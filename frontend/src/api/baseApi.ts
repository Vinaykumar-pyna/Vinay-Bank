import { createApi } from '@reduxjs/toolkit/query/react';
import { axiosBaseQuery } from './axiosBaseQuery';

/**
 * Single RTK Query API slice. Feature modules add endpoints with
 * `baseApi.injectEndpoints(...)`, which keeps them code-split and colocated.
 * Tags drive cache invalidation, e.g. a transfer invalidates 'Account' and 'Transaction'.
 */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: axiosBaseQuery(),
  tagTypes: [
    'Me',
    'Session',
    'Account',
    'Transaction',
    'Beneficiary',
    'Card',
    'Notification',
    'Approval',
    'Customer',
    'Audit',
    'Ledger',
    'Staff',
  ],
  refetchOnReconnect: true,
  endpoints: () => ({}),
});
