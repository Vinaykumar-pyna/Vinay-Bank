import { useState } from 'react';
import { Alert, Card, Col, Form, InputGroup, Row, Table } from 'react-bootstrap';
import { useNavigate, useSearchParams } from 'react-router';
import { Money } from '@/components/banking/Money';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { PageLoader } from '@/components/common/PageLoader';
import { PaginationBar } from '@/components/common/PaginationBar';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { errorMessage } from '@/lib/apiError';
import { formatDate } from '@/lib/format';
import { useSearchCustomersQuery } from '../staffApi';

const KYC_FILTERS = [
  { value: '', label: 'Any KYC status' },
  { value: 'PENDING', label: 'KYC pending' },
  { value: 'VERIFIED', label: 'KYC verified' },
  { value: 'REJECTED', label: 'KYC rejected' },
];

export default function CustomersPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const kycStatus = params.get('kyc') ?? '';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.trim(), 350);
  const { data, isLoading, isFetching, error } = useSearchCustomersQuery({
    search: debouncedSearch,
    kycStatus,
    page,
    limit: 15,
  });

  const open = (id: string) => navigate(`/staff/customers/${id}`);

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Find a customer to review KYC, accounts and recent activity."
      />
      {error && <Alert variant="danger">{errorMessage(error)}</Alert>}
      <Card>
        <Card.Body>
          <Row className="g-2 mb-3">
            <Col md={7} lg={6}>
              <InputGroup size="sm">
                <InputGroup.Text>
                  <i className="bi bi-search" aria-hidden="true" />
                </InputGroup.Text>
                <Form.Control
                  type="search"
                  aria-label="Search customers"
                  placeholder="Name, email, mobile or customer ID"
                  maxLength={60}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </InputGroup>
            </Col>
            <Col md={5} lg={3}>
              <Form.Select
                size="sm"
                aria-label="KYC status"
                value={kycStatus}
                onChange={(e) => {
                  const next = new URLSearchParams(params);
                  if (e.target.value) next.set('kyc', e.target.value);
                  else next.delete('kyc');
                  setParams(next, { replace: true });
                  setPage(1);
                }}
              >
                {KYC_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Form.Select>
            </Col>
          </Row>

          {isLoading ? (
            <PageLoader />
          ) : data?.items.length ? (
            <>
              <Table hover className="table-ab table-stack align-middle">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Mobile</th>
                    <th>KYC</th>
                    <th>Profile</th>
                    <th className="text-end">Accounts</th>
                    <th className="text-end">Total balance</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody style={{ opacity: isFetching ? 0.6 : 1 }}>
                  {data.items.map((c) => (
                    <tr
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => open(c.id)}
                      onKeyDown={(e) => e.key === 'Enter' && open(c.id)}
                    >
                      <td data-label="Customer">
                        <div className="small fw-medium">{c.fullName}</div>
                        <div className="small text-body-secondary text-break">
                          <span className="font-mono">{c.customerId}</span> · {c.email}
                        </div>
                      </td>
                      <td data-label="Mobile" className="small font-mono">
                        {c.phone}
                      </td>
                      <td data-label="KYC">
                        <StatusBadge status={c.kycStatus} />
                      </td>
                      <td data-label="Profile">
                        <StatusBadge status={c.status} />
                      </td>
                      <td data-label="Accounts" className="text-end small">
                        {c.accounts}
                      </td>
                      <td data-label="Total balance" className="text-end">
                        <Money paise={c.totalBalance} className="small" />
                      </td>
                      <td data-label="Joined" className="small text-nowrap">
                        {formatDate(c.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <PaginationBar meta={data.meta} onPage={setPage} />
            </>
          ) : (
            <EmptyState
              icon="bi-person-x"
              title="No customers found"
              description={
                debouncedSearch ? 'Try a shorter search, such as the first name.' : undefined
              }
            />
          )}
        </Card.Body>
      </Card>
    </>
  );
}
