import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { formatInr, maskAccountNumber } from '@app/shared';
import { Channel, TransactionType } from '../../common/enums/banking.enums';
import { Role } from '../../common/enums/role.enum';
import {
  DomainEvents,
  type AccountEvent,
  type ApprovalEvent,
  type BeneficiaryAddedEvent,
  type OtpIssuedEvent,
  type TransactionEvent,
} from '../../common/events/domain-events';
import type { AppConfig } from '../../config/configuration';
import { Account } from '../accounts/schemas/account.schema';
import { Approval } from '../approvals/approval.schema';
import { AuthEvents, type LoginSucceededEvent, type SecurityEvent } from '../auth/auth.events';
import type { KycReviewedEvent } from '../staff/customers-admin.service';
import { Transaction } from '../transactions/schemas/transaction.schema';
import { KycStatus } from '../users/user.schema';
import { NotificationType } from './notification.schema';
import { NotificationsService } from './notifications.service';

const time = (date: Date) =>
  date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

/** Turns domain events into customer and staff notifications (Observer pattern). */
@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);
  private readonly demoMode: boolean;

  constructor(
    private readonly notifications: NotificationsService,
    @InjectModel(Transaction.name) private readonly transactions: Model<Transaction>,
    @InjectModel(Account.name) private readonly accounts: Model<Account>,
    @InjectModel(Approval.name) private readonly approvals: Model<Approval>,
    config: ConfigService<AppConfig, true>,
  ) {
    this.demoMode = config.get('demoMode', { infer: true });
  }

  @OnEvent(DomainEvents.TRANSACTION_COMPLETED, { async: true })
  async onCompleted({ transactionId }: TransactionEvent): Promise<void> {
    const txn = await this.transactions.findById(transactionId).lean();
    if (!txn) return;
    const from = txn.from;
    const to = txn.to;
    const amount = formatInr(txn.amount);
    const self = Boolean(
      from?.customerId && to?.customerId && String(from.customerId) === String(to.customerId),
    );

    if (self && from && to) {
      await this.notifications.notify(from.customerId!.toString(), {
        type: NotificationType.TRANSACTION,
        title: `${amount} moved between your accounts`,
        message: `From ${maskAccountNumber(from.accountNumber)} to ${maskAccountNumber(to.accountNumber)}. Ref ${txn.reference}.`,
        link: `/app/transactions/${transactionId}`,
        data: { transactionId, direction: 'SELF' },
      });
      return;
    }

    // Bulk files get one summary for the payer instead of an alert per payment.
    if (from?.customerId && from.accountId && txn.channel !== Channel.BULK_UPLOAD) {
      const balance = await this.available(from.accountId.toString());
      const verb = txn.type === TransactionType.ATM_WITHDRAWAL ? 'withdrawn' : 'debited';
      await this.notifications.notify(from.customerId.toString(), {
        type: NotificationType.TRANSACTION,
        title: `${amount} ${verb}`,
        message:
          `${amount} ${verb} from A/c ${maskAccountNumber(from.accountNumber)}` +
          `${to ? ` to ${to.name}` : ''} via ${txn.rail}. Ref ${txn.reference}.` +
          (balance !== null ? ` Available balance ${formatInr(balance)}.` : ''),
        link: `/app/transactions/${transactionId}`,
        data: { transactionId, direction: 'DEBIT', amount: txn.amount },
      });
    }
    if (to?.customerId && to.accountId) {
      const balance = await this.available(to.accountId.toString());
      await this.notifications.notify(to.customerId.toString(), {
        type: NotificationType.TRANSACTION,
        title: `${amount} credited`,
        message:
          `${amount} credited to A/c ${maskAccountNumber(to.accountNumber)}` +
          `${from ? ` from ${from.name}` : ''}. Ref ${txn.reference}.` +
          (balance !== null ? ` Available balance ${formatInr(balance)}.` : ''),
        link: `/app/transactions/${transactionId}`,
        data: { transactionId, direction: 'CREDIT', amount: txn.amount },
      });
    }
  }

  @OnEvent(DomainEvents.TRANSACTION_PROCESSING, { async: true })
  async onProcessing({ transactionId }: TransactionEvent): Promise<void> {
    const txn = await this.transactions.findById(transactionId).lean();
    if (!txn?.from?.customerId) return;
    await this.notifications.notify(txn.from.customerId.toString(), {
      type: NotificationType.TRANSACTION,
      title: `${txn.rail} of ${formatInr(txn.amount)} is being processed`,
      message: `${formatInr(txn.amount + txn.fee)} debited for ${txn.to?.name}. It will settle in batch ${txn.settlementBatch ?? ''}. Ref ${txn.reference}.`,
      link: `/app/transactions/${transactionId}`,
      data: { transactionId },
    });
  }

  @OnEvent(DomainEvents.TRANSACTION_HELD, { async: true })
  async onHeld({ transactionId }: TransactionEvent): Promise<void> {
    const txn = await this.transactions.findById(transactionId).lean();
    if (!txn?.from?.customerId) return;
    await this.notifications.notify(txn.from.customerId.toString(), {
      type: NotificationType.TRANSACTION,
      title: 'Transfer waiting for bank approval',
      message: `Your transfer of ${formatInr(txn.amount)} to ${txn.to?.name} needs a quick review by your branch. The money is reserved in your account and you will be notified of the outcome.`,
      link: `/app/transactions/${transactionId}`,
      data: { transactionId },
    });
  }

  @OnEvent(DomainEvents.TRANSACTION_REJECTED, { async: true })
  async onRejected({ transactionId }: TransactionEvent): Promise<void> {
    const txn = await this.transactions.findById(transactionId).lean();
    if (!txn?.from?.customerId) return;
    await this.notifications.notify(txn.from.customerId.toString(), {
      type: NotificationType.TRANSACTION,
      title: 'Transfer not approved',
      message: `${txn.failureReason ?? 'Your transfer was not approved'}. The reserved ${formatInr(txn.amount + txn.fee)} is available again.`,
      link: `/app/transactions/${transactionId}`,
      data: { transactionId },
    });
  }

  @OnEvent(DomainEvents.TRANSACTION_REVERSED, { async: true })
  async onReversed({ transactionId }: TransactionEvent): Promise<void> {
    const txn = await this.transactions.findById(transactionId).lean();
    if (!txn?.from?.customerId) return;
    await this.notifications.notify(txn.from.customerId.toString(), {
      type: NotificationType.TRANSACTION,
      title: `${formatInr(txn.amount + txn.fee)} refunded`,
      message: `${txn.rail} to ${txn.to?.name} was returned (${txn.failureReason}). The money is back in A/c ${maskAccountNumber(txn.from.accountNumber)}.`,
      link: `/app/transactions/${transactionId}`,
      data: { transactionId },
    });
  }

  /** Simulated SMS gateway: in demo mode the OTP lands in the notification centre. */
  @OnEvent(DomainEvents.OTP_ISSUED, { async: true })
  async onOtp(event: OtpIssuedEvent): Promise<void> {
    if (!this.demoMode) {
      this.logger.warn(
        'No SMS gateway configured; OTP not delivered (enable DEMO_MODE for local runs)',
      );
      return;
    }
    await this.notifications.notify(event.userId, {
      type: NotificationType.OTP,
      title: 'SMS: one-time password',
      message: event.message,
      data: { purpose: event.purpose },
    });
  }

  @OnEvent(DomainEvents.BENEFICIARY_ADDED, { async: true })
  async onBeneficiary(event: BeneficiaryAddedEvent): Promise<void> {
    await this.notifications.notify(event.userId, {
      type: NotificationType.SECURITY,
      title: 'New payee added',
      message: `${event.beneficiaryName} (${event.bankName}, ${event.maskedAccount}) was added to your payees. For safety, transfers to a new payee are capped for the first 24 hours. Not you? Contact us immediately.`,
      link: '/app/beneficiaries',
    });
  }

  @OnEvent(DomainEvents.ACCOUNT_OPENED, { async: true })
  async onAccountOpened(event: AccountEvent): Promise<void> {
    const account = await this.accounts.findById(event.accountId).lean();
    if (!account) return;
    await this.notifications.notify(event.customerId, {
      type: NotificationType.ACCOUNT,
      title: `Your ${account.type.toLowerCase()} account is open`,
      message: `A/c ${account.accountNumber} (IFSC ${account.ifsc}) is active and ready to use.`,
      link: `/app/accounts/${event.accountId}`,
    });
  }

  @OnEvent(DomainEvents.ACCOUNT_STATUS_CHANGED, { async: true })
  async onAccountStatus(event: AccountEvent): Promise<void> {
    const account = await this.accounts.findById(event.accountId).lean();
    if (!account || !event.customerId) return;
    await this.notifications.notify(event.customerId, {
      type: NotificationType.ACCOUNT,
      title: `Account ${maskAccountNumber(account.accountNumber)} is now ${account.status.toLowerCase().replace('_', ' ')}`,
      message: account.statusReason ?? 'Your account status was updated by the bank.',
      link: `/app/accounts/${event.accountId}`,
    });
  }

  @OnEvent(DomainEvents.APPROVAL_REQUESTED, { async: true })
  async onApprovalRequested({ approvalId }: ApprovalEvent): Promise<void> {
    const approval = await this.approvals.findById(approvalId).lean();
    if (!approval) return;
    await this.notifications.notifyRoles([Role.MANAGER, Role.ADMIN], {
      type: NotificationType.APPROVAL,
      title: 'Approval needed',
      message: `${approval.title} (requested by ${approval.makerName}).`,
      link: '/staff/approvals',
      data: { approvalId },
    });
  }

  @OnEvent(DomainEvents.APPROVAL_DECIDED, { async: true })
  async onApprovalDecided({ approvalId }: ApprovalEvent): Promise<void> {
    const approval = await this.approvals.findById(approvalId).lean();
    if (!approval || approval.makerRole === String(Role.CUSTOMER)) return; // customers hear via the transaction
    await this.notifications.notify(approval.makerId.toString(), {
      type: NotificationType.APPROVAL,
      title: `Request ${approval.status.toLowerCase()}`,
      message: `${approval.title} was ${approval.status.toLowerCase()} by ${approval.checkerName}${approval.remarks ? `: ${approval.remarks}` : ''}.`,
      link: '/staff/approvals',
      data: { approvalId },
    });
  }

  @OnEvent(DomainEvents.KYC_REVIEWED, { async: true })
  async onKycReviewed(event: KycReviewedEvent): Promise<void> {
    const verified = event.decision === KycStatus.VERIFIED;
    await this.notifications.notify(event.userId, {
      type: NotificationType.ACCOUNT,
      title: verified ? 'Your KYC is verified' : 'KYC needs attention',
      message: verified
        ? 'Thank you. Your KYC is verified and your full transfer limits are now available.'
        : `We could not verify your KYC: ${event.remarks}. Please visit your branch with original documents.`,
      link: '/app/profile',
    });
  }

  @OnEvent(AuthEvents.LOGIN_SUCCEEDED, { async: true })
  async onLogin(event: LoginSucceededEvent): Promise<void> {
    await this.notifications.notify(event.userId, {
      type: NotificationType.SECURITY,
      title: 'New sign-in to your account',
      message: `Signed in on ${event.deviceLabel} at ${time(event.at)}. If this was not you, change your password and sign out other devices.`,
      link: '/app/profile',
    });
  }

  @OnEvent(AuthEvents.PASSWORD_CHANGED, { async: true })
  async onPasswordChanged(event: SecurityEvent): Promise<void> {
    await this.notifications.notify(event.userId, {
      type: NotificationType.SECURITY,
      title: 'Password changed',
      message: `Your password was changed at ${time(event.at)} and other devices were signed out.`,
    });
  }

  @OnEvent(AuthEvents.MFA_CHANGED, { async: true })
  async onMfaChanged(event: SecurityEvent): Promise<void> {
    await this.notifications.notify(event.userId, {
      type: NotificationType.SECURITY,
      title: `Two-factor authentication ${event.detail}`,
      message: `Two-factor authentication was ${event.detail} at ${time(event.at)}.`,
    });
  }

  @OnEvent(AuthEvents.ACCOUNT_LOCKED, { async: true })
  async onLocked(event: SecurityEvent): Promise<void> {
    await this.notifications.notify(event.userId, {
      type: NotificationType.SECURITY,
      title: 'Sign-in locked after failed attempts',
      message: `We locked sign-in after several wrong passwords or codes. It unlocks automatically at ${time(new Date(event.detail ?? Date.now()))}.`,
    });
  }

  private async available(accountId: string): Promise<number | null> {
    const account = await this.accounts
      .findById(accountId)
      .select('ledgerBalance holdAmount')
      .lean();
    return account ? account.ledgerBalance - account.holdAmount : null;
  }
}
