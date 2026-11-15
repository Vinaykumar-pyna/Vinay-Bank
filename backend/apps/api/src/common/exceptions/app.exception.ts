import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export interface FieldError {
  field: string;
  messages: string[];
}

/**
 * Domain exception carrying a stable error code. Throw this from services;
 * the global exception filter converts it into the standard error response.
 */
export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }

  static notFound(entity: string): AppException {
    return new AppException(ErrorCode.NOT_FOUND, `${entity} not found`, HttpStatus.NOT_FOUND);
  }

  static forbidden(message = 'You do not have permission to perform this action'): AppException {
    return new AppException(ErrorCode.FORBIDDEN, message, HttpStatus.FORBIDDEN);
  }

  static conflict(message: string, code = ErrorCode.CONFLICT): AppException {
    return new AppException(code, message, HttpStatus.CONFLICT);
  }

  static unauthorized(message = 'Authentication required', code = ErrorCode.UNAUTHORIZED) {
    return new AppException(code, message, HttpStatus.UNAUTHORIZED);
  }

  static unprocessable(code: ErrorCode, message: string, details?: unknown): AppException {
    return new AppException(code, message, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }

  static validation(details: FieldError[]): AppException {
    return new AppException(
      ErrorCode.VALIDATION_FAILED,
      'One or more fields are invalid',
      HttpStatus.BAD_REQUEST,
      details,
    );
  }
}
