import { Button } from 'react-bootstrap';
import { Link } from 'react-router';
import { Money } from '@/components/banking/Money';
import { CopyButton } from '@/components/common/CopyButton';
import type { Transaction } from '@/features/banking/types';
import { formatDateTime } from '@/lib/format';

const OUTCOMES = {
  COMPLETED: { icon: 'bi-check-circle-fill', tone: 'success', title: 'Money sent' },
  PROCESSING: { icon: 'bi-clock-history', tone: 'info', title: 'Transfer is processing' },
  PENDING_APPROVAL: { icon: 'bi-hourglass-split', tone: 'warning', title: 'Sent for approval' },
} as const;

export function TransferResult({
  transaction,
  onNew,
}: {
  transaction: Transaction;
  onNew: () => void;
}) {
  const outcome = OUTCOMES[transaction.status as keyof typeof OUTCOMES] ?? OUTCOMES.COMPLETED;
  const detail = {
    COMPLETED: `${transaction.to?.name} has received the money.`,
    PROCESSING:
      'Your NEFT transfer will settle in the next batch. We will notify you when it completes.',
    PENDING_APPROVAL:
      'The amount is reserved in your account. A branch manager will review it shortly.',
  }[transaction.status as keyof typeof OUTCOMES];

  return (
    <div className="text-center">
      <i
        className={`bi ${outcome.icon} text-${outcome.tone}`}
        style={{ fontSize: '3.5rem' }}
        aria-hidden="true"
      />
      <h2 className="h4 mt-2 mb-1">{outcome.title}</h2>
      <p className="text-body-secondary">{detail}</p>
      <div className="display-6 fw-bold mb-3">
        <Money paise={transaction.amount} />
      </div>

      <dl className="text-start mx-auto mb-4" style={{ maxWidth: 440 }}>
        <div className="receipt-row">
          <dt>Reference</dt>
          <dd className="font-mono">
            {transaction.reference}
            <CopyButton value={transaction.reference} label="Copy reference" />
          </dd>
        </div>
        <div className="receipt-row">
          <dt>To</dt>
          <dd>
            {transaction.to?.name} · {transaction.to?.maskedAccount}
          </dd>
        </div>
        <div className="receipt-row">
          <dt>Method</dt>
          <dd>{transaction.rail}</dd>
        </div>
        {transaction.fee > 0 && (
          <div className="receipt-row">
            <dt>Charges</dt>
            <dd>
              <Money paise={transaction.fee} />
            </dd>
          </div>
        )}
        <div className="receipt-row">
          <dt>Date</dt>
          <dd>{formatDateTime(transaction.createdAt)}</dd>
        </div>
      </dl>

      <div className="d-flex flex-wrap gap-2 justify-content-center no-print">
        <Button onClick={onNew}>
          <i className="bi bi-send me-1" aria-hidden="true" />
          New transfer
        </Button>
        <Link to={`/app/transactions/${transaction.id}`} className="btn btn-outline-secondary">
          View details
        </Link>
        <Button variant="outline-secondary" onClick={() => window.print()}>
          <i className="bi bi-printer me-1" aria-hidden="true" />
          Print receipt
        </Button>
      </div>
    </div>
  );
}
