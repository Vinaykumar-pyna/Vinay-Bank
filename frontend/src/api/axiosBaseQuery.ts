import type { BaseQueryFn } from '@reduxjs/toolkit/query';
import type { AxiosRequestConfig, Method } from 'axios';
import { toApiError, type ApiError } from '@/lib/apiError';
import { http } from '@/lib/http';

export interface AxiosQueryArgs {
  url: string;
  method?: Method;
  data?: unknown;
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  responseType?: AxiosRequestConfig['responseType'];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

interface Envelope {
  success: boolean;
  data: unknown;
  meta?: PaginationMeta;
}

function isEnvelope(body: unknown): body is Envelope {
  return typeof body === 'object' && body !== null && 'success' in body && 'data' in body;
}

/**
 * RTK Query base query backed by Axios: RTK Query handles caching, de-duplication
 * and invalidation, while the Axios interceptors handle tokens and refresh.
 * Unwraps the API envelope: `{ data }` -> data, `{ data, meta }` -> { items, meta }.
 */
export const axiosBaseQuery =
  (): BaseQueryFn<AxiosQueryArgs | string, unknown, ApiError> => async (args) => {
    const config = typeof args === 'string' ? { url: args } : args;
    try {
      const response = await http.request({
        url: config.url,
        method: config.method ?? 'GET',
        data: config.data,
        params: config.params,
        headers: config.headers,
        responseType: config.responseType,
      });
      const body: unknown = response.data;
      if (isEnvelope(body)) {
        return { data: body.meta ? { items: body.data, meta: body.meta } : body.data };
      }
      return { data: body };
    } catch (error) {
      return { error: toApiError(error) };
    }
  };
