import { Alert, Card, Col, Row } from 'react-bootstrap';
import { Link } from 'react-router';
import { useAppSelector } from '@/app/hooks';
import { Money } from '@/components/banking/Money';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { PageLoader } from '@/components/common/PageLoader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ROLE_LABELS, type Role } from '@/features/auth/types';
import { errorMessage } from '@/lib/apiError';
import {
  formatMoneyCompact,
  formatRelative,
  formatRupees,
  greeting,
  plural,
  titleCase,
} from '@/lib/format';
import { RailMixList } from './components/RailMixList';
import { StatTile } from './components/StatTile';
import { VolumeChart } from './components/VolumeChart';
import { isChecker, RAIL_LABELS } from './labels';
import { useGetStaffOverviewQuery } from './staffApi';
import { CASH_APPROVAL_THRESHOLDS, type StaffOverview } from './types';

const count = (n: number) => n.toLocaleString('en-IN');

function QuickActions({ role, pending }: { role: Role; pending: number }) {
  if (role === 'TELLER') {
    return (
      <>
        <Link to="/staff/cash" className="btn btn-primary">
          <i className="bi bi-cash-coin me-2" aria-hidden="true" />
          Cash counter
        </Link>
        <Link to="/staff/customers" className="btn btn-outline-primary">
          <i className="bi bi-search me-2" aria-hidden="true" />
          Find a customer
        </Link>
      </>
    );
  }
  return (
    <>
      <Link to="/staff/approvals" className="btn btn-primary">
        <i className="bi bi-check2-square me-2" aria-hidden="true" />
        Review approvals{pending ? ` (${pending})` : ''}
      </Link>
      <Link
        to={role === 'ADMIN' ? '/staff/audit' : '/staff/transactions?riskLevel=HIGH'}
        className="btn btn-outline-primary"
      >
        <i
          className={`bi ${role === 'ADMIN' ? 'bi-patch-check' : 'bi-shield-exclamation'} me-2`}
          aria-hidden="true"
        />
        {role === 'ADMIN' ? 'Verify audit trail' : 'Risk alerts'}
      </Link>
    </>
  );
}

function RiskAlerts({ items }: { items: StaffOverview['recentFlagged'] }) {
  if (!items.length) {
    return (
      <EmptyState
        icon="bi-shield-check"
        title="No risk alerts"
        description="Flagged transactions will appear here."
      />
    );
  }
  return (
    <ul className="list-unstyled mb-0">
      {items.map((t) => (
        <li key={t.id} className="d-flex gap-3 py-2 border-bottom">
          <span className="icon-tile icon-tile-danger" aria-hidden="true">
            <i className="bi bi-shield-exclamation" />
          </span>
          <div className="min-w-0 flex-grow-1">
            <Link
              to={`/staff/transactions?search=${t.reference}`}
              className="small fw-medium text-reset text-decoration-none d-block text-truncate"
            >
              {t.from?.name ?? 'Bank'} <span className="text-body-secondary">to</span>{' '}
              {t.to?.name ?? 'Bank'}
            </Link>
            <div className="small text-body-secondary text-truncate">
              <span className="font-mono">{t.reference}</span> · {RAIL_LABELS[t.rail] ?? t.rail} ·{' '}
              {formatRelative(t.createdAt)}
            </div>
            {t.risk?.reasons?.[0] && (
              <div className="small text-body-secondary text-truncate">{t.risk.reasons[0]}</div>
            )}
          </div>
          <div className="text-end flex-shrink-0">
            <Money paise={t.amount} className="small fw-semibold d-block" />
            <StatusBadge
              status={t.risk?.level ?? 'LOW'}
              label={`${titleCase(t.risk?.level ?? 'LOW')}${t.risk?.score !== undefined ? ` · ${t.risk.score}` : ''}`}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function RiskEngineBadge({ engine }: { engine: StaffOverview['riskEngine'] }) {
  const up = engine.health === 'UP' && engine.state === 'CLOSED';
  return (
    <span
      className={`small d-inline-flex align-items-center gap-1 ${up ? 'text-success-emphasis' : 'text-warning-emphasis'}`}
      title={
        up
          ? `Spring Boot service at ${engine.url}`
          : 'The Java engine is not reachable: the API scores transfers with the same rules in-process'
      }
    >
      <i className={`bi ${up ? 'bi-cpu' : 'bi-exclamation-triangle'}`} aria-hidden="true" />
      {up ? 'Java risk engine online' : 'Fallback rules (Java engine offline)'}
    </span>
  );
}

function AuditActivity({ items }: { items: StaffOverview['recentAudit'] }) {
  return (
    <ul className="list-unstyled mb-0">
      {items.map((a) => (
        <li key={a.seq} className="d-flex gap-2 py-2 border-bottom small">
          <span className="font-mono text-body-secondary" style={{ minWidth: '3.5em' }}>
            #{a.seq}
          </span>
          <div className="min-w-0 flex-grow-1">
            <div className="fw-medium text-truncate">
              {titleCase(a.action)}
              {a.outcome === 'FAILURE' && (
                <StatusBadge status="FAILURE" label="Failed" className="ms-2" />
              )}
            </div>
            <div className="text-body-secondary text-truncate">
              {a.actorLabel ?? 'System'}
              {a.actorRole ? ` (${titleCase(a.actorRole)})` : ''} · {formatRelative(a.at)}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CounterRules() {
  return (
    <ul className="small mb-0 d-grid gap-2 ps-3">
      <li>
        Cash deposits below {formatRupees(CASH_APPROVAL_THRESHOLDS.deposit)} post instantly; from{' '}
        {formatRupees(CASH_APPROVAL_THRESHOLDS.deposit)} they wait for a manager&apos;s approval.
      </li>
      <li>
        Withdrawals below {formatRupees(CASH_APPROVAL_THRESHOLDS.withdrawal)} post instantly; from{' '}
        {formatRupees(CASH_APPROVAL_THRESHOLDS.withdrawal)} the amount is put on hold until a
        manager approves.
      </li>
      <li>Check original photo ID and the signature before paying out any withdrawal.</li>
      <li>Every action you take is written to the tamper-evident audit trail.</li>
    </ul>
  );
}

export default function StaffDashboardPage() {
  const user = useAppSelector((state) => state.auth.user);
  const { data, isLoading, error } = useGetStaffOverviewQuery(undefined, {
    pollingInterval: 60_000,
    skipPollingIfUnfocused: true,
  });

  if (!user) return null;
  const checker = isChecker(user.role);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.firstName}`}
        subtitle={`${ROLE_LABELS[user.role]} · Branch ${user.branchCode ?? '0001'}${user.employeeId ? ` · ${user.employeeId}` : ''}`}
        actions={<QuickActions role={user.role} pending={data?.approvals.pending ?? 0} />}
      />
      {error && <Alert variant="danger">{errorMessage(error)}</Alert>}

      <Row className="g-3 mb-4">
        <Col xs={12} sm={6} xl={4}>
          <StatTile
            label="Customers"
            icon="bi-people"
            loading={isLoading}
            value={data && count(data.customers.total)}
            hint={data && `${count(data.customers.kycPending)} awaiting KYC review`}
            to="/staff/customers?kyc=PENDING"
          />
        </Col>
        <Col xs={12} sm={6} xl={4}>
          <StatTile
            label="Deposits held"
            icon="bi-bank"
            loading={isLoading}
            value={data && formatMoneyCompact(data.deposits.total)}
            hint={data && `${plural(data.accounts.active, 'active account')}`}
          />
        </Col>
        <Col xs={12} sm={6} xl={4}>
          <StatTile
            label="Settled today"
            icon="bi-activity"
            tone="info"
            loading={isLoading}
            value={data && formatMoneyCompact(data.today.volume)}
            hint={data && plural(data.today.count, 'transaction')}
            to="/staff/transactions"
          />
        </Col>
        <Col xs={12} sm={6} xl={4}>
          <StatTile
            label="Pending approvals"
            icon="bi-check2-square"
            tone={data?.approvals.pending ? 'warning' : 'primary'}
            loading={isLoading}
            value={data && count(data.approvals.pending)}
            hint="Maker-checker queue"
            to="/staff/approvals"
          />
        </Col>
        <Col xs={12} sm={6} xl={4}>
          <StatTile
            label="Risk alerts, last 7 days"
            icon="bi-shield-exclamation"
            tone={data?.flagged.last7Days ? 'danger' : 'primary'}
            loading={isLoading}
            value={data && count(data.flagged.last7Days)}
            hint="High and critical risk scores"
            to="/staff/transactions?riskLevel=HIGH"
          />
        </Col>
        <Col xs={12} sm={6} xl={4}>
          <StatTile
            label="Accounts"
            icon="bi-wallet2"
            loading={isLoading}
            value={data && count(data.accounts.total)}
            hint={
              data &&
              `${count(data.accounts.frozen)} frozen · ${count(data.accounts.pendingApproval)} awaiting approval`
            }
          />
        </Col>
      </Row>

      {isLoading || !data ? (
        <PageLoader />
      ) : (
        <>
          <Row className="g-4 mb-4">
            <Col lg={8}>
              <Card className="h-100">
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-baseline mb-3">
                    <h2 className="card-title-sm mb-0">Settled value, last 7 days</h2>
                    <span className="small text-body-secondary">
                      {formatMoneyCompact(data.volume7d.reduce((s, d) => s + d.amount, 0))} in{' '}
                      {plural(
                        data.volume7d.reduce((s, d) => s + d.count, 0),
                        'transaction',
                      )}
                    </span>
                  </div>
                  <VolumeChart data={data.volume7d} />
                </Card.Body>
              </Card>
            </Col>
            <Col lg={4}>
              <Card className="h-100">
                <Card.Body>
                  <h2 className="card-title-sm mb-1">Payment rails, last 30 days</h2>
                  <p className="small text-body-secondary mb-3">Share of settled value by rail</p>
                  <RailMixList data={data.railMix} />
                </Card.Body>
              </Card>
            </Col>
          </Row>

          <Row className="g-4">
            <Col lg={7}>
              <Card className="h-100">
                <Card.Body>
                  <div className="d-flex flex-wrap gap-2 justify-content-between align-items-baseline mb-2">
                    <h2 className="card-title-sm mb-0">Recent risk alerts</h2>
                    <RiskEngineBadge engine={data.riskEngine} />
                    <Link to="/staff/transactions?riskLevel=HIGH" className="small">
                      Open monitor
                    </Link>
                  </div>
                  <RiskAlerts items={data.recentFlagged} />
                </Card.Body>
              </Card>
            </Col>
            <Col lg={5}>
              <Card className="h-100">
                <Card.Body>
                  {checker ? (
                    <>
                      <div className="d-flex justify-content-between align-items-baseline mb-2">
                        <h2 className="card-title-sm mb-0">Latest audit events</h2>
                        <Link to="/staff/audit" className="small">
                          Audit trail
                        </Link>
                      </div>
                      <AuditActivity items={data.recentAudit} />
                    </>
                  ) : (
                    <>
                      <h2 className="card-title-sm mb-3">Counter rules</h2>
                      <CounterRules />
                    </>
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </>
      )}
    </>
  );
}
