import { baseApi } from '@/api/baseApi';
import type { OtpChallenge } from '@/features/banking/types';

export interface BulkIssue {
  path: string;
  message: string;
  payment?: number;
}

export interface BulkPreviewLine {
  index: number;
  endToEndId: string;
  amount: number;
  currency: string;
  creditorName: string;
  creditorAccount: string;
  creditorIfsc: string;
  remittanceInfo?: string;
  rail: 'INTERNAL' | 'NEFT';
  payeeBank: string;
}

export interface BulkPreview {
  valid: boolean;
  issues: BulkIssue[];
  messageId?: string;
  createdAt?: string;
  initiatingParty?: string;
  requestedExecutionDate?: string;
  debitAccount?: { id: string; maskedNumber: string; availableBalance: number };
  payments: BulkPreviewLine[];
  totals: { count: number; amount: number; internal: number; neft: number };
  otp?: OtpChallenge;
}

export interface BulkResult {
  batchId: string;
  messageId: string;
  count: number;
  totalAmount: number;
  payments: { endToEndId: string; reference: string; rail: string; status: string }[];
}

export interface BulkBatchSummary {
  id: string;
  messageId: string;
  paymentCount: number;
  totalAmount: number;
  internalCount: number;
  neftCount: number;
  initiatingParty?: string;
  createdAt: string;
}

export const bulkApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getBulkBatches: build.query<BulkBatchSummary[], void>({
      query: () => '/bulk-payments',
      providesTags: ['Transaction'],
    }),
    previewBulk: build.mutation<BulkPreview, { xml: string }>({
      query: (data) => ({ url: '/bulk-payments/preview', method: 'POST', data }),
    }),
    submitBulk: build.mutation<
      BulkResult,
      { xml: string; challengeId: string; otp: string; idempotencyKey: string }
    >({
      query: ({ idempotencyKey, ...data }) => ({
        url: '/bulk-payments',
        method: 'POST',
        data,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      invalidatesTags: ['Account', 'Transaction'],
    }),
  }),
});

export const { useGetBulkBatchesQuery, usePreviewBulkMutation, useSubmitBulkMutation } = bulkApi;
