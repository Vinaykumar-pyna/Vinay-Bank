import { HttpStatus } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppException } from '../exceptions/app.exception';
import { ErrorCode } from '../exceptions/error-codes';

interface BodyParserError {
  type?: string;
}

/**
 * Express error middleware placed right after the body parsers. It turns
 * body-parser failures into AppExceptions with stable codes, which then flow
 * through the global exception filter like any other error.
 */
export function bodyParserErrorMiddleware(
  err: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const type = (err as BodyParserError)?.type;
  if (type === 'entity.parse.failed') {
    next(new AppException(ErrorCode.MALFORMED_REQUEST, 'Request body is not valid JSON'));
    return;
  }
  if (type === 'entity.too.large') {
    next(
      new AppException(
        ErrorCode.PAYLOAD_TOO_LARGE,
        'Request body is too large',
        HttpStatus.PAYLOAD_TOO_LARGE,
      ),
    );
    return;
  }
  next(err);
}
