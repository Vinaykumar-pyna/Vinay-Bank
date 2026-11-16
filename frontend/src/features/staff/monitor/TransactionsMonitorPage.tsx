import { useState } from 'react';
import { Alert, Button, Card, Col, Form, InputGroup, Row, Spinner, Table } from 'react-bootstrap';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router';
import { useAppSelector } from '@/app/hooks';
import { Money } from '@/components/banking/Money';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { PageLoader } from '@/components/common/PageLoader';
import { PaginationBar } from '@/components/common/PaginationBar';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useGetTransactionsQuery } from '@/features/banking/bankingApi';
import type { Transaction } from '@/features/banking/types';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { errorMessage } from '@/lib/apiError';
import { formatDateTime, titleCase } from '@/lib/format';
import { isChecker, RAIL_LABELS, RISK_LEVELS } from '../labels';
import { useRunSettlementMutation } from '../staffApi';
import { TransactionDrawer } from './TransactionDrawer';

const STATUSES = ['COMPLETED', 'PROCESSING', 'PENDING_APPROVAL', 'REJECTED', 'REVERSED', 'FAILED'];
const RAILS = ['INTERNAL', 'IMPS', 'NEFT', 'RTGS', 'CASH', 'CARD'];
const SEARCHABLE = /^[A-Za-z0-9]{2,20}$/;

/**
 * Bank-wide transaction monitor for operations staff. Filters live in the URL,
 * so a link such as /staff/transactions?riskLevel=HIGH can be shared.
 */
export default function TransactionsMonitorPage() {
  const role = useAppSelector((state) => state.auth.user?.role);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Transaction>();
  const debounced = useDebouncedValue(search.trim(), 350);
  const status = params.get('status') ?? '';
  const rail = params.get('rail') ?? '';
  const riskLevel = params.get('riskLevel') ?? '';
  const { data, isLoading, isFetching, error } = useGetTransactionsQuery({
    page,
    limit: 15,
    status,
    rail,
    riskLevel,
    search: SEARCHABLE.test(debounced) ? debounced : undefined,
  });
  const [runSettlement, settlement] = useRunSettlementMutation();

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(1);
  };

  const settleNow = async () => {
    try {
      const { settled } = await runSettlement().unwrap();
      toast.success(
        settled
          ? `Settled ${settled} NEFT transfer${settled === 1 ? '' : 's'}`
          : 'No NEFT transfers are due yet',
      );
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const filters = [
    { key: 'status', label: 'Status', value: status, options: STATUSES, all: 'All statuses' },
    { key: 'rail', label: 'Method', value: rail, options: RAILS, all: 'All methods' },
    {
      key: 'riskLevel',
      label: 'Risk',
      value: riskLevel,
      options: [...RISK_LEVELS],
      all: 'Any risk',
    },
  ];

  return (
    <>
      <PageHeader
        title="Transaction monitor"
        subtitle="Every transaction in the bank, with the fraud engine's risk score."
        actions={
          isChecker(role) && (
            <Button variant="outline-primary" onClick={settleNow} disabled={settlement.isLoading}>
              {settlement.isLoading ? (
                <Spinner size="sm" className="me-2" />
              ) : (
                <i className="bi bi-arrow-repeat me-2" aria-hidden="true" />
              )}
              Run NEFT settlement
            </Button>
          )
        }
      />
      {error && <Alert variant="danger">{errorMessage(error)}</Alert>}
      <Card>
        <Card.Body>
          <Row className="g-2 mb-3">
            <Col md={6} xl={3}>
              <InputGroup size="sm">
                <InputGroup.Text>
                  <i className="bi bi-search" aria-hidden="true" />
                </InputGroup.Text>
                <Form.Control
                  type="search"
                  aria-label="Search by reference"
                  placeholder="Reference, e.g. AB24"
                  maxLength={20}
                  value={search}
                  isInvalid={!!search && !/^[A-Za-z0-9]*$/.test(search)}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </InputGroup>
            </Col>
            {filters.map((f) => (
              <Col xs={12} sm={4} md={6} xl={3} key={f.key}>
                <Form.Select
                  size="sm"
                  aria-label={f.label}
                  value={f.value}
                  onChange={(e) => setFilter(f.key, e.target.value)}
                >
                  <option value="">{f.all}</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {f.key === 'rail' ? (RAIL_LABELS[o] ?? o) : titleCase(o)}
                    </option>
                  ))}
                </Form.Select>
              </Col>
            ))}
          </Row>

          {isLoading ? (
            <PageLoader />
          ) : data?.items.length ? (
            <>
              <Table hover className="table-ab table-stack align-middle">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Parties</th>
                    <th>Method</th>
                    <th>Risk</th>
                    <th>Status</th>
                    <th className="text-end">Amount</th>
                  </tr>
                </thead>
                <tbody style={{ opacity: isFetching ? 0.6 : 1 }}>
                  {data.items.map((t) => (
                    <tr
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected(t)}
                      onKeyDown={(e) => e.key === 'Enter' && setSelected(t)}
                    >
                      <td data-label="Date" className="small text-nowrap">
                        {formatDateTime(t.createdAt)}
                        <div className="text-body-secondary font-mono">{t.reference}</div>
                      </td>
                      <td data-label="Parties" className="small">
                        <div className="fw-medium">{t.from?.name ?? 'Vinay Bank'}</div>
                        <div className="text-body-secondary">to {t.to?.name ?? 'Vinay Bank'}</div>
                      </td>
                      <td data-label="Method" className="small">
                        {RAIL_LABELS[t.rail] ?? t.rail}
                        <div className="text-body-secondary">{titleCase(t.type)}</div>
                      </td>
                      <td data-label="Risk">
                        {t.risk ? (
                          <StatusBadge
                            status={t.risk.level}
                            label={`${titleCase(t.risk.level)}${t.risk.score !== undefined ? ` · ${t.risk.score}` : ''}`}
                          />
                        ) : (
                          <span className="small text-body-secondary">-</span>
                        )}
                      </td>
                      <td data-label="Status">
                        <StatusBadge status={t.status} />
                      </td>
                      <td data-label="Amount" className="text-end">
                        <Money paise={t.amount} className="small fw-semibold" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <PaginationBar meta={data.meta} onPage={setPage} />
            </>
          ) : (
            <EmptyState icon="bi-search" title="No transactions match these filters" />
          )}
        </Card.Body>
      </Card>
      <TransactionDrawer transaction={selected} onHide={() => setSelected(undefined)} />
    </>
  );
}
