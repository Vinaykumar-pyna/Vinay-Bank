import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Form, InputGroup, ListGroup } from 'react-bootstrap';
import toast from 'react-hot-toast';
import { Link } from 'react-router';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { PageLoader } from '@/components/common/PageLoader';
import {
  useGetBeneficiariesQuery,
  useRemoveBeneficiaryMutation,
} from '@/features/banking/bankingApi';
import type { Beneficiary } from '@/features/banking/types';
import { errorMessage } from '@/lib/apiError';
import { formatDateTime, initials } from '@/lib/format';
import { AddBeneficiaryModal } from './AddBeneficiaryModal';

export default function BeneficiariesPage() {
  const { data, isLoading, error } = useGetBeneficiariesQuery();
  const [removeBeneficiary, removeState] = useRemoveBeneficiaryMutation();
  const [showAdd, setShowAdd] = useState(false);
  const [toRemove, setToRemove] = useState<Beneficiary | null>(null);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((b) =>
      [b.name, b.nickname, b.bankName, b.ifsc, b.accountNumber].some((v) =>
        v?.toLowerCase().includes(q),
      ),
    );
  }, [data, query]);

  const confirmRemove = async () => {
    if (!toRemove) return;
    try {
      await removeBeneficiary(toRemove.id).unwrap();
      toast.success(`${toRemove.name} removed`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setToRemove(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Payees"
        subtitle="People and businesses you send money to."
        actions={
          <Button onClick={() => setShowAdd(true)}>
            <i className="bi bi-person-plus me-1" aria-hidden="true" />
            Add payee
          </Button>
        }
      />
      {error && <Alert variant="danger">{errorMessage(error)}</Alert>}
      <Card>
        <Card.Body>
          <InputGroup className="mb-3" style={{ maxWidth: 420 }}>
            <InputGroup.Text>
              <i className="bi bi-search" aria-hidden="true" />
            </InputGroup.Text>
            <Form.Control
              placeholder="Search by name, bank or account"
              aria-label="Search payees"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </InputGroup>
          {isLoading ? (
            <PageLoader label="Loading payees" />
          ) : filtered.length ? (
            <ListGroup variant="flush">
              {filtered.map((b) => (
                <ListGroup.Item
                  key={b.id}
                  className="px-0 d-flex flex-wrap align-items-center gap-3"
                >
                  <span className="avatar">{initials(...b.name.split(' '))}</span>
                  <div className="flex-grow-1 min-w-0">
                    <div className="fw-semibold">
                      {b.name}
                      {b.nickname && (
                        <span className="text-body-secondary fw-normal"> ({b.nickname})</span>
                      )}
                    </div>
                    <div className="small text-body-secondary">
                      {b.bankName} · <span className="font-mono">{b.maskedAccount}</span> ·{' '}
                      <span className="font-mono">{b.ifsc}</span>
                    </div>
                    <div className="d-flex flex-wrap gap-1 mt-1">
                      {b.isInternal && (
                        <Badge bg="primary-subtle" text="primary-emphasis" className="rounded-pill">
                          ArthaBank · instant
                        </Badge>
                      )}
                      {b.inCoolingPeriod && (
                        <Badge
                          bg="warning-subtle"
                          text="warning-emphasis"
                          className="rounded-pill"
                          title="Transfers capped at ₹50,000 until then"
                        >
                          <i className="bi bi-hourglass-split me-1" aria-hidden="true" />
                          New payee until {formatDateTime(b.coolingUntil)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="d-flex gap-2 ms-auto">
                    <Link to={`/app/transfer?payee=${b.id}`} className="btn btn-sm btn-primary">
                      <i className="bi bi-send me-1" aria-hidden="true" />
                      Pay
                    </Link>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      onClick={() => setToRemove(b)}
                      aria-label={`Remove ${b.name}`}
                    >
                      <i className="bi bi-trash" aria-hidden="true" />
                    </Button>
                  </div>
                </ListGroup.Item>
              ))}
            </ListGroup>
          ) : (
            <EmptyState
              icon="bi-people"
              title={query ? 'No payees match your search' : 'No payees yet'}
              description={
                query
                  ? undefined
                  : 'Add a payee to send money to other ArthaBank customers or any bank in India.'
              }
              action={
                !query && <Button onClick={() => setShowAdd(true)}>Add your first payee</Button>
              }
            />
          )}
        </Card.Body>
      </Card>
      <AddBeneficiaryModal show={showAdd} onHide={() => setShowAdd(false)} />
      <ConfirmDialog
        show={!!toRemove}
        title="Remove payee?"
        body={
          <>
            You will need to add <strong>{toRemove?.name}</strong> again (with a new cooling period)
            to pay them later.
          </>
        }
        confirmLabel="Remove"
        variant="danger"
        busy={removeState.isLoading}
        onConfirm={confirmRemove}
        onCancel={() => setToRemove(null)}
      />
    </>
  );
}
