import { Button, Card } from 'react-bootstrap';
import { Money } from '@/components/banking/Money';
import { StatusBadge } from '@/components/common/StatusBadge';
import type { Transaction } from '@/features/banking/types';
import { formatDateTime } from '@/lib/format';

interface CashReceiptProps {
  transaction: Transaction;
  onNew: () => void;
}

/** Counter slip after a cash operation, printable for the customer. */
export function CashReceipt({ transaction: t, onNew }: CashReceiptProps) {
  const deposit = t.type === 'CASH_DEPOSIT';
  const held = t.status === 'PENDING_APPROVAL';
  const account = deposit ? t.to : t.from;
  return (
    <Card>
      <Card.Body className="p-4">
        <div className="text-center mb-4">
          <span
            className={`icon-tile icon-tile-${held ? 'warning' : 'success'} mb-3`}
            aria-hidden="true"
          >
            <i className={`bi ${held ? 'bi-hourglass-split' : 'bi-check2-circle'}`} />
          </span>
          <h2 className="h4 mb-1">
            {held ? 'Sent for approval' : deposit ? 'Deposit credited' : 'Withdrawal posted'}
          </h2>
          <p className="text-body-secondary mb-0">
            {held
              ? deposit
                ? 'A manager must approve this deposit before it is credited. Keep the cash in the vault until then.'
                : 'The amount is on hold in the account. Pay out the cash only after a manager approves.'
              : deposit
                ? 'The customer has been notified.'
                : 'Hand over the cash and ask the customer to sign the slip.'}
          </p>
        </div>
        <div className="display-6 fw-bold text-center mb-4">
          <Money paise={t.amount} />
        </div>
        <div className="receipt-row">
          <span>Reference</span>
          <span className="font-mono">{t.reference}</span>
        </div>
        <div className="receipt-row">
          <span>Status</span>
          <StatusBadge status={t.status} />
        </div>
        <div className="receipt-row">
          <span>Account</span>
          <span className="font-mono">{account?.maskedAccount}</span>
        </div>
        <div className="receipt-row">
          <span>Account holder</span>
          <span>{account?.name}</span>
        </div>
        {t.remarks && (
          <div className="receipt-row">
            <span>Remarks</span>
            <span>{t.remarks}</span>
          </div>
        )}
        <div className="receipt-row">
          <span>Date and time</span>
          <span>{formatDateTime(t.createdAt)}</span>
        </div>
        <div className="d-flex gap-2 justify-content-center mt-4 no-print">
          <Button variant="outline-secondary" onClick={() => window.print()}>
            <i className="bi bi-printer me-2" aria-hidden="true" />
            Print slip
          </Button>
          <Button onClick={onNew}>
            <i className="bi bi-plus-lg me-2" aria-hidden="true" />
            New transaction
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}
