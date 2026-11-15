import type { ReactNode } from 'react';
import { Card } from 'react-bootstrap';
import { StatusBadge } from '@/components/common/StatusBadge';
import type { UserProfile } from '@/features/auth/types';
import { ROLE_LABELS } from '@/features/auth/types';
import { formatDate, initials } from '@/lib/format';

export function ProfileCard({ user }: { user: UserProfile }) {
  const rows: [string, ReactNode][] = [
    ['Email', user.email],
    ['Mobile', `+91 ${user.phone}`],
  ];
  if (user.customerId)
    rows.unshift(['Customer ID', <span className="font-mono">{user.customerId}</span>]);
  if (user.employeeId)
    rows.unshift(['Employee ID', <span className="font-mono">{user.employeeId}</span>]);
  if (user.kyc.panMasked)
    rows.push(['PAN', <span className="font-mono">{user.kyc.panMasked}</span>]);
  if (user.dateOfBirth) rows.push(['Date of birth', formatDate(user.dateOfBirth)]);
  if (user.address) {
    rows.push([
      'Address',
      `${user.address.line1}${user.address.line2 ? `, ${user.address.line2}` : ''}, ${user.address.city}, ${user.address.state} ${user.address.pincode}`,
    ]);
  }
  rows.push(['Member since', formatDate(user.createdAt)]);

  return (
    <Card>
      <Card.Body>
        <div className="d-flex align-items-center gap-3 mb-4">
          <span className="avatar" style={{ width: 56, height: 56, fontSize: '1.25rem' }}>
            {initials(user.firstName, user.lastName)}
          </span>
          <div className="min-w-0">
            <h2 className="h5 mb-1">{user.fullName}</h2>
            <div className="d-flex flex-wrap gap-2 align-items-center">
              <span className="badge rounded-pill text-bg-primary">{ROLE_LABELS[user.role]}</span>
              {user.role === 'CUSTOMER' && (
                <StatusBadge
                  status={user.kyc.status}
                  label={`KYC ${user.kyc.status.toLowerCase()}`}
                />
              )}
            </div>
          </div>
        </div>
        <dl className="row mb-0 small">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="col-12 d-flex justify-content-between gap-3 py-2 border-bottom"
            >
              <dt className="text-body-secondary fw-normal">{label}</dt>
              <dd className="mb-0 text-end fw-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {user.role === 'CUSTOMER' && user.kyc.status === 'PENDING' && (
          <div className="alert alert-warning small mt-3 mb-0">
            <i className="bi bi-hourglass-split me-2" aria-hidden="true" />
            Your KYC is being reviewed by our branch team. Some limits are lower until it is
            verified.
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
