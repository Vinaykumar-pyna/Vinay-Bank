import { baseApi } from '@/api/baseApi';

export interface ForexRate {
  currency: string;
  name: string;
  perRupee: number;
  rupeesPerUnit: number;
}

export interface ForexRates {
  base: 'INR';
  date: string;
  source: 'LIVE' | 'CACHE' | 'OFFLINE';
  rates: ForexRate[];
}

export const forexApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getForexRates: build.query<ForexRates, void>({
      query: () => '/forex/rates',
      keepUnusedDataFor: 1800,
    }),
  }),
});

export const { useGetForexRatesQuery } = forexApi;
