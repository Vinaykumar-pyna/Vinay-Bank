import { baseApi } from '@/api/baseApi';
import type { Paginated } from '@/api/axiosBaseQuery';
import type { UserProfile } from '@/features/auth/types';
import type { Account, Transaction } from '@/features/banking/types';
import type {
  AccountLookup,
  Approval,
  ApprovalStatus,
  ApprovalType,
  AuditEntry,
  AuditVerification,
  CashOperationRequest,
  CreateStaffRequest,
  CustomerDetail,
  CustomerSummary,
  JournalEntryView,
  Reconciliation,
  StaffOverview,
  TrialBalance,
} from './types';

export interface CustomerQuery {
  page?: number;
  limit?: number;
  search?: string;
  kycStatus?: string;
}

export interface ApprovalQuery {
  page?: number;
  limit?: number;
  status?: ApprovalStatus | '';
  type?: ApprovalType | '';
}

export interface AuditQuery {
  page?: number;
  limit?: number;
  seq?: number;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
}

function clean<T extends object>(params: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
}

/**
 * Staff portal endpoints. Every mutation invalidates the tags it affects, so the
 * overview KPIs, approval queue and customer views stay consistent without manual refetching.
 */
export const staffApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getStaffOverview: build.query<StaffOverview, void>({
      query: () => '/staff/overview',
      providesTags: ['Approval', 'Customer', 'Transaction', 'Account', 'Audit'],
    }),

    searchCustomers: build.query<Paginated<CustomerSummary>, CustomerQuery>({
      query: (params) => ({ url: '/staff/customers', params: clean(params) }),
      providesTags: ['Customer'],
    }),
    getCustomer: build.query<CustomerDetail, string>({
      query: (id) => `/staff/customers/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Customer', id }, 'Account', 'Transaction'],
    }),
    reviewKyc: build.mutation<
      UserProfile,
      { id: string; decision: 'VERIFIED' | 'REJECTED'; remarks: string }
    >({
      query: ({ id, ...data }) => ({ url: `/staff/customers/${id}/kyc`, method: 'POST', data }),
      invalidatesTags: ['Customer'],
    }),
    setUserStatus: build.mutation<
      UserProfile,
      { id: string; status: 'ACTIVE' | 'DISABLED'; reason: string }
    >({
      query: ({ id, ...data }) => ({ url: `/staff/users/${id}/status`, method: 'POST', data }),
      invalidatesTags: ['Customer', 'Staff'],
    }),
    setAccountStatus: build.mutation<
      Account,
      { id: string; status: 'ACTIVE' | 'FROZEN' | 'CLOSED'; reason: string }
    >({
      query: ({ id, ...data }) => ({ url: `/accounts/${id}/status`, method: 'POST', data }),
      invalidatesTags: ['Customer', 'Account'],
    }),

    lookupAccount: build.query<AccountLookup, string>({
      query: (accountNumber) => ({ url: '/staff/accounts/lookup', params: { accountNumber } }),
      providesTags: ['Account'],
    }),
    cashOperation: build.mutation<Transaction, CashOperationRequest>({
      query: ({ kind, idempotencyKey, ...data }) => ({
        url: `/staff/cash/${kind}`,
        method: 'POST',
        data,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      invalidatesTags: ['Transaction', 'Account', 'Approval', 'Customer'],
    }),

    getApprovals: build.query<Paginated<Approval>, ApprovalQuery>({
      query: (params) => ({ url: '/approvals', params: clean(params) }),
      providesTags: ['Approval'],
    }),
    decideApproval: build.mutation<
      Approval,
      { id: string; decision: 'APPROVED' | 'REJECTED'; remarks?: string }
    >({
      query: ({ id, ...data }) => ({ url: `/approvals/${id}/decision`, method: 'POST', data }),
      invalidatesTags: ['Approval', 'Transaction', 'Account', 'Customer'],
    }),

    getAuditLogs: build.query<Paginated<AuditEntry>, AuditQuery>({
      query: (params) => ({ url: '/audit', params: clean(params) }),
      providesTags: ['Audit'],
    }),
    // A GET on the wire, but modelled as a mutation: it runs on demand and records its own audit event.
    verifyAuditChain: build.mutation<AuditVerification, void>({
      query: () => ({ url: '/audit/verify', method: 'GET' }),
      invalidatesTags: ['Audit'],
    }),

    getStaffUsers: build.query<UserProfile[], void>({
      query: () => '/staff/users',
      providesTags: ['Staff'],
    }),
    createStaffUser: build.mutation<UserProfile, CreateStaffRequest>({
      query: (data) => ({ url: '/staff/users', method: 'POST', data }),
      invalidatesTags: ['Staff'],
    }),

    getTrialBalance: build.query<TrialBalance, void>({
      query: () => '/ledger/trial-balance',
      providesTags: ['Ledger'],
    }),
    getReconciliation: build.query<Reconciliation, void>({
      query: () => '/ledger/reconciliation',
      providesTags: ['Ledger'],
    }),
    getJournal: build.query<
      { total: number; items: JournalEntryView[] },
      { page?: number; limit?: number }
    >({
      query: (params) => ({ url: '/ledger/journal', params: clean(params) }),
      providesTags: ['Ledger'],
    }),
    syncLedger: build.mutation<{ posted: number; reversed: number; skipped: number }, void>({
      query: () => ({ url: '/ledger/sync', method: 'POST' }),
      invalidatesTags: ['Ledger'],
    }),

    runSettlement: build.mutation<{ settled: number }, void>({
      query: () => ({ url: '/transactions/settlement/run', method: 'POST' }),
      invalidatesTags: ['Transaction', 'Account'],
    }),
  }),
});

export const {
  useGetStaffOverviewQuery,
  useSearchCustomersQuery,
  useGetCustomerQuery,
  useReviewKycMutation,
  useSetUserStatusMutation,
  useSetAccountStatusMutation,
  useLookupAccountQuery,
  useCashOperationMutation,
  useGetApprovalsQuery,
  useDecideApprovalMutation,
  useGetAuditLogsQuery,
  useVerifyAuditChainMutation,
  useGetStaffUsersQuery,
  useCreateStaffUserMutation,
  useRunSettlementMutation,
  useGetTrialBalanceQuery,
  useGetReconciliationQuery,
  useGetJournalQuery,
  useSyncLedgerMutation,
} = staffApi;
