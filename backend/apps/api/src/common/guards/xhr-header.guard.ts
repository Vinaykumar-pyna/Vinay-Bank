import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../exceptions/app.exception';

/**
 * CSRF defence for cookie-authenticated endpoints (refresh, logout).
 *
 * Browsers attach cookies automatically, so a malicious site could try to make
 * a victim's browser call /auth/refresh. Requiring a custom header blocks that:
 * HTML forms cannot set headers, and a cross-origin fetch with a custom header
 * triggers a CORS preflight that our origin allow-list rejects. This works
 * together with the SameSite=Strict cookie attribute.
 */
@Injectable()
export class XhrHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
      throw AppException.forbidden('Missing X-Requested-With header');
    }
    return true;
  }
}
