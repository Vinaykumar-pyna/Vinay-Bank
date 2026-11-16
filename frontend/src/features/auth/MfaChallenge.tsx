import { useState, type FormEvent } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import { toApiError, type ApiError } from '@/lib/apiError';
import { useLoginMfaMutation } from './authApi';

interface MfaChallengeProps {
  mfaToken: string;
  onBack: () => void;
}

/** Second sign-in step: a 6-digit authenticator code or a single-use recovery code. */
export function MfaChallenge({ mfaToken, onBack }: MfaChallengeProps) {
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [loginMfa, { isLoading }] = useLoginMfaMutation();

  const valid = useRecovery
    ? /^[A-Za-z2-7]{4}-?[A-Za-z2-7]{4}$/.test(code.trim())
    : /^\d{6}$/.test(code);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setError(null);
    try {
      await loginMfa({ mfaToken, code: code.trim() }).unwrap();
    } catch (err) {
      setError(toApiError(err));
      setCode('');
    }
  };

  return (
    <Form onSubmit={submit} noValidate>
      <div className="icon-tile icon-tile-primary mb-3">
        <i className="bi bi-shield-lock" aria-hidden="true" />
      </div>
      <h1 className="h3 mb-1">Two-step verification</h1>
      <p className="text-body-secondary mb-4">
        {useRecovery
          ? 'Enter one of the recovery codes you saved when you set up two-factor authentication.'
          : 'Open your authenticator app and enter the 6-digit code for Vinay Bank.'}
      </p>

      {error && (
        <Alert variant="danger" className="py-2">
          {error.message}
        </Alert>
      )}

      <Form.Group className="mb-3" controlId="mfa-code">
        <Form.Label>{useRecovery ? 'Recovery code' : 'Verification code'}</Form.Label>
        <Form.Control
          className="otp-input"
          value={code}
          onChange={(e) =>
            setCode(
              useRecovery
                ? e.target.value.toUpperCase().slice(0, 9)
                : e.target.value.replace(/\D/g, '').slice(0, 6),
            )
          }
          inputMode={useRecovery ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          placeholder={useRecovery ? 'ABCD-EFGH' : '000000'}
          autoFocus
          aria-describedby="mfa-help"
        />
      </Form.Group>

      <Button type="submit" className="w-100" size="lg" disabled={!valid || isLoading}>
        {isLoading ? <Spinner size="sm" animation="border" /> : 'Verify and sign in'}
      </Button>

      <div id="mfa-help" className="d-flex justify-content-between mt-3 small">
        <button type="button" className="btn btn-link p-0" onClick={onBack}>
          <i className="bi bi-arrow-left me-1" aria-hidden="true" />
          Back
        </button>
        <button
          type="button"
          className="btn btn-link p-0"
          onClick={() => {
            setUseRecovery((v) => !v);
            setCode('');
            setError(null);
          }}
        >
          {useRecovery ? 'Use authenticator code' : 'Use a recovery code'}
        </button>
      </div>
    </Form>
  );
}
