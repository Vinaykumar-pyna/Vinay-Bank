import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { SKIP_ENVELOPE_KEY } from '../decorators/skip-envelope.decorator';
import { PaginatedResult } from '../dto/paginated-result';

/**
 * Wraps successful responses in a consistent envelope:
 *   { "success": true, "data": ... }                   (single resource)
 *   { "success": true, "data": [...], "meta": {...} }  (paginated list)
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    return next.handle().pipe(
      map((data: unknown) => {
        if (data instanceof StreamableFile) return data;
        if (data instanceof PaginatedResult) {
          return { success: true, data: data.items, meta: data.meta };
        }
        return { success: true, data: data ?? null };
      }),
    );
  }
}
