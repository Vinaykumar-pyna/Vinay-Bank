import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import type { OtpChallenge } from '@/features/banking/types';
import { errorMessage } from '@/lib/apiError';

interface OtpStepProps {
  challenge?: OtpChallenge;
  sending: boolean;
  sendError?: unknown;
  code: string;
  onCode: (code: string) => void;
  onSend: () => void;
  purposeText: string;
}

/**
 * Step-up verification for a sensitive card action: send a one-time code
 * (or use the authenticator app), then type it in.
 */
export function OtpStep({
  challenge,
  sending,
  sendError,
  code,
  onCode,
  onSend,
  purposeText,
}: OtpStepProps) {
  if (!challenge) {
    return (
      <div>
        <p className="mb-3">To {purposeText}, we first confirm it is you with a one-time code.</p>
        {!!sendError && <Alert variant="danger">{errorMessage(sendError)}</Alert>}
        <Button onClick={onSend} disabled={sending}>
          {sending && <Spinner size="sm" className="me-2" />}
          Send code
        </Button>
      </div>
    );
  }
  return (
    <Form.Group controlId="card-otp">
      <Form.Label>
        {challenge.channel === 'TOTP'
          ? 'Code from your authenticator app'
          : `One-time password sent to ${challenge.destination}`}
      </Form.Label>
      <Form.Control
        className="otp-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        value={code}
        autoFocus
        onChange={(e) => onCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
      />
      {challenge.channel === 'SMS' && (
        <Form.Text>Demo: the SMS arrives in your notifications (bell icon).</Form.Text>
      )}
    </Form.Group>
  );
}
