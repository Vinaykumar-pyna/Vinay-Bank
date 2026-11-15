import { Alert, Button, Card, Col, Row } from 'react-bootstrap';
import { Link, useParams } from 'react-router';
import { Money } from '@/components/banking/Money';
import { CopyButton } from '@/components/common/CopyButton';
import { PageLoader } from '@/components/common/PageLoader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useGetTransactionQuery } from '@/features/banking/bankingApi';
import type { Transaction } from '@/features/banking/types';
import { errorMessage } from '@/lib/apiError';
import { amountInWords } from '@/lib/amountInWords';
import { formatDateTime, titleCase } from '@/lib/format';

interface TimelineStep {
  label: string;
  done: boolean;
  failed?: boolean;
  at?: string;
}

function timeline(t: Transaction): TimelineStep[] {
  const steps: TimelineStep[] = [{ label: 'Initiated', done: true, at: t.createdAt }];
  if (t.status === 'PENDING_APPROVAL') {
    steps.push({ label: 'Waiting for branch approval', done: false });
  }
  if (t.status === 'REJECTED') steps.push({ label: 'Not approved', done: true, failed: true });
  if (t.rail === 'NEFT' && t.status !== 'REJECTED') {
    steps.push({
      label: 'In NEFT batch',
      done: ['PROCESSING', 'COMPLETED', 'REVERSED'].includes(t.status),
    });
  }
  if (t.status === 'REVERSED')
    steps.push({ label: 'Returned and refunded', done: true, failed: true });
  if (!['REJECTED', 'REVERSED', 'FAILED'].includes(t.status)) {
    steps.push({ label: 'Completed', done: t.status === 'COMPLETED', at: t.completedAt });
  }
  return steps;
}

export default function TransactionDetailsPage() {
  const { id = '' } = useParams();
  const { data: t, isLoading, error } = useGetTransactionQuery(id);
  if (isLoading) return <PageLoader />;
  if (error || !t)
    return <Alert variant="danger">{error ? errorMessage(error) : 'Not found'}</Alert>;

  return (
    <>
      <Link to="/app/transactions" className="small d-inline-block mb-3 no-print">
        <i className="bi bi-arrow-left me-1" aria-hidden="true" />
        All transactions
      </Link>
      <Row className="g-4">
        <Col lg={7}>
          <Card>
            <Card.Body className="p-4">
              <div className="d-flex justify-content-between align-items-start mb-3">
                <div>
                  <div className="small text-body-secondary">
                    {titleCase(t.type)} · {t.rail}
                  </div>
                  <div className="display-6 fw-bold">
                    <Money paise={t.amount} direction={t.direction} />
                  </div>
                  <div className="small text-body-secondary">{amountInWords(t.amount)}</div>
                </div>
                <StatusBadge status={t.status} />
              </div>

              {t.failureReason && (
                <Alert variant="warning" className="small">
                  {t.failureReason}
                </Alert>
              )}

              <dl className="mb-0">
                <div className="receipt-row">
                  <dt>Reference</dt>
                  <dd className="font-mono">
                    {t.reference}
                    <CopyButton value={t.reference} label="Copy reference" />
                  </dd>
                </div>
                {t.from && (
                  <div className="receipt-row">
                    <dt>From</dt>
                    <dd>
                      {t.from.name}
                      <div className="small text-body-secondary">
                        {t.from.bankName} · {t.from.maskedAccount}
                      </div>
                    </dd>
                  </div>
                )}
                {t.to && (
                  <div className="receipt-row">
                    <dt>To</dt>
                    <dd>
                      {t.to.name}
                      <div className="small text-body-secondary">
                        {t.to.bankName} · {t.to.maskedAccount}
                        {t.to.ifsc && ` · ${t.to.ifsc}`}
                      </div>
                    </dd>
                  </div>
                )}
                {t.fee > 0 && (
                  <div className="receipt-row">
                    <dt>Charges (incl. GST)</dt>
                    <dd>
                      <Money paise={t.fee} />
                    </dd>
                  </div>
                )}
                {t.remarks && (
                  <div className="receipt-row">
                    <dt>Remarks</dt>
                    <dd>{t.remarks}</dd>
                  </div>
                )}
                <div className="receipt-row">
                  <dt>Category</dt>
                  <dd>{titleCase(t.category)}</dd>
                </div>
                <div className="receipt-row">
                  <dt>Date</dt>
                  <dd>{formatDateTime(t.createdAt)}</dd>
                </div>
                {t.risk && (
                  <div className="receipt-row">
                    <dt>Security check</dt>
                    <dd>
                      <StatusBadge
                        status={t.risk.level}
                        label={`${titleCase(t.risk.level)} risk`}
                      />
                    </dd>
                  </div>
                )}
              </dl>
              <Button
                variant="outline-secondary"
                size="sm"
                className="mt-3 no-print"
                onClick={() => window.print()}
              >
                <i className="bi bi-printer me-1" aria-hidden="true" />
                Print
              </Button>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={5}>
          <Card>
            <Card.Body>
              <h2 className="h6 mb-3">Progress</h2>
              <ol className="list-unstyled mb-0 d-grid gap-3">
                {timeline(t).map((step) => (
                  <li key={step.label} className="d-flex gap-3">
                    <i
                      className={`bi ${step.failed ? 'bi-x-circle-fill text-danger' : step.done ? 'bi-check-circle-fill text-success' : 'bi-circle text-body-secondary'}`}
                      aria-hidden="true"
                    />
                    <div>
                      <div className={step.done ? 'fw-medium' : 'text-body-secondary'}>
                        {step.label}
                      </div>
                      {step.at && (
                        <div className="small text-body-secondary">{formatDateTime(step.at)}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
}
