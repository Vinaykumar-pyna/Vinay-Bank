import { Badge } from 'react-bootstrap';
import { titleCase } from '@/lib/format';

type Variant = 'success' | 'warning' | 'info' | 'danger' | 'secondary' | 'primary';

const VARIANTS: Record<string, Variant> = {
  ACTIVE: 'success',
  VERIFIED: 'success',
  COMPLETED: 'success',
  APPROVED: 'success',
  SUCCESS: 'success',
  LOW: 'success',
  PENDING: 'warning',
  PENDING_APPROVAL: 'warning',
  MEDIUM: 'warning',
  PROCESSING: 'info',
  INITIATED: 'info',
  FROZEN: 'secondary',
  CLOSED: 'secondary',
  DISABLED: 'secondary',
  REVERSED: 'secondary',
  EXPIRED: 'secondary',
  BLOCKED: 'danger',
  HOTLISTED: 'danger',
  REJECTED: 'danger',
  FAILED: 'danger',
  FAILURE: 'danger',
  HIGH: 'danger',
  CRITICAL: 'danger',
};

interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
}

/** Consistent colour coding for every status in the app (accounts, KYC, transfers, risk...). */
export function StatusBadge({ status, label, className = '' }: StatusBadgeProps) {
  const variant = VARIANTS[status] ?? 'secondary';
  return (
    <Badge
      bg={`${variant}-subtle`}
      text={`${variant}-emphasis`}
      className={`rounded-pill border border-${variant}-subtle fw-semibold ${className}`}
    >
      {label ?? titleCase(status)}
    </Badge>
  );
}
