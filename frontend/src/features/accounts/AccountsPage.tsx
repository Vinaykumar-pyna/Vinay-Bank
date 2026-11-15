import { useState } from 'react';
import { Alert, Button, Card, Col, Placeholder, Row } from 'react-bootstrap';
import { Link } from 'react-router';
import { Money } from '@/components/banking/Money';
import { CopyButton } from '@/components/common/CopyButton';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useGetAccountsQuery } from '@/features/banking/bankingApi';
import { errorMessage } from '@/lib/apiError';
import { titleCase } from '@/lib/format';
import { OpenAccountModal } from './OpenAccountModal';

export default function AccountsPage() {
  const { data: accounts, isLoading, error } = useGetAccountsQuery();
  const [showOpen, setShowOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="My accounts"
        subtitle="Balances, account details and statements."
        actions={
          <Button onClick={() => setShowOpen(true)}>
            <i className="bi bi-plus-lg me-1" aria-hidden="true" />
            Open new account
          </Button>
        }
      />
      {error && <Alert variant="danger">{errorMessage(error)}</Alert>}
      <Row xs={1} lg={2} className="g-4">
        {isLoading &&
          [1, 2].map((i) => (
            <Col key={i}>
              <Card body>
                <Placeholder as="div" animation="glow">
                  <Placeholder xs={6} /> <Placeholder xs={8} />{' '}
                  <Placeholder xs={4} style={{ height: 32 }} />
                </Placeholder>
              </Card>
            </Col>
          ))}
        {accounts?.map((account) => (
          <Col key={account.id}>
            <Card className="h-100">
              <Card.Body>
                <div className="d-flex justify-content-between align-items-start gap-2 mb-3">
                  <div className="d-flex gap-3 align-items-center">
                    <span className="icon-tile icon-tile-primary">
                      <i
                        className={`bi ${account.type === 'SAVINGS' ? 'bi-piggy-bank' : 'bi-briefcase'}`}
                        aria-hidden="true"
                      />
                    </span>
                    <div>
                      <h2 className="h6 mb-0">
                        {account.nickname ?? `${titleCase(account.type)} account`}
                      </h2>
                      <div className="small text-body-secondary">
                        {titleCase(account.type)} · {account.branch.name}
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={account.status} />
                </div>

                <dl className="row small mb-3 g-2">
                  <dt className="col-5 text-body-secondary fw-normal">Account number</dt>
                  <dd className="col-7 mb-0 font-mono text-end">
                    {account.accountNumber}
                    <CopyButton value={account.accountNumber} label="Copy account number" />
                  </dd>
                  <dt className="col-5 text-body-secondary fw-normal">IFSC</dt>
                  <dd className="col-7 mb-0 font-mono text-end">
                    {account.ifsc}
                    <CopyButton value={account.ifsc} label="Copy IFSC" />
                  </dd>
                  {account.type === 'SAVINGS' && (
                    <>
                      <dt className="col-5 text-body-secondary fw-normal">Interest rate</dt>
                      <dd className="col-7 mb-0 text-end">
                        {account.interestRatePercent.toFixed(2)}% p.a.
                      </dd>
                    </>
                  )}
                </dl>

                {account.status === 'PENDING_APPROVAL' ? (
                  <Alert variant="info" className="small mb-0 py-2">
                    <i className="bi bi-hourglass-split me-1" aria-hidden="true" />
                    Waiting for branch approval. You will be notified when it opens.
                  </Alert>
                ) : (
                  <div className="d-flex justify-content-between align-items-end">
                    <div>
                      <div className="small text-body-secondary">Available balance</div>
                      <div className="h4 mb-0">
                        <Money paise={account.availableBalance} />
                      </div>
                      {account.holdAmount > 0 && (
                        <div className="small text-warning-emphasis">
                          <Money paise={account.holdAmount} /> on hold for approval
                        </div>
                      )}
                    </div>
                    <Link
                      to={`/app/accounts/${account.id}`}
                      className="btn btn-outline-primary btn-sm"
                    >
                      Statement <i className="bi bi-arrow-right ms-1" aria-hidden="true" />
                    </Link>
                  </div>
                )}
                {account.statusReason && account.status !== 'PENDING_APPROVAL' && (
                  <div className="small text-body-secondary mt-2">{account.statusReason}</div>
                )}
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
      <OpenAccountModal show={showOpen} onHide={() => setShowOpen(false)} />
    </>
  );
}
