import { Alert, Card, Col, Placeholder, Row } from 'react-bootstrap';
import { Link } from 'react-router';
import { useAppSelector } from '@/app/hooks';
import { Money } from '@/components/banking/Money';
import { PostingRow } from '@/components/banking/PostingRow';
import { EmptyState } from '@/components/common/EmptyState';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useGetOverviewQuery } from '@/features/banking/bankingApi';
import { errorMessage } from '@/lib/apiError';
import { formatDateTime, greeting, titleCase } from '@/lib/format';
import { CashflowChart } from './CashflowChart';
import { ExchangeRates } from './ExchangeRates';
import { SpendingBreakdown } from './SpendingBreakdown';

const quickActions = [
  { to: '/app/transfer', icon: 'bi-send', label: 'Send money' },
  { to: '/app/beneficiaries', icon: 'bi-person-plus', label: 'Add payee' },
  { to: '/app/accounts', icon: 'bi-file-earmark-text', label: 'Statements' },
  { to: '/app/transactions', icon: 'bi-clock-history', label: 'History' },
];

export default function DashboardPage() {
  const user = useAppSelector((state) => state.auth.user);
  const { data, isLoading, isError, error } = useGetOverviewQuery();

  if (isError) return <Alert variant="danger">{errorMessage(error)}</Alert>;

  const thisMonth = data?.cashflow.at(-1);

  return (
    <>
      <div className="mb-4">
        <h1 className="h3 mb-1">
          {greeting()}, {user?.firstName}
        </h1>
        <p className="text-body-secondary mb-0">
          {user?.lastLoginAt
            ? `Last sign-in ${formatDateTime(user.lastLoginAt)}`
            : 'Welcome to Vinay Bank'}
        </p>
      </div>

      {user?.kyc.status === 'PENDING' && (
        <Alert variant="warning" className="d-flex gap-2 align-items-start">
          <i className="bi bi-hourglass-split mt-1" aria-hidden="true" />
          <div>
            <strong>Your KYC is under review.</strong> Until it is verified, transfers are limited
            to ₹50,000 a day.
          </div>
        </Alert>
      )}

      <Row className="g-4 mb-4">
        <Col lg={8}>
          <Card className="balance-hero h-100">
            <Card.Body className="p-4 position-relative" style={{ zIndex: 1 }}>
              <div className="small text-uppercase letter-spacing-wide opacity-75">
                Total balance
              </div>
              {isLoading || !data ? (
                <Placeholder as="div" animation="glow">
                  <Placeholder xs={6} style={{ height: 44 }} />
                </Placeholder>
              ) : (
                <div className="display-6 fw-bold my-1">
                  <Money paise={data.totalBalance} />
                </div>
              )}
              <div className="small opacity-75 mb-4">
                Available to spend: {data ? <Money paise={data.totalAvailable} /> : '...'} across{' '}
                {data?.accounts.filter((a) => a.status === 'ACTIVE').length ?? 0} account(s)
              </div>
              <div className="d-flex flex-wrap gap-2">
                {quickActions.map((action, index) => (
                  <Link
                    key={action.to}
                    to={action.to}
                    className={`btn btn-sm ${index === 0 ? 'btn-light' : 'btn-outline-light'}`}
                  >
                    <i className={`bi ${action.icon} me-1`} aria-hidden="true" />
                    {action.label}
                  </Link>
                ))}
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={4}>
          <Card className="h-100">
            <Card.Body>
              <div className="card-title-sm mb-3">This month</div>
              <div className="d-flex align-items-center gap-3 mb-3">
                <span className="icon-tile icon-tile-success">
                  <i className="bi bi-arrow-down-left" aria-hidden="true" />
                </span>
                <div>
                  <div className="small text-body-secondary">Money in</div>
                  <div className="h5 mb-0">
                    {thisMonth ? <Money paise={thisMonth.inflow} /> : '...'}
                  </div>
                </div>
              </div>
              <div className="d-flex align-items-center gap-3">
                <span className="icon-tile icon-tile-danger">
                  <i className="bi bi-arrow-up-right" aria-hidden="true" />
                </span>
                <div>
                  <div className="small text-body-secondary">Money out</div>
                  <div className="h5 mb-0">
                    {thisMonth ? <Money paise={thisMonth.outflow} /> : '...'}
                  </div>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row xs={1} md={2} xl={3} className="g-3 mb-4">
        {data?.accounts.map((account) => (
          <Col key={account.id}>
            <Link to={`/app/accounts/${account.id}`} className="account-tile h-100">
              <div className="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <div className="fw-semibold">{account.nickname ?? titleCase(account.type)}</div>
                  <div className="small text-body-secondary font-mono">
                    {titleCase(account.type)} · {account.maskedNumber.slice(-8)}
                  </div>
                </div>
                {account.status !== 'ACTIVE' && <StatusBadge status={account.status} />}
              </div>
              <div className="h5 mb-0">
                <Money paise={account.availableBalance} />
              </div>
              <div className="small text-body-secondary">
                Available
                {account.holdAmount > 0 && (
                  <>
                    {' '}
                    · <Money paise={account.holdAmount} /> on hold
                  </>
                )}
              </div>
            </Link>
          </Col>
        ))}
      </Row>

      <Row className="g-4">
        <Col xl={8}>
          <Card className="h-100">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h2 className="h6 mb-0">Cash flow, last 6 months</h2>
              </div>
              {data ? (
                <CashflowChart data={data.cashflow} />
              ) : (
                <Placeholder as="div" animation="glow">
                  <Placeholder xs={12} style={{ height: 260 }} />
                </Placeholder>
              )}
            </Card.Body>
          </Card>
        </Col>
        <Col xl={4}>
          <Card className="h-100">
            <Card.Body>
              <h2 className="h6 mb-3">Spending this month</h2>
              {data && <SpendingBreakdown items={data.spendingByCategory} />}
            </Card.Body>
          </Card>
        </Col>
        <Col xl={8}>
          <Card className="h-100">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center mb-1">
                <h2 className="h6 mb-0">Recent activity</h2>
                <Link to="/app/transactions" className="small">
                  View all
                </Link>
              </div>
              {data?.recent.length ? (
                <ul className="list-unstyled mb-0 divide-y">
                  {data.recent.map((posting) => (
                    <PostingRow key={posting.id} posting={posting} />
                  ))}
                </ul>
              ) : (
                !isLoading && (
                  <EmptyState
                    icon="bi-clock-history"
                    title="No transactions yet"
                    description="Money you send and receive will appear here."
                  />
                )
              )}
            </Card.Body>
          </Card>
        </Col>
        <Col xl={4}>
          <ExchangeRates />
        </Col>
      </Row>
    </>
  );
}
