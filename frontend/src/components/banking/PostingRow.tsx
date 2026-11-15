import type { Posting } from '@/features/banking/types';
import { formatDateTime } from '@/lib/format';
import { CategoryIcon } from './CategoryIcon';
import { Money } from './Money';

/** One statement line: category icon, narration, date and signed amount. */
export function PostingRow({
  posting,
  showBalance = false,
}: {
  posting: Posting;
  showBalance?: boolean;
}) {
  return (
    <li className="d-flex align-items-center gap-3 py-2">
      <CategoryIcon category={posting.category} direction={posting.direction} />
      <div className="flex-grow-1 min-w-0">
        <div className="fw-medium small text-truncate" title={posting.narration}>
          {posting.narration}
        </div>
        <div className="small text-body-secondary">{formatDateTime(posting.createdAt)}</div>
      </div>
      <div className="text-end">
        <Money paise={posting.amount} direction={posting.direction} className="small" />
        {showBalance && (
          <div className="small text-body-secondary">
            Bal <Money paise={posting.balanceAfter} />
          </div>
        )}
      </div>
    </li>
  );
}
