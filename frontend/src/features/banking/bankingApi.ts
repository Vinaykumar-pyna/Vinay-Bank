import { baseApi } from '@/api/baseApi';
import type { Paginated } from '@/api/axiosBaseQuery';
import type {
  Account,
  AccountType,
  AppNotification,
  Bank,
  Beneficiary,
  Branch,
  IfscDetails,
  Overview,
  Posting,
  RailInfo,
  Transaction,
  TransferQuote,
  TransferRequest,
} from './types';

export interface StatementQuery {
  id: string;
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  direction?: 'ALL' | 'DEBIT' | 'CREDIT';
  search?: string;
}

export interface TransactionQuery {
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
  rail?: string;
  riskLevel?: string;
  accountId?: string;
  search?: string;
}

/** Removes empty filters so they are not sent as `?status=`. */
function clean<T extends object>(params: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
}

/**
 * Banking endpoints. Tags drive cache invalidation: completing a transfer
 * invalidates 'Account' and 'Transaction', so balances, statements and the
 * dashboard refetch automatically.
 */
export const bankingApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAccounts: build.query<Account[], void>({
      query: () => '/accounts',
      providesTags: ['Account'],
    }),
    getOverview: build.query<Overview, void>({
      query: () => '/accounts/overview',
      providesTags: ['Account', 'Transaction'],
    }),
    getAccount: build.query<Account, string>({
      query: (id) => `/accounts/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Account', id }],
    }),
    getStatement: build.query<Paginated<Posting>, StatementQuery>({
      query: ({ id, ...params }) => ({ url: `/accounts/${id}/statement`, params: clean(params) }),
      providesTags: ['Transaction'],
    }),
    getBranches: build.query<Branch[], void>({
      query: () => '/accounts/branches',
      keepUnusedDataFor: 3600,
    }),
    requestAccount: build.mutation<
      Account,
      { type: AccountType; nickname?: string; branchCode?: string }
    >({
      query: (data) => ({ url: '/accounts', method: 'POST', data }),
      invalidatesTags: ['Account'],
    }),
    updateAccount: build.mutation<
      Account,
      { id: string; nickname?: string; dailyTransferLimit?: number }
    >({
      query: ({ id, ...data }) => ({ url: `/accounts/${id}`, method: 'PATCH', data }),
      invalidatesTags: ['Account'],
    }),

    getBeneficiaries: build.query<Beneficiary[], void>({
      query: () => '/beneficiaries',
      providesTags: ['Beneficiary'],
    }),
    addBeneficiary: build.mutation<
      Beneficiary,
      {
        name: string;
        nickname?: string;
        accountNumber: string;
        confirmAccountNumber: string;
        ifsc: string;
      }
    >({
      query: (data) => ({ url: '/beneficiaries', method: 'POST', data }),
      invalidatesTags: ['Beneficiary'],
    }),
    removeBeneficiary: build.mutation<void, string>({
      query: (id) => ({ url: `/beneficiaries/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Beneficiary'],
    }),
    getBanks: build.query<Bank[], void>({
      query: () => '/banks',
      keepUnusedDataFor: 3600,
    }),
    lookupIfsc: build.query<IfscDetails, string>({
      query: (code) => `/ifsc/${encodeURIComponent(code)}`,
      keepUnusedDataFor: 3600,
    }),

    getRails: build.query<RailInfo[], void>({
      query: () => '/transfers/rails',
      keepUnusedDataFor: 3600,
    }),
    quoteTransfer: build.mutation<TransferQuote, TransferRequest>({
      query: (data) => ({ url: '/transfers/quote', method: 'POST', data }),
    }),
    executeTransfer: build.mutation<
      Transaction,
      { quoteToken: string; otp?: string; idempotencyKey: string }
    >({
      query: ({ idempotencyKey, ...data }) => ({
        url: '/transfers',
        method: 'POST',
        data,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      invalidatesTags: ['Account', 'Transaction'],
    }),

    getTransactions: build.query<Paginated<Transaction>, TransactionQuery>({
      query: (params) => ({ url: '/transactions', params: clean(params) }),
      providesTags: ['Transaction'],
    }),
    getTransaction: build.query<Transaction, string>({
      query: (id) => `/transactions/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Transaction', id }],
    }),

    getNotifications: build.query<
      Paginated<AppNotification>,
      { page?: number; limit?: number; unreadOnly?: boolean }
    >({
      query: (params) => ({ url: '/notifications', params: clean(params) }),
      providesTags: ['Notification'],
    }),
    getUnreadCount: build.query<{ unread: number }, void>({
      query: () => '/notifications/unread-count',
      providesTags: ['Notification'],
    }),
    markNotificationRead: build.mutation<void, string>({
      query: (id) => ({ url: `/notifications/${id}/read`, method: 'POST' }),
      invalidatesTags: ['Notification'],
    }),
    markAllNotificationsRead: build.mutation<{ updated: number }, void>({
      query: () => ({ url: '/notifications/read-all', method: 'POST' }),
      invalidatesTags: ['Notification'],
    }),
  }),
});

export const {
  useGetAccountsQuery,
  useGetOverviewQuery,
  useGetAccountQuery,
  useGetStatementQuery,
  useGetBranchesQuery,
  useRequestAccountMutation,
  useGetBeneficiariesQuery,
  useAddBeneficiaryMutation,
  useRemoveBeneficiaryMutation,
  useGetBanksQuery,
  useLookupIfscQuery,
  useGetRailsQuery,
  useQuoteTransferMutation,
  useExecuteTransferMutation,
  useGetTransactionsQuery,
  useGetTransactionQuery,
  useGetNotificationsQuery,
  useGetUnreadCountQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} = bankingApi;
