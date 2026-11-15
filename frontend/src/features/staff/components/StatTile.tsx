import type { ReactNode } from 'react';
import { Card, Placeholder } from 'react-bootstrap';
import { Link } from 'react-router';

type Tone = 'primary' | 'warning' | 'danger' | 'info' | 'secondary' | 'success';

interface StatTileProps {
  label: string;
  value: ReactNode;
  icon: string;
  tone?: Tone;
  hint?: ReactNode;
  to?: string;
  loading?: boolean;
}

/**
 * KPI tile: a sentence-case label, one compact headline value and a hint line.
 * Status tones (warning/danger) are only used for counts that need attention,
 * and always come with an icon and a label, never colour alone.
 */
export function StatTile({
  label,
  value,
  icon,
  tone = 'primary',
  hint,
  to,
  loading,
}: StatTileProps) {
  const body = (
    <Card.Body className="d-flex gap-3 align-items-start">
      <span className={`icon-tile icon-tile-${tone}`} aria-hidden="true">
        <i className={`bi ${icon}`} />
      </span>
      <div className="min-w-0">
        <div className="stat-label">{label}</div>
        {loading ? (
          <Placeholder as="div" animation="glow">
            <Placeholder xs={8} style={{ height: 30 }} />
          </Placeholder>
        ) : (
          <div className="stat-value">{value}</div>
        )}
        {hint && <div className="small text-body-secondary mt-1">{hint}</div>}
      </div>
    </Card.Body>
  );
  return to ? (
    <Card as={Link} to={to} className="stat-tile card-hover h-100 text-reset text-decoration-none">
      {body}
    </Card>
  ) : (
    <Card className="stat-tile h-100">{body}</Card>
  );
}
