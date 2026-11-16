import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Connection, Model } from 'mongoose';
import {
  describeResponseCode,
  istDateStamp,
  MCC_ATM,
  randomDigits,
  type CardAuthorizeRequest,
  type CardAuthorizeResponse,
  type CardReverseRequest,
  type CardReverseResponse,
} from '@app/shared';
import {
  AccountStatus,
  Category,
  Channel,
  PaymentRail,
  PostingDirection,
  TransactionStatus,
  TransactionType,
} from '../../common/enums/banking.enums';
import { Role } from '../../common/enums/role.enum';
import { DomainEvents, type TransactionEvent } from '../../common/events/domain-events';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { AccountLedgerService } from '../accounts/account-ledger.service';
import { Account } from '../accounts/schemas/account.schema';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { Transaction } from '../transactions/schemas/transaction.schema';
import { assertTransition } from '../transactions/transaction-state';
import { TransactionsService } from '../transactions/transactions.service';
import { CardSecurityService } from './card-security.service';
import { Card, CardStatus, MAX_PIN_TRIES, type CardDocument } from './schemas/card.schema';

const RUPEE = 100;
/** RBI allows contactless payments without a PIN up to Rs 5,000. */
const CONTACTLESS_NO_PIN_LIMIT = 5_000 * RUPEE;

const CATEGORY_BY_MCC: Record<string, Category> = {
  '5411': Category.GROCERIES,
  '5812': Category.FOOD,
  '5814': Category.FOOD,
  '5541': Category.TRAVEL,
  '4111': Category.TRAVEL,
  '5815': Category.ENTERTAINMENT,
  '5912': Category.HEALTH,
};

function respond(code: string, extra: Partial<CardAuthorizeResponse> = {}): CardAuthorizeResponse {
  return { responseCode: code, message: describeResponseCode(code), ...extra };
}

/** Defence in depth: the switch is trusted (mutual TLS) but every field is still checked. */
function formatProblem(r: CardAuthorizeRequest): string | null {
  if (!r || typeof r !== 'object') return 'empty request';
  if (!['PURCHASE', 'CASH_WITHDRAWAL', 'BALANCE_INQUIRY'].includes(r.operation)) return 'operation';
  if (!/^\d{13,19}$/.test(r.pan ?? '')) return 'pan';
  if (!/^\d{4}$/.test(r.expiry ?? '')) return 'expiry';
  if (!Number.isSafeInteger(r.amount) || r.amount < 0) return 'amount';
  if (r.pinBlock !== undefined && !/^[0-9A-Fa-f]{16}$/.test(r.pinBlock)) return 'pinBlock';
  if (!/^\d{6}$/.test(r.stan ?? '') || !/^[A-Za-z0-9]{12}$/.test(r.rrn ?? ''))
    return 'trace numbers';
  if (!/^[\x20-\x7E]{1,8}$/.test(r.terminalId ?? '')) return 'terminalId';
  if (!/^\d{4}$/.test(r.mcc ?? '') || !/^\d{3}$/.test(r.entryMode ?? ''))
    return 'mcc or entry mode';
  return null;
}

/**
 * Issuer authorization: the core banking side of a card payment. Called by
 * the card switch for every ISO 8583 0200 and 0420 message. Declines are
 * normal answers (a response code), never exceptions.
 */
@Injectable()
export class CardAuthorizationService {
  private readonly logger = new Logger(CardAuthorizationService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Card.name) private readonly cards: Model<Card>,
    @InjectModel(Account.name) private readonly accounts: Model<Account>,
    @InjectModel(Transaction.name) private readonly transactionModel: Model<Transaction>,
    private readonly security: CardSecurityService,
    private readonly ledger: AccountLedgerService,
    private readonly transactions: TransactionsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async authorize(request: CardAuthorizeRequest): Promise<CardAuthorizeResponse> {
    const problem = formatProblem(request);
    if (problem) return respond('30', { message: `Format error: ${problem}` });
    try {
      const card = await this.cards.findOne({ panIndex: this.security.panIndex(request.pan) });
      const result = card ? await this.decide(card, request) : respond('14');
      await this.record(card, request, result);
      return result;
    } catch (error) {
      this.logger.error(`Authorization failed (STAN ${request.stan})`, (error as Error).stack);
      return respond('96');
    }
  }

  private async decide(
    card: CardDocument,
    r: CardAuthorizeRequest,
  ): Promise<CardAuthorizeResponse> {
    if (card.status === CardStatus.HOTLISTED) return respond('41');
    if (card.status === CardStatus.BLOCKED)
      return respond('62', { message: 'Card is blocked by the customer' });

    const now = istDateStamp().slice(2, 6); // YYMM
    if (card.expiry < now) return respond('54');
    if (card.expiry !== r.expiry) return respond('05', { message: 'Expiry date does not match' });

    const atm = r.mcc === MCC_ATM;
    if (atm ? !card.controls.atm : !card.controls.pos) {
      return respond('57', { message: `${atm ? 'ATM' : 'Shop'} use is turned off for this card` });
    }

    const contactlessWithoutPin =
      !r.pinBlock &&
      r.operation === 'PURCHASE' &&
      r.entryMode.startsWith('07') &&
      card.controls.contactless &&
      r.amount <= CONTACTLESS_NO_PIN_LIMIT;
    if (!contactlessWithoutPin) {
      const pinResult = await this.checkPin(card, r);
      if (pinResult) return pinResult;
    }

    const account = await this.accounts.findById(card.accountId).lean();
    if (!account || account.status !== AccountStatus.ACTIVE) {
      return respond('62', { message: 'The linked account cannot be used' });
    }
    const balances = {
      ledgerBalance: account.ledgerBalance,
      availableBalance: account.ledgerBalance - account.holdAmount,
    };
    if (r.operation === 'BALANCE_INQUIRY') return respond('00', balances);

    if (r.amount <= 0) return respond('13');
    if (r.operation === 'CASH_WITHDRAWAL' && r.amount % (100 * RUPEE) !== 0) {
      return respond('13', { message: 'ATM withdrawals must be in multiples of Rs 100' });
    }
    if (r.operation === 'CASH_WITHDRAWAL' && !atm) return respond('12');
    return this.debit(card, r);
  }

  /** Returns a decline, or null when the PIN is correct. Three wrong PINs lock the PIN. */
  private async checkPin(
    card: CardDocument,
    r: CardAuthorizeRequest,
  ): Promise<CardAuthorizeResponse | null> {
    if (!card.pinVerificationValue)
      return respond('55', { message: 'No PIN has been set for this card' });
    if (card.pinTries >= MAX_PIN_TRIES) return respond('75');
    if (r.pinBlock && this.security.verifyPinBlock(r.pinBlock, r.pan, card.pinVerificationValue)) {
      if (card.pinTries > 0)
        await this.cards.updateOne({ _id: card._id }, { $set: { pinTries: 0 } });
      return null;
    }
    const updated = await this.cards.findOneAndUpdate(
      { _id: card._id },
      { $inc: { pinTries: 1 } },
      { new: true },
    );
    return (updated?.pinTries ?? MAX_PIN_TRIES) >= MAX_PIN_TRIES ? respond('75') : respond('55');
  }

  private async debit(card: CardDocument, r: CardAuthorizeRequest): Promise<CardAuthorizeResponse> {
    const atm = r.mcc === MCC_ATM;
    const authCode = randomDigits(6);
    let outcome: { response: CardAuthorizeResponse; transactionId: string };
    try {
      outcome = await this.connection.transaction(async (session) => {
        if (!(await this.reserveDailyLimit(card, atm ? 'atm' : 'pos', r.amount, session))) {
          return { response: respond('61'), transactionId: '' };
        }
        const account = await this.accounts.findById(card.accountId).session(session);
        const txn = await this.transactions.create(
          {
            type: atm ? TransactionType.ATM_WITHDRAWAL : TransactionType.CARD_PAYMENT,
            rail: PaymentRail.CARD,
            channel: atm ? Channel.ATM : Channel.POS,
            status: TransactionStatus.PROCESSING,
            amount: r.amount,
            from: {
              accountId: card.accountId,
              accountNumber: account!.accountNumber,
              ifsc: account!.ifsc,
              name: card.cardholderName,
              bankName: 'Vinay Bank',
              customerId: card.customerId,
            },
            to: {
              accountNumber: 'CARD',
              name: r.merchantName,
              bankName: atm ? 'Vinay Bank ATM network' : 'Card network',
            },
            initiatedBy: card.customerId,
            initiatorRole: Role.CUSTOMER,
            category: atm ? Category.CASH : (CATEGORY_BY_MCC[r.mcc] ?? Category.SHOPPING),
            remarks: atm ? 'ATM cash withdrawal' : 'Card purchase',
            metadata: {
              cardId: card._id.toString(),
              cardLast4: card.last4,
              terminalId: r.terminalId,
              merchantId: r.merchantId,
              mcc: r.mcc,
              stan: r.stan,
              rrn: r.rrn,
              authCode,
              entryMode: r.entryMode,
            },
          },
          session,
        );
        const updated = await this.ledger.debit(card.accountId, r.amount, session);
        await this.ledger.post(
          [
            {
              accountId: card.accountId,
              transactionId: txn._id,
              reference: txn.reference,
              direction: PostingDirection.DEBIT,
              amount: r.amount,
              balanceAfter: updated.ledgerBalance,
              narration: `${atm ? 'ATM withdrawal' : 'Card purchase'} at ${r.merchantName} (card XX${card.last4})`,
              counterpartyName: r.merchantName,
              category: txn.category,
              channel: atm ? Channel.ATM : Channel.POS,
              selfTransfer: false,
            },
          ],
          session,
        );
        assertTransition(txn.status, TransactionStatus.COMPLETED);
        txn.status = TransactionStatus.COMPLETED;
        txn.completedAt = new Date();
        await txn.save({ session });
        return {
          transactionId: txn._id.toString(),
          response: respond('00', {
            authCode,
            transactionId: txn._id.toString(),
            ledgerBalance: updated.ledgerBalance,
            availableBalance: updated.ledgerBalance - updated.holdAmount,
          }),
        };
      });
    } catch (error) {
      if (error instanceof AppException && error.code === ErrorCode.INSUFFICIENT_FUNDS)
        return respond('51');
      if ((error as { code?: number }).code === 11000) return respond('94');
      throw error;
    }
    if (outcome.transactionId) {
      this.events.emit(DomainEvents.TRANSACTION_COMPLETED, {
        transactionId: outcome.transactionId,
      } satisfies TransactionEvent);
    }
    return outcome.response;
  }

  /**
   * Adds `amount` to today's channel spend only if it stays within the card's
   * daily limit, in one atomic update (the counter resets on a new IST day).
   */
  private async reserveDailyLimit(
    card: CardDocument,
    channel: 'atm' | 'pos',
    amount: number,
    session: ClientSession,
  ): Promise<boolean> {
    const today = istDateStamp();
    const limit = channel === 'atm' ? card.limits.atmDaily : card.limits.posDaily;
    const spentToday = { $cond: [{ $eq: ['$usage.date', today] }, `$usage.${channel}`, 0] };
    const updated = await this.cards.findOneAndUpdate(
      { _id: card._id, $expr: { $lte: [{ $add: [spentToday, amount] }, limit] } },
      [
        {
          $set: {
            'usage.atm':
              channel === 'atm'
                ? { $add: [spentToday, amount] }
                : { $cond: [{ $eq: ['$usage.date', today] }, '$usage.atm', 0] },
            'usage.pos':
              channel === 'pos'
                ? { $add: [spentToday, amount] }
                : { $cond: [{ $eq: ['$usage.date', today] }, '$usage.pos', 0] },
            'usage.date': today,
          },
        },
      ],
      { new: true, session },
    );
    return Boolean(updated);
  }

  /** ISO 8583 0420: the terminal could not complete the transaction (e.g. cash not dispensed). */
  async reverse(request: CardReverseRequest): Promise<CardReverseResponse> {
    try {
      if (!/^[A-Za-z0-9]{12}$/.test(request?.rrn ?? '') || !request.terminalId) {
        return { responseCode: '30', message: 'Format error' };
      }
      const original = await this.transactionModel.findOne({
        rail: PaymentRail.CARD,
        'metadata.rrn': request.rrn,
        'metadata.terminalId': request.terminalId,
      });
      if (!original) return { responseCode: '25', message: describeResponseCode('25') };
      if (original.status === TransactionStatus.REVERSED) {
        return {
          responseCode: '00',
          message: 'Already reversed',
          transactionId: original.id as string,
        };
      }
      if (original.status !== TransactionStatus.COMPLETED)
        return { responseCode: '12', message: describeResponseCode('12') };
      if (request.amount !== original.amount) {
        return { responseCode: '13', message: 'Partial reversals are not supported' };
      }

      await this.connection.transaction(async (session) => {
        const accountId = original.from!.accountId!;
        const updated = await this.ledger.credit(accountId, original.amount, session);
        await this.ledger.post(
          [
            {
              accountId,
              transactionId: original._id,
              reference: original.reference,
              direction: PostingDirection.CREDIT,
              amount: original.amount,
              balanceAfter: updated.ledgerBalance,
              narration: `Reversal: ${original.to?.name} (${request.reason})`,
              counterpartyName: original.to?.name,
              category: Category.REFUND,
              channel: original.channel,
              selfTransfer: false,
            },
          ],
          session,
        );
        assertTransition(original.status, TransactionStatus.REVERSED);
        original.status = TransactionStatus.REVERSED;
        original.failureReason = request.reason;
        await original.save({ session });
        const cardId = original.metadata?.cardId as string | undefined;
        const channel = original.type === TransactionType.ATM_WITHDRAWAL ? 'atm' : 'pos';
        if (cardId) {
          await this.cards.updateOne(
            { _id: cardId, 'usage.date': istDateStamp(original.createdAt) },
            { $inc: { [`usage.${channel}`]: -original.amount } },
            { session },
          );
        }
      });

      await this.audit.record({
        action: AuditAction.CARD_TRANSACTION,
        actor: { id: original.from?.customerId?.toString(), role: Role.CUSTOMER },
        entity: { type: 'Transaction', id: original.id as string },
        details: {
          kind: 'REVERSAL',
          reference: original.reference,
          amount: original.amount,
          reason: request.reason,
          terminalId: request.terminalId,
        },
      });
      this.events.emit(DomainEvents.TRANSACTION_REVERSED, {
        transactionId: original.id as string,
      } satisfies TransactionEvent);
      return { responseCode: '00', message: 'Reversed', transactionId: original.id as string };
    } catch (error) {
      this.logger.error(`Reversal failed (RRN ${request?.rrn})`, (error as Error).stack);
      return { responseCode: '96', message: describeResponseCode('96') };
    }
  }

  /** Every authorization decision goes to the audit trail (never the PIN block or full PAN). */
  private async record(
    card: CardDocument | null,
    r: CardAuthorizeRequest,
    result: CardAuthorizeResponse,
  ) {
    await this.audit.record({
      action: AuditAction.CARD_TRANSACTION,
      outcome: result.responseCode === '00' ? 'SUCCESS' : 'FAILURE',
      actor: card ? { id: card.customerId.toString(), role: Role.CUSTOMER } : undefined,
      entity: card ? { type: 'Card', id: card._id.toString() } : undefined,
      details: {
        operation: r.operation,
        amount: r.amount,
        cardLast4: r.pan.slice(-4),
        terminalId: r.terminalId,
        merchant: r.merchantName,
        stan: r.stan,
        rrn: r.rrn,
        responseCode: result.responseCode,
        response: result.message,
      },
    });
  }
}
