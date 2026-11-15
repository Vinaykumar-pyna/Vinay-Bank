import { isAxiosError } from 'axios';

/** Normalized error shape used across the UI, mirroring the API's error envelope. */
export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

export interface FieldErrorDetail {
  field: string;
  messages: string[];
}

interface ApiErrorBody {
  success?: false;
  error?: { code?: string; message?: string; details?: unknown };
  requestId?: string;
}

export function toApiError(error: unknown): ApiError {
  if (isAxiosError<ApiErrorBody>(error)) {
    const response = error.response;
    if (!response) {
      return {
        status: 0,
        code: error.code === 'ECONNABORTED' ? 'TIMEOUT' : 'NETWORK_ERROR',
        message:
          error.code === 'ECONNABORTED'
            ? 'The server took too long to respond. Please try again.'
            : 'Cannot reach ArthaBank servers. Check your connection and try again.',
      };
    }
    const body = response.data;
    if (body?.error?.code) {
      return {
        status: response.status,
        code: body.error.code,
        message: body.error.message ?? 'Request failed',
        details: body.error.details,
        requestId: body.requestId,
      };
    }
    return {
      status: response.status,
      code: `HTTP_${response.status}`,
      message: response.statusText || 'Request failed',
    };
  }
  if (isApiError(error)) return error;
  return { status: 0, code: 'UNKNOWN', message: 'Something went wrong. Please try again.' };
}

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    'status' in value
  );
}

/** Field-level validation errors from a VALIDATION_FAILED response, keyed by field path. */
export function fieldErrors(error: ApiError | undefined): Record<string, string> {
  if (!error || error.code !== 'VALIDATION_FAILED' || !Array.isArray(error.details)) return {};
  return Object.fromEntries(
    (error.details as FieldErrorDetail[]).map((d) => [d.field, d.messages.join(', ')]),
  );
}

/** Best human-readable message for any error. */
export function errorMessage(error: unknown): string {
  return toApiError(error).message;
}
