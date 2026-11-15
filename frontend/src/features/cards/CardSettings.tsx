import { useState } from 'react';
import { Button, Card, Form, Spinner } from 'react-bootstrap';
import toast from 'react-hot-toast';
import { errorMessage } from '@/lib/apiError';
import { formatMoney, formatRupees } from '@/lib/format';
import { useUpdateCardSettingsMutation } from './cardsApi';
import { CARD_LIMIT_CAPS, type CardControls, type DebitCard } from './types';

const CONTROLS: { key: keyof CardControls; label: string; hint: string; icon: string }[] = [
  {
    key: 'atm',
    label: 'ATM withdrawals',
    hint: 'Cash and balance at any ATM',
    icon: 'bi-cash-stack',
  },
  { key: 'pos', label: 'Shops (POS)', hint: 'Card machines in stores', icon: 'bi-shop' },
  { key: 'ecommerce', label: 'Online payments', hint: 'Websites and apps', icon: 'bi-globe2' },
  { key: 'contactless', label: 'Tap and pay', hint: 'Up to ₹5,000 without a PIN', icon: 'bi-wifi' },
  { key: 'international', label: 'International use', hint: 'Outside India', icon: 'bi-airplane' },
];

const STEP = 1_000 * 100;

/**
 * Used-today meter. The fill carries severity (accent, then warning from 80%,
 * danger at the limit) on a lighter track of the same hue; the figures are
 * always printed as text too.
 */
function UsageMeter({ used, limit, label }: { used: number; limit: number; label: string }) {
  const share = limit > 0 ? Math.min(100, (used / limit) * 100) : used > 0 ? 100 : 0;
  const tone = share >= 100 ? 'danger' : share >= 80 ? 'warning' : 'accent';
  return (
    <div className="mt-2">
      <div
        className={`meter-track meter-${tone}`}
        role="meter"
        aria-label={`${label} used today`}
        aria-valuenow={Math.round(share)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="meter-fill" style={{ width: `${share}%` }} />
      </div>
      <div className="small text-body-secondary mt-1 d-flex align-items-center gap-1">
        {tone !== 'accent' && <i className="bi bi-exclamation-triangle" aria-hidden="true" />}
        {formatMoney(used)} of {formatRupees(limit)} used today
      </div>
    </div>
  );
}

function LimitsForm({ card }: { card: DebitCard }) {
  const [atm, setAtm] = useState(card.limits.atmDaily);
  const [pos, setPos] = useState(card.limits.posDaily);
  const [update, { isLoading }] = useUpdateCardSettingsMutation();
  const disabled = card.status === 'HOTLISTED';
  const changed = atm !== card.limits.atmDaily || pos !== card.limits.posDaily;

  const save = async () => {
    try {
      await update({ id: card.id, limits: { atmDaily: atm, posDaily: pos } }).unwrap();
      toast.success('Daily limits updated');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <>
      <Form.Group controlId={`limit-atm-${card.id}`} className="mb-3">
        <div className="d-flex justify-content-between">
          <Form.Label className="mb-1">ATM withdrawals per day</Form.Label>
          <span className="fw-semibold">{formatRupees(atm)}</span>
        </div>
        <Form.Range
          min={0}
          max={CARD_LIMIT_CAPS.atmDaily}
          step={STEP}
          value={atm}
          disabled={disabled}
          onChange={(e) => setAtm(Number(e.target.value))}
        />
        <UsageMeter used={card.usedToday.atm} limit={card.limits.atmDaily} label="ATM limit" />
      </Form.Group>
      <Form.Group controlId={`limit-pos-${card.id}`} className="mb-3">
        <div className="d-flex justify-content-between">
          <Form.Label className="mb-1">Shop and online spend per day</Form.Label>
          <span className="fw-semibold">{formatRupees(pos)}</span>
        </div>
        <Form.Range
          min={0}
          max={CARD_LIMIT_CAPS.posDaily}
          step={STEP}
          value={pos}
          disabled={disabled}
          onChange={(e) => setPos(Number(e.target.value))}
        />
        <UsageMeter used={card.usedToday.pos} limit={card.limits.posDaily} label="Spend limit" />
      </Form.Group>
      <Button size="sm" onClick={save} disabled={!changed || isLoading || disabled}>
        {isLoading && <Spinner size="sm" className="me-2" />}
        Save limits
      </Button>
    </>
  );
}

/** Where the card works (switches save immediately) and how much it may spend per day. */
export function CardSettings({ card }: { card: DebitCard }) {
  const [update, { isLoading, originalArgs }] = useUpdateCardSettingsMutation();
  const disabled = card.status === 'HOTLISTED';

  const toggle = async (key: keyof CardControls, value: boolean) => {
    try {
      await update({ id: card.id, controls: { [key]: value } }).unwrap();
      toast.success(`${CONTROLS.find((c) => c.key === key)?.label} turned ${value ? 'on' : 'off'}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="d-grid gap-4">
      <Card>
        <Card.Body>
          <h2 className="card-title-sm mb-3">Where your card works</h2>
          <ul className="list-unstyled mb-0 d-grid gap-3">
            {CONTROLS.map((control) => {
              const saving = isLoading && originalArgs?.controls?.[control.key] !== undefined;
              return (
                <li key={control.key} className="d-flex align-items-center gap-3">
                  <span className="icon-tile icon-tile-primary" aria-hidden="true">
                    <i className={`bi ${control.icon}`} />
                  </span>
                  <div className="flex-grow-1 min-w-0">
                    <div className="fw-medium">{control.label}</div>
                    <div className="small text-body-secondary">{control.hint}</div>
                  </div>
                  {saving && <Spinner size="sm" />}
                  <Form.Check
                    type="switch"
                    id={`control-${card.id}-${control.key}`}
                    aria-label={control.label}
                    checked={card.controls[control.key]}
                    disabled={disabled || isLoading}
                    onChange={(e) => void toggle(control.key, e.target.checked)}
                  />
                </li>
              );
            })}
          </ul>
        </Card.Body>
      </Card>
      <Card>
        <Card.Body>
          <h2 className="card-title-sm mb-3">Daily limits</h2>
          <LimitsForm
            key={`${card.id}-${card.limits.atmDaily}-${card.limits.posDaily}`}
            card={card}
          />
        </Card.Body>
      </Card>
    </div>
  );
}
