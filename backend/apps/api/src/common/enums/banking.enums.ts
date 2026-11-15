export enum AccountType {
  SAVINGS = 'SAVINGS',
  CURRENT = 'CURRENT',
}

/** FROZEN is a debit freeze: the account can still receive money but cannot send any. */
export enum AccountStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
  CLOSED = 'CLOSED',
  REJECTED = 'REJECTED',
}

export enum TransactionType {
  TRANSFER = 'TRANSFER',
  CASH_DEPOSIT = 'CASH_DEPOSIT',
  CASH_WITHDRAWAL = 'CASH_WITHDRAWAL',
  CARD_PAYMENT = 'CARD_PAYMENT',
  ATM_WITHDRAWAL = 'ATM_WITHDRAWAL',
  BILL_PAYMENT = 'BILL_PAYMENT',
  SALARY_CREDIT = 'SALARY_CREDIT',
  INTEREST_CREDIT = 'INTEREST_CREDIT',
  REVERSAL = 'REVERSAL',
  BULK_TRANSFER = 'BULK_TRANSFER',
}

/** Transaction lifecycle (a state machine; see transaction-state.ts for the allowed moves). */
export enum TransactionStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REJECTED = 'REJECTED',
  REVERSED = 'REVERSED',
}

export enum PaymentRail {
  INTERNAL = 'INTERNAL',
  IMPS = 'IMPS',
  NEFT = 'NEFT',
  RTGS = 'RTGS',
  CARD = 'CARD',
  CASH = 'CASH',
  SYSTEM = 'SYSTEM',
}

export enum Channel {
  NET_BANKING = 'NET_BANKING',
  BRANCH = 'BRANCH',
  ATM = 'ATM',
  POS = 'POS',
  BULK_UPLOAD = 'BULK_UPLOAD',
  SOAP = 'SOAP',
  SYSTEM = 'SYSTEM',
}

export enum PostingDirection {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

/** Spending/income categories used for analytics on the dashboard. */
export enum Category {
  SALARY = 'SALARY',
  TRANSFER = 'TRANSFER',
  RENT = 'RENT',
  BILLS = 'BILLS',
  FOOD = 'FOOD',
  GROCERIES = 'GROCERIES',
  SHOPPING = 'SHOPPING',
  TRAVEL = 'TRAVEL',
  ENTERTAINMENT = 'ENTERTAINMENT',
  HEALTH = 'HEALTH',
  EDUCATION = 'EDUCATION',
  FAMILY = 'FAMILY',
  CASH = 'CASH',
  INVESTMENT = 'INVESTMENT',
  FEES = 'FEES',
  INTEREST = 'INTEREST',
  REFUND = 'REFUND',
  OTHER = 'OTHER',
}
