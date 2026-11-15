import { HttpStatus, Injectable, type OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Connection, Model } from 'mongoose';
import { canonicalJson, formatInr, maskAccountNumber, sha256Hex } from '@app/shared';
import { BANK_NAME } from '../../common/constants/app.constants';
import { findBranchByCode } from '../../common/constants/branches';
import { RUPEE } from '../../common/constants/limits';
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
import { AccountLedgerService } from '../accounts/account-ledger.service';
import { Account, type AccountDocument } from '../accounts/schemas/account.schema';
import { ApprovalType, type ApprovalDocument } from '../approvals/approval.schema';
import {
  ApprovalsService,
  type ApprovalHandler,
  type HandlerOutcome,
} from '../approvals/approvals.service';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import type { TransactionDocument } from '../transactions/schemas/transaction.schema';
import { assertTransition } from '../transactions/transaction-state';
import { toTransactionView, type TransactionView } from '../transactions/transaction.mapper';
import { TransactionsService } from '../transactions/transactions.service';
import { User } from '../users/user.schema';
import type { CashOperationDto } from './dto/staff.dto';

/** Cash at or above these amounts needs a second person (maker-checker). */
export const CASH_DEPOSIT_APPROVAL_THRESHOLD = 200_000 * RUPEE;
export const CASH_WITHDRAWAL_APPROVAL_THRESHOLD = 50_000 * RUPEE;

type CashKind = 'DEPOSIT' | 'WITHDRAWAL';

/**
 * Branch cash operations performed by a teller (the maker). Small amounts post
 * immediately; large ones become approval requests for a manager (the checker).
 * Withdrawals reserve the money with a hold while waiting.
 */
@Injectable()
export class CashService implements OnModuleInit {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Account.name) private readonly accounts: Model<Account>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly ledger: AccountLedgerService,
    private readonly transactions: TransactionsService,
    private readonly approvals: ApprovalsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly idempotency: IdempotencyService,
  ) {}

  onModuleInit(): void {
    const handler = (kind: CashKind): ApprovalHandler => ({
      approve: (approval, checker, session) => this.approveHeld(kind, approval, checker, session),
      reject: (approval, _checker, reason, session) =>
        this.rejectHeld(kind, approval, reason, session),
    });
    this.approvals.registerHandler(ApprovalType.CASH_DEPOSIT, handler('DEPOSIT'));
    this.approvals.registerHandler(ApprovalType.CASH_WITHDRAWAL, handler('WITHDRAWAL'));
  }

  /** Teller screen: who owns this account and can it be used? */
  async lookup(accountNumber: string) {
    const account = await this.accounts.findOne({ accountNumber }).lean();
    if (!account) throw AppException.notFound('Account');
    const holder = await this.users.findById(account.customerId).lean();
    return {
      accountId: account._id.toString(),
      accountNumber: account.accountNumber,
      type: account.type,
      status: account.status,
      branch: findBranchByCode(account.branchCode)?.name,
      holderName: holder ? `${holder.firstName} ${holder.lastName}` : 'Unknown',
      customerId: holder?.customerId,
      kycStatus: holder?.kyc?.status,
      availableBalance: account.ledgerBalance - account.holdAmount,
    };
  }

  /**
   * Posts a cash deposit or withdrawal, or holds it for a manager's approval.
   * Idempotent: a retried request with the same Idempotency-Key returns the
   * original result instead of moving the money twice.
   */
  async operate(
    kind: CashKind,
    teller: AuthUser,
    dto: CashOperationDto,
    idempotencyKey: string,
    ctx: RequestContext,
  ): Promise<{ transaction: TransactionView; replayed: boolean }> {
    const started = await this.idempotency.begin<TransactionView>(
      teller.id,
      idempotencyKey,
      sha256Hex(canonicalJson({ kind, ...dto })),
    );
    if (started.replay) return { transaction: started.response, replayed: true };
    try {
      return {
        transaction: await this.perform(kind, teller, dto, idempotencyKey, ctx),
        replayed: false,
      };
    } catch (error) {
      await this.idempotency.abandon(teller.id, idempotencyKey);
      throw error;
    }
  }

  private async perform(
    kind: CashKind,
    teller: AuthUser,
    dto: CashOperationDto,
    idempotencyKey: string,
    ctx: RequestContext,
  ): Promise<TransactionView> {
    const threshold =
      kind === 'DEPOSIT' ? CASH_DEPOSIT_APPROVAL_THRESHOLD : CASH_WITHDRAWAL_APPROVAL_THRESHOLD;
    const needsApproval = dto.amount >= threshold;
    const tellerUser = await this.users.findById(teller.id).lean();
    const tellerName = tellerUser ? `${tellerUser.firstName} ${tellerUser.lastName}` : 'Teller';
    const branchName = findBranchByCode(tellerUser?.branchCode ?? '0001')?.name ?? BANK_NAME;

    const { view, afterCommit } = await this.connection.transaction(async (session) => {
      const account = await this.accounts
        .findOne({ accountNumber: dto.accountNumber })
        .session(session);
      if (!account) throw AppException.notFound('Account');
      this.assertUsable(kind, account);
      const holder = await this.users.findById(account.customerId).session(session).lean();
      const holderName = holder ? `${holder.firstName} ${holder.lastName}` : 'Account holder';
      const cashParty = {
        accountNumber: 'CASH',
        name: dto.counterpartyName || (kind === 'DEPOSIT' ? 'Cash deposit' : 'Cash withdrawal'),
        bankName: branchName,
      };
      const accountParty = {
        accountId: account._id,
        accountNumber: account.accountNumber,
        ifsc: account.ifsc,
        name: holderName,
        bankName: BANK_NAME,
        customerId: account.customerId,
      };

      const txn = await this.transactions.create(
        {
          type: kind === 'DEPOSIT' ? TransactionType.CASH_DEPOSIT : TransactionType.CASH_WITHDRAWAL,
          rail: PaymentRail.CASH,
          channel: Channel.BRANCH,
          status: TransactionStatus.PENDING_APPROVAL,
          amount: dto.amount,
          from: kind === 'DEPOSIT' ? cashParty : accountParty,
          to: kind === 'DEPOSIT' ? accountParty : cashParty,
          initiatedBy: tellerUser!._id,
          initiatorRole: teller.role,
          remarks: dto.remarks,
          category: Category.CASH,
          metadata: { tellerId: teller.id, tellerName, branch: branchName },
        },
        session,
      );

      let after: () => void;
      if (needsApproval) {
        if (kind === 'WITHDRAWAL') await this.ledger.placeHold(account._id, dto.amount, session);
        const approval = await this.approvals.create(
          {
            type: kind === 'DEPOSIT' ? ApprovalType.CASH_DEPOSIT : ApprovalType.CASH_WITHDRAWAL,
            entityType: 'Transaction',
            entityId: txn._id,
            title: `Cash ${kind.toLowerCase()} of ${formatInr(dto.amount)} for ${holderName}`,
            amount: dto.amount,
            customerId: account.customerId,
            customerName: holderName,
            accountNumber: account.accountNumber,
            details: { reference: txn.reference, branch: branchName, remarks: dto.remarks },
            maker: { id: teller.id, role: teller.role, name: tellerName },
            branchCode: account.branchCode,
          },
          session,
        );
        txn.approvalId = approval._id;
        after = () => this.approvals.announce(approval);
      } else {
        after = await this.post(kind, txn, session, 0);
      }
      await txn.save({ session });
      const result = toTransactionView(txn.toObject(), teller);
      await this.idempotency.complete(teller.id, idempotencyKey, result, session);
      return { view: result, afterCommit: after };
    });

    await this.audit.record({
      action: kind === 'DEPOSIT' ? AuditAction.CASH_DEPOSIT : AuditAction.CASH_WITHDRAWAL,
      actor: { id: teller.id, role: teller.role, label: tellerName },
      entity: { type: 'Transaction', id: view.id },
      context: ctx,
      details: {
        reference: view.reference,
        amount: dto.amount,
        account: maskAccountNumber(dto.accountNumber),
        status: view.status,
      },
    });
    afterCommit();
    return view;
  }

  private assertUsable(kind: CashKind, account: AccountDocument): void {
    const allowed =
      kind === 'DEPOSIT' ? [AccountStatus.ACTIVE, AccountStatus.FROZEN] : [AccountStatus.ACTIVE];
    if (!allowed.includes(account.status)) {
      throw new AppException(
        ErrorCode.ACCOUNT_NOT_ACTIVE,
        kind === 'DEPOSIT'
          ? 'This account cannot accept deposits'
          : 'Withdrawals are not allowed on this account',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  /** Posts the cash movement and its statement line; completes the transaction. */
  private async post(
    kind: CashKind,
    txn: TransactionDocument,
    session: ClientSession,
    fromHold: number,
  ) {
    const accountId = kind === 'DEPOSIT' ? txn.to!.accountId! : txn.from!.accountId!;
    const updated =
      kind === 'DEPOSIT'
        ? await this.ledger.credit(accountId, txn.amount, session)
        : await this.ledger.debit(accountId, txn.amount, session, fromHold);
    const branch = typeof txn.metadata?.branch === 'string' ? txn.metadata.branch : 'branch';
    await this.ledger.post(
      [
        {
          accountId: updated._id,
          transactionId: txn._id,
          reference: txn.reference,
          direction: kind === 'DEPOSIT' ? PostingDirection.CREDIT : PostingDirection.DEBIT,
          amount: txn.amount,
          balanceAfter: updated.ledgerBalance,
          narration: `Cash ${kind === 'DEPOSIT' ? 'deposit' : 'withdrawal'} at ${branch}${txn.remarks ? ` - ${txn.remarks}` : ''}`,
          counterpartyName: kind === 'DEPOSIT' ? txn.from?.name : txn.to?.name,
          category: Category.CASH,
          channel: Channel.BRANCH,
          selfTransfer: false,
        },
      ],
      session,
    );
    assertTransition(txn.status, TransactionStatus.COMPLETED);
    txn.status = TransactionStatus.COMPLETED;
    txn.completedAt = new Date();
    const id = txn._id.toString();
    return () => {
      this.events.emit(DomainEvents.TRANSACTION_COMPLETED, {
        transactionId: id,
      } satisfies TransactionEvent);
    };
  }

  private async approveHeld(
    kind: CashKind,
    approval: ApprovalDocument,
    _checker: AuthUser,
    session: ClientSession,
  ): Promise<HandlerOutcome> {
    const txn = await this.loadHeld(approval, session);
    const afterCommit = await this.post(kind, txn, session, kind === 'WITHDRAWAL' ? txn.amount : 0);
    await txn.save({ session });
    return { afterCommit };
  }

  private async rejectHeld(
    kind: CashKind,
    approval: ApprovalDocument,
    reason: string,
    session: ClientSession,
  ): Promise<HandlerOutcome> {
    const txn = await this.loadHeld(approval, session);
    if (kind === 'WITHDRAWAL')
      await this.ledger.releaseHold(txn.from!.accountId!, txn.amount, session);
    assertTransition(txn.status, TransactionStatus.REJECTED);
    txn.status = TransactionStatus.REJECTED;
    txn.failureReason = `Not approved: ${reason}`;
    await txn.save({ session });
    const id = txn._id.toString();
    return {
      afterCommit: () => {
        this.events.emit(DomainEvents.TRANSACTION_REJECTED, {
          transactionId: id,
        } satisfies TransactionEvent);
      },
    };
  }

  private async loadHeld(approval: ApprovalDocument, session: ClientSession) {
    const txn = await this.transactions.model.findById(approval.entityId).session(session);
    if (!txn || txn.status !== TransactionStatus.PENDING_APPROVAL) {
      throw AppException.conflict('This cash request is no longer waiting for approval');
    }
    return txn;
  }
}
