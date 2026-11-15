import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Connection, Model, Types } from 'mongoose';
import { formatInr, istDateStamp, istHour, maskAccountNumber, sha256Hex } from '@app/shared';
import { BANK_NAME } from '../../../common/constants/app.constants';
import {
  COOLING_PERIOD_TRANSFER_LIMIT,
  KYC_PENDING_DAILY_LIMIT,
} from '../../../common/constants/limits';
import {
  AccountStatus,
  Category,
  Channel,
  PaymentRail,
  PostingDirection,
  TransactionStatus,
  TransactionType,
} from '../../../common/enums/banking.enums';
import { DomainEvents, type TransactionEvent } from '../../../common/events/domain-events';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes';
import type { AuthUser, RequestContext } from '../../../common/types/auth.types';
import type { AppConfig } from '../../../config/configuration';
import { AccountLedgerService } from '../../accounts/account-ledger.service';
import { Account, type AccountDocument } from '../../accounts/schemas/account.schema';
import { Posting } from '../../accounts/schemas/posting.schema';
import { ApprovalType } from '../../approvals/approval.schema';
import { ApprovalsService } from '../../approvals/approvals.service';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import { BeneficiariesService } from '../../beneficiaries/beneficiaries.service';
import { IdempotencyService } from '../../idempotency/idempotency.service';
import { OtpService, type IssuedChallenge } from '../../otp/otp.service';
import { RiskService } from '../../risk/risk.service';
import type { RiskAssessment } from '../../risk/risk.types';
import { KycStatus, type UserDocument } from '../../users/user.schema';
import { UsersService } from '../../users/users.service';
import type { ExecuteTransferDto, TransferPurpose, TransferRequestDto } from '../dto/transfer.dto';
import { EXTERNAL_RAILS, railPolicy } from '../rails/payment-rails';
import type { TransactionDocument } from '../schemas/transaction.schema';
import { toTransactionView, type TransactionView } from '../transaction.mapper';
import { TransactionsService } from '../transactions.service';
import { QuoteTokenService, type QuotePayload } from './quote-token.service';

const PURPOSE_CATEGORY: Record<TransferPurpose, Category> = {
  TRANSFER: Category.TRANSFER,
  RENT: Category.RENT,
  BILLS: Category.BILLS,
  FAMILY: Category.FAMILY,
  SHOPPING: Category.SHOPPING,
  EDUCATION: Category.EDUCATION,
  INVESTMENT: Category.INVESTMENT,
  OTHER: Category.OTHER,
};

interface ResolvedPayee {
  kind: 'OWN' | 'BENEFICIARY';
  id: string;
  name: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  /** Set when the money stays inside ArthaBank and must be credited to this account. */
  internalAccount?: AccountDocument;
  beneficiaryId?: Types.ObjectId;
  coolingUntil?: Date;
  beneficiaryAgeHours: number | null;
}

export interface TransferQuote {
  quoteToken: string;
  expiresAt: string;
  from: { id: string; maskedNumber: string; nickname?: string; availableBalance: number };
  payee: {
    kind: 'OWN' | 'BENEFICIARY';
    name: string;
    maskedAccount: string;
    bankName: string;
    ifsc: string;
  };
  rail: PaymentRail;
  railLabel: string;
  settlement: 'INSTANT' | 'DEFERRED';
  amount: number;
  fee: number;
  total: number;
  approvalRequired: boolean;
  otp: IssuedChallenge | null;
  risk: { level: string; score: number; reasons: string[] };
}

type PostCommit = () => void;

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);
  private readonly banking: AppConfig['banking'];

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Account.name) private readonly accounts: Model<Account>,
    @InjectModel(Posting.name) private readonly postings: Model<Posting>,
    private readonly ledger: AccountLedgerService,
    private readonly transactions: TransactionsService,
    private readonly beneficiaries: BeneficiariesService,
    private readonly users: UsersService,
    private readonly risk: RiskService,
    private readonly otp: OtpService,
    private readonly quotes: QuoteTokenService,
    private readonly idempotency: IdempotencyService,
    private readonly approvals: ApprovalsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    config: ConfigService<AppConfig, true>,
  ) {
    this.banking = config.get('banking', { infer: true });
  }

  // ---------------------------------------------------------------------------
  // Step 1: quote (validate, price, score risk, issue OTP)
  // ---------------------------------------------------------------------------

  async quote(
    user: AuthUser,
    dto: TransferRequestDto,
    ctx: RequestContext,
  ): Promise<TransferQuote> {
    const customer = await this.users.findByIdOrThrow(user.id);
    const from = await this.loadSourceAccount(dto.fromAccountId, user.id);
    const payee = await this.resolvePayee(
      user.id,
      dto.mode,
      dto.mode === 'OWN' ? dto.toAccountId! : dto.beneficiaryId!,
      from,
    );
    const rail = payee.internalAccount ? PaymentRail.INTERNAL : (dto.rail ?? PaymentRail.IMPS);
    if (
      !payee.internalAccount &&
      !EXTERNAL_RAILS.includes(rail as (typeof EXTERNAL_RAILS)[number])
    ) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Choose IMPS, NEFT or RTGS for other banks',
      );
    }
    const policy = railPolicy(rail);
    const railError = policy.validate(dto.amount);
    if (railError) throw AppException.unprocessable(ErrorCode.LIMIT_EXCEEDED, railError);

    const fee = policy.fee(dto.amount);
    const total = dto.amount + fee;
    const available = from.ledgerBalance - from.holdAmount;
    if (available < total) {
      throw new AppException(
        ErrorCode.INSUFFICIENT_FUNDS,
        `Insufficient balance. Available: ${formatInr(available)}, needed: ${formatInr(total)}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { available, required: total },
      );
    }
    await this.assertWithinLimits(from, customer, payee, dto.amount);

    const assessment = await this.assessRisk(customer, from, payee, dto.amount, rail);
    if (assessment.decision === 'BLOCK') {
      await this.audit.record({
        action: AuditAction.TRANSFER_BLOCKED,
        outcome: 'FAILURE',
        actor: { id: user.id, role: user.role },
        entity: { type: 'Account', id: from.id },
        context: ctx,
        details: {
          amount: dto.amount,
          payee: maskAccountNumber(payee.accountNumber),
          risk: assessment,
        },
      });
      throw new AppException(
        ErrorCode.RISK_BLOCKED,
        'For your safety this transfer was blocked by our fraud checks. Please contact your branch if this is genuine.',
        HttpStatus.UNPROCESSABLE_ENTITY,
        { reasons: assessment.reasons },
      );
    }

    const ownTransfer = payee.kind === 'OWN';
    const approvalRequired =
      !ownTransfer &&
      (assessment.decision === 'REVIEW' || dto.amount >= this.banking.highValueThresholdPaise);
    const otpRequired = !ownTransfer || assessment.decision === 'STEP_UP';

    const payload = this.quotes.prepare({
      sub: user.id,
      fromAccountId: from.id,
      payee: { kind: payee.kind, id: payee.id },
      rail,
      amount: dto.amount,
      fee,
      category: ownTransfer ? Category.TRANSFER : PURPOSE_CATEGORY[dto.purpose ?? 'TRANSFER'],
      remarks: dto.remarks || undefined,
      approvalRequired,
      risk: {
        score: assessment.score,
        level: assessment.level,
        decision: assessment.decision,
        reasons: assessment.reasons,
        source: assessment.source,
      },
    });

    let challenge: IssuedChallenge | null = null;
    if (otpRequired) {
      challenge = await this.otp.issue(
        { id: user.id, phone: customer.phone, mfaEnabled: Boolean(customer.mfa?.enabled) },
        'TRANSFER',
        this.quotes.contextHash(payload),
        (code) =>
          `${code} is your ArthaBank OTP to send ${formatInr(dto.amount)} to ${payee.name}. ` +
          'Valid for 5 minutes. Never share it with anyone, including bank staff.',
      );
      payload.otp = { challengeId: challenge.challengeId, channel: challenge.channel };
    }

    return {
      quoteToken: this.quotes.sign(payload),
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      from: {
        id: from.id,
        maskedNumber: maskAccountNumber(from.accountNumber),
        nickname: from.nickname,
        availableBalance: available,
      },
      payee: {
        kind: payee.kind,
        name: payee.name,
        maskedAccount: maskAccountNumber(payee.accountNumber),
        bankName: payee.bankName,
        ifsc: payee.ifsc,
      },
      rail,
      railLabel: policy.label,
      settlement: policy.settlement,
      amount: dto.amount,
      fee,
      total,
      approvalRequired,
      otp: challenge,
      risk: { level: assessment.level, score: assessment.score, reasons: assessment.reasons },
    };
  }

  // ---------------------------------------------------------------------------
  // Step 2: execute (idempotent, OTP-verified, one ACID transaction)
  // ---------------------------------------------------------------------------

  async execute(
    user: AuthUser,
    dto: ExecuteTransferDto,
    idempotencyKey: string,
    ctx: RequestContext,
  ): Promise<{ transaction: TransactionView; replayed: boolean }> {
    const quote = this.quotes.verify(dto.quoteToken, user.id);
    const started = await this.idempotency.begin<TransactionView>(
      user.id,
      idempotencyKey,
      sha256Hex(dto.quoteToken),
    );
    if (started.replay) return { transaction: started.response, replayed: true };

    try {
      if (quote.otp) {
        if (!dto.otp) {
          throw new AppException(
            ErrorCode.OTP_REQUIRED,
            'Enter the verification code to confirm this transfer',
          );
        }
        await this.otp.verify(
          quote.otp.challengeId,
          user.id,
          dto.otp,
          this.quotes.contextHash(quote),
        );
      }

      const { view, afterCommit } = await this.connection.transaction(async (session) => {
        const result = await this.performTransfer(user, quote, session);
        await this.idempotency.complete(user.id, idempotencyKey, result.view, session);
        return result;
      });

      await this.audit.record({
        action:
          view.status === TransactionStatus.PENDING_APPROVAL
            ? AuditAction.TRANSFER_HELD_FOR_APPROVAL
            : AuditAction.TRANSFER_COMPLETED,
        actor: { id: user.id, role: user.role },
        entity: { type: 'Transaction', id: view.id },
        context: ctx,
        details: {
          reference: view.reference,
          amount: view.amount,
          fee: view.fee,
          rail: view.rail,
          status: view.status,
          risk: quote.risk,
        },
      });
      afterCommit();
      return { transaction: view, replayed: false };
    } catch (error) {
      await this.idempotency.abandon(user.id, idempotencyKey);
      throw error;
    }
  }

  /** Runs inside the MongoDB transaction: every write below commits or rolls back together. */
  private async performTransfer(
    user: AuthUser,
    quote: QuotePayload,
    session: ClientSession,
  ): Promise<{ view: TransactionView; afterCommit: PostCommit }> {
    const customer = await this.users.findByIdOrThrow(user.id);
    const from = await this.loadSourceAccount(quote.fromAccountId, user.id, session);
    const payee = await this.resolvePayee(user.id, quote.payee.kind, quote.payee.id, from, session);
    // Limits are re-checked inside the transaction: the quote may be minutes old.
    await this.assertWithinLimits(from, customer, payee, quote.amount, session);

    const txn = await this.transactions.create(
      {
        type: TransactionType.TRANSFER,
        rail: quote.rail,
        channel: Channel.NET_BANKING,
        status: TransactionStatus.PENDING_APPROVAL,
        amount: quote.amount,
        fee: quote.fee,
        from: {
          accountId: from._id,
          accountNumber: from.accountNumber,
          ifsc: from.ifsc,
          name: `${customer.firstName} ${customer.lastName}`,
          bankName: BANK_NAME,
          customerId: customer._id,
        },
        to: {
          accountId: payee.internalAccount?._id,
          accountNumber: payee.accountNumber,
          ifsc: payee.ifsc,
          name: payee.name,
          bankName: payee.bankName,
          customerId: payee.internalAccount?.customerId,
          beneficiaryId: payee.beneficiaryId,
        },
        initiatedBy: customer._id,
        initiatorRole: user.role,
        remarks: quote.remarks,
        category: quote.category,
        risk: quote.risk,
      },
      session,
    );

    let afterCommit: PostCommit;
    if (quote.approvalRequired) {
      await this.ledger.placeHold(from._id, quote.amount + quote.fee, session);
      const approval = await this.approvals.create(
        {
          type: ApprovalType.HIGH_VALUE_TRANSFER,
          entityType: 'Transaction',
          entityId: txn._id,
          title: `${quote.rail} transfer of ${formatInr(quote.amount)} to ${payee.name}`,
          amount: quote.amount,
          customerId: customer._id,
          customerName: `${customer.firstName} ${customer.lastName}`,
          accountNumber: from.accountNumber,
          details: {
            reference: txn.reference,
            rail: quote.rail,
            payee: payee.name,
            payeeAccount: maskAccountNumber(payee.accountNumber),
            payeeBank: payee.bankName,
            risk: quote.risk,
          },
          maker: {
            id: user.id,
            role: user.role,
            name: `${customer.firstName} ${customer.lastName}`,
          },
          branchCode: from.branchCode,
        },
        session,
      );
      txn.approvalId = approval._id;
      afterCommit = () => {
        this.approvals.announce(approval);
        this.emit(DomainEvents.TRANSACTION_HELD, txn._id.toString());
      };
    } else {
      afterCommit = await this.applyMovement(txn, session, 0);
    }
    await txn.save({ session });
    return { view: toTransactionView(txn.toObject(), user), afterCommit };
  }

  /**
   * Moves the money for a transfer: debit (optionally releasing a hold), fee,
   * credit for in-bank payees, statement postings and the status change.
   * Shared by direct execution and by the maker-checker approval handler.
   */
  async applyMovement(
    txn: TransactionDocument,
    session: ClientSession,
    fromHold: number,
  ): Promise<PostCommit> {
    const from = txn.from!;
    const to = txn.to!;
    const total = txn.amount + txn.fee;
    // Compare as strings: robust whether the ids are ObjectIds or already-serialised values.
    const selfTransfer = Boolean(
      to.customerId && from.customerId && String(to.customerId) === String(from.customerId),
    );
    const debited = await this.ledger.debit(from.accountId!, total, session, fromHold);

    const remarks = txn.remarks ? ` - ${txn.remarks}` : '';
    const debitNarration = selfTransfer
      ? `Transfer to own account ${maskAccountNumber(to.accountNumber)}${remarks}`
      : txn.rail === PaymentRail.INTERNAL
        ? `To ${to.name} (ArthaBank)${remarks}`
        : `${txn.rail} to ${to.name} (${to.bankName ?? to.ifsc})${remarks}`;

    const postings: Partial<Posting>[] = [
      {
        accountId: debited._id,
        transactionId: txn._id,
        reference: txn.reference,
        direction: PostingDirection.DEBIT,
        amount: txn.amount,
        balanceAfter: debited.ledgerBalance + txn.fee,
        narration: debitNarration,
        counterpartyName: to.name,
        counterpartyAccount: maskAccountNumber(to.accountNumber),
        category: txn.category,
        channel: txn.channel,
        selfTransfer,
      },
    ];
    if (txn.fee > 0) {
      postings.push({
        accountId: debited._id,
        transactionId: txn._id,
        reference: txn.reference,
        direction: PostingDirection.DEBIT,
        amount: txn.fee,
        balanceAfter: debited.ledgerBalance,
        narration: `${txn.rail} charges incl. GST (${txn.reference})`,
        category: Category.FEES,
        channel: txn.channel,
        selfTransfer: false,
      });
    }
    if (to.accountId) {
      const credited = await this.ledger.credit(to.accountId, txn.amount, session);
      postings.push({
        accountId: credited._id,
        transactionId: txn._id,
        reference: txn.reference,
        direction: PostingDirection.CREDIT,
        amount: txn.amount,
        balanceAfter: credited.ledgerBalance,
        narration: selfTransfer
          ? `Transfer from own account ${maskAccountNumber(from.accountNumber)}${remarks}`
          : `From ${from.name} (ArthaBank)${remarks}`,
        counterpartyName: from.name,
        counterpartyAccount: maskAccountNumber(from.accountNumber),
        category: Category.TRANSFER,
        channel: txn.channel,
        selfTransfer,
      });
    }
    await this.ledger.post(postings, session);

    const now = new Date();
    if (txn.rail === PaymentRail.NEFT) {
      txn.status = TransactionStatus.PROCESSING;
      txn.settlementDueAt = new Date(now.getTime() + this.banking.neftSettlementSeconds * 1000);
      txn.settlementBatch = `NEFT-${istDateStamp(now)}-${String(istHour(now)).padStart(2, '0')}${now.getUTCMinutes() < 30 ? '00' : '30'}`;
      return () => this.emit(DomainEvents.TRANSACTION_PROCESSING, txn._id.toString());
    }
    txn.status = TransactionStatus.COMPLETED;
    txn.completedAt = now;
    return () => this.emit(DomainEvents.TRANSACTION_COMPLETED, txn._id.toString());
  }

  // ---------------------------------------------------------------------------

  private async loadSourceAccount(accountId: string, userId: string, session?: ClientSession) {
    const account = await this.accounts.findById(accountId).session(session ?? null);
    if (!account || account.customerId.toString() !== userId)
      throw AppException.notFound('Account');
    if (account.status !== AccountStatus.ACTIVE) {
      throw AppException.unprocessable(
        ErrorCode.ACCOUNT_NOT_ACTIVE,
        account.status === AccountStatus.FROZEN
          ? 'This account is frozen for debits. Please contact your branch.'
          : 'This account cannot be used for payments',
      );
    }
    return account;
  }

  private async resolvePayee(
    userId: string,
    kind: 'OWN' | 'BENEFICIARY',
    id: string,
    from: AccountDocument,
    session?: ClientSession,
  ): Promise<ResolvedPayee> {
    if (kind === 'OWN') {
      const to = await this.accounts.findById(id).session(session ?? null);
      if (!to || to.customerId.toString() !== userId)
        throw AppException.notFound('Destination account');
      if (to._id.equals(from._id)) {
        throw new AppException(ErrorCode.VALIDATION_FAILED, 'Choose two different accounts');
      }
      if (![AccountStatus.ACTIVE, AccountStatus.FROZEN].includes(to.status)) {
        throw AppException.unprocessable(
          ErrorCode.ACCOUNT_NOT_ACTIVE,
          'The destination account is not active',
        );
      }
      return {
        kind,
        id: to.id,
        name: to.nickname ? `${to.nickname} (own account)` : 'Own account',
        accountNumber: to.accountNumber,
        ifsc: to.ifsc,
        bankName: BANK_NAME,
        internalAccount: to,
        beneficiaryAgeHours: null,
      };
    }

    const beneficiary = await this.beneficiaries.getOwned(id, userId);
    let internalAccount: AccountDocument | undefined;
    if (beneficiary.isInternal && beneficiary.internalAccountId) {
      internalAccount =
        (await this.accounts.findById(beneficiary.internalAccountId).session(session ?? null)) ??
        undefined;
      if (
        !internalAccount ||
        ![AccountStatus.ACTIVE, AccountStatus.FROZEN].includes(internalAccount.status)
      ) {
        throw AppException.unprocessable(
          ErrorCode.ACCOUNT_NOT_ACTIVE,
          "The payee's account cannot receive money",
        );
      }
    }
    return {
      kind,
      id: beneficiary.id,
      name: beneficiary.name,
      accountNumber: beneficiary.accountNumber,
      ifsc: beneficiary.ifsc,
      bankName: beneficiary.bankName,
      internalAccount,
      beneficiaryId: beneficiary._id,
      coolingUntil: beneficiary.coolingUntil,
      beneficiaryAgeHours: (Date.now() - beneficiary.createdAt.getTime()) / 3_600_000,
    };
  }

  private async assertWithinLimits(
    from: AccountDocument,
    customer: UserDocument,
    payee: ResolvedPayee,
    amount: number,
    session?: ClientSession,
  ): Promise<void> {
    if (payee.kind === 'BENEFICIARY' && payee.coolingUntil && payee.coolingUntil > new Date()) {
      if (amount > COOLING_PERIOD_TRANSFER_LIMIT) {
        throw new AppException(
          ErrorCode.LIMIT_EXCEEDED,
          `This payee was added recently. Until ${payee.coolingUntil.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} you can send at most ${formatInr(COOLING_PERIOD_TRANSFER_LIMIT)} per transfer.`,
          HttpStatus.UNPROCESSABLE_ENTITY,
          {
            coolingUntil: payee.coolingUntil.toISOString(),
            maxAmount: COOLING_PERIOD_TRANSFER_LIMIT,
          },
        );
      }
    }
    if (payee.kind === 'OWN') return; // moving money between own accounts is not limited

    const kycVerified = customer.kyc?.status === KycStatus.VERIFIED;
    const limit = kycVerified
      ? from.dailyTransferLimit
      : Math.min(from.dailyTransferLimit, KYC_PENDING_DAILY_LIMIT);
    const usedToday = await this.transactions.debitedToday(from._id, session);
    if (usedToday + amount > limit) {
      const remaining = Math.max(0, limit - usedToday);
      throw new AppException(
        ErrorCode.LIMIT_EXCEEDED,
        `This exceeds your daily transfer limit. You can send ${formatInr(remaining)} more today${kycVerified ? '' : ' (limit is lower until your KYC is verified)'}.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { limit, usedToday, remaining },
      );
    }
  }

  private async assessRisk(
    customer: UserDocument,
    from: AccountDocument,
    payee: ResolvedPayee,
    amount: number,
    rail: PaymentRail,
  ): Promise<RiskAssessment> {
    const now = Date.now();
    const [lastHour, last24h, average] = await Promise.all([
      this.transactions.outgoingSince(from._id, new Date(now - 3_600_000)),
      this.transactions.outgoingSince(from._id, new Date(now - 86_400_000)),
      this.postings.aggregate<{ avg: number }>([
        {
          $match: {
            accountId: from._id,
            direction: PostingDirection.DEBIT,
            selfTransfer: false,
            createdAt: { $gte: new Date(now - 90 * 86_400_000) },
          },
        },
        { $group: { _id: null, avg: { $avg: '$amount' } } },
      ]),
    ]);
    try {
      return await this.risk.assess({
        amount,
        rail,
        channel: Channel.NET_BANKING,
        ownAccountTransfer: payee.kind === 'OWN',
        beneficiaryAgeHours: payee.beneficiaryAgeHours,
        transfersLastHour: lastHour.count,
        amountLast24h: last24h.total,
        dailyLimit: from.dailyTransferLimit,
        averageDebit90d: Math.round(average[0]?.avg ?? 0),
        hourOfDayIst: istHour(),
        accountAgeDays: (now - from.createdAt.getTime()) / 86_400_000,
        kycVerified: customer.kyc?.status === KycStatus.VERIFIED,
      });
    } catch (error) {
      this.logger.error('Risk assessment failed', (error as Error).stack);
      throw new AppException(
        ErrorCode.SERVICE_UNAVAILABLE,
        'We could not complete security checks. Please try again shortly.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private emit(event: string, transactionId: string): void {
    this.events.emit(event, { transactionId } satisfies TransactionEvent);
  }
}
