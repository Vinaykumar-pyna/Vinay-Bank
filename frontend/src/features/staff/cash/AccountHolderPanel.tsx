import { Alert, Placeholder } from 'react-bootstrap';
import { Money } from '@/components/banking/Money';
import { StatusBadge } from '@/components/common/StatusBadge';
import { isApiError, toApiError } from '@/lib/apiError';
import { titleCase } from '@/lib/format';
import type { AccountLookup } from '../types';

interface AccountHolderPanelProps {
  data?: AccountLookup;
  loading: boolean;
  error?: unknown;
}

/** Shows whose account the teller is about to credit or debit, before any money moves. */
export function AccountHolderPanel({ data, loading, error }: AccountHolderPanelProps) {
  if (loading) {
    return (
      <Placeholder as="div" animation="glow" className="border rounded-3 p-3">
        <Placeholder xs={6} />
        <Placeholder xs={9} />
      </Placeholder>
    );
  }
  if (error) {
    const notFound = isApiError(error) ? error.status === 404 : toApiError(error).status === 404;
    return (
      <Alert variant="warning" className="mb-0 small">
        {notFound
          ? 'No ArthaBank account has this number. Check the passbook or cheque leaf.'
          : 'Account lookup failed.'}
      </Alert>
    );
  }
  if (!data) return null;
  return (
    <div className="border rounded-3 p-3 bg-body-tertiary" aria-live="polite">
      <div className="d-flex align-items-start gap-3">
        <span className="icon-tile icon-tile-primary" aria-hidden="true">
          <i className="bi bi-person-vcard" />
        </span>
        <div className="min-w-0 flex-grow-1">
          <div className="fw-semibold">{data.holderName}</div>
          <div className="small text-body-secondary">
            <span className="font-mono">{data.customerId}</span> · {titleCase(data.type)} account ·{' '}
            {data.branch}
          </div>
          <div className="d-flex flex-wrap gap-2 mt-2">
            <StatusBadge status={data.status} />
            {data.kycStatus && (
              <StatusBadge
                status={data.kycStatus}
                label={`KYC ${titleCase(data.kycStatus).toLowerCase()}`}
              />
            )}
          </div>
        </div>
        <div className="text-end">
          <div className="small text-body-secondary">Available</div>
          <Money paise={data.availableBalance} className="fw-semibold" />
        </div>
      </div>
    </div>
  );
}
