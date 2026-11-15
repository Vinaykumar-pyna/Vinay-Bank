import type { DebitCard } from './types';

interface DebitCardVisualProps {
  card: Pick<DebitCard, 'maskedPan' | 'cardholderName' | 'expiry' | 'variant' | 'status'>;
  /** Full number shown instead of the masked one (only while revealed) */
  pan?: string;
}

const groups = (pan: string) => pan.replace(/(\d{4})(?=\d)/g, '$1 ');

/** The card face: masked by default, never stores or logs the full number. */
export function DebitCardVisual({ card, pan }: DebitCardVisualProps) {
  const inactive = card.status !== 'ACTIVE';
  return (
    <div
      className={`bank-card ${inactive ? 'is-blocked' : ''}`}
      role="img"
      aria-label={`${card.variant} card ${card.maskedPan}, ${card.status.toLowerCase()}`}
    >
      <div
        className="d-flex justify-content-between align-items-start position-relative"
        style={{ zIndex: 1 }}
      >
        <div>
          <div className="fw-semibold">ArthaBank</div>
          <div className="small opacity-75">{card.variant}</div>
        </div>
        <span className="fw-bold fst-italic letter-spacing-wide">RuPay</span>
      </div>
      <div className="position-relative" style={{ zIndex: 1 }}>
        <div className="chip mb-3" aria-hidden="true" />
        <div className="card-number">{pan ? groups(pan) : card.maskedPan}</div>
      </div>
      <div
        className="d-flex justify-content-between align-items-end small position-relative"
        style={{ zIndex: 1 }}
      >
        <div className="text-truncate me-3">
          <div className="opacity-75" style={{ fontSize: '0.65rem' }}>
            CARD HOLDER
          </div>
          <div className="fw-semibold text-truncate">{card.cardholderName}</div>
        </div>
        <div className="text-end">
          <div className="opacity-75" style={{ fontSize: '0.65rem' }}>
            VALID THRU
          </div>
          <div className="fw-semibold font-mono">{card.expiry}</div>
        </div>
      </div>
    </div>
  );
}
