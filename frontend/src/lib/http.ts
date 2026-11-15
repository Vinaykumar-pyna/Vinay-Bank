import axios from 'axios';
import { env } from '@/config/env';

/**
 * Shared Axios instance for every API call.
 *  - withCredentials: sends the httpOnly refresh-token cookie to /auth endpoints
 *  - X-Requested-With: a custom header that simple cross-site form posts cannot add,
 *    which the API checks on cookie-authenticated endpoints (CSRF defence)
 * Authentication interceptors are attached in lib/authInterceptors.ts.
 */
export const http = axios.create({
  baseURL: env.apiBaseUrl,
  withCredentials: true,
  timeout: 20_000,
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
});
