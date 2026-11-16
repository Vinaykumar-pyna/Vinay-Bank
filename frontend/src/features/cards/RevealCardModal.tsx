import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { CopyButton } from '@/components/common/CopyButton';
import { errorMessage } from '@/lib/apiError';
import { useRequestCardOtpMutation, useRevealCardMutation } from './cardsApi';
import { DebitCardVisual } from './DebitCardVisual';
import { OtpStep } from './OtpStep';
import type { DebitCard, RevealedCard } from './types';

const VISIBLE_SECONDS = 60;

/** Shows the full card number, expiry and CVV for one minute after OTP verification. */
export function RevealCardModal({ card, onClose }: { card: DebitCard; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [details, setDetails] = useState<RevealedCard>();
  const [secondsLeft, setSecondsLeft] = useState(VISIBLE_SECONDS);
  const [requestOtp, otpState] = useRequestCardOtpMutation();
  const [reveal, revealState] = useRevealCardMutation();

  useEffect(() => {
    if (!details) return;
    const timer = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [details]);

  const visible = details && secondsLeft > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!otpState.data || code.length !== 6) return;
    try {
      const result = await reveal({
        id: card.id,
        challengeId: otpState.data.challengeId,
        otp: code,
      }).unwrap();
      setSecondsLeft(VISIBLE_SECONDS);
      setDetails(result);
    } catch {
      // Shown below.
    }
  };

  return (
    <Modal show onHide={onClose} centered>
      <Form noValidate onSubmit={submit}>
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h5">
            Card details
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {visible ? (
            <>
              <div className="d-flex justify-content-center mb-3">
                <DebitCardVisual card={card} pan={details.pan} />
              </div>
              <div className="receipt-row">
                <span>Card number</span>
                <span className="d-flex align-items-center gap-2">
                  <span className="font-mono">{details.pan.replace(/(\d{4})(?=\d)/g, '$1 ')}</span>
                  <CopyButton value={details.pan} label="Copy card number" />
                </span>
              </div>
              <div className="receipt-row">
                <span>Valid thru</span>
                <span className="font-mono">{details.expiry}</span>
              </div>
              <div className="receipt-row">
                <span>CVV</span>
                <span className="font-mono">{details.cvv}</span>
              </div>
              <p className="small text-body-secondary mt-3 mb-0">
                <i className="bi bi-eye-slash me-1" aria-hidden="true" />
                Hidden again in {secondsLeft}s. Vinay Bank never asks for these details by phone or
                email.
              </p>
            </>
          ) : details ? (
            <Alert variant="secondary" className="mb-0">
              The details are hidden again. Close this window and verify once more to see them.
            </Alert>
          ) : (
            <>
              <OtpStep
                challenge={otpState.data}
                sending={otpState.isLoading}
                sendError={otpState.error}
                code={code}
                onCode={setCode}
                onSend={() => void requestOtp({ id: card.id, purpose: 'REVEAL' })}
                purposeText="show the full card number and CVV"
              />
              {revealState.error && (
                <Alert variant="danger" className="mt-3 mb-0 small">
                  {errorMessage(revealState.error)}
                </Alert>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onClose}>
            Close
          </Button>
          {!details && otpState.data && (
            <Button type="submit" disabled={code.length !== 6 || revealState.isLoading}>
              {revealState.isLoading && <Spinner size="sm" className="me-2" />}
              Show details
            </Button>
          )}
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
