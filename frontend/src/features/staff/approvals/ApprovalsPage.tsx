import { useState } from 'react';
import { Alert, Button, Card, Form, Nav, Table } from 'react-bootstrap';
import { useSearchParams } from 'react-router';
import { useAppSelector } from '@/app/hooks';
import { Money } from '@/components/banking/Money';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { PageLoader } from '@/components/common/PageLoader';
import { PaginationBar } from '@/components/common/PaginationBar';
import { StatusBadge } from '@/components/common/StatusBadge';
import { errorMessage } from '@/lib/apiError';
import { formatDateTime, formatRelative, titleCase } from '@/lib/format';
import { isChecker } from '../labels';
import { useGetApprovalsQuery } from '../staffApi';
import {
  APPROVAL_TYPE_LABELS,
  type Approval,
  type ApprovalStatus,
  type ApprovalType,
} from '../types';
import { DecisionModal } from './DecisionModal';

const STATUS_TABS: { value: ApprovalStatus | 'ALL'; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All' },
];

export default function ApprovalsPage() {
  const user = useAppSelector((state) => state.auth.user);
  const [params, setParams] = useSearchParams();
  const tab = (params.get('status') ?? 'PENDING') as ApprovalStatus | 'ALL';
  const status = tab === 'ALL' ? '' : tab;
  const type = (params.get('type') ?? '') as ApprovalType | '';
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<{
    approval: Approval;
    decision: 'APPROVED' | 'REJECTED';
  }>();
  const { data, isLoading, isFetching, error } = useGetApprovalsQuery({
    status,
    type,
    page,
    limit: 10,
  });
  const checker = isChecker(user?.role);

  const setFilter = (key: 'status' | 'type', value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle="Maker-checker control: sensitive requests need a second, senior person to approve them."
      />
      {!checker && (
        <Alert variant="info" className="d-flex gap-2">
          <i className="bi bi-info-circle mt-1" aria-hidden="true" />
          <span>
            You can follow the requests you raise here. A branch manager or administrator approves
            them.
          </span>
        </Alert>
      )}
      {error && <Alert variant="danger">{errorMessage(error)}</Alert>}

      <Card>
        <Card.Body>
          <div className="d-flex flex-column flex-md-row gap-3 justify-content-between align-items-md-center mb-3">
            <Nav
              variant="pills"
              activeKey={tab}
              onSelect={(key) => setFilter('status', key ?? 'PENDING')}
            >
              {STATUS_TABS.map((option) => (
                <Nav.Item key={option.value}>
                  <Nav.Link eventKey={option.value} className="py-1 px-3">
                    {option.label}
                  </Nav.Link>
                </Nav.Item>
              ))}
            </Nav>
            <Form.Select
              size="sm"
              aria-label="Request type"
              style={{ maxWidth: 240 }}
              value={type}
              onChange={(e) => setFilter('type', e.target.value)}
            >
              <option value="">All request types</option>
              {Object.entries(APPROVAL_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Form.Select>
          </div>

          {isLoading ? (
            <PageLoader />
          ) : data?.items.length ? (
            <>
              <Table className="table-ab table-stack align-middle">
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Raised by</th>
                    <th>Status</th>
                    <th className="text-end">Amount</th>
                    {checker && <th className="text-end">Decision</th>}
                  </tr>
                </thead>
                <tbody style={{ opacity: isFetching ? 0.6 : 1 }}>
                  {data.items.map((a) => {
                    const ownRequest = a.makerId === user?.id;
                    return (
                      <tr key={a._id}>
                        <td data-label="Request">
                          <div className="fw-medium small">{a.title}</div>
                          <div className="small text-body-secondary">
                            {APPROVAL_TYPE_LABELS[a.type]}
                            {a.accountNumber && (
                              <>
                                {' '}
                                · <span className="font-mono">{a.accountNumber}</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td data-label="Raised by" className="small">
                          <div>
                            {a.makerName}
                            {ownRequest && (
                              <StatusBadge status="INITIATED" label="You" className="ms-2" />
                            )}
                          </div>
                          <div className="text-body-secondary" title={formatDateTime(a.createdAt)}>
                            {titleCase(a.makerRole)} · {formatRelative(a.createdAt)}
                          </div>
                        </td>
                        <td data-label="Status" className="small">
                          <StatusBadge status={a.status} />
                          {a.checkerName && (
                            <div className="text-body-secondary mt-1">
                              by {a.checkerName}
                              {a.remarks ? `: ${a.remarks}` : ''}
                            </div>
                          )}
                        </td>
                        <td data-label="Amount" className="text-end">
                          {a.amount !== undefined ? (
                            <Money paise={a.amount} className="small fw-semibold" />
                          ) : (
                            '-'
                          )}
                        </td>
                        {checker && (
                          <td data-label="Decision" className="text-end text-nowrap">
                            {a.status === 'PENDING' ? (
                              ownRequest ? (
                                <span className="small text-body-secondary">
                                  Another checker must decide
                                </span>
                              ) : (
                                <div className="d-inline-flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline-danger"
                                    onClick={() =>
                                      setPending({ approval: a, decision: 'REJECTED' })
                                    }
                                  >
                                    Reject
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="success"
                                    onClick={() =>
                                      setPending({ approval: a, decision: 'APPROVED' })
                                    }
                                  >
                                    Approve
                                  </Button>
                                </div>
                              )
                            ) : (
                              <span className="small text-body-secondary">
                                {a.decidedAt ? formatDateTime(a.decidedAt) : ''}
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
              <PaginationBar meta={data.meta} onPage={setPage} />
            </>
          ) : (
            <EmptyState
              icon="bi-check2-all"
              title={status === 'PENDING' ? 'Nothing waiting for approval' : 'No requests found'}
              description={
                status === 'PENDING' ? 'New requests appear here in real time.' : undefined
              }
            />
          )}
        </Card.Body>
      </Card>

      {pending && (
        <DecisionModal
          approval={pending.approval}
          decision={pending.decision}
          onClose={() => setPending(undefined)}
        />
      )}
    </>
  );
}
