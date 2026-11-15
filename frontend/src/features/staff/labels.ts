import type { Role } from '@/features/auth/types';

export const RAIL_LABELS: Record<string, string> = {
  INTERNAL: 'Within ArthaBank',
  IMPS: 'IMPS',
  NEFT: 'NEFT',
  RTGS: 'RTGS',
  CASH: 'Cash at branch',
  CARD: 'Card',
  SYSTEM: 'System',
};

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

/** Checkers in the maker-checker flow: they approve requests and review KYC. */
export function isChecker(role: Role | undefined): boolean {
  return role === 'MANAGER' || role === 'ADMIN';
}

export function isAdmin(role: Role | undefined): boolean {
  return role === 'ADMIN';
}
