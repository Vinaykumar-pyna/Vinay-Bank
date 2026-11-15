import { baseApi } from './baseApi';

export interface HealthStatus {
  status: string;
  service: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
}

export const healthApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getHealth: build.query<HealthStatus, void>({
      query: () => '/health',
      keepUnusedDataFor: 30,
    }),
  }),
});

export const { useGetHealthQuery } = healthApi;
