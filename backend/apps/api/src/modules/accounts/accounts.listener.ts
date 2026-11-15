import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AccountStatus, AccountType } from '../../common/enums/banking.enums';
import { DomainEvents, type AccountEvent } from '../../common/events/domain-events';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { AuthEvents, type UserRegisteredEvent } from '../auth/auth.events';
import { AccountsService } from './accounts.service';

@Injectable()
export class AccountsListener {
  constructor(
    private readonly accounts: AccountsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  /** Digital onboarding: every new customer gets a zero-balance savings account immediately. */
  @OnEvent(AuthEvents.USER_REGISTERED, { suppressErrors: false })
  async openFirstAccount(event: UserRegisteredEvent): Promise<void> {
    const account = await this.accounts.open({
      customerId: event.userId,
      type: AccountType.SAVINGS,
      status: AccountStatus.ACTIVE,
      nickname: 'Savings',
    });
    await this.audit.record({
      action: AuditAction.ACCOUNT_OPENED,
      actor: { id: event.userId, role: 'CUSTOMER' },
      entity: { type: 'Account', id: account.id },
      details: {
        accountNumber: account.accountNumber,
        type: account.type,
        channel: 'DIGITAL_ONBOARDING',
      },
    });
    this.events.emit(DomainEvents.ACCOUNT_OPENED, {
      accountId: account.id,
      customerId: event.userId,
    } satisfies AccountEvent);
  }
}
