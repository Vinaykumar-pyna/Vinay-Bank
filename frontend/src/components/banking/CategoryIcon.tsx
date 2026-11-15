import { categoryIcon, categoryLabel } from '@/lib/categories';

interface CategoryIconProps {
  category: string;
  direction?: 'DEBIT' | 'CREDIT';
}

/** Icon tile for a statement line; credits use the success tone, debits the neutral brand tone. */
export function CategoryIcon({ category, direction }: CategoryIconProps) {
  const tone = direction === 'CREDIT' ? 'success' : 'primary';
  return (
    <span className={`icon-tile icon-tile-${tone}`} title={categoryLabel(category)}>
      <i className={`bi ${categoryIcon(category)}`} aria-hidden="true" />
    </span>
  );
}
