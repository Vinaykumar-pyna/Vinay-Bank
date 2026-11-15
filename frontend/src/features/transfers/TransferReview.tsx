import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import { Money } from '@/components/banking/Money';
import { useExecuteTransferMutation } from '@/features/banking/bankingApi';
import type { Transaction, TransferQuote } from '@/features/banking/types';
import { toApiError, type ApiError } from '@/lib/apiError';
import { amountInWords } from '@/lib/amountInWords';

interface Props {
  quote: TransferQuote;
  idempotencyKey: string;
  onBack: () => void;
  onDone: (transaction: Transaction) => void;
}

function useSecondsLeft(until: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
}

export function TransferReview({ quote, idempotencyKey, onBack, onDone }: Props) {
  const [executeTransfer, { isLoading }] = useExecuteTransferMutation();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const quoteSeconds = useSecondsLeft(quote.expiresAt);
  const otpSeconds = useSecondsLeft(quote.otp?.expiresAt ?? quote.expiresAt);
  const expired = quoteSeconds === 0 || (quote.otp && otpSeconds === 0);

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      // The same Idempotency-Key is reused if the user clicks again or retries after a
      // network error, so the transfer can never be executed twice.
      const transaction = await executeTransfer({
        quoteToken: quote.quoteToken,
        otp: quote.otp ? otp : undefined,
        idempotencyKey,
      }).unwrap();
      onDone(transaction);
    } catch (err) {
      setError(toApiError(err));
      if (toApiError(err).code === 'INVALID_OTP') setOtp('');
    }
  };

  const rows: [string, ReactNode][] = [
    ['From', `${quote.from.nickname ?? 'Account'} · ${quote.from.maskedNumber.slice(-8)}`],
    [
      'To',
      <span key="to">
        {quote.payee.name}
        <br />
        <span className="small text-body-secondary">
          {quote.payee.bankName} · {quote.payee.maskedAccount} · {quote.payee.ifsc}
        </span>
      </span>,
    ],
    [
      'Method',
      `${quote.railLabel}${quote.settlement === 'DEFERRED' ? ' (settles in the next batch)' : ' (instant)'}`,
    ],
    ['Amount', <Money key="amt" paise={quote.amount} />],
    ['Charges (incl. GST)', quote.fee ? <Money key="fee" paise={quote.fee} /> : 'Free'],
  ];

  return (
    <Form onSubmit={confirm} noValidate>
      <div className="text-center mb-4">
        <div className="small text-body-secondary">You are sending</div>
        <div className="display-6 fw-bold">
          <Money paise={quote.total} />
        </div>
        <div className="small text-body-secondary">{amountInWords(quote.total)}</div>
      </div>

      <dl className="mb-4">
        {rows.map(([label, value]) => (
          <div key={label} className="receipt-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {quote.approvalRequired && (
        <Alert variant="warning" className="small">
          <div className="fw-semibold mb-1">
            <i className="bi bi-person-check me-1" aria-hidden="true" />
            This transfer needs branch approval
          </div>
          The money will be reserved in your account and sent once a branch manager approves it. You
          will get a notification either way.
          {quote.risk.reasons.length > 0 && (
            <ul className="mb-0 mt-2">
              {quote.risk.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      {!quote.approvalRequired && quote.risk.level === 'MEDIUM' && (
        <Alert variant="info" className="small">
          <i className="bi bi-shield-check me-1" aria-hidden="true" />
          For your security we need an extra verification for this transfer.
        </Alert>
      )}

      {quote.otp && (
        <Form.Group className="mb-3" controlId="tf-otp">
          <Form.Label>
            {quote.otp.channel === 'TOTP'
              ? 'Code from your authenticator app'
              : `One-time password sent to ${quote.otp.destination}`}
          </Form.Label>
          <Form.Control
            className="otp-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoFocus
          />
          <Form.Text>
            {quote.otp.channel === 'SMS' &&
              'Demo: the SMS arrives in your notifications (bell icon). '}
            Expires in {Math.floor(otpSeconds / 60)}:{String(otpSeconds % 60).padStart(2, '0')}.
          </Form.Text>
        </Form.Group>
      )}

      {error && (
        <Alert variant="danger" className="small py-2">
          {error.message}
        </Alert>
      )}
      {expired && (
        <Alert variant="secondary" className="small py-2">
          This review has expired. Go back and review the transfer again.
        </Alert>
      )}

      <div className="d-flex gap-2">
        <Button variant="outline-secondary" onClick={onBack} disabled={isLoading}>
          <i className="bi bi-pencil me-1" aria-hidden="true" />
          Edit
        </Button>
        <Button
          type="submit"
          className="flex-grow-1"
          size="lg"
          disabled={isLoading || !!expired || (!!quote.otp && otp.length !== 6)}
        >
          {isLoading ? (
            <Spinner size="sm" animation="border" />
          ) : quote.approvalRequired ? (
            'Confirm and send for approval'
          ) : (
            'Confirm and send'
          )}
        </Button>
      </div>
    </Form>
  );
}
