import { useState } from 'react';
import { Alert, Card, Col, Dropdown, Form, Row, Spinner, Table } from 'react-bootstrap';
import toast from 'react-hot-toast';
import { Link, useParams } from 'react-router';
import { Money } from '@/components/banking/Money';
import { CopyButton } from '@/components/common/CopyButton';
import { EmptyState } from '@/components/common/EmptyState';
import { PageLoader } from '@/components/common/PageLoader';
import { PaginationBar } from '@/components/common/PaginationBar';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useGetAccountQuery, useGetStatementQuery } from '@/features/banking/bankingApi';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { errorMessage } from '@/lib/apiError';
import { formatDate, formatDateTime, titleCase } from '@/lib/format';
import { http } from '@/lib/http';
import { saveStatement, type StatementFormat } from './saveStatement';

export default function AccountDetailsPage() {
  const { id = '' } = useParams();
  const { data: account, isLoading, error } = useGetAccountQuery(id);
  const [page, setPage] = useState(1);
  const [direction, setDirection] = useState<'ALL' | 'DEBIT' | 'CREDIT'>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 350);
  const [downloading, setDownloading] = useState(false);

  const statement = useGetStatementQuery(
    {
      id,
      page,
      limit: 15,
      direction,
      from: from || undefined,
      to: to || undefined,
      search: debouncedSearch || undefined,
    },
    { skip: !id },
  );

  /** CSV for spreadsheets, XML for accounting software, or HTML rendered from the XML by XSLT. */
  const exportStatement = async (format: StatementFormat) => {
    setDownloading(true);
    try {
      await saveStatement(
        format,
        () =>
          http
            .get<Blob>(`/accounts/${id}/statement.${format}`, {
              responseType: 'blob',
              params: { from: from || undefined, to: to || undefined, direction },
            })
            .then((response) => response.data),
        `ArthaBank-${account?.accountNumber.slice(-4)}-statement`,
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) return <PageLoader label="Loading account" />;
  if (error || !account)
    return <Alert variant="danger">{error ? errorMessage(error) : 'Account not found'}</Alert>;

  const resetToFirstPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  return (
    <>
      <Link to="/app/accounts" className="small d-inline-block mb-3">
        <i className="bi bi-arrow-left me-1" aria-hidden="true" />
        All accounts
      </Link>
      <div className="d-flex flex-column flex-md-row justify-content-between gap-3 mb-4">
        <div>
          <h1 className="h3 mb-1">{account.nickname ?? `${titleCase(account.type)} account`}</h1>
          <div className="text-body-secondary small">
            <span className="font-mono">{account.accountNumber}</span>
            <CopyButton value={account.accountNumber} label="Copy account number" /> · IFSC{' '}
            <span className="font-mono">{account.ifsc}</span> · {account.branch.name}
          </div>
        </div>
        <div className="d-flex gap-2 align-items-start">
          <StatusBadge status={account.status} />
        </div>
      </div>

      <Row xs={2} lg={4} className="g-3 mb-4">
        {[
          {
            label: 'Available balance',
            value: account.availableBalance,
            icon: 'bi-wallet2',
            tone: 'primary',
          },
          {
            label: 'Ledger balance',
            value: account.ledgerBalance,
            icon: 'bi-journal-text',
            tone: 'info',
          },
          { label: 'On hold', value: account.holdAmount, icon: 'bi-lock', tone: 'warning' },
          {
            label: 'Daily transfer limit',
            value: account.dailyTransferLimit,
            icon: 'bi-speedometer',
            tone: 'secondary',
          },
        ].map((tile) => (
          <Col key={tile.label}>
            <Card className="h-100">
              <Card.Body className="d-flex gap-3 align-items-center">
                <span className={`icon-tile icon-tile-${tile.tone} d-none d-sm-inline-flex`}>
                  <i className={`bi ${tile.icon}`} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="small text-body-secondary">{tile.label}</div>
                  <div className="fw-semibold">
                    <Money paise={tile.value} />
                  </div>
                </div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      <Card>
        <Card.Body>
          <div className="d-flex flex-column flex-lg-row gap-3 justify-content-between align-items-lg-end mb-3">
            <div>
              <h2 className="h6 mb-1">Statement</h2>
              <p className="small text-body-secondary mb-0">
                Every credit and debit with its running balance.
              </p>
            </div>
            <Dropdown className="no-print" align="end">
              <Dropdown.Toggle variant="outline-primary" size="sm" disabled={downloading}>
                {downloading ? (
                  <Spinner size="sm" animation="border" />
                ) : (
                  <i className="bi bi-download me-1" aria-hidden="true" />
                )}{' '}
                Download
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item onClick={() => void exportStatement('csv')}>
                  <i className="bi bi-filetype-csv me-2" aria-hidden="true" />
                  CSV for spreadsheets
                </Dropdown.Item>
                <Dropdown.Item onClick={() => void exportStatement('xml')}>
                  <i className="bi bi-filetype-xml me-2" aria-hidden="true" />
                  XML for accounting software
                </Dropdown.Item>
                <Dropdown.Item onClick={() => void exportStatement('html')}>
                  <i className="bi bi-printer me-2" aria-hidden="true" />
                  Printable statement (XSLT)
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </div>

          <Row className="g-2 mb-3 no-print">
            <Col xs={6} md={3}>
              <Form.Label htmlFor="st-from" className="small mb-1">
                From
              </Form.Label>
              <Form.Control
                id="st-from"
                type="date"
                size="sm"
                value={from}
                max={to || undefined}
                onChange={(e) => resetToFirstPage(setFrom)(e.target.value)}
              />
            </Col>
            <Col xs={6} md={3}>
              <Form.Label htmlFor="st-to" className="small mb-1">
                To
              </Form.Label>
              <Form.Control
                id="st-to"
                type="date"
                size="sm"
                value={to}
                min={from || undefined}
                onChange={(e) => resetToFirstPage(setTo)(e.target.value)}
              />
            </Col>
            <Col xs={6} md={2}>
              <Form.Label htmlFor="st-type" className="small mb-1">
                Type
              </Form.Label>
              <Form.Select
                id="st-type"
                size="sm"
                value={direction}
                onChange={(e) => resetToFirstPage(setDirection)(e.target.value as typeof direction)}
              >
                <option value="ALL">All</option>
                <option value="CREDIT">Credits</option>
                <option value="DEBIT">Debits</option>
              </Form.Select>
            </Col>
            <Col xs={6} md={4}>
              <Form.Label htmlFor="st-search" className="small mb-1">
                Search
              </Form.Label>
              <Form.Control
                id="st-search"
                size="sm"
                placeholder="Name, narration or reference"
                value={search}
                onChange={(e) => resetToFirstPage(setSearch)(e.target.value)}
              />
            </Col>
          </Row>

          {statement.isFetching && !statement.data ? (
            <PageLoader label="Loading statement" />
          ) : statement.data?.items.length ? (
            <>
              <Table responsive={false} hover className="table-ab table-stack align-middle">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th className="text-end">Debit</th>
                    <th className="text-end">Credit</th>
                    <th className="text-end">Balance</th>
                  </tr>
                </thead>
                <tbody style={{ opacity: statement.isFetching ? 0.6 : 1 }}>
                  {statement.data.items.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Date" className="text-nowrap small">
                        <span className="d-none d-md-inline">{formatDate(p.createdAt)}</span>
                        <span className="d-md-none">{formatDateTime(p.createdAt)}</span>
                      </td>
                      <td data-label="Description">
                        <div className="small fw-medium">{p.narration}</div>
                        <div className="small text-body-secondary font-mono">{p.reference}</div>
                      </td>
                      <td data-label="Debit" className="text-end">
                        {p.direction === 'DEBIT' ? (
                          <Money paise={p.amount} direction="DEBIT" className="small" />
                        ) : (
                          <span className="text-body-secondary">-</span>
                        )}
                      </td>
                      <td data-label="Credit" className="text-end">
                        {p.direction === 'CREDIT' ? (
                          <Money paise={p.amount} direction="CREDIT" className="small" />
                        ) : (
                          <span className="text-body-secondary">-</span>
                        )}
                      </td>
                      <td data-label="Balance" className="text-end small fw-medium">
                        <Money paise={p.balanceAfter} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <PaginationBar meta={statement.data.meta} onPage={setPage} />
            </>
          ) : (
            <EmptyState
              icon="bi-search"
              title="No transactions match your filters"
              description="Try a wider date range or clear the search."
            />
          )}
        </Card.Body>
      </Card>
    </>
  );
}
