import { useState, type FormEvent, type ReactNode } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { errorMessage } from '@/lib/apiError';

interface ReasonDialogProps {
  title: string;
  description?: ReactNode;
  label?: string;
  placeholder?: string;
  confirmLabel: string;
  variant?: 'primary' | 'danger' | 'warning' | 'success';
  busy?: boolean;
  error?: unknown;
  minLength?: number;
  maxLength?: number;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

/**
 * Confirmation that records why: freezing an account, disabling a profile and
 * similar actions all need a reason, which goes to the audit trail.
 * Mount it only while open, so the text box starts empty each time.
 */
export function ReasonDialog({
  title,
  description,
  label = 'Reason',
  placeholder,
  confirmLabel,
  variant = 'primary',
  busy = false,
  error,
  minLength = 3,
  maxLength = 200,
  onConfirm,
  onCancel,
}: ReasonDialogProps) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const invalid = reason.trim().length < minLength;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!invalid) onConfirm(reason.trim());
  };

  return (
    <Modal show onHide={onCancel} centered>
      <Form noValidate onSubmit={submit}>
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h5">
            {title}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {!!error && <Alert variant="danger">{errorMessage(error)}</Alert>}
          {description && <div className="mb-3">{description}</div>}
          <Form.Group controlId="reason-dialog-text">
            <Form.Label>{label}</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              autoFocus
              maxLength={maxLength}
              value={reason}
              placeholder={placeholder}
              isInvalid={touched && invalid}
              onChange={(e) => setReason(e.target.value)}
            />
            <Form.Control.Feedback type="invalid">
              Please enter at least {minLength} characters.
            </Form.Control.Feedback>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant={variant} disabled={busy}>
            {busy && <Spinner size="sm" className="me-2" />}
            {confirmLabel}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
