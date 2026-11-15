import { Injectable, type OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model } from 'mongoose';
import { AccountStatus } from '../../common/enums/banking.enums';
import { DomainEvents, type AccountEvent } from '../../common/events/domain-events';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { AuthUser } from '../../common/types/auth.types';
import { ApprovalType, type ApprovalDocument } from '../approvals/approval.schema';
import {
  ApprovalsService,
  type ApprovalHandler,
  type HandlerOutcome,
} from '../approvals/approvals.service';
import { User } from '../users/user.schema';
import { KycStatus } from '../users/user.schema';
import { Account } from './schemas/account.schema';

/** Checker decision for a customer's request to open an additional account. */
@Injectable()
export class AccountOpeningHandler implements ApprovalHandler, OnModuleInit {
  constructor(
    private readonly approvals: ApprovalsService,
    @InjectModel(Account.name) private readonly accounts: Model<Account>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.approvals.registerHandler(ApprovalType.ACCOUNT_OPENING, this);
  }

  async approve(
    approval: ApprovalDocument,
    checker: AuthUser,
    session: ClientSession,
  ): Promise<HandlerOutcome> {
    const customer = await this.users.findById(approval.customerId).session(session).lean();
    if (customer?.kyc?.status !== KycStatus.VERIFIED) {
      throw AppException.unprocessable(
        ErrorCode.INVALID_STATE,
        "Verify the customer's KYC before approving a new account",
      );
    }
    const account = await this.accounts.findOneAndUpdate(
      { _id: approval.entityId, status: AccountStatus.PENDING_APPROVAL },
      {
        $set: { status: AccountStatus.ACTIVE, openedAt: new Date(), approvedBy: checker.id },
        $unset: { statusReason: 1 },
      },
      { new: true, session },
    );
    if (!account) throw AppException.conflict('The account is no longer awaiting approval');
    return {
      afterCommit: () => {
        this.events.emit(DomainEvents.ACCOUNT_OPENED, {
          accountId: account.id,
          customerId: account.customerId.toString(),
        } satisfies AccountEvent);
      },
    };
  }

  async reject(
    approval: ApprovalDocument,
    _checker: AuthUser,
    reason: string,
    session: ClientSession,
  ) {
    await this.accounts.updateOne(
      { _id: approval.entityId, status: AccountStatus.PENDING_APPROVAL },
      { $set: { status: AccountStatus.REJECTED, statusReason: reason } },
      { session },
    );
    return {
      afterCommit: () => {
        this.events.emit(DomainEvents.ACCOUNT_STATUS_CHANGED, {
          accountId: approval.entityId.toString(),
          customerId: approval.customerId?.toString() ?? '',
        } satisfies AccountEvent);
      },
    };
  }
}
