/**
 * Domain events (Observer pattern). Modules publish facts ("a transaction
 * completed") and other modules react (notifications, audit, ledger posting)
 * without the publisher knowing who listens.
 */
export const DomainEvents = {
  TRANSACTION_COMPLETED: 'transaction.completed',
  TRANSACTION_PROCESSING: 'transaction.processing',
  TRANSACTION_HELD: 'transaction.held',
  TRANSACTION_REJECTED: 'transaction.rejected',
  TRANSACTION_FAILED: 'transaction.failed',
  TRANSACTION_REVERSED: 'transaction.reversed',
  OTP_ISSUED: 'otp.issued',
  BENEFICIARY_ADDED: 'beneficiary.added',
  ACCOUNT_OPENED: 'account.opened',
  ACCOUNT_REQUESTED: 'account.requested',
  ACCOUNT_STATUS_CHANGED: 'account.status_changed',
  APPROVAL_REQUESTED: 'approval.requested',
  APPROVAL_DECIDED: 'approval.decided',
  KYC_REVIEWED: 'kyc.reviewed',
} as const;

export interface TransactionEvent {
  transactionId: string;
}

export interface OtpIssuedEvent {
  userId: string;
  code: string;
  purpose: string;
  message: string;
}

export interface BeneficiaryAddedEvent {
  userId: string;
  beneficiaryName: string;
  maskedAccount: string;
  bankName: string;
}

export interface AccountEvent {
  accountId: string;
  customerId: string;
}

export interface ApprovalEvent {
  approvalId: string;
}
