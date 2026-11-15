import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { normalizeException } from '../exceptions/normalize-exception';

type RequestWithId = Request & { id?: string };

/**
 * Global HTTP exception filter. Every error leaves the API in one shape:
 *
 * {
 *   "success": false,
 *   "statusCode": 422,
 *   "error": { "code": "INSUFFICIENT_FUNDS", "message": "...", "details": ... },
 *   "path": "/api/v1/transfers",
 *   "timestamp": "2026-11-13T10:00:00.000Z",
 *   "requestId": "c1b2..."
 * }
 *
 * Unexpected errors are logged with their stack trace, but clients only see a
 * generic message, so internals never leak.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      this.logger.error(`Unhandled ${host.getType()} exception`, (exception as Error)?.stack);
      return;
    }

    const ctx = host.switchToHttp();
    const request = ctx.getRequest<RequestWithId>();
    const response = ctx.getResponse<Response>();
    const error = normalizeException(exception);

    const summary = `${request.method} ${request.originalUrl ?? request.url} -> ${error.status} ${error.code}`;
    if (error.status >= 500) {
      this.logger.error(
        `${summary}: ${(exception as Error)?.message}`,
        (exception as Error)?.stack,
      );
    } else {
      this.logger.debug(`${summary}: ${error.message}`);
    }

    if (response.headersSent) return;

    response.status(error.status).json({
      success: false,
      statusCode: error.status,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
      path: request.originalUrl ?? request.url,
      timestamp: new Date().toISOString(),
      requestId: request.id,
    });
  }
}
