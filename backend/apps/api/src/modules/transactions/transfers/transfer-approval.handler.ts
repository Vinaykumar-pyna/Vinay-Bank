import { Injectable, type OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ClientSession } from 'mongoose';
import { TransactionStatus } from '../../../common/enums/banking.enums';
import { DomainEvents, type TransactionEvent } from '../../../common/events/domain-events';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthUser } from '../../../common/types/auth.types';
import { AccountLedgerService } from '../../accounts/account-ledger.service';
import { ApprovalType, type ApprovalDocument } from '../../approvals/approval.schema';
import {
  ApprovalsService,
  type ApprovalHandler,
  type HandlerOutcome,
} from '../../approvals/approvals.service';
import { assertTransition } from '../transaction-state';
import { TransactionsService } from '../transactions.service';
import { TransfersService } from './transfers.service';

/** Checker decision for a high-value or risk-flagged transfer whose funds are on hold. */
@Injectable()
export class TransferApprovalHandler implements ApprovalHandler, OnModuleInit {
  constructor(
    private readonly approvals: ApprovalsService,
    private readonly transactions: TransactionsService,
    private readonly transfers: TransfersService,
    private readonly ledger: AccountLedgerService,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.approvals.registerHandler(ApprovalType.HIGH_VALUE_TRANSFER, this);
  }

  async approve(
    approval: ApprovalDocument,
    checker: AuthUser,
    session: ClientSession,
  ): Promise<HandlerOutcome> {
    const txn = await this.loadHeld(approval, session);
    // The held amount is released and debited in one atomic update.
    const afterCommit = await this.transfers.applyMovement(txn, session, txn.amount + txn.fee);
    txn.metadata = { ...(txn.metadata ?? {}), approvedBy: checker.id };
    await txn.save({ session });
    return { afterCommit };
  }

  async reject(
    approval: ApprovalDocument,
    _checker: AuthUser,
    reason: string,
    session: ClientSession,
  ) {
    const txn = await this.loadHeld(approval, session);
    await this.ledger.releaseHold(txn.from!.accountId!, txn.amount + txn.fee, session);
    assertTransition(txn.status, TransactionStatus.REJECTED);
    txn.status = TransactionStatus.REJECTED;
    txn.failureReason = `Not approved by the bank: ${reason}`;
    await txn.save({ session });
    return {
      afterCommit: () => {
        this.events.emit(DomainEvents.TRANSACTION_REJECTED, {
          transactionId: txn.id,
        } satisfies TransactionEvent);
      },
    };
  }

  private async loadHeld(approval: ApprovalDocument, session: ClientSession) {
    const txn = await this.transactions.model.findById(approval.entityId).session(session);
    if (!txn || txn.status !== TransactionStatus.PENDING_APPROVAL) {
      throw AppException.conflict('The transfer is no longer waiting for approval');
    }
    return txn;
  }
}
