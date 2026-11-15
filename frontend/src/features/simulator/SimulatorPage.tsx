import { useState } from 'react';
import { Alert, Button, ButtonGroup, Card, Col, Form, Nav, Row, Spinner } from 'react-bootstrap';
import { Link } from 'react-router';
import { Logo } from '@/components/common/Logo';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { usePageTitle } from '@/components/layout/usePageTitle';
import { env } from '@/config/env';
import { useLazyGetDemoCardQuery, useRunCardNetworkMutation } from '@/features/cards/cardsApi';
import type {
  SimulatorOperation,
  SimulatorOutcome,
  SimulatorRequest,
} from '@/features/cards/types';
import { errorMessage } from '@/lib/apiError';
import { formatMoney, rupeesToPaise } from '@/lib/format';
import { MessageInspector, type InspectedExchange } from './MessageInspector';

const TERMINALS = {
  ATM: { label: 'ATM', place: 'ArthaBank ATM, Fort, Mumbai', icon: 'bi-cash-stack' },
  POS: { label: 'Shop terminal', place: 'Blue Tokai Coffee, Pune', icon: 'bi-shop' },
} as const;
const QUICK_CASH = [500, 1_000, 2_000, 5_000];
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];
/** Demo PIN of the seeded cards (see the README); shown only in demo builds. */
const DEMO_PIN_HINT = '4826';

type Terminal = keyof typeof TERMINALS;
type LastApproved = NonNullable<SimulatorRequest['original']> & { pan: string; terminal: Terminal };

function screenText(o: SimulatorOutcome): string {
  if (!o.approved) return `Declined (${o.responseCode}): ${o.message}`;
  switch (o.operation) {
    case 'BALANCE':
      return `Available balance ${formatMoney(o.availableBalance ?? 0)}`;
    case 'WITHDRAWAL':
      return `Please take your cash: ${formatMoney(o.amount ?? 0)}`;
    case 'PURCHASE':
      return `Payment approved: ${formatMoney(o.amount ?? 0)}`;
    case 'REVERSAL':
      return `Reversal accepted: ${formatMoney(o.amount ?? 0)} back in the account`;
    default:
      return 'Card switch is online (echo test passed)';
  }
}

/**
 * Card network simulator: an ATM and a shop terminal that send real ISO 8583
 * messages through the card switch over mutual TLS, with a message inspector.
 * Public page (like a real ATM, the card and PIN are the credentials); the API
 * only enables it in demo mode.
 */
export default function SimulatorPage() {
  usePageTitle();
  const [terminal, setTerminal] = useState<Terminal>('ATM');
  const [pan, setPan] = useState('');
  const [expiry, setExpiry] = useState('');
  const [pin, setPin] = useState('');
  const [amount, setAmount] = useState('1000');
  const [screen, setScreen] = useState<{ text: string; approved: boolean }>();
  const [items, setItems] = useState<InspectedExchange[]>([]);
  const [last, setLast] = useState<LastApproved>();
  const [run, { isLoading, error }] = useRunCardNetworkMutation();
  const [loadDemoCard, demoCard] = useLazyGetDemoCardQuery();

  const amountPaise = rupeesToPaise(amount) ?? 0;
  const cardReady = /^\d{13,19}$/.test(pan) && /^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry);

  const send = async (operation: SimulatorOperation) => {
    const request: SimulatorRequest =
      operation === 'ECHO'
        ? { operation, terminal }
        : operation === 'REVERSAL' && last
          ? {
              operation,
              terminal: last.terminal,
              pan: last.pan,
              original: {
                rrn: last.rrn,
                stan: last.stan,
                transmittedAt: last.transmittedAt,
                operation: last.operation,
                amount: last.amount,
              },
            }
          : {
              operation,
              terminal,
              pan,
              expiry,
              pin,
              amount: operation === 'BALANCE' ? undefined : amountPaise,
            };
    try {
      const result = await run(request).unwrap();
      setItems((current) => [{ id: Date.now(), ...result }, ...current].slice(0, 8));
      setScreen({ text: screenText(result.outcome), approved: result.outcome.approved });
      if (
        result.outcome.approved &&
        (operation === 'WITHDRAWAL' || operation === 'PURCHASE') &&
        result.outcome.rrn
      ) {
        setLast({
          rrn: result.outcome.rrn,
          stan: result.outcome.stan,
          transmittedAt: result.outcome.transmittedAt,
          operation,
          amount: amountPaise,
          pan,
          terminal,
        });
      } else if (operation === 'REVERSAL' && result.outcome.approved) {
        setLast(undefined);
      }
      if (operation !== 'ECHO') setPin('');
    } catch {
      setScreen(undefined);
    }
  };

  const fillDemoCard = async () => {
    const card = await loadDemoCard().unwrap();
    setPan(card.pan);
    setExpiry(card.expiry);
  };

  const press = (key: string) => {
    if (key === 'clear') setPin('');
    else if (key === 'back') setPin((p) => p.slice(0, -1));
    else setPin((p) => (p.length < 6 ? p + key : p));
  };

  return (
    <div className="min-vh-100 bg-body-tertiary">
      <header className="d-flex align-items-center gap-3 px-3 px-md-4 py-3 border-bottom bg-body">
        <Logo />
        <div className="d-none d-md-block border-start ps-3">
          <div className="fw-semibold">Card network simulator</div>
          <div className="small text-body-secondary">ISO 8583 over mutual TLS</div>
        </div>
        <div className="ms-auto d-flex align-items-center gap-2">
          <ThemeToggle />
          <Link to="/app/cards" className="btn btn-sm btn-outline-primary">
            My cards
          </Link>
        </div>
      </header>

      <main id="main-content" className="container-xl py-4">
        <Row className="g-4">
          <Col lg={5}>
            <Card>
              <Card.Body>
                <Nav
                  variant="pills"
                  activeKey={terminal}
                  onSelect={(k) => k && setTerminal(k as Terminal)}
                  className="mb-3"
                >
                  {(Object.keys(TERMINALS) as Terminal[]).map((key) => (
                    <Nav.Item key={key}>
                      <Nav.Link eventKey={key} className="py-1 px-3">
                        <i className={`bi ${TERMINALS[key].icon} me-1`} aria-hidden="true" />
                        {TERMINALS[key].label}
                      </Nav.Link>
                    </Nav.Item>
                  ))}
                </Nav>

                <div
                  className={`atm-screen mb-3 ${screen ? (screen.approved ? 'is-approved' : 'is-declined') : ''}`}
                  role="status"
                  aria-live="polite"
                >
                  <div className="small opacity-75">{TERMINALS[terminal].place}</div>
                  <div className="fw-semibold mt-1">
                    {isLoading
                      ? 'Processing, please wait...'
                      : (screen?.text ?? 'Enter the card details and PIN')}
                  </div>
                </div>

                {error && (
                  <Alert variant="danger" className="small">
                    {errorMessage(error)}
                  </Alert>
                )}

                <Row className="g-2 mb-3">
                  <Col xs={8}>
                    <Form.Group controlId="sim-pan">
                      <Form.Label className="small mb-1">Card number</Form.Label>
                      <Form.Control
                        inputMode="numeric"
                        autoComplete="off"
                        className="font-mono"
                        placeholder="16 digits"
                        value={pan}
                        onChange={(e) => setPan(e.target.value.replace(/\D/g, '').slice(0, 19))}
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={4}>
                    <Form.Group controlId="sim-expiry">
                      <Form.Label className="small mb-1">Valid thru</Form.Label>
                      <Form.Control
                        inputMode="numeric"
                        autoComplete="off"
                        className="font-mono"
                        placeholder="MM/YY"
                        value={expiry}
                        onChange={(e) => {
                          const d = e.target.value.replace(/\D/g, '').slice(0, 4);
                          setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                        }}
                      />
                    </Form.Group>
                  </Col>
                </Row>
                {env.showDemoAccounts && (
                  <div className="d-flex flex-wrap align-items-center gap-2 small mb-3">
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      onClick={() => void fillDemoCard()}
                      disabled={demoCard.isFetching}
                    >
                      <i className="bi bi-magic me-1" aria-hidden="true" />
                      Use demo card
                    </Button>
                    <span className="text-body-secondary">Demo card PIN: {DEMO_PIN_HINT}</span>
                    {demoCard.isError && (
                      <span className="text-danger">{errorMessage(demoCard.error)}</span>
                    )}
                  </div>
                )}

                <Form.Group controlId="sim-pin" className="mb-2">
                  <Form.Label className="small mb-1">PIN</Form.Label>
                  <Form.Control
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    className="otp-input"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </Form.Group>
                <div className="pin-pad mb-3" aria-label="PIN pad">
                  {KEYS.map((key) => (
                    <Button
                      key={key}
                      variant="outline-secondary"
                      aria-label={
                        key === 'clear' ? 'Clear PIN' : key === 'back' ? 'Delete last digit' : key
                      }
                      onClick={() => press(key)}
                    >
                      {key === 'clear' ? (
                        'C'
                      ) : key === 'back' ? (
                        <i className="bi bi-backspace" aria-hidden="true" />
                      ) : (
                        key
                      )}
                    </Button>
                  ))}
                </div>

                <Form.Group controlId="sim-amount" className="mb-3">
                  <Form.Label className="small mb-1">
                    {terminal === 'ATM' ? 'Cash amount (₹)' : 'Bill amount (₹)'}
                  </Form.Label>
                  <Form.Control
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) =>
                      setAmount(
                        e.target.value.replace(/[^\d.]/g, '').replace(/(\.\d{0,2}).*$/, '$1'),
                      )
                    }
                  />
                  {terminal === 'ATM' && (
                    <ButtonGroup size="sm" className="mt-2 flex-wrap">
                      {QUICK_CASH.map((value) => (
                        <Button
                          key={value}
                          variant="outline-primary"
                          onClick={() => setAmount(String(value))}
                        >
                          ₹{value.toLocaleString('en-IN')}
                        </Button>
                      ))}
                    </ButtonGroup>
                  )}
                </Form.Group>

                <div className="d-grid gap-2">
                  {terminal === 'ATM' ? (
                    <Row className="g-2">
                      <Col>
                        <Button
                          className="w-100"
                          variant="outline-primary"
                          disabled={!cardReady || pin.length < 4 || isLoading}
                          onClick={() => void send('BALANCE')}
                        >
                          Check balance
                        </Button>
                      </Col>
                      <Col>
                        <Button
                          className="w-100"
                          disabled={!cardReady || pin.length < 4 || !amountPaise || isLoading}
                          onClick={() => void send('WITHDRAWAL')}
                        >
                          {isLoading && <Spinner size="sm" className="me-2" />}
                          Withdraw cash
                        </Button>
                      </Col>
                    </Row>
                  ) : (
                    <Button
                      disabled={!cardReady || pin.length < 4 || !amountPaise || isLoading}
                      onClick={() => void send('PURCHASE')}
                    >
                      {isLoading && <Spinner size="sm" className="me-2" />}
                      Pay {amountPaise ? formatMoney(amountPaise) : ''}
                    </Button>
                  )}
                  <Row className="g-2">
                    <Col>
                      <Button
                        className="w-100"
                        variant="outline-secondary"
                        size="sm"
                        disabled={isLoading}
                        onClick={() => void send('ECHO')}
                      >
                        Echo test (0800)
                      </Button>
                    </Col>
                    <Col>
                      <Button
                        className="w-100"
                        variant="outline-danger"
                        size="sm"
                        disabled={!last || isLoading}
                        onClick={() => void send('REVERSAL')}
                      >
                        {last?.terminal === 'POS' ? 'Cancel last payment' : 'Cash not dispensed'}{' '}
                        (0420)
                      </Button>
                    </Col>
                  </Row>
                </div>
              </Card.Body>
            </Card>
          </Col>
          <Col lg={7}>
            <MessageInspector items={items} />
          </Col>
        </Row>
      </main>
    </div>
  );
}
