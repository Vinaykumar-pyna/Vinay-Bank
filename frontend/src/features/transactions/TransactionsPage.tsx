import { useState } from 'react';
import { Alert, Card, Form, Table } from 'react-bootstrap';
import { useNavigate } from 'react-router';
import { Money } from '@/components/banking/Money';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { PageLoader } from '@/components/common/PageLoader';
import { PaginationBar } from '@/components/common/PaginationBar';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useGetTransactionsQuery } from '@/features/banking/bankingApi';
import { errorMessage } from '@/lib/apiError';
import { formatDateTime, titleCase } from '@/lib/format';

const STATUSES = [
  '',
  'COMPLETED',
  'PROCESSING',
  'PENDING_APPROVAL',
  'REJECTED',
  'REVERSED',
  'FAILED',
];

export default function TransactionsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const { data, isLoading, isFetching, error } = useGetTransactionsQuery({
    page,
    limit: 15,
    status,
  });

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Every transfer, payment and deposit, with its current status."
      />
      {error && <Alert variant="danger">{errorMessage(error)}</Alert>}
      <Card>
        <Card.Body>
          <Form.Group className="mb-3" style={{ maxWidth: 260 }} controlId="txn-status">
            <Form.Label className="small mb-1">Status</Form.Label>
            <Form.Select
              size="sm"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s ? titleCase(s) : 'All statuses'}
                </option>
              ))}
            </Form.Select>
          </Form.Group>

          {isLoading ? (
            <PageLoader />
          ) : data?.items.length ? (
            <>
              <Table hover className="table-ab table-stack align-middle">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Details</th>
                    <th>Method</th>
                    <th>Status</th>
                    <th className="text-end">Amount</th>
                  </tr>
                </thead>
                <tbody style={{ opacity: isFetching ? 0.6 : 1 }}>
                  {data.items.map((t) => {
                    const counterparty = t.direction === 'CREDIT' ? t.from : t.to;
                    return (
                      <tr
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/app/transactions/${t.id}`)}
                        onKeyDown={(e) =>
                          e.key === 'Enter' && navigate(`/app/transactions/${t.id}`)
                        }
                      >
                        <td data-label="Date" className="small text-nowrap">
                          {formatDateTime(t.createdAt)}
                        </td>
                        <td data-label="Details">
                          <div className="small fw-medium">
                            {t.direction === 'CREDIT' ? 'From ' : 'To '}
                            {counterparty?.name ?? titleCase(t.type)}
                          </div>
                          <div className="small text-body-secondary font-mono">{t.reference}</div>
                        </td>
                        <td data-label="Method" className="small">
                          {titleCase(t.type)} · {t.rail}
                        </td>
                        <td data-label="Status">
                          <StatusBadge status={t.status} />
                        </td>
                        <td data-label="Amount" className="text-end">
                          <Money paise={t.amount} direction={t.direction} className="small" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
              <PaginationBar meta={data.meta} onPage={setPage} />
            </>
          ) : (
            <EmptyState icon="bi-receipt" title="No transactions found" />
          )}
        </Card.Body>
      </Card>
    </>
  );
}
