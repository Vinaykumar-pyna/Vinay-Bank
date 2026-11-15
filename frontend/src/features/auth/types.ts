export type Role = 'CUSTOMER' | 'TELLER' | 'MANAGER' | 'ADMIN';
export type KycStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
}

export interface UserProfile {
  id: string;
  role: Role;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth?: string;
  address?: Address;
  customerId?: string;
  employeeId?: string;
  branchCode?: string;
  status: 'ACTIVE' | 'DISABLED';
  kyc: { status: KycStatus; panMasked?: string; reviewedAt?: string; remarks?: string };
  mfaEnabled: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface AuthSession {
  accessToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: UserProfile;
}

export type LoginResponse =
  { mfaRequired: true; mfaToken: string } | ({ mfaRequired: false } & AuthSession);

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  dateOfBirth: string;
  pan: string;
  address: Address;
  acceptTerms: boolean;
}

export interface SessionView {
  id: string;
  deviceLabel: string;
  ip?: string;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export interface MfaSetup {
  manualEntryKey: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export const STAFF_ROLES: readonly Role[] = ['TELLER', 'MANAGER', 'ADMIN'];

export function isStaffRole(role: Role | undefined): boolean {
  return !!role && STAFF_ROLES.includes(role);
}

export function homePathFor(role: Role | undefined): string {
  return isStaffRole(role) ? '/staff/dashboard' : '/app/dashboard';
}

export const ROLE_LABELS: Record<Role, string> = {
  CUSTOMER: 'Customer',
  TELLER: 'Teller',
  MANAGER: 'Branch manager',
  ADMIN: 'Administrator',
};
