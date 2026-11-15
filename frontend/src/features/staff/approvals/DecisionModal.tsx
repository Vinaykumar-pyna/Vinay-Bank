import { useState, type FormEvent } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import toast from 'react-hot-toast';
import { StatusBadge } from '@/components/common/StatusBadge';
import { errorMessage } from '@/lib/apiError';
import { formatDateTime, formatMoney, titleCase } from '@/lib/format';
import { useDecideApprovalMutation } from '../staffApi';
import { APPROVAL_TYPE_LABELS, type Approval } from '../types';

interface DecisionModalProps {
  approval: Approval;
  decision: 'APPROVED' | 'REJECTED';
  onClose: () => void;
}

interface RiskDetails {
  level?: string;
  score?: number;
  reasons?: string[];
}

function DetailRows({ details }: { details?: Record<string, unknown> }) {
  if (!details) return null;
  const risk = details.risk as RiskDetails | undefined;
  const rows = Object.entries(details).filter(
    ([key, value]) =>
      key !== 'risk' && value !== undefined && value !== null && typeof value !== 'object',
  );
  return (
    <>
      {rows.map(([key, value]) => (
        <div className="receipt-row" key={key}>
          <span>{titleCase(key.replace(/([a-z])([A-Z])/g, '$1_$2'))}</span>
          <span className="text-break">{String(value)}</span>
        </div>
      ))}
      {risk?.level && (
        <div className="receipt-row">
          <span>Risk</span>
          <span>
            <StatusBadge
              status={risk.level}
              label={`${titleCase(risk.level)} · score ${risk.score ?? 0}`}
            />
          </span>
        </div>
      )}
      {!!risk?.reasons?.length && (
        <ul className="small text-body-secondary mt-2 mb-0 ps-3">
          {risk.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Checker's decision. Rejections need a reason, which is shown to the maker and
 * stored in the audit trail; approvals can carry an optional note.
 */
export function DecisionModal({ approval, decision, onClose }: DecisionModalProps) {
  const [remarks, setRemarks] = useState('');
  const [touched, setTouched] = useState(false);
  const [decide, { isLoading, error }] = useDecideApprovalMutation();
  const rejecting = decision === 'REJECTED';
  const remarksError =
    rejecting && remarks.trim().length < 3
      ? 'Give the maker a reason (at least 3 characters).'
      : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (remarksError) return;
    try {
      await decide({ id: approval._id, decision, remarks: remarks.trim() || undefined }).unwrap();
      toast.success(rejecting ? 'Request rejected' : 'Request approved');
      onClose();
    } catch {
      // The error is shown inside the dialog.
    }
  };

  return (
    <Modal show onHide={onClose} centered>
      <Form noValidate onSubmit={submit}>
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h5">
            {rejecting ? 'Reject request' : 'Approve request'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{errorMessage(error)}</Alert>}
          <div className="mb-3">
            <div className="fw-semibold">{approval.title}</div>
            <div className="small text-body-secondary">
              {APPROVAL_TYPE_LABELS[approval.type]} · raised by {approval.makerName} (
              {titleCase(approval.makerRole)}) on {formatDateTime(approval.createdAt)}
            </div>
          </div>
          <div className="border rounded-3 p-3 mb-3">
            {approval.amount !== undefined && (
              <div className="receipt-row">
                <span>Amount</span>
                <span className="fw-semibold">{formatMoney(approval.amount)}</span>
              </div>
            )}
            {approval.customerName && (
              <div className="receipt-row">
                <span>Customer</span>
                <span>{approval.customerName}</span>
              </div>
            )}
            {approval.accountNumber && (
              <div className="receipt-row">
                <span>Account</span>
                <span className="font-mono">{approval.accountNumber}</span>
              </div>
            )}
            <DetailRows details={approval.details} />
          </div>
          <Form.Group controlId="decision-remarks">
            <Form.Label>{rejecting ? 'Reason for rejection' : 'Note (optional)'}</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              maxLength={300}
              value={remarks}
              isInvalid={touched && !!remarksError}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={rejecting ? 'For example: signature does not match our records' : ''}
            />
            <Form.Control.Feedback type="invalid">{remarksError}</Form.Control.Feedback>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant={rejecting ? 'danger' : 'success'} disabled={isLoading}>
            {isLoading && <Spinner size="sm" className="me-2" />}
            {rejecting ? 'Reject' : 'Approve'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
