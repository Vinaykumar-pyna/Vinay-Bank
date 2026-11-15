/**
 * Role-based access control.
 *  CUSTOMER  internet banking user, can only access their own resources
 *  TELLER    branch staff (maker): onboards customers, initiates cash operations
 *  MANAGER   branch manager (checker): approves maker requests, reviews KYC and fraud alerts
 *  ADMIN     platform administrator: staff management, audit verification, system health
 */
export enum Role {
  CUSTOMER = 'CUSTOMER',
  TELLER = 'TELLER',
  MANAGER = 'MANAGER',
  ADMIN = 'ADMIN',
}

export const STAFF_ROLES: readonly Role[] = [Role.TELLER, Role.MANAGER, Role.ADMIN];
export const CHECKER_ROLES: readonly Role[] = [Role.MANAGER, Role.ADMIN];

export function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}
