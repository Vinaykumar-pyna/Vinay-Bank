import { HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Error as MongooseError } from 'mongoose';
import { AppException } from './app.exception';
import { ErrorCode } from './error-codes';

export interface NormalizedError {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.UNPROCESSABLE,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

interface MongoServerErrorLike {
  name?: string;
  code?: number;
  keyValue?: Record<string, unknown>;
  keyPattern?: Record<string, unknown>;
}

interface HttpErrorLike {
  status?: number;
  statusCode?: number;
  type?: string;
  expose?: boolean;
  message?: string;
}

function isMongoDuplicateKey(err: unknown): err is MongoServerErrorLike {
  const e = err as MongoServerErrorLike;
  return typeof e === 'object' && e !== null && e.code === 11000;
}

function messageFromHttpResponse(response: string | object, fallback: string): string {
  if (typeof response === 'string') return response;
  const message = (response as { message?: unknown }).message;
  if (Array.isArray(message)) return message.join('; ');
  return typeof message === 'string' ? message : fallback;
}

/**
 * Converts any thrown value into a consistent { status, code, message, details } shape.
 * Pure function, so it is unit-tested independently of Nest.
 */
export function normalizeException(exception: unknown): NormalizedError {
  if (exception instanceof AppException) {
    return {
      status: exception.getStatus(),
      code: exception.code,
      message: messageFromHttpResponse(exception.getResponse(), exception.message),
      details: exception.details,
    };
  }

  if (exception instanceof ThrottlerException) {
    return {
      status: HttpStatus.TOO_MANY_REQUESTS,
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many requests. Please slow down and try again shortly.',
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const isPlainNestBody =
      typeof response === 'object' &&
      response !== null &&
      'statusCode' in response &&
      'message' in response;
    return {
      status,
      code:
        STATUS_TO_CODE[status] ??
        (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST),
      message: messageFromHttpResponse(response, exception.message),
      // Terminus and similar libraries put structured diagnostics in the response body.
      details: typeof response === 'object' && !isPlainNestBody ? response : undefined,
    };
  }

  if (isMongoDuplicateKey(exception)) {
    const fields = Object.keys(exception.keyPattern ?? exception.keyValue ?? {});
    return {
      status: HttpStatus.CONFLICT,
      code: ErrorCode.DUPLICATE_RESOURCE,
      message: fields.length
        ? `A record with the same ${fields.join(', ')} already exists`
        : 'A record with the same unique value already exists',
      details: fields.length ? { fields } : undefined,
    };
  }

  if (exception instanceof MongooseError.ValidationError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'One or more fields are invalid',
      details: Object.values(exception.errors).map((e) => ({
        field: e.path,
        messages: [e.message],
      })),
    };
  }

  if (exception instanceof MongooseError.CastError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      code: ErrorCode.INVALID_ID,
      message: `Invalid value for ${exception.path}`,
    };
  }

  // Errors raised by Express middleware such as body-parser carry an HTTP status.
  const httpLike = exception as HttpErrorLike;
  const httpStatus = httpLike?.status ?? httpLike?.statusCode;
  if (typeof httpStatus === 'number' && httpStatus >= 400 && httpStatus < 500) {
    if (httpLike.type === 'entity.parse.failed') {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.MALFORMED_REQUEST,
        message: 'Request body is not valid JSON',
      };
    }
    if (httpLike.type === 'entity.too.large') {
      return {
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        code: ErrorCode.PAYLOAD_TOO_LARGE,
        message: 'Request body is too large',
      };
    }
    return {
      status: httpStatus,
      code: STATUS_TO_CODE[httpStatus] ?? ErrorCode.BAD_REQUEST,
      message: httpLike.expose && httpLike.message ? httpLike.message : 'Bad request',
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCode.INTERNAL_ERROR,
    message: 'Something went wrong on our side. Please try again later.',
  };
}
