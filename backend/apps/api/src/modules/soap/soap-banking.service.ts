import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import type { Model } from 'mongoose';
import { paiseToRupeeString, safeEqual } from '@app/shared';
import { IFSC_PATTERN } from '../../common/validators/banking.validators';
import type { AppConfig } from '../../config/configuration';
import { Account } from '../accounts/schemas/account.schema';
import { Posting } from '../accounts/schemas/posting.schema';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { IfscService } from '../integrations/ifsc.service';
import { User } from '../users/user.schema';

/** A SOAP fault: node-soap turns an error with a `Fault` property into <soap:Fault>. */
class SoapFault extends Error {
  readonly Fault: { faultcode: string; faultstring: string; statusCode: number };

  constructor(code: 'Client' | 'Server', message: string, statusCode = 500) {
    super(message);
    this.Fault = { faultcode: `soap:${code}`, faultstring: message, statusCode };
  }
}

/**
 * node-soap gives element text as a string, as a number or boolean when the
 * WSDL types it (xsd:int Count arrives as 5, not "5"), or as { $value, attributes }.
 */
function valueOf(node: unknown): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (node && typeof node === 'object' && '$value' in node) return String(node.$value);
  return '';
}

interface UsernameToken {
  Username?: unknown;
  Password?: unknown;
  Nonce?: unknown;
  Created?: unknown;
}

const NONCE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Operations behind the WSDL. A partner (for example a corporate customer's
 * ERP system) authenticates with a WS-Security UsernameToken and can only see
 * the accounts of the customer its credentials are bound to.
 */
@Injectable()
export class SoapBankingService {
  private readonly logger = new Logger('SoapBanking');
  private readonly soap: AppConfig['soap'];
  /** Nonces seen inside the freshness window: a captured request cannot be replayed. */
  private readonly nonces = new Map<string, number>();

  constructor(
    config: ConfigService<AppConfig, true>,
    @InjectModel(Account.name) private readonly accounts: Model<Account>,
    @InjectModel(Posting.name) private readonly postings: Model<Posting>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly ifsc: IfscService,
    private readonly audit: AuditService,
  ) {
    this.soap = config.get('soap', { infer: true });
  }

  /**
   * WS-Security UsernameToken check. PasswordDigest is
   * Base64(SHA-1(nonce + created + password)), as the OASIS profile defines it;
   * the timestamp must be fresh and the nonce unused.
   */
  authenticate(security: { UsernameToken?: UsernameToken } | undefined, ip?: string): boolean {
    const token = security?.UsernameToken;
    const username = valueOf(token?.Username);
    const password = valueOf(token?.Password);
    const type = String(
      (token?.Password as { attributes?: { Type?: string } } | undefined)?.attributes?.Type ?? '',
    );
    let ok =
      Boolean(this.soap.password) && safeEqual(username, this.soap.username) && Boolean(password);

    if (ok && type.endsWith('#PasswordDigest')) {
      const nonce = valueOf(token?.Nonce);
      const created = valueOf(token?.Created);
      const age = Math.abs(Date.now() - Date.parse(created));
      this.forgetOldNonces();
      if (!nonce || !(age <= NONCE_WINDOW_MS) || this.nonces.has(nonce)) {
        ok = false;
      } else {
        const digest = createHash('sha1')
          .update(
            Buffer.concat([
              Buffer.from(nonce, 'base64'),
              Buffer.from(created),
              Buffer.from(this.soap.password),
            ]),
          )
          .digest('base64');
        ok = safeEqual(digest, password);
        if (ok) this.nonces.set(nonce, Date.now());
      }
    } else if (ok) {
      ok = safeEqual(password, this.soap.password); // PasswordText: only acceptable over TLS
    }

    if (!ok) {
      this.logger.warn(`SOAP authentication failed for "${username || 'anonymous'}"`);
      void this.audit.record({
        action: AuditAction.SOAP_AUTH_FAILED,
        outcome: 'FAILURE',
        context: { ip },
        details: {
          username: username.slice(0, 60) || null,
          passwordType: type.split('#')[1] ?? 'none',
        },
      });
    }
    return ok;
  }

  private forgetOldNonces(): void {
    const cutoff = Date.now() - 2 * NONCE_WINDOW_MS;
    for (const [nonce, seenAt] of this.nonces) if (seenAt < cutoff) this.nonces.delete(nonce);
  }

  /** The partner sees only the accounts of the customer its credentials belong to. */
  private async partnerAccount(accountNumber: unknown) {
    const number = valueOf(accountNumber);
    if (!/^\d{12}$/.test(number))
      throw new SoapFault('Client', 'AccountNumber must be 12 digits', 400);
    const customer = await this.users
      .findOne({ email: this.soap.customerEmail })
      .select('_id')
      .lean();
    const account = customer
      ? await this.accounts.findOne({ accountNumber: number, customerId: customer._id }).lean()
      : null;
    if (!account) throw new SoapFault('Client', 'Account not found for this partner', 404);
    return account;
  }

  async getAccountBalance(args: { AccountNumber?: unknown }) {
    const account = await this.partnerAccount(args.AccountNumber);
    return {
      AccountNumber: account.accountNumber,
      AccountType: account.type,
      Status: account.status,
      Currency: account.currency,
      LedgerBalance: paiseToRupeeString(account.ledgerBalance),
      AvailableBalance: paiseToRupeeString(account.ledgerBalance - account.holdAmount),
      AsOf: new Date().toISOString(),
    };
  }

  async getMiniStatement(args: { AccountNumber?: unknown; Count?: unknown }) {
    const account = await this.partnerAccount(args.AccountNumber);
    const count = Math.min(20, Math.max(1, Number(valueOf(args.Count)) || 10));
    const rows = await this.postings
      .find({ accountId: account._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(count)
      .lean();
    return {
      AccountNumber: account.accountNumber,
      Entry: rows.map((row) => ({
        Date: row.createdAt.toISOString(),
        Reference: row.reference,
        Narration: row.narration,
        Direction: row.direction,
        Amount: paiseToRupeeString(row.amount),
        BalanceAfter: paiseToRupeeString(row.balanceAfter),
      })),
    };
  }

  async validateIfsc(args: { Ifsc?: unknown }) {
    const code = valueOf(args.Ifsc).trim().toUpperCase();
    if (!IFSC_PATTERN.test(code)) {
      return { Ifsc: code, Valid: false, Bank: '', Branch: '', Source: 'FORMAT' };
    }
    const details = await this.ifsc.lookup(code).catch(() => null);
    return {
      Ifsc: code,
      Valid: Boolean(details),
      Bank: details?.bank ?? '',
      Branch: details?.branch ?? '',
      Source: details?.source ?? 'OFFLINE',
    };
  }
}
