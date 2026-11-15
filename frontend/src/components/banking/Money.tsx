import { formatMoney } from '@/lib/format';

interface MoneyProps {
  paise: number;
  /** Show + / - and colour for credits and debits. */
  direction?: 'DEBIT' | 'CREDIT';
  className?: string;
}

/** Formats paise as Indian rupees; credits and debits get a sign, colour and a screen-reader word. */
export function Money({ paise, direction, className = '' }: MoneyProps) {
  if (!direction) return <span className={`text-nowrap ${className}`}>{formatMoney(paise)}</span>;
  const credit = direction === 'CREDIT';
  return (
    <span
      className={`text-nowrap fw-semibold ${credit ? 'amount-credit' : 'amount-debit'} ${className}`}
    >
      <span aria-hidden="true">{credit ? '+ ' : '- '}</span>
      <span className="visually-hidden">{credit ? 'credit ' : 'debit '}</span>
      {formatMoney(paise)}
    </span>
  );
}
