import type { ReactNode } from 'react';
import { Button, Modal, Spinner } from 'react-bootstrap';

interface ConfirmDialogProps {
  show: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  variant?: 'primary' | 'danger' | 'warning' | 'success';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  show,
  title,
  body,
  confirmLabel = 'Confirm',
  variant = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal show={show} onHide={onCancel} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5">
          {title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>{body}</Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant={variant} onClick={onConfirm} disabled={busy}>
          {busy ? <Spinner size="sm" animation="border" /> : confirmLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
