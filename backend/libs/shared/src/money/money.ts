/**
 * Money helpers.
 *
 * Every amount in Vinay Bank is an integer number of paise (1 rupee = 100 paise).
 * Binary floating point cannot represent most decimal fractions exactly
 * (0.1 + 0.2 !== 0.3), which is unacceptable for balances. Integers are exact,
 * and Number.MAX_SAFE_INTEGER paise is about 90 trillion rupees.
 */
export const PAISE_PER_RUPEE = 100;

const RUPEE_PATTERN = /^(\d{1,13})(?:\.(\d{1,2}))?$/;

export class InvalidAmountError extends Error {
  constructor(input: unknown) {
    super(`Invalid amount: ${String(input)}`);
    this.name = 'InvalidAmountError';
  }
}

/** True for a positive whole number of paise that is safe for integer arithmetic. */
export function isValidPaise(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function assertValidPaise(value: unknown): asserts value is number {
  if (!isValidPaise(value)) throw new InvalidAmountError(value);
}

/**
 * Parses a rupee string such as "1500", "1500.5" or "1500.50" into paise using
 * string arithmetic only (no floating point). Rejects negatives and more than two decimals.
 */
export function rupeesToPaise(input: string): number {
  const match = RUPEE_PATTERN.exec(input.trim());
  if (!match) throw new InvalidAmountError(input);
  const rupees = Number(match[1]);
  const paise = Number((match[2] ?? '').padEnd(2, '0'));
  return rupees * PAISE_PER_RUPEE + paise;
}

/** Formats paise as a plain decimal rupee string, e.g. 150050 -> "1500.50". */
export function paiseToRupeeString(paise: number): string {
  if (!Number.isSafeInteger(paise)) throw new InvalidAmountError(paise);
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / PAISE_PER_RUPEE);
  const fraction = String(abs % PAISE_PER_RUPEE).padStart(2, '0');
  return `${sign}${rupees}.${fraction}`;
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats paise in Indian notation, e.g. 12345678 -> "₹1,23,456.78". */
export function formatInr(paise: number): string {
  return inrFormatter.format(paise / PAISE_PER_RUPEE);
}

/**
 * Applies a rate expressed in basis points (1 bp = 0.01%) with half-up rounding
 * to the nearest paisa, e.g. 18% GST = 1800 bp.
 */
export function applyBasisPoints(paise: number, basisPoints: number): number {
  if (!Number.isSafeInteger(paise) || !Number.isInteger(basisPoints)) {
    throw new InvalidAmountError(paise);
  }
  return Math.round((paise * basisPoints) / 10_000);
}
