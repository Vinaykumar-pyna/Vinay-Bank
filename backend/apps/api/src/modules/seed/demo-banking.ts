import { Category, Channel, PaymentRail, TransactionType } from '../../common/enums/banking.enums';

/** Deterministic pseudo-random generator (mulberry32), so demo data is identical on every machine. */
export function createRng(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
  };
}

export type Rng = ReturnType<typeof createRng>;

export interface Merchant {
  name: string;
  category: Category;
  min: number;
  max: number;
}

/** Amounts in rupees. */
export const MERCHANTS: readonly Merchant[] = [
  { name: 'BigBasket', category: Category.GROCERIES, min: 650, max: 3800 },
  { name: 'DMart', category: Category.GROCERIES, min: 900, max: 4200 },
  { name: 'Swiggy', category: Category.FOOD, min: 220, max: 1400 },
  { name: 'Zomato', category: Category.FOOD, min: 250, max: 1600 },
  { name: 'Third Wave Coffee', category: Category.FOOD, min: 180, max: 650 },
  { name: 'Amazon', category: Category.SHOPPING, min: 499, max: 7800 },
  { name: 'Myntra', category: Category.SHOPPING, min: 799, max: 4500 },
  { name: 'Croma', category: Category.SHOPPING, min: 1500, max: 9000 },
  { name: 'Uber', category: Category.TRAVEL, min: 140, max: 780 },
  { name: 'IRCTC', category: Category.TRAVEL, min: 450, max: 3200 },
  { name: 'IndiGo Airlines', category: Category.TRAVEL, min: 3200, max: 8900 },
  { name: 'BookMyShow', category: Category.ENTERTAINMENT, min: 300, max: 1200 },
  { name: 'Netflix', category: Category.ENTERTAINMENT, min: 199, max: 649 },
  { name: 'Apollo Pharmacy', category: Category.HEALTH, min: 180, max: 1900 },
  { name: 'Cult.fit', category: Category.HEALTH, min: 999, max: 2499 },
];

export interface LedgerEvent {
  at: Date;
  type: TransactionType;
  rail: PaymentRail;
  channel: Channel;
  category: Category;
  amount: number; // paise
  /** Account keys debited / credited. External parties have no key. */
  debit?: string;
  credit?: string;
  counterparty: { name: string; accountNumber: string; bankName?: string; ifsc?: string };
  narrationDebit?: string;
  narrationCredit?: string;
  remarks?: string;
}

export interface CustomerProfile {
  accountKey: string;
  employer: string;
  salary: number; // rupees
  rent: number; // rupees
  landlord: string;
  spendsPerMonth: [number, number];
  city: string;
}
