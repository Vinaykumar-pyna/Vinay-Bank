import { useState, type FormEvent } from 'react';
import { Alert, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import toast from 'react-hot-toast';
import { errorMessage } from '@/lib/apiError';
import { useRequestCardOtpMutation, useSetCardPinMutation } from './cardsApi';
import { OtpStep } from './OtpStep';
import { isWeakPin, type DebitCard } from './types';

const digits = (value: string) => value.replace(/\D/g, '').slice(0, 4);

/** Set or change the card PIN after OTP verification. The PIN itself is never stored. */
export function SetPinModal({ card, onClose }: { card: DebitCard; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [requestOtp, otpState] = useRequestCardOtpMutation();
  const [savePin, saveState] = useSetCardPinMutation();

  const pinError =
    pin.length !== 4
      ? 'Enter 4 digits'
      : isWeakPin(pin)
        ? 'Too easy to guess. Avoid repeated digits and sequences such as 1234.'
        : undefined;
  const confirmError = confirm !== pin ? 'The PINs do not match' : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!otpState.data || code.length !== 6 || pinError || confirmError) return;
    try {
      await savePin({
        id: card.id,
        challengeId: otpState.data.challengeId,
        otp: code,
        pin,
      }).unwrap();
      toast.success(`PIN set for card ending ${card.last4}`);
      onClose();
    } catch {
      // Shown below.
    }
  };

  return (
    <Modal show onHide={onClose} centered>
      <Form noValidate onSubmit={submit}>
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h5">
            {card.pinSet ? 'Change PIN' : 'Set PIN'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <OtpStep
            challenge={otpState.data}
            sending={otpState.isLoading}
            sendError={otpState.error}
            code={code}
            onCode={setCode}
            onSend={() => void requestOtp({ id: card.id, purpose: 'PIN' })}
            purposeText={`set the PIN for card ending ${card.last4}`}
          />
          {otpState.data && (
            <Row className="g-3 mt-1">
              <Col sm={6}>
                <Form.Group controlId="card-new-pin">
                  <Form.Label>New PIN</Form.Label>
                  <Form.Control
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    className="otp-input"
                    value={pin}
                    isInvalid={touched && !!pinError}
                    onChange={(e) => setPin(digits(e.target.value))}
                  />
                  <Form.Control.Feedback type="invalid">{pinError}</Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col sm={6}>
                <Form.Group controlId="card-confirm-pin">
                  <Form.Label>Confirm PIN</Form.Label>
                  <Form.Control
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    className="otp-input"
                    value={confirm}
                    isInvalid={touched && !!confirmError}
                    onChange={(e) => setConfirm(digits(e.target.value))}
                  />
                  <Form.Control.Feedback type="invalid">{confirmError}</Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>
          )}
          {saveState.error && (
            <Alert variant="danger" className="mt-3 mb-0 small">
              {errorMessage(saveState.error)}
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onClose} disabled={saveState.isLoading}>
            Cancel
          </Button>
          {otpState.data && (
            <Button type="submit" disabled={saveState.isLoading || code.length !== 6}>
              {saveState.isLoading && <Spinner size="sm" className="me-2" />}
              Save PIN
            </Button>
          )}
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
