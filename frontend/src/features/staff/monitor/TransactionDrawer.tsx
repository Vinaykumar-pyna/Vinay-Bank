import type { ReactNode } from 'react';
import { Offcanvas } from 'react-bootstrap';
import { Money } from '@/components/banking/Money';
import { CopyButton } from '@/components/common/CopyButton';
import { StatusBadge } from '@/components/common/StatusBadge';
import type { Party, Transaction } from '@/features/banking/types';
import { formatDateTime, formatMoney, titleCase } from '@/lib/format';
import { RAIL_LABELS } from '../labels';

function PartyBlock({ label, party }: { label: string; party?: Party }) {
  return (
    <div className="border rounded-3 p-3">
      <div className="small text-body-secondary mb-1">{label}</div>
      <div className="fw-semibold">{party?.name ?? 'Vinay Bank'}</div>
      {party && (
        <div className="small text-body-secondary">
          <span className="font-mono">{party.maskedAccount}</span>
          {party.bankName && ` · ${party.bankName}`}
          {party.ifsc && ` · ${party.ifsc}`}
        </div>
      )}
    </div>
  );
}

const DetailRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="receipt-row">
    <span>{label}</span>
    <span className="text-end text-break">{children}</span>
  </div>
);

/** Full transaction view for operations staff: parties, timeline, risk explanation and metadata. */
export function TransactionDrawer({
  transaction: t,
  onHide,
}: {
  transaction?: Transaction;
  onHide: () => void;
}) {
  const metadata = Object.entries(t?.metadata ?? {}).filter(
    ([, value]) => value !== null && value !== undefined && typeof value !== 'object',
  );
  return (
    <Offcanvas show={!!t} onHide={onHide} placement="end" style={{ width: 'min(460px, 100vw)' }}>
      {t && (
        <>
          <Offcanvas.Header closeButton>
            <Offcanvas.Title as="h2" className="h5 mb-0">
              {titleCase(t.type)}
              <div className="small text-body-secondary fw-normal font-mono d-flex align-items-center gap-2">
                {t.reference}
                <CopyButton value={t.reference} label="Copy reference" />
              </div>
            </Offcanvas.Title>
          </Offcanvas.Header>
          <Offcanvas.Body>
            <div className="text-center mb-4">
              <div className="display-6 fw-bold">
                <Money paise={t.amount} />
              </div>
              <div className="d-flex justify-content-center gap-2 mt-2">
                <StatusBadge status={t.status} />
                {t.risk && (
                  <StatusBadge status={t.risk.level} label={`${titleCase(t.risk.level)} risk`} />
                )}
              </div>
            </div>

            <div className="d-grid gap-2 mb-4">
              <PartyBlock label="From" party={t.from} />
              <div className="text-center text-body-secondary" aria-hidden="true">
                <i className="bi bi-arrow-down" />
              </div>
              <PartyBlock label="To" party={t.to} />
            </div>

            <DetailRow label="Method">
              {RAIL_LABELS[t.rail] ?? t.rail} · {titleCase(t.channel)}
            </DetailRow>
            {t.fee > 0 && <DetailRow label="Fee (incl. GST)">{formatMoney(t.fee)}</DetailRow>}
            <DetailRow label="Category">{titleCase(t.category)}</DetailRow>
            {t.remarks && <DetailRow label="Remarks">{t.remarks}</DetailRow>}
            <DetailRow label="Created">{formatDateTime(t.createdAt)}</DetailRow>
            {t.settlementDueAt && t.status === 'PROCESSING' && (
              <DetailRow label="Settles by">{formatDateTime(t.settlementDueAt)}</DetailRow>
            )}
            {t.completedAt && (
              <DetailRow label="Completed">{formatDateTime(t.completedAt)}</DetailRow>
            )}
            {t.failureReason && <DetailRow label="Reason">{t.failureReason}</DetailRow>}

            {t.risk && (
              <div className="mt-4">
                <h3 className="card-title-sm mb-2">Risk assessment</h3>
                <DetailRow label="Score">{t.risk.score ?? '-'} / 100</DetailRow>
                {t.risk.decision && (
                  <DetailRow label="Decision">{titleCase(t.risk.decision)}</DetailRow>
                )}
                {t.risk.source && <DetailRow label="Engine">{titleCase(t.risk.source)}</DetailRow>}
                {!!t.risk.reasons?.length && (
                  <ul className="small mt-2 mb-0 ps-3">
                    {t.risk.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {metadata.length > 0 && (
              <div className="mt-4">
                <h3 className="card-title-sm mb-2">Processing details</h3>
                {metadata.map(([key, value]) => (
                  <DetailRow key={key} label={titleCase(key.replace(/([a-z])([A-Z])/g, '$1_$2'))}>
                    <span className="small">{String(value)}</span>
                  </DetailRow>
                ))}
              </div>
            )}
          </Offcanvas.Body>
        </>
      )}
    </Offcanvas>
  );
}
