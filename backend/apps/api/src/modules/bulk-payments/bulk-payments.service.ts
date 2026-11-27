import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { create } from 'xmlbuilder2';
import { isValidObjectId, Types, type Connection, type Model } from 'mongoose';
import { formatInr, istDateStamp, istHour, maskAccountNumber, sha256Hex } from '@app/shared';
import { BANK_NAME } from '../../common/constants/app.constants';
import { isOwnIfsc } from '../../common/constants/branches';
import {
  AccountStatus,
  Category,
  Channel,
  PaymentRail,
  PostingDirection,
  TransactionStatus,
  TransactionType,
} from '../../common/enums/banking.enums';
import { DomainEvents, type TransactionEvent } from '../../common/events/domain-events';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { AuthUser, RequestContext } from '../../common/types/auth.types';
import type { AppConfig } from '../../config/configuration';
import { AccountLedgerService } from '../accounts/account-ledger.service';
import { Account, type AccountDocument } from '../accounts/schemas/account.schema';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { IfscService } from '../integrations/ifsc.service';
import { NotificationType } from '../notifications/notification.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { OtpService, type IssuedChallenge } from '../otp/otp.service';
import { assertTransition } from '../transactions/transaction-state';
import { TransactionsService } from '../transactions/transactions.service';
import { UsersService } from '../users/users.service';
import { BulkBatch } from './bulk-batch.schema';
import { parsePain001, type Pain001Issue, type Pain001Payment } from './pain001.parser';

export interface BulkPreviewLine extends Pain001Payment {
  rail: 'INTERNAL' | 'NEFT';
  payeeBank: string;
}

export interface BulkPreview {
  valid: boolean;
  issues: Pain001Issue[];
  messageId?: string;
  createdAt?: string;
  initiatingParty?: string;
  requestedExecutionDate?: string;
  debitAccount?: { id: string; maskedNumber: string; availableBalance: number };
  payments: BulkPreviewLine[];
  totals: { count: number; amount: number; internal: number; neft: number };
  otp?: IssuedChallenge;
}

export interface BulkResult {
  batchId: string;
  messageId: string;
  count: number;
  totalAmount: number;
  payments: { endToEndId: string; reference: string; rail: string; status: string }[];
}

interface Checked {
  preview: BulkPreview;
  account?: AccountDocument;
  payees: Map<string, AccountDocument>;
}

/**
 * ISO 20022 bulk payments (pain.001): preview with every check a bank makes,
 * then an OTP-approved, idempotent submission that posts the whole file in
 * one MongoDB transaction: every payment is accepted, or none is.
 */
@Injectable()
export class BulkPaymentsService {
  private readonly neftSettlementSeconds: number;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Account.name) private readonly accounts: Model<Account>,
    @InjectModel(BulkBatch.name) private readonly batches: Model<BulkBatch>,
    private readonly ledger: AccountLedgerService,
    private readonly transactions: TransactionsService,
    private readonly ifsc: IfscService,
    private readonly users: UsersService,
    private readonly otp: OtpService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly events: EventEmitter2,
    config: ConfigService<AppConfig, true>,
  ) {
    this.neftSettlementSeconds = config.get('banking', { infer: true }).neftSettlementSeconds;
  }

  private contextHash(xml: string): string {
    return sha256Hex(`bulk:${sha256Hex(xml)}`);
  }

  async preview(user: AuthUser, xml: string): Promise<BulkPreview> {
    const { preview } = await this.check(user, xml);
    if (preview.valid) {
      const customer = await this.users.findByIdOrThrow(user.id);
      preview.otp = await this.otp.issue(
        { id: user.id, phone: customer.phone, mfaEnabled: Boolean(customer.mfa?.enabled) },
        'BULK_PAYMENT',
        this.contextHash(xml),
        (code) =>
          `${code} is your Vinay Bank OTP to approve ${preview.totals.count} payments totalling ` +
          `${formatInr(preview.totals.amount)} (file ${preview.messageId}). Never share it.`,
      );
    }
    return preview;
  }

  private async check(user: AuthUser, xml: string): Promise<Checked> {
    const { batch, issues } = parsePain001(xml);
    const empty = { count: 0, amount: 0, internal: 0, neft: 0 };
    if (!batch)
      return { preview: { valid: false, issues, payments: [], totals: empty }, payees: new Map() };

    const account = await this.accounts.findOne({
      accountNumber: batch.debtorAccount,
      customerId: user.id,
    });
    if (!account) {
      issues.push({
        path: 'PmtInf/DbtrAcct',
        message: `Account ${maskAccountNumber(batch.debtorAccount)} is not one of your accounts`,
      });
    } else if (account.status !== AccountStatus.ACTIVE) {
      issues.push({ path: 'PmtInf/DbtrAcct', message: 'The debit account is not active' });
    }
    const previous = await this.batches
      .findOne({ customerId: user.id, messageId: batch.messageId })
      .lean();
    if (previous) {
      issues.push({
        path: 'GrpHdr/MsgId',
        message: `File ${batch.messageId} was already paid on ${istDateStamp(previous.createdAt)}`,
      });
    }

    const banks = new Map<string, string>();
    await Promise.all(
      [
        ...new Set(
          batch.payments.filter((p) => !isOwnIfsc(p.creditorIfsc)).map((p) => p.creditorIfsc),
        ),
      ].map(async (code) =>
        banks.set(
          code,
          await this.ifsc
            .lookup(code)
            .then((d) => d.bank)
            .catch(() => 'Unknown bank'),
        ),
      ),
    );
    // One indexed query for every Vinay Bank payee in the file, not one per payment line
    const internalNumbers = [
      ...new Set(
        batch.payments.filter((p) => isOwnIfsc(p.creditorIfsc)).map((p) => p.creditorAccount),
      ),
    ];
    const ownBankAccounts = new Map(
      (internalNumbers.length
        ? await this.accounts.find({ accountNumber: { $in: internalNumbers } })
        : []
      ).map((a) => [a.accountNumber, a]),
    );

    const payees = new Map<string, AccountDocument>();
    const lines: BulkPreviewLine[] = [];
    for (const payment of batch.payments) {
      const internal = isOwnIfsc(payment.creditorIfsc);
      if (internal) {
        const payee = ownBankAccounts.get(payment.creditorAccount);
        if (!payee || ![AccountStatus.ACTIVE, AccountStatus.FROZEN].includes(payee.status)) {
          issues.push({
            path: `CdtTrfTxInf[${payment.index}]/CdtrAcct`,
            message: 'No active Vinay Bank account has this number',
            payment: payment.index,
          });
        } else if (account && payee.id === account.id) {
          issues.push({
            path: `CdtTrfTxInf[${payment.index}]/CdtrAcct`,
            message: 'A payment cannot go to the debit account itself',
            payment: payment.index,
          });
        } else {
          payees.set(payment.creditorAccount, payee);
        }
      }
      lines.push({
        ...payment,
        rail: internal ? 'INTERNAL' : 'NEFT',
        payeeBank: internal ? BANK_NAME : (banks.get(payment.creditorIfsc) ?? 'Unknown bank'),
      });
    }

    const totals = {
      count: lines.length,
      amount: lines.reduce((sum, l) => sum + l.amount, 0),
      internal: lines.filter((l) => l.rail === 'INTERNAL').length,
      neft: lines.filter((l) => l.rail === 'NEFT').length,
    };
    if (account) {
      const available = account.ledgerBalance - account.holdAmount;
      if (totals.amount > available) {
        issues.push({
          path: 'GrpHdr/CtrlSum',
          message: `The total ${formatInr(totals.amount)} is more than the available balance ${formatInr(available)}`,
        });
      }
      const usedToday = await this.transactions.debitedToday(account._id);
      if (usedToday + totals.amount > account.dailyTransferLimit) {
        issues.push({
          path: 'GrpHdr/CtrlSum',
          message: `The total would exceed the account's daily transfer limit of ${formatInr(account.dailyTransferLimit)}`,
        });
      }
    }
    return {
      account: account ?? undefined,
      payees,
      preview: {
        valid: issues.length === 0,
        issues,
        messageId: batch.messageId,
        createdAt: batch.createdAt,
        initiatingParty: batch.initiatingParty,
        requestedExecutionDate: batch.requestedExecutionDate,
        debitAccount: account
          ? {
              id: account.id as string,
              maskedNumber: maskAccountNumber(account.accountNumber),
              availableBalance: account.ledgerBalance - account.holdAmount,
            }
          : undefined,
        payments: lines,
        totals,
      },
    };
  }

  async submit(
    user: AuthUser,
    xml: string,
    challengeId: string,
    code: string,
    idempotencyKey: string,
    ctx: RequestContext,
  ): Promise<{ result: BulkResult; replayed: boolean }> {
    const fileHash = sha256Hex(xml);
    const started = await this.idempotency.begin<BulkResult>(user.id, idempotencyKey, fileHash);
    if (started.replay) return { result: started.response, replayed: true };
    try {
      const { preview, account, payees } = await this.check(user, xml);
      if (!preview.valid || !account) {
        throw new AppException(
          ErrorCode.VALIDATION_FAILED,
          'The file has problems. Preview it again for details.',
          HttpStatus.UNPROCESSABLE_ENTITY,
          preview.issues,
        );
      }
      await this.otp.verify(challengeId, user.id, code, this.contextHash(xml));

      const now = new Date();
      const batchId = new Types.ObjectId();
      const settlementBatch = `NEFT-${istDateStamp(now)}-${String(istHour(now)).padStart(2, '0')}${now.getUTCMinutes() < 30 ? '00' : '30'}`;
      const { result, completed, processing } = await this.connection.transaction(
        async (session) => {
          const completedIds: string[] = [];
          const processingIds: string[] = [];
          const lines: BulkResult['payments'] = [];
          const customer = await this.users.findByIdOrThrow(user.id);
          for (const line of preview.payments) {
            const payee = payees.get(line.creditorAccount);
            const internal = line.rail === 'INTERNAL';
            const txn = await this.transactions.create(
              {
                type: TransactionType.BULK_TRANSFER,
                rail: internal ? PaymentRail.INTERNAL : PaymentRail.NEFT,
                channel: Channel.BULK_UPLOAD,
                status: TransactionStatus.PROCESSING,
                amount: line.amount,
                from: {
                  accountId: account._id,
                  accountNumber: account.accountNumber,
                  ifsc: account.ifsc,
                  name: `${customer.firstName} ${customer.lastName}`,
                  bankName: BANK_NAME,
                  customerId: account.customerId,
                },
                to: {
                  accountId: payee?._id,
                  accountNumber: line.creditorAccount,
                  ifsc: line.creditorIfsc,
                  name: line.creditorName,
                  bankName: line.payeeBank,
                  customerId: payee?.customerId,
                },
                initiatedBy: account.customerId,
                initiatorRole: user.role,
                category: Category.TRANSFER,
                remarks: line.remittanceInfo,
                metadata: {
                  batchId: batchId.toString(),
                  messageId: preview.messageId,
                  endToEndId: line.endToEndId,
                },
              },
              session,
            );
            const debited = await this.ledger.debit(account._id, line.amount, session);
            const postings: Parameters<AccountLedgerService['post']>[0] = [
              {
                accountId: account._id,
                transactionId: txn._id,
                reference: txn.reference,
                direction: PostingDirection.DEBIT,
                amount: line.amount,
                balanceAfter: debited.ledgerBalance,
                narration: `Bulk ${internal ? 'transfer' : 'NEFT'} to ${line.creditorName} (${line.endToEndId})`,
                counterpartyName: line.creditorName,
                category: Category.TRANSFER,
                channel: Channel.BULK_UPLOAD,
                selfTransfer: false,
              },
            ];
            if (internal && payee) {
              const credited = await this.ledger.credit(payee._id, line.amount, session);
              postings.push({
                accountId: payee._id,
                transactionId: txn._id,
                reference: txn.reference,
                direction: PostingDirection.CREDIT,
                amount: line.amount,
                balanceAfter: credited.ledgerBalance,
                narration: `From ${customer.firstName} ${customer.lastName}${line.remittanceInfo ? ` - ${line.remittanceInfo}` : ''}`,
                counterpartyName: `${customer.firstName} ${customer.lastName}`,
                category: Category.TRANSFER,
                channel: Channel.BULK_UPLOAD,
                selfTransfer: false,
              });
              assertTransition(txn.status, TransactionStatus.COMPLETED);
              txn.status = TransactionStatus.COMPLETED;
              txn.completedAt = now;
              completedIds.push(txn._id.toString());
            } else {
              txn.settlementDueAt = new Date(now.getTime() + this.neftSettlementSeconds * 1000);
              txn.settlementBatch = settlementBatch;
              processingIds.push(txn._id.toString());
            }
            await this.ledger.post(postings, session);
            await txn.save({ session });
            lines.push({
              endToEndId: line.endToEndId,
              reference: txn.reference,
              rail: txn.rail,
              status: txn.status,
            });
          }
          await this.batches.create(
            [
              {
                _id: batchId,
                customerId: account.customerId,
                accountId: account._id,
                messageId: preview.messageId,
                fileHash,
                initiatingParty: preview.initiatingParty,
                paymentCount: preview.totals.count,
                totalAmount: preview.totals.amount,
                internalCount: preview.totals.internal,
                neftCount: preview.totals.neft,
                transactionIds: [...completedIds, ...processingIds].map(
                  (id) => new Types.ObjectId(id),
                ),
              },
            ],
            { session },
          );
          const bulkResult: BulkResult = {
            batchId: batchId.toString(),
            messageId: preview.messageId!,
            count: preview.totals.count,
            totalAmount: preview.totals.amount,
            payments: lines,
          };
          await this.idempotency.complete(user.id, idempotencyKey, bulkResult, session);
          return { result: bulkResult, completed: completedIds, processing: processingIds };
        },
      );

      await this.audit.record({
        action: AuditAction.BULK_BATCH_SUBMITTED,
        actor: { id: user.id, role: user.role },
        entity: { type: 'BulkBatch', id: result.batchId },
        context: ctx,
        details: {
          messageId: result.messageId,
          count: result.count,
          totalAmount: result.totalAmount,
          fileHash,
        },
      });
      await this.notifications.notify(user.id, {
        type: NotificationType.TRANSACTION,
        title: `Bulk payment accepted: ${formatInr(result.totalAmount)}`,
        message: `${result.count} payments from file ${result.messageId} were debited from A/c ${maskAccountNumber(account.accountNumber)}. ${processing.length} NEFT payment(s) settle in the next batch.`,
        link: '/app/bulk-payments',
      });
      // Payees at Vinay Bank get their usual credit alerts (the payer already has the summary).
      for (const transactionId of completed) {
        this.events.emit(DomainEvents.TRANSACTION_COMPLETED, {
          transactionId,
        } satisfies TransactionEvent);
      }
      return { result, replayed: false };
    } catch (error) {
      await this.idempotency.abandon(user.id, idempotencyKey);
      if ((error as { code?: number }).code === 11000) {
        throw AppException.conflict('This file was already paid (same message ID)');
      }
      throw error;
    }
  }

  async list(user: AuthUser) {
    const batches = await this.batches
      .find({ customerId: user.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    return batches.map((b) => ({
      id: b._id.toString(),
      messageId: b.messageId,
      paymentCount: b.paymentCount,
      totalAmount: b.totalAmount,
      internalCount: b.internalCount,
      neftCount: b.neftCount,
      initiatingParty: b.initiatingParty,
      createdAt: b.createdAt.toISOString(),
    }));
  }

  /** A ready-to-upload pain.001.001.03 file for one of the customer's accounts. */
  async sample(user: AuthUser, accountId: string): Promise<{ filename: string; xml: string }> {
    const account = isValidObjectId(accountId)
      ? await this.accounts.findOne({ _id: accountId, customerId: user.id }).lean()
      : null;
    if (!account) throw AppException.notFound('Account');
    const customer = await this.users.findByIdOrThrow(user.id);
    const own = await this.accounts
      .findOne({ customerId: user.id, _id: { $ne: account._id }, status: AccountStatus.ACTIVE })
      .lean();
    const stamp = istDateStamp();
    const payments = [
      {
        id: `SAL-${stamp}-001`,
        amount: '45000.00',
        ifsc: 'HDFC0000240',
        name: 'Amit Kulkarni',
        account: '50100234567812',
        note: 'Salary November',
      },
      {
        id: `SAL-${stamp}-002`,
        amount: '32500.00',
        ifsc: 'SBIN0001234',
        name: 'Suresh Patil',
        account: '30012345678',
        note: 'Salary November',
      },
      {
        id: `SAL-${stamp}-003`,
        amount: '28000.00',
        ifsc: 'BARB0ANDHER',
        name: 'Neha Joshi',
        account: '29080100004567',
        note: 'Salary November',
      },
      ...(own
        ? [
            {
              id: `SAL-${stamp}-004`,
              amount: '5000.00',
              ifsc: own.ifsc,
              name: `${customer.firstName} ${customer.lastName}`,
              account: own.accountNumber,
              note: 'Petty cash float',
            },
          ]
        : []),
    ];
    const total = payments.reduce((sum, p) => sum + Number(p.amount), 0).toFixed(2);
    const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele(
      'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03',
      'Document',
    );
    const initn = doc.ele('CstmrCdtTrfInitn');
    const header = initn.ele('GrpHdr');
    header.ele('MsgId').txt(`SAL-${stamp}-${Date.now().toString(36).toUpperCase()}`);
    header.ele('CreDtTm').txt(new Date().toISOString().slice(0, 19));
    header.ele('NbOfTxs').txt(String(payments.length));
    header.ele('CtrlSum').txt(total);
    header.ele('InitgPty').ele('Nm').txt(`${customer.firstName} ${customer.lastName}`);
    const info = initn.ele('PmtInf');
    info.ele('PmtInfId').txt(`PMT-${stamp}`);
    info.ele('PmtMtd').txt('TRF');
    info.ele('NbOfTxs').txt(String(payments.length));
    info.ele('CtrlSum').txt(total);
    info.ele('ReqdExctnDt').txt(new Date().toISOString().slice(0, 10));
    info.ele('Dbtr').ele('Nm').txt(`${customer.firstName} ${customer.lastName}`);
    info.ele('DbtrAcct').ele('Id').ele('Othr').ele('Id').txt(account.accountNumber);
    info.ele('DbtrAgt').ele('FinInstnId').ele('ClrSysMmbId').ele('MmbId').txt(account.ifsc);
    for (const p of payments) {
      const tx = info.ele('CdtTrfTxInf');
      tx.ele('PmtId').ele('EndToEndId').txt(p.id);
      tx.ele('Amt').ele('InstdAmt', { Ccy: 'INR' }).txt(p.amount);
      tx.ele('CdtrAgt').ele('FinInstnId').ele('ClrSysMmbId').ele('MmbId').txt(p.ifsc);
      tx.ele('Cdtr').ele('Nm').txt(p.name);
      tx.ele('CdtrAcct').ele('Id').ele('Othr').ele('Id').txt(p.account);
      tx.ele('RmtInf').ele('Ustrd').txt(p.note);
    }
    return { filename: `pain001-sample-${stamp}.xml`, xml: doc.end({ prettyPrint: true }) };
  }
}
