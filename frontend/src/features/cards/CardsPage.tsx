import { useState } from 'react';
import { Alert, Button, Card, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import toast from 'react-hot-toast';
import { Link } from 'react-router';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { PageLoader } from '@/components/common/PageLoader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useGetAccountsQuery } from '@/features/banking/bankingApi';
import { errorMessage } from '@/lib/apiError';
import { formatDate, titleCase } from '@/lib/format';
import { CardSettings } from './CardSettings';
import {
  useGetCardsQuery,
  useHotlistCardMutation,
  useIssueCardMutation,
  useSetCardBlockedMutation,
} from './cardsApi';
import { DebitCardVisual } from './DebitCardVisual';
import { RevealCardModal } from './RevealCardModal';
import { SetPinModal } from './SetPinModal';
import type { DebitCard } from './types';

type Dialog = { kind: 'reveal' | 'pin' | 'hotlist'; card: DebitCard };
const REASONS = ['LOST', 'STOLEN', 'DAMAGED'] as const;

function HotlistModal({ card, onClose }: { card: DebitCard; onClose: () => void }) {
  const [reason, setReason] = useState<(typeof REASONS)[number]>('LOST');
  const [hotlist, { isLoading, error }] = useHotlistCardMutation();
  const confirm = async () => {
    try {
      await hotlist({ id: card.id, reason }).unwrap();
      toast.success(`Card ending ${card.last4} is permanently blocked`);
      onClose();
    } catch {
      // Shown below.
    }
  };
  return (
    <Modal show onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5">
          Report card ending {card.last4}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{errorMessage(error)}</Alert>}
        <p>
          The card is blocked permanently and straight away. You can then get a new card for the
          same account.
        </p>
        <Form.Group>
          <Form.Label as="legend" className="small fw-semibold">
            What happened?
          </Form.Label>
          {REASONS.map((r) => (
            <Form.Check
              key={r}
              type="radio"
              id={`hotlist-${r}`}
              name="hotlist-reason"
              label={titleCase(r)}
              checked={reason === r}
              onChange={() => setReason(r)}
            />
          ))}
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button variant="danger" onClick={confirm} disabled={isLoading}>
          {isLoading && <Spinner size="sm" className="me-2" />}
          Block permanently
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function IssueCard({ cards }: { cards: DebitCard[] }) {
  const { data: accounts = [] } = useGetAccountsQuery();
  const [issue, { isLoading, error }] = useIssueCardMutation();
  const eligible = accounts.filter(
    (a) =>
      a.status === 'ACTIVE' && !cards.some((c) => c.accountId === a.id && c.status !== 'HOTLISTED'),
  );
  const [chosen, setChosen] = useState('');
  const accountId = chosen || eligible[0]?.id || '';
  if (!eligible.length) return null;

  const submit = async () => {
    try {
      const card = await issue({ accountId }).unwrap();
      toast.success(`Card ending ${card.last4} is ready. Set a PIN to start using it.`);
    } catch {
      // Shown below.
    }
  };

  return (
    <Card className="mb-4">
      <Card.Body className="d-flex flex-column flex-md-row gap-3 align-items-md-center">
        <span className="icon-tile icon-tile-primary" aria-hidden="true">
          <i className="bi bi-credit-card-2-front" />
        </span>
        <div className="flex-grow-1">
          <div className="fw-semibold">Get a free virtual RuPay debit card</div>
          <div className="small text-body-secondary">
            Issued instantly. Use it online now, and at ATMs and shops once you set a PIN.
          </div>
          {error && (
            <Alert variant="danger" className="small py-2 mt-2 mb-0">
              {errorMessage(error)}
            </Alert>
          )}
        </div>
        <Form.Select
          aria-label="Account for the card"
          style={{ maxWidth: 260 }}
          value={accountId}
          onChange={(e) => setChosen(e.target.value)}
        >
          {eligible.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nickname ?? titleCase(a.type)} · {a.maskedNumber}
            </option>
          ))}
        </Form.Select>
        <Button onClick={submit} disabled={isLoading || !accountId}>
          {isLoading && <Spinner size="sm" className="me-2" />}
          Get card
        </Button>
      </Card.Body>
    </Card>
  );
}

function CardActions({ card, open }: { card: DebitCard; open: (d: Dialog) => void }) {
  const [setBlocked, { isLoading }] = useSetCardBlockedMutation();
  const toggleBlock = async () => {
    const blocked = card.status === 'ACTIVE';
    try {
      await setBlocked({ id: card.id, blocked }).unwrap();
      toast.success(blocked ? 'Card blocked. Unblock it any time.' : 'Card unblocked');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  if (card.status === 'HOTLISTED') return null;
  return (
    <div className="d-flex flex-wrap gap-2 mt-3">
      <Button size="sm" variant="outline-primary" onClick={() => open({ kind: 'reveal', card })}>
        <i className="bi bi-eye me-1" aria-hidden="true" />
        Show details
      </Button>
      <Button size="sm" variant="outline-primary" onClick={() => open({ kind: 'pin', card })}>
        <i className="bi bi-key me-1" aria-hidden="true" />
        {card.pinSet ? 'Change PIN' : 'Set PIN'}
      </Button>
      <Button size="sm" variant="outline-secondary" onClick={toggleBlock} disabled={isLoading}>
        <i
          className={`bi ${card.status === 'ACTIVE' ? 'bi-lock' : 'bi-unlock'} me-1`}
          aria-hidden="true"
        />
        {card.status === 'ACTIVE' ? 'Block' : 'Unblock'}
      </Button>
      <Button size="sm" variant="outline-danger" onClick={() => open({ kind: 'hotlist', card })}>
        <i className="bi bi-exclamation-octagon me-1" aria-hidden="true" />
        Report lost or stolen
      </Button>
    </div>
  );
}

export default function CardsPage() {
  const { data: cards = [], isLoading, error } = useGetCardsQuery();
  const [dialog, setDialog] = useState<Dialog>();
  const live = cards.filter((c) => c.status !== 'HOTLISTED');
  const old = cards.filter((c) => c.status === 'HOTLISTED');

  return (
    <>
      <PageHeader
        title="Cards"
        subtitle="Your RuPay debit cards: choose where they work and how much they can spend."
        actions={
          <Link to="/simulator" className="btn btn-outline-primary">
            <i className="bi bi-pc-display me-2" aria-hidden="true" />
            ATM simulator
          </Link>
        }
      />
      {error && <Alert variant="danger">{errorMessage(error)}</Alert>}
      {isLoading ? (
        <PageLoader />
      ) : (
        <>
          <IssueCard cards={cards} />
          {!live.length && !old.length && (
            <EmptyState
              icon="bi-credit-card"
              title="No cards yet"
              description="Get a virtual debit card above."
            />
          )}
          {live.map((card) => (
            <Row className="g-4 mb-4" key={card.id}>
              <Col lg={5}>
                <DebitCardVisual card={card} />
                <div className="d-flex flex-wrap align-items-center gap-2 mt-3">
                  <StatusBadge status={card.status} />
                  {!card.pinSet && <StatusBadge status="PENDING" label="PIN not set" />}
                  {card.pinLocked && <StatusBadge status="BLOCKED" label="PIN locked" />}
                </div>
                {card.status === 'BLOCKED' && (
                  <Alert variant="secondary" className="small mt-3 mb-0">
                    Blocked by you: all payments and withdrawals are declined until you unblock it.
                  </Alert>
                )}
                {card.pinLocked && (
                  <Alert variant="danger" className="small mt-3 mb-0">
                    The PIN was entered wrongly three times. Set a new PIN to use the card again.
                  </Alert>
                )}
                {!card.pinSet && card.status === 'ACTIVE' && (
                  <Alert variant="warning" className="small mt-3 mb-0">
                    Set a PIN to use this card at ATMs and in shops.
                  </Alert>
                )}
                <CardActions card={card} open={setDialog} />
              </Col>
              <Col lg={7}>
                <CardSettings card={card} />
              </Col>
            </Row>
          ))}
          {old.length > 0 && (
            <Card>
              <Card.Body>
                <h2 className="card-title-sm mb-3">Permanently blocked cards</h2>
                <ul className="list-unstyled mb-0 d-grid gap-2">
                  {old.map((card) => (
                    <li key={card.id} className="d-flex align-items-center gap-2 small">
                      <i className="bi bi-credit-card text-body-secondary" aria-hidden="true" />
                      <span className="font-mono">{card.maskedPan}</span>
                      <StatusBadge
                        status="HOTLISTED"
                        label={titleCase(card.hotlistReason ?? 'Blocked')}
                      />
                      <span className="text-body-secondary ms-auto">
                        Issued {formatDate(card.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card.Body>
            </Card>
          )}
        </>
      )}

      {dialog?.kind === 'reveal' && (
        <RevealCardModal card={dialog.card} onClose={() => setDialog(undefined)} />
      )}
      {dialog?.kind === 'pin' && (
        <SetPinModal card={dialog.card} onClose={() => setDialog(undefined)} />
      )}
      {dialog?.kind === 'hotlist' && (
        <HotlistModal card={dialog.card} onClose={() => setDialog(undefined)} />
      )}
    </>
  );
}
