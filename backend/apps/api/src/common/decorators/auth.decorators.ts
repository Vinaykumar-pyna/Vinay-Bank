import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../enums/role.enum';
import type { AuthUser, RequestContext } from '../types/auth.types';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Marks a route as reachable without an access token. Everything else requires one. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route (or controller) to the given roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the authenticated user, e.g. `me(@CurrentUser() user: AuthUser)`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined =>
    ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>().user,
);

/** Injects client IP, user agent and correlation id for sessions and audit logs. */
export const ReqContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext => {
    const req = ctx.switchToHttp().getRequest<Request & { id?: string }>();
    const userAgent = req.headers['user-agent'];
    return {
      ip: req.ip,
      userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 300) : undefined,
      requestId: req.id,
    };
  },
);
