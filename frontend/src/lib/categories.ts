import { titleCase } from './format';

const ICONS: Record<string, string> = {
  SALARY: 'bi-briefcase',
  TRANSFER: 'bi-arrow-left-right',
  RENT: 'bi-house-door',
  BILLS: 'bi-receipt',
  FOOD: 'bi-cup-hot',
  GROCERIES: 'bi-basket',
  SHOPPING: 'bi-bag',
  TRAVEL: 'bi-airplane',
  ENTERTAINMENT: 'bi-film',
  HEALTH: 'bi-heart-pulse',
  EDUCATION: 'bi-mortarboard',
  FAMILY: 'bi-people',
  CASH: 'bi-cash-stack',
  INVESTMENT: 'bi-graph-up-arrow',
  FEES: 'bi-percent',
  INTEREST: 'bi-piggy-bank',
  REFUND: 'bi-arrow-counterclockwise',
  OTHER: 'bi-three-dots',
};

export function categoryIcon(category: string): string {
  return ICONS[category] ?? ICONS.OTHER;
}

export function categoryLabel(category: string): string {
  return titleCase(category);
}
