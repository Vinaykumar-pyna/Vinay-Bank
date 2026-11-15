import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { loggedOut, sessionStarted } from '@/features/auth/authSlice';
import type { AuthSession } from '@/features/auth/types';
import { http } from './http';

/** Minimal store surface this module needs (avoids a circular import with app/store). */
interface SessionStore {
  getState: () => { auth: { accessToken: string | null } };
  dispatch: (action: { type: string }) => unknown;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

const AUTH_ENDPOINTS = /\/auth\/(login|login\/mfa|register|refresh|logout)$/;
const REFRESH_LOCK = 'arthabank-token-refresh';

let store: SessionStore | null = null;
let inFlightRefresh: Promise<string | null> | null = null;

/**
 * Exchanges the httpOnly refresh cookie for a new access token.
 *
 *  - Single-flight within a tab: many requests failing at once trigger only one refresh.
 *  - Serialized across tabs with the Web Locks API: the refresh token rotates on
 *    every use, so two tabs refreshing in parallel would look like token theft.
 *    With the lock, the second tab waits and then uses the already-rotated cookie.
 */
export function refreshAccessToken(): Promise<string | null> {
  inFlightRefresh ??= runExclusive(performRefresh).finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

async function performRefresh(): Promise<string | null> {
  try {
    const response = await http.post<{ data: AuthSession }>('/auth/refresh');
    const session = response.data.data;
    store?.dispatch(sessionStarted({ accessToken: session.accessToken, user: session.user }));
    return session.accessToken;
  } catch {
    store?.dispatch(loggedOut());
    return null;
  }
}

function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks?.request) return task();
  // The lock is held until the task's promise settles; the outer promise carries its result.
  return new Promise<T>((resolve, reject) => {
    locks.request(REFRESH_LOCK, () => task().then(resolve, reject)).catch(reject);
  });
}

/**
 * Attaches the bearer token to outgoing requests, and on a 401 refreshes the
 * session once and replays the original request transparently.
 */
export function setupAuthInterceptors(appStore: SessionStore): void {
  store = appStore;

  http.interceptors.request.use((config) => {
    const token = appStore.getState().auth.accessToken;
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  http.interceptors.response.use(undefined, async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const isAuthCall = original?.url ? AUTH_ENDPOINTS.test(original.url) : false;

    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      const token = await refreshAccessToken();
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return http.request(original);
      }
    }
    return Promise.reject(error);
  });
}
