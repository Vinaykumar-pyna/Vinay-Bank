import type { Role } from '../enums/role.enum';

/** The authenticated principal attached to `request.user` by the JWT guard. */
export interface AuthUser {
  id: string;
  role: Role;
  sessionId: string;
}

/** Who/where a request came from; recorded in sessions and the audit trail. */
export interface RequestContext {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}
