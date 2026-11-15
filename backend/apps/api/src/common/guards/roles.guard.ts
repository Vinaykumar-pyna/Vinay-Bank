import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/auth.decorators';
import type { Role } from '../enums/role.enum';
import { AppException } from '../exceptions/app.exception';
import type { AuthUser } from '../types/auth.types';

/** Enforces @Roles(...). Runs after JwtAuthGuard, so request.user is populated. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (!user) throw AppException.unauthorized();
    if (!required.includes(user.role)) throw AppException.forbidden();
    return true;
  }
}
