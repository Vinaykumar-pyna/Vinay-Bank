import { formatMoneyCompact } from '@/lib/format';
import { RAIL_LABELS } from '../labels';
import type { RailShare } from '../types';

/**
 * Meter list: one row per payment rail with its name, its share of the total
 * value as a bar (one hue on a lighter track of the same hue) and the figures
 * as text, so the numbers never depend on reading the bar.
 */
export function RailMixList({ data }: { data: RailShare[] }) {
  const total = data.reduce((sum, r) => sum + r.amount, 0);
  if (!total) return <p className="small text-body-secondary mb-0">No settled transactions yet.</p>;
  return (
    <ul className="list-unstyled mb-0 d-grid gap-3">
      {data.map((r) => {
        const share = (r.amount / total) * 100;
        return (
          <li key={r.rail}>
            <div className="d-flex align-items-baseline gap-2 small mb-1">
              <span className="fw-medium">{RAIL_LABELS[r.rail] ?? r.rail}</span>
              <span className="text-body-secondary">
                {r.count.toLocaleString('en-IN')} txn{r.count === 1 ? '' : 's'}
              </span>
              <span className="ms-auto fw-semibold">{formatMoneyCompact(r.amount)}</span>
              <span
                className="text-body-secondary"
                style={{ minWidth: '3.2em', textAlign: 'right' }}
              >
                {share < 1 ? '<1' : Math.round(share)}%
              </span>
            </div>
            <div
              className="meter-track"
              role="meter"
              aria-label={`${RAIL_LABELS[r.rail] ?? r.rail} share of value`}
              aria-valuenow={Math.round(share)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="meter-fill" style={{ width: `${Math.max(share, 1)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
