import { useState } from 'react';
import { Alert, Button, Card, Table } from 'react-bootstrap';
import toast from 'react-hot-toast';
import { useAppSelector } from '@/app/hooks';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { PageLoader } from '@/components/common/PageLoader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ROLE_LABELS, type UserProfile } from '@/features/auth/types';
import { errorMessage } from '@/lib/apiError';
import { formatDateTime, initials } from '@/lib/format';
import { ReasonDialog } from '../components/ReasonDialog';
import { useGetStaffUsersQuery, useSetUserStatusMutation } from '../staffApi';
import { AddStaffModal } from './AddStaffModal';

/** Staff directory for administrators: create logins, see MFA adoption, disable leavers. */
export default function StaffUsersPage() {
  const me = useAppSelector((state) => state.auth.user);
  const { data = [], isLoading, error } = useGetStaffUsersQuery();
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState<UserProfile>();
  const [setStatus, statusState] = useSetUserStatusMutation();
  const mfaCount = data.filter((u) => u.mfaEnabled).length;

  const toggle = async (reason: string) => {
    if (!target) return;
    const status = target.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      await setStatus({ id: target.id, status, reason }).unwrap();
      toast.success(`${target.fullName} is now ${status === 'ACTIVE' ? 'enabled' : 'disabled'}`);
      setTarget(undefined);
    } catch {
      // Shown in the dialog.
    }
  };

  return (
    <>
      <PageHeader
        title="Staff users"
        subtitle={
          data.length
            ? `${data.length} staff logins · ${mfaCount} with two-step sign-in`
            : 'Branch and head-office logins'
        }
        actions={
          <Button onClick={() => setAdding(true)}>
            <i className="bi bi-person-plus me-2" aria-hidden="true" />
            Add staff member
          </Button>
        }
      />
      {error && <Alert variant="danger">{errorMessage(error)}</Alert>}
      <Card>
        <Card.Body>
          {isLoading ? (
            <PageLoader />
          ) : data.length ? (
            <Table className="table-ab table-stack table-stack-lg align-middle mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Branch</th>
                  <th>Two-step sign-in</th>
                  <th>Last sign-in</th>
                  <th>Status</th>
                  <th className="text-end">Access</th>
                </tr>
              </thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id}>
                    <td data-label="Name">
                      <div className="d-flex align-items-center gap-2">
                        <span className="avatar" aria-hidden="true">
                          {initials(u.firstName, u.lastName)}
                        </span>
                        <div className="min-w-0">
                          <div className="small fw-medium">
                            {u.fullName}
                            {u.id === me?.id && <span className="text-body-secondary"> (you)</span>}
                          </div>
                          <div className="small text-body-secondary text-break">
                            <span className="font-mono">{u.employeeId}</span> · {u.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Role" className="small">
                      {ROLE_LABELS[u.role]}
                    </td>
                    <td data-label="Branch" className="small font-mono">
                      {u.branchCode ?? '-'}
                    </td>
                    <td data-label="Two-step sign-in" className="small">
                      {u.mfaEnabled ? (
                        <span>
                          <i className="bi bi-shield-check text-success me-1" aria-hidden="true" />
                          On
                        </span>
                      ) : (
                        <span className="text-body-secondary">Off</span>
                      )}
                    </td>
                    <td data-label="Last sign-in" className="small text-nowrap">
                      {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}
                    </td>
                    <td data-label="Status">
                      <StatusBadge status={u.status} />
                    </td>
                    <td data-label="Access" className="text-end">
                      {u.id !== me?.id && (
                        <Button
                          size="sm"
                          variant={u.status === 'ACTIVE' ? 'outline-danger' : 'outline-success'}
                          onClick={() => setTarget(u)}
                        >
                          {u.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon="bi-people" title="No staff users yet" />
          )}
        </Card.Body>
      </Card>

      {adding && <AddStaffModal onClose={() => setAdding(false)} />}
      {target && (
        <ReasonDialog
          title={
            target.status === 'ACTIVE' ? `Disable ${target.fullName}` : `Enable ${target.fullName}`
          }
          confirmLabel={target.status === 'ACTIVE' ? 'Disable and sign out' : 'Enable'}
          variant={target.status === 'ACTIVE' ? 'danger' : 'success'}
          description={
            <span className="small">
              {target.status === 'ACTIVE'
                ? 'They are signed out on every device immediately and cannot sign in until enabled again.'
                : 'They will be able to sign in again with their existing password.'}
            </span>
          }
          placeholder={
            target.status === 'ACTIVE' ? 'For example: resigned, last working day 14 Nov' : ''
          }
          busy={statusState.isLoading}
          error={statusState.error}
          onConfirm={toggle}
          onCancel={() => {
            setTarget(undefined);
            statusState.reset();
          }}
        />
      )}
    </>
  );
}
