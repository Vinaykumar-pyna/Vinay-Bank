import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, Form, Modal, Spinner } from 'react-bootstrap';
import toast from 'react-hot-toast';
import { PageLoader } from '@/components/common/PageLoader';
import { StatusBadge } from '@/components/common/StatusBadge';
import {
  useMeQuery,
  useMfaDisableMutation,
  useMfaEnableMutation,
  useMfaSetupMutation,
} from '@/features/auth/authApi';
import type { MfaSetup } from '@/features/auth/types';
import { errorMessage } from '@/lib/apiError';

export function MfaCard({ enabled }: { enabled: boolean }) {
  const [showSetup, setShowSetup] = useState(false);
  const [showDisable, setShowDisable] = useState(false);

  return (
    <Card>
      <Card.Body>
        <div className="d-flex justify-content-between align-items-start gap-3">
          <div>
            <h2 className="h6 mb-1">Two-factor authentication</h2>
            <p className="small text-body-secondary mb-0">
              Require a code from an authenticator app (Google Authenticator, Microsoft
              Authenticator, Authy) every time you sign in.
            </p>
          </div>
          <StatusBadge status={enabled ? 'ACTIVE' : 'DISABLED'} label={enabled ? 'On' : 'Off'} />
        </div>
        <div className="mt-3">
          {enabled ? (
            <Button variant="outline-danger" size="sm" onClick={() => setShowDisable(true)}>
              Turn off
            </Button>
          ) : (
            <Button size="sm" onClick={() => setShowSetup(true)}>
              <i className="bi bi-qr-code me-1" aria-hidden="true" />
              Set up two-factor authentication
            </Button>
          )}
        </div>
      </Card.Body>
      {showSetup && <MfaSetupModal onClose={() => setShowSetup(false)} />}
      {showDisable && <MfaDisableModal onClose={() => setShowDisable(false)} />}
    </Card>
  );
}

function MfaSetupModal({ onClose }: { onClose: () => void }) {
  const [setupMfa, setupState] = useMfaSetupMutation();
  const [enableMfa, enableState] = useMfaEnableMutation();
  const { refetch } = useMeQuery();
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const start = async () => {
    try {
      setSetup(await setupMfa().unwrap());
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const result = await enableMfa({ code }).unwrap();
      setRecoveryCodes(result.recoveryCodes);
      void refetch();
      toast.success('Two-factor authentication is now on');
    } catch (err) {
      setError(errorMessage(err));
      setCode('');
    }
  };

  const download = () => {
    const text = `Vinay Bank recovery codes\nGenerated ${new Date().toLocaleString('en-IN')}\nEach code works once.\n\n${recoveryCodes!.join('\n')}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = Object.assign(document.createElement('a'), {
      href: url,
      download: 'vinaybank-recovery-codes.txt',
    });
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      show
      onHide={onClose}
      centered
      onEntered={() => !setup && void start()}
      backdrop="static"
    >
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5">
          {recoveryCodes ? 'Save your recovery codes' : 'Set up two-factor authentication'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && (
          <Alert variant="danger" className="py-2">
            {error}
          </Alert>
        )}

        {!setup && !error && <PageLoader compact label="Preparing your authenticator setup" />}

        {setup && !recoveryCodes && (
          <Form onSubmit={confirm}>
            <ol className="small ps-3">
              <li>Open your authenticator app and scan this QR code.</li>
              <li>Enter the 6-digit code the app shows to finish.</li>
            </ol>
            <div className="text-center my-3">
              <img
                src={setup.qrCodeDataUrl}
                alt="QR code to add Vinay Bank to your authenticator app"
                width={200}
                height={200}
                className="rounded border bg-white p-2"
              />
            </div>
            <p className="small text-body-secondary text-center">
              Can't scan? Enter this key manually:
              <br />
              <code className="fs-6 user-select-all">{setup.manualEntryKey}</code>
            </p>
            <Form.Group controlId="mfa-setup-code">
              <Form.Label>Verification code</Form.Label>
              <Form.Control
                className="otp-input"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
              />
            </Form.Group>
            <Button
              type="submit"
              className="w-100 mt-3"
              disabled={code.length !== 6 || enableState.isLoading}
            >
              {enableState.isLoading ? (
                <Spinner size="sm" animation="border" />
              ) : (
                'Verify and turn on'
              )}
            </Button>
          </Form>
        )}

        {recoveryCodes && (
          <>
            <Alert variant="warning" className="small">
              <i className="bi bi-exclamation-triangle me-2" aria-hidden="true" />
              Store these codes somewhere safe. Each one lets you sign in once if you lose your
              phone. They will not be shown again.
            </Alert>
            <div className="row row-cols-2 g-2 font-mono text-center mb-3">
              {recoveryCodes.map((rc) => (
                <div key={rc} className="col">
                  <div className="border rounded py-2 bg-body-tertiary">{rc}</div>
                </div>
              ))}
            </div>
            <div className="d-flex gap-2">
              <Button variant="outline-primary" className="flex-fill" onClick={download}>
                <i className="bi bi-download me-1" aria-hidden="true" />
                Download
              </Button>
              <Button className="flex-fill" onClick={onClose}>
                I have saved them
              </Button>
            </div>
          </>
        )}
        {setupState.isError && !setup && (
          <Button variant="outline-secondary" onClick={start}>
            Try again
          </Button>
        )}
      </Modal.Body>
    </Modal>
  );
}

function MfaDisableModal({ onClose }: { onClose: () => void }) {
  const [disableMfa, { isLoading }] = useMfaDisableMutation();
  const { refetch } = useMeQuery();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await disableMfa({ password, code }).unwrap();
      void refetch();
      toast.success('Two-factor authentication is now off');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal show onHide={onClose} centered>
      <Form onSubmit={submit}>
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h5">
            Turn off two-factor authentication
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small text-body-secondary">
            Your account will be protected by your password only. Confirm it's you.
          </p>
          {error && (
            <Alert variant="danger" className="py-2">
              {error}
            </Alert>
          )}
          <Form.Group className="mb-3" controlId="mfa-off-password">
            <Form.Label>Password</Form.Label>
            <Form.Control
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Form.Group>
          <Form.Group controlId="mfa-off-code">
            <Form.Label>Authenticator or recovery code</Form.Label>
            <Form.Control
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              autoComplete="one-time-code"
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            disabled={!password || code.length < 6 || isLoading}
          >
            {isLoading ? <Spinner size="sm" animation="border" /> : 'Turn off'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
