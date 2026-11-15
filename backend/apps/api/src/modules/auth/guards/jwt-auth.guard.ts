import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../../common/decorators/auth.decorators';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes';
import type { AuthUser } from '../../../common/types/auth.types';
import { SessionsService } from '../sessions.service';
import { TokenService } from '../token.service';

/**
 * Global authentication guard: every route requires a valid access token
 * unless it is marked @Public() (secure by default).
 *
 * Besides the JWT signature and expiry, the session behind the token must still
 * be active, so "sign out this device", a password change or token-theft
 * detection take effect immediately instead of when the token expires.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) throw AppException.unauthorized('Sign in to continue');

    const claims = await this.tokens.verifyAccessToken(token);
    if (!(await this.sessions.isActive(claims.sid, claims.sub))) {
      throw AppException.unauthorized(
        'Your session has ended. Please sign in again.',
        ErrorCode.SESSION_REVOKED,
      );
    }
    request.user = { id: claims.sub, role: claims.role, sessionId: claims.sid };
    return true;
  }
}

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}
