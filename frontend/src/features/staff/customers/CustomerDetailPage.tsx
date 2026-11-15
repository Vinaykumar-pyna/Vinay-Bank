import { useState, type ReactNode } from 'react';
import { Alert, Button, Card, Col, Row, Table } from 'react-bootstrap';
import toast from 'react-hot-toast';
import { Link, useParams } from 'react-router';
import { useAppSelector } from '@/app/hooks';
import { Money } from '@/components/banking/Money';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { PageLoader } from '@/components/common/PageLoader';
import { StatusBadge } from '@/components/common/StatusBadge';
import type { Account } from '@/features/banking/types';
import { errorMessage } from '@/lib/apiError';
import { formatDate, formatDateTime, initials, titleCase } from '@/lib/format';
import { ReasonDialog } from '../components/ReasonDialog';
import { isAdmin, isChecker, RAIL_LABELS } from '../labels';
import {
  useGetCustomerQuery,
  useSetAccountStatusMutation,
  useSetUserStatusMutation,
} from '../staffApi';
import { KycReviewCard } from './KycReviewCard';

type AccountAction = { account: Account; status: 'ACTIVE' | 'FROZEN' | 'CLOSED' };

const ACCOUNT_ACTION_COPY: Record<
  AccountAction['status'],
  { title: string; confirm: string; variant: 'success' | 'warning' | 'danger' }
> = {
  FROZEN: { title: 'Freeze account', confirm: 'Freeze', variant: 'warning' },
  ACTIVE: { title: 'Unfreeze account', confirm: 'Unfreeze', variant: 'success' },
  CLOSED: { title: 'Close account', confirm: 'Close account', variant: 'danger' },
};

function ProfileRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="receipt-row">
      <span>{label}</span>
      <span className="text-break text-end">{children}</span>
    </div>
  );
}

export default function CustomerDetailPage() {
  const { id = '' } = useParams();
  const viewer = useAppSelector((state) => state.auth.user);
  const { data, isLoading, error } = useGetCustomerQuery(id);
  const [accountAction, setAccountAction] = useState<AccountAction>();
  const [profileDialog, setProfileDialog] = useState(false);
  const [setAccountStatus, accountStatusState] = useSetAccountStatusMutation();
  const [setUserStatus, userStatusState] = useSetUserStatusMutation();
  const checker = isChecker(viewer?.role);

  if (isLoading) return <PageLoader />;
  if (error || !data) return <Alert variant="danger">{errorMessage(error)}</Alert>;

  const { profile, accounts, recentTransactions } = data;
  const disabled = profile.status === 'DISABLED';

  const changeAccountStatus = async (reason: string) => {
    if (!accountAction) return;
    try {
      await setAccountStatus({
        id: accountAction.account.id,
        status: accountAction.status,
        reason,
      }).unwrap();
      toast.success(
        `Account ${accountAction.account.maskedNumber} is now ${titleCase(accountAction.status).toLowerCase()}`,
      );
      setAccountAction(undefined);
    } catch {
      // Shown in the dialog.
    }
  };

  const toggleProfile = async (reason: string) => {
    try {
      await setUserStatus({
        id: profile.id,
        status: disabled ? 'ACTIVE' : 'DISABLED',
        reason,
      }).unwrap();
      toast.success(disabled ? 'Profile enabled' : 'Profile disabled and signed out everywhere');
      setProfileDialog(false);
    } catch {
      // Shown in the dialog.
    }
  };

  return (
    <>
      <Link to="/staff/customers" className="small d-inline-flex align-items-center gap-1 mb-2">
        <i className="bi bi-arrow-left" aria-hidden="true" /> Customers
      </Link>
      <PageHeader
        title={profile.fullName}
        subtitle={`${profile.customerId ?? ''} · Customer since ${formatDate(profile.createdAt)}`}
        actions={
          isAdmin(viewer?.role) && (
            <Button
              variant={disabled ? 'outline-success' : 'outline-danger'}
              onClick={() => setProfileDialog(true)}
            >
              <i
                className={`bi ${disabled ? 'bi-person-check' : 'bi-person-slash'} me-2`}
                aria-hidden="true"
              />
              {disabled ? 'Enable profile' : 'Disable profile'}
            </Button>
          )
        }
      />
      {disabled && (
        <Alert variant="secondary" className="d-flex gap-2">
          <i className="bi bi-person-slash mt-1" aria-hidden="true" />
          <span>
            This profile is disabled. The customer cannot sign in until an administrator enables it.
          </span>
        </Alert>
      )}

      <Row className="g-4">
        <Col lg={4} className="d-grid gap-4 align-content-start">
          <Card>
            <Card.Body>
              <div className="d-flex align-items-center gap-3 mb-3">
                <span className="avatar">{initials(profile.firstName, profile.lastName)}</span>
                <div className="min-w-0">
                  <div className="fw-semibold text-truncate">{profile.fullName}</div>
                  <StatusBadge status={profile.status} />
                </div>
              </div>
              <ProfileRow label="Email">{profile.email}</ProfileRow>
              <ProfileRow label="Mobile">
                <span className="font-mono">{profile.phone}</span>
              </ProfileRow>
              {profile.dateOfBirth && (
                <ProfileRow label="Date of birth">{formatDate(profile.dateOfBirth)}</ProfileRow>
              )}
              {profile.address && (
                <ProfileRow label="Address">
                  {profile.address.city}, {profile.address.state} {profile.address.pincode}
                </ProfileRow>
              )}
              <ProfileRow label="Two-step sign-in">{profile.mfaEnabled ? 'On' : 'Off'}</ProfileRow>
              <ProfileRow label="Last sign-in">
                {profile.lastLoginAt ? formatDateTime(profile.lastLoginAt) : 'Never'}
              </ProfileRow>
            </Card.Body>
          </Card>
          <KycReviewCard profile={profile} canReview={checker} />
        </Col>

        <Col lg={8} className="d-grid gap-4 align-content-start">
          <Card>
            <Card.Body>
              <h2 className="card-title-sm mb-3">Accounts</h2>
              {accounts.length ? (
                <Table className="table-ab table-stack align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Status</th>
                      <th className="text-end">Balance</th>
                      {checker && <th className="text-end">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => (
                      <tr key={a.id}>
                        <td data-label="Account">
                          <div className="small fw-medium font-mono">{a.accountNumber}</div>
                          <div className="small text-body-secondary">
                            {titleCase(a.type)} · {a.branch.name}
                          </div>
                        </td>
                        <td data-label="Status">
                          <StatusBadge status={a.status} />
                          {a.statusReason && (
                            <div className="small text-body-secondary mt-1">{a.statusReason}</div>
                          )}
                        </td>
                        <td data-label="Balance" className="text-end">
                          <Money paise={a.ledgerBalance} className="small fw-semibold d-block" />
                          {a.holdAmount > 0 && (
                            <span className="small text-body-secondary">
                              On hold <Money paise={a.holdAmount} />
                            </span>
                          )}
                        </td>
                        {checker && (
                          <td data-label="Actions" className="text-end text-nowrap">
                            {a.status === 'ACTIVE' && (
                              <Button
                                size="sm"
                                variant="outline-warning"
                                className="me-2"
                                onClick={() => setAccountAction({ account: a, status: 'FROZEN' })}
                              >
                                Freeze
                              </Button>
                            )}
                            {a.status === 'FROZEN' && (
                              <Button
                                size="sm"
                                variant="outline-success"
                                className="me-2"
                                onClick={() => setAccountAction({ account: a, status: 'ACTIVE' })}
                              >
                                Unfreeze
                              </Button>
                            )}
                            {(a.status === 'ACTIVE' || a.status === 'FROZEN') && (
                              <Button
                                size="sm"
                                variant="outline-danger"
                                onClick={() => setAccountAction({ account: a, status: 'CLOSED' })}
                              >
                                Close
                              </Button>
                            )}
                            {a.status === 'PENDING_APPROVAL' && (
                              <Link to="/staff/approvals?type=ACCOUNT_OPENING" className="small">
                                Review request
                              </Link>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <EmptyState icon="bi-wallet2" title="No accounts yet" />
              )}
            </Card.Body>
          </Card>

          <Card>
            <Card.Body>
              <h2 className="card-title-sm mb-3">Recent transactions</h2>
              {recentTransactions.length ? (
                <Table className="table-ab table-stack align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Details</th>
                      <th>Status</th>
                      <th className="text-end">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTransactions.map((t) => (
                      <tr key={t.id}>
                        <td data-label="Date" className="small text-nowrap">
                          {formatDateTime(t.createdAt)}
                        </td>
                        <td data-label="Details" className="small">
                          <div className="fw-medium">
                            {t.from?.name ?? 'Bank'} to {t.to?.name ?? 'Bank'}
                          </div>
                          <div className="text-body-secondary">
                            <Link
                              to={`/staff/transactions?search=${t.reference}`}
                              className="font-mono"
                            >
                              {t.reference}
                            </Link>{' '}
                            · {titleCase(t.type)} · {RAIL_LABELS[t.rail] ?? t.rail}
                          </div>
                        </td>
                        <td data-label="Status">
                          <StatusBadge status={t.status} />
                        </td>
                        <td data-label="Amount" className="text-end">
                          <Money paise={t.amount} className="small" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <EmptyState icon="bi-receipt" title="No transactions yet" />
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {accountAction && (
        <ReasonDialog
          title={ACCOUNT_ACTION_COPY[accountAction.status].title}
          confirmLabel={ACCOUNT_ACTION_COPY[accountAction.status].confirm}
          variant={ACCOUNT_ACTION_COPY[accountAction.status].variant}
          description={
            <span className="small">
              Account <span className="font-mono">{accountAction.account.accountNumber}</span>.{' '}
              {accountAction.status === 'FROZEN'
                ? 'The customer cannot send money from a frozen account until it is unfrozen.'
                : accountAction.status === 'CLOSED'
                  ? 'Closing is permanent. The balance must be zero and nothing may be on hold.'
                  : 'The customer can use the account again straight away.'}
            </span>
          }
          busy={accountStatusState.isLoading}
          error={accountStatusState.error}
          onConfirm={changeAccountStatus}
          onCancel={() => {
            setAccountAction(undefined);
            accountStatusState.reset();
          }}
        />
      )}
      {profileDialog && (
        <ReasonDialog
          title={disabled ? 'Enable profile' : 'Disable profile'}
          confirmLabel={disabled ? 'Enable' : 'Disable and sign out'}
          variant={disabled ? 'success' : 'danger'}
          description={
            <span className="small">
              {disabled
                ? `${profile.firstName} will be able to sign in again.`
                : `${profile.firstName} will be signed out on every device and cannot sign in until the profile is enabled.`}
            </span>
          }
          busy={userStatusState.isLoading}
          error={userStatusState.error}
          onConfirm={toggleProfile}
          onCancel={() => {
            setProfileDialog(false);
            userStatusState.reset();
          }}
        />
      )}
    </>
  );
}
