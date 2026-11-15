export type AccountType = 'SAVINGS' | 'CURRENT';
export type AccountStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'FROZEN' | 'CLOSED' | 'REJECTED';
export type Direction = 'DEBIT' | 'CREDIT';
export type TransactionStatus =
  'PENDING_APPROVAL' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REJECTED' | 'REVERSED';
export type Rail = 'INTERNAL' | 'IMPS' | 'NEFT' | 'RTGS' | 'CARD' | 'CASH' | 'SYSTEM';
export type ExternalRail = 'IMPS' | 'NEFT' | 'RTGS';

export interface Account {
  id: string;
  accountNumber: string;
  maskedNumber: string;
  type: AccountType;
  status: AccountStatus;
  nickname?: string;
  ifsc: string;
  branch: { code: string; name: string; city: string };
  currency: string;
  ledgerBalance: number;
  holdAmount: number;
  availableBalance: number;
  dailyTransferLimit: number;
  interestRatePercent: number;
  statusReason?: string;
  openedAt?: string;
  createdAt: string;
}

export interface Posting {
  id: string;
  accountId: string;
  transactionId: string;
  reference: string;
  direction: Direction;
  amount: number;
  balanceAfter: number;
  narration: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  category: string;
  channel: string;
  createdAt: string;
}

export interface Overview {
  totalBalance: number;
  totalAvailable: number;
  accounts: Account[];
  cashflow: { month: string; label: string; inflow: number; outflow: number }[];
  spendingByCategory: { category: string; amount: number }[];
  recent: Posting[];
}

export interface Branch {
  code: string;
  name: string;
  city: string;
  state: string;
  address: string;
  ifsc: string;
}

export interface Beneficiary {
  id: string;
  name: string;
  nickname?: string;
  accountNumber: string;
  maskedAccount: string;
  ifsc: string;
  bankName: string;
  branchName?: string;
  isInternal: boolean;
  inCoolingPeriod: boolean;
  coolingUntil: string;
  createdAt: string;
}

export interface IfscDetails {
  ifsc: string;
  bank: string;
  branch: string;
  city?: string;
  state?: string;
  address?: string;
  rails: { imps: boolean; neft: boolean; rtgs: boolean; upi: boolean };
  source: 'LIVE' | 'CACHE' | 'INTERNAL' | 'OFFLINE';
}

export interface Party {
  accountId?: string;
  maskedAccount: string;
  name: string;
  bankName?: string;
  ifsc?: string;
}

export interface Transaction {
  id: string;
  reference: string;
  type: string;
  rail: Rail;
  channel: string;
  status: TransactionStatus;
  amount: number;
  fee: number;
  currency: string;
  direction?: Direction;
  from?: Party;
  to?: Party;
  remarks?: string;
  category: string;
  failureReason?: string;
  settlementDueAt?: string;
  completedAt?: string;
  createdAt: string;
  risk?: { level: string; score?: number; decision?: string; reasons?: string[]; source?: string };
  metadata?: Record<string, unknown>;
}

export interface TransferRequest {
  fromAccountId: string;
  mode: 'OWN' | 'BENEFICIARY';
  toAccountId?: string;
  beneficiaryId?: string;
  rail?: ExternalRail;
  amount: number;
  purpose?: string;
  remarks?: string;
}

export interface OtpChallenge {
  challengeId: string;
  channel: 'SMS' | 'TOTP';
  expiresAt: string;
  destination: string;
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
  rail: Rail;
  railLabel: string;
  settlement: 'INSTANT' | 'DEFERRED';
  amount: number;
  fee: number;
  total: number;
  approvalRequired: boolean;
  otp: OtpChallenge | null;
  risk: { level: string; score: number; reasons: string[] };
}

export interface RailInfo {
  rail: ExternalRail;
  label: string;
  description: string;
  settlement: 'INSTANT' | 'DEFERRED';
}

export type NotificationType =
  'TRANSACTION' | 'SECURITY' | 'OTP' | 'APPROVAL' | 'ACCOUNT' | 'SYSTEM';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export const TRANSFER_PURPOSES = [
  { value: 'TRANSFER', label: 'General transfer' },
  { value: 'FAMILY', label: 'Family and friends' },
  { value: 'RENT', label: 'Rent' },
  { value: 'BILLS', label: 'Bills and utilities' },
  { value: 'SHOPPING', label: 'Shopping' },
  { value: 'EDUCATION', label: 'Education' },
  { value: 'INVESTMENT', label: 'Investment' },
  { value: 'OTHER', label: 'Other' },
] as const;
