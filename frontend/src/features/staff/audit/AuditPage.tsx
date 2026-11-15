import { Fragment, useState } from 'react';
import { Alert, Button, Card, Col, Form, Row, Spinner, Table } from 'react-bootstrap';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { PageLoader } from '@/components/common/PageLoader';
import { PaginationBar } from '@/components/common/PaginationBar';
import { StatusBadge } from '@/components/common/StatusBadge';
import { errorMessage } from '@/lib/apiError';
import { formatDateTime, formatIp, titleCase } from '@/lib/format';
import { useGetAuditLogsQuery, useVerifyAuditChainMutation } from '../staffApi';
import type { AuditEntry } from '../types';

const ACTION_GROUPS: { label: string; actions: string[] }[] = [
  {
    label: 'Sign-in and security',
    actions: [
      'AUTH_LOGIN_SUCCEEDED',
      'AUTH_LOGIN_FAILED',
      'AUTH_ACCOUNT_LOCKED',
      'AUTH_MFA_FAILED',
      'AUTH_TOKEN_REUSE_DETECTED',
      'AUTH_PASSWORD_CHANGED',
      'AUTH_MFA_ENABLED',
      'AUTH_SESSION_REVOKED',
    ],
  },
  {
    label: 'Money movement',
    actions: [
      'TRANSFER_COMPLETED',
      'TRANSFER_HELD_FOR_APPROVAL',
      'TRANSFER_BLOCKED',
      'TRANSFER_REVERSED',
      'CASH_DEPOSIT',
      'CASH_WITHDRAWAL',
    ],
  },
  {
    label: 'Branch operations',
    actions: [
      'APPROVAL_APPROVED',
      'APPROVAL_REJECTED',
      'KYC_VERIFIED',
      'KYC_REJECTED',
      'ACCOUNT_STATUS_CHANGED',
      'USER_STATUS_CHANGED',
      'STAFF_CREATED',
      'AUDIT_CHAIN_VERIFIED',
    ],
  },
];

const ENTITY_TYPES = ['User', 'Account', 'Transaction', 'Approval', 'Beneficiary'];

const shortHash = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-6)}`;

function AuditDetails({ entry }: { entry: AuditEntry }) {
  return (
    <div className="small d-grid gap-2">
      <div className="row g-2">
        <div className="col-md-6">
          <div className="text-body-secondary">Previous hash</div>
          <code className="text-break">{entry.prevHash}</code>
        </div>
        <div className="col-md-6">
          <div className="text-body-secondary">Record hash</div>
          <code className="text-break">{entry.hash}</code>
        </div>
      </div>
      {entry.entityId && (
        <div>
          <span className="text-body-secondary">Entity ID </span>
          <span className="font-mono">{entry.entityId}</span>
        </div>
      )}
      {entry.requestId && (
        <div>
          <span className="text-body-secondary">Request ID </span>
          <span className="font-mono">{entry.requestId}</span>
        </div>
      )}
      {entry.userAgent && <div className="text-body-secondary text-break">{entry.userAgent}</div>}
      {entry.details && (
        <pre className="hex-dump mb-0">{JSON.stringify(entry.details, null, 2)}</pre>
      )}
    </div>
  );
}

/**
 * Tamper-evident audit trail. Each record stores the SHA-256 hash of the one
 * before it; "Verify integrity" recomputes the whole chain on the server and
 * names the first record that no longer matches.
 */
export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ seq: '', action: '', entityType: '', from: '', to: '' });
  const [expanded, setExpanded] = useState<number>();
  const [verify, verification] = useVerifyAuditChainMutation();
  const report = verification.data;
  const brokenSeq = report?.valid === false ? report.firstInvalidSeq : undefined;
  const { data, isLoading, isFetching, error } = useGetAuditLogsQuery({
    page,
    limit: 20,
    seq: filters.seq ? Number(filters.seq) : undefined,
    action: filters.action,
    entityType: filters.entityType,
    from: filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : undefined,
    to: filters.to ? new Date(`${filters.to}T23:59:59.999`).toISOString() : undefined,
  });

  const update = (key: keyof typeof filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const showRecord = (seq: number) => {
    setFilters({ seq: String(seq), action: '', entityType: '', from: '', to: '' });
    setExpanded(seq);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Audit trail"
        subtitle="Append-only, hash-chained record of every security and money event."
        actions={
          <Button onClick={() => verify()} disabled={verification.isLoading}>
            {verification.isLoading ? (
              <Spinner size="sm" className="me-2" />
            ) : (
              <i className="bi bi-patch-check me-2" aria-hidden="true" />
            )}
            Verify integrity
          </Button>
        }
      />

      {verification.error && <Alert variant="danger">{errorMessage(verification.error)}</Alert>}
      {report &&
        (report.valid ? (
          <Alert variant="success" className="d-flex gap-3 align-items-start">
            <i className="bi bi-shield-check fs-4" aria-hidden="true" />
            <div className="min-w-0">
              <div className="fw-semibold">Chain intact</div>
              <div className="small">
                All {report.checked.toLocaleString('en-IN')} records match their hashes (checked in{' '}
                {report.durationMs} ms at {formatDateTime(report.verifiedAt)}).
              </div>
              <div className="small text-break">
                Latest hash <code>{report.lastHash}</code>
              </div>
            </div>
          </Alert>
        ) : (
          <Alert variant="danger" className="d-flex gap-3 align-items-start">
            <i className="bi bi-shield-exclamation fs-4" aria-hidden="true" />
            <div className="min-w-0">
              <div className="fw-semibold">
                Tampering detected at record #{report.firstInvalidSeq}
              </div>
              <div className="small mb-2">
                {report.reason}. This record was changed outside the application, so it and every
                record after it can no longer be trusted. {report.checked.toLocaleString('en-IN')}{' '}
                records checked.
              </div>
              {brokenSeq !== undefined && (
                <Button size="sm" variant="outline-danger" onClick={() => showRecord(brokenSeq)}>
                  Show record #{brokenSeq}
                </Button>
              )}
            </div>
          </Alert>
        ))}
      {error && <Alert variant="danger">{errorMessage(error)}</Alert>}

      <Card>
        <Card.Body>
          <Row className="g-2 mb-3">
            <Col xs={6} md={2}>
              <Form.Control
                size="sm"
                inputMode="numeric"
                aria-label="Record number"
                placeholder="Record #"
                value={filters.seq}
                onChange={(e) => update('seq', e.target.value.replace(/\D/g, '').slice(0, 9))}
              />
            </Col>
            <Col xs={6} md={4} xl={3}>
              <Form.Select
                size="sm"
                aria-label="Action"
                value={filters.action}
                onChange={(e) => update('action', e.target.value)}
              >
                <option value="">All actions</option>
                {ACTION_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.actions.map((a) => (
                      <option key={a} value={a}>
                        {titleCase(a)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Form.Select>
            </Col>
            <Col xs={12} md={6} xl={3}>
              <Form.Select
                size="sm"
                aria-label="Entity"
                value={filters.entityType}
                onChange={(e) => update('entityType', e.target.value)}
              >
                <option value="">All entities</option>
                {ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col xs={6} md={3} xl={2}>
              <Form.Control
                size="sm"
                type="date"
                aria-label="From date"
                value={filters.from}
                onChange={(e) => update('from', e.target.value)}
              />
            </Col>
            <Col xs={6} md={3} xl={2}>
              <Form.Control
                size="sm"
                type="date"
                aria-label="To date"
                value={filters.to}
                onChange={(e) => update('to', e.target.value)}
              />
            </Col>
          </Row>

          {isLoading ? (
            <PageLoader />
          ) : data?.items.length ? (
            <>
              <Table hover className="table-ab table-stack table-stack-lg align-middle">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Entity</th>
                    <th>Source</th>
                    <th>Hash</th>
                  </tr>
                </thead>
                <tbody style={{ opacity: isFetching ? 0.6 : 1 }}>
                  {data.items.map((entry) => {
                    const open = expanded === entry.seq;
                    const broken = brokenSeq === entry.seq;
                    return (
                      <Fragment key={entry.seq}>
                        <tr
                          role="button"
                          tabIndex={0}
                          aria-expanded={open}
                          className={broken ? 'table-danger' : undefined}
                          onClick={() => setExpanded(open ? undefined : entry.seq)}
                          onKeyDown={(e) =>
                            e.key === 'Enter' && setExpanded(open ? undefined : entry.seq)
                          }
                        >
                          <td data-label="#" className="small font-mono">
                            {entry.seq}
                          </td>
                          <td data-label="Time" className="small text-nowrap">
                            {formatDateTime(entry.at)}
                          </td>
                          <td data-label="Action" className="small">
                            <span className="fw-medium">{titleCase(entry.action)}</span>
                            {entry.outcome === 'FAILURE' && (
                              <StatusBadge status="FAILURE" label="Failed" className="ms-2" />
                            )}
                          </td>
                          <td data-label="Actor" className="small">
                            {entry.actorLabel ?? 'System'}
                            {entry.actorRole && (
                              <div className="text-body-secondary">
                                {titleCase(entry.actorRole)}
                              </div>
                            )}
                          </td>
                          <td data-label="Entity" className="small">
                            {entry.entityType ?? '-'}
                          </td>
                          <td data-label="Source" className="small">
                            {entry.ip ? formatIp(entry.ip) : '-'}
                          </td>
                          <td data-label="Hash" className="small">
                            <code>{shortHash(entry.hash)}</code>
                          </td>
                        </tr>
                        {open && (
                          <tr className="audit-details-row">
                            <td colSpan={7}>
                              <AuditDetails entry={entry} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </Table>
              <PaginationBar meta={data.meta} onPage={setPage} />
            </>
          ) : (
            <EmptyState icon="bi-journal-x" title="No audit records match these filters" />
          )}
        </Card.Body>
      </Card>
    </>
  );
}
