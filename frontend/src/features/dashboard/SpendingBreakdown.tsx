import { categoryIcon, categoryLabel } from '@/lib/categories';
import { EmptyState } from '@/components/common/EmptyState';
import { formatMoney } from '@/lib/format';

/**
 * This month's spending by category as a ranked bar list: a single series, so
 * one hue and no legend; every row is labelled with its category and amount.
 */
export function SpendingBreakdown({ items }: { items: { category: string; amount: number }[] }) {
  if (!items.length) {
    return <EmptyState icon="bi-pie-chart" title="No spending yet this month" />;
  }
  const total = items.reduce((sum, i) => sum + i.amount, 0);
  const max = Math.max(...items.map((i) => i.amount));

  return (
    <ul className="list-unstyled mb-0 d-grid gap-3">
      {items.slice(0, 7).map((item) => {
        const share = Math.round((item.amount / total) * 100);
        return (
          <li
            key={item.category}
            title={`${categoryLabel(item.category)}: ${formatMoney(item.amount)} (${share}%)`}
          >
            <div className="d-flex align-items-center gap-2 small mb-1">
              <i
                className={`bi ${categoryIcon(item.category)} text-body-secondary`}
                aria-hidden="true"
              />
              <span className="fw-medium">{categoryLabel(item.category)}</span>
              <span className="ms-auto fw-semibold">{formatMoney(item.amount)}</span>
              <span className="text-body-secondary" style={{ width: 38, textAlign: 'right' }}>
                {share}%
              </span>
            </div>
            <div className="rounded-pill bg-body-tertiary" style={{ height: 8 }}>
              <div
                className="rounded-pill h-100"
                style={{
                  width: `${Math.max(3, (item.amount / max) * 100)}%`,
                  background: 'var(--vb-series-1)',
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
