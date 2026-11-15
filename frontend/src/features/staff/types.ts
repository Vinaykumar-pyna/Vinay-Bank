import type { KycStatus, Role, UserProfile } from '@/features/auth/types';
import type { Account, AccountStatus, AccountType, Transaction } from '@/features/banking/types';

export interface DailyVolume {
  date: string;
  label: string;
  count: number;
  amount: number;
}

export interface RailShare {
  rail: string;
  count: number;
  amount: number;
}

export interface AuditSummary {
  seq: number;
  at: string;
  action: string;
  outcome: 'SUCCESS' | 'FAILURE';
  actorLabel?: string;
  actorRole?: string;
  entityType?: string;
}

export interface StaffOverview {
  customers: { total: number; kycPending: number };
  accounts: { total: number; active: number; frozen: number; pendingApproval: number };
  deposits: { total: number };
  today: { count: number; volume: number };
  approvals: { pending: number };
  flagged: { last7Days: number };
  volume7d: DailyVolume[];
  railMix: RailShare[];
  recentFlagged: Transaction[];
  recentAudit: AuditSummary[];
  /** Java (Spring Boot) risk engine: live health and circuit breaker state */
  riskEngine: {
    health: 'UP' | 'DOWN' | 'DISABLED';
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    url: string;
  };
}

export interface CustomerSummary {
  id: string;
  customerId?: string;
  fullName: string;
  email: string;
  phone: string;
  kycStatus: KycStatus;
  status: 'ACTIVE' | 'DISABLED';
  accounts: number;
  totalBalance: number;
  createdAt: string;
}

export interface CustomerDetail {
  profile: UserProfile;
  accounts: Account[];
  recentTransactions: Transaction[];
}

export type ApprovalType =
  'HIGH_VALUE_TRANSFER' | 'ACCOUNT_OPENING' | 'CASH_DEPOSIT' | 'CASH_WITHDRAWAL';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** A maker-checker request. Comes from a lean MongoDB query, so the id is `_id`. */
export interface Approval {
  _id: string;
  type: ApprovalType;
  status: ApprovalStatus;
  entityType: string;
  entityId: string;
  title: string;
  amount?: number;
  customerId?: string;
  customerName?: string;
  accountNumber?: string;
  details?: Record<string, unknown>;
  makerId: string;
  makerRole: Role;
  makerName: string;
  checkerId?: string;
  checkerName?: string;
  decidedAt?: string;
  remarks?: string;
  branchCode?: string;
  createdAt: string;
}

export interface AuditEntry {
  _id: string;
  seq: number;
  at: string;
  action: string;
  outcome: 'SUCCESS' | 'FAILURE';
  actorId?: string;
  actorRole?: string;
  actorLabel?: string;
  entityType?: string;
  entityId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  details?: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

export interface AuditVerification {
  valid: boolean;
  checked: number;
  firstInvalidSeq?: number;
  reason?: string;
  lastHash: string;
  verifiedAt: string;
  durationMs: number;
}

export interface AccountLookup {
  accountId: string;
  accountNumber: string;
  type: AccountType;
  status: AccountStatus;
  branch?: string;
  holderName: string;
  customerId?: string;
  kycStatus?: KycStatus;
  availableBalance: number;
}

export type CashKind = 'deposit' | 'withdrawal';

export interface CashOperationRequest {
  kind: CashKind;
  /** One per cash slip, reused on retry so the money never moves twice. */
  idempotencyKey: string;
  accountNumber: string;
  amount: number;
  remarks?: string;
  counterpartyName?: string;
}

export type StaffRole = Exclude<Role, 'CUSTOMER'>;

export interface CreateStaffRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: StaffRole;
  branchCode: string;
  password: string;
}

export const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  HIGH_VALUE_TRANSFER: 'High-value transfer',
  ACCOUNT_OPENING: 'Account opening',
  CASH_DEPOSIT: 'Cash deposit',
  CASH_WITHDRAWAL: 'Cash withdrawal',
};

/** Same thresholds as the API (cash.service.ts): amounts at or above these need approval. */
export const CASH_APPROVAL_THRESHOLDS: Record<CashKind, number> = {
  deposit: 200_000 * 100,
  withdrawal: 50_000 * 100,
};

// ---------------------------------------------------------------------------
// General ledger (SQL)
// ---------------------------------------------------------------------------

export interface TrialBalanceRow {
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface TrialBalance {
  generatedAt: string;
  entries: number;
  rows: TrialBalanceRow[];
  totals: { debit: number; credit: number };
  balanced: boolean;
}

export interface Reconciliation {
  generatedAt: string;
  accountsChecked: number;
  matched: number;
  mismatches: {
    accountNumber: string;
    maskedNumber: string;
    status: string;
    coreBalance: number;
    ledgerBalance: number;
    difference: number;
  }[];
  pendingTransactions: number;
}

export interface JournalEntryView {
  id: number;
  sourceId: string;
  kind: 'POSTING' | 'REVERSAL';
  reference: string;
  transactionType: string;
  rail: string;
  narration: string;
  postedAt: string;
  lines: {
    glCode: string;
    glName: string;
    accountNumber: string | null;
    debit: number;
    credit: number;
  }[];
}
