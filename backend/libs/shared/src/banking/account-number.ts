import { isValidLuhn, luhnCheckDigit } from './luhn';

/**
 * Vinay Bank account number: 12 digits
 *   BBBB  branch code
 *   PP    product (10 = savings, 20 = current)
 *   SSSSS serial within branch and product
 *   C     Luhn check digit
 * Example: 0001 10 00042 C
 */
export const PRODUCT_CODES = { SAVINGS: '10', CURRENT: '20' } as const;
export type ProductType = keyof typeof PRODUCT_CODES;

export function buildAccountNumber(
  branchCode: string,
  product: ProductType,
  serial: number,
): string {
  if (!/^\d{4}$/.test(branchCode)) throw new Error('Branch code must be 4 digits');
  if (!Number.isInteger(serial) || serial < 1 || serial > 99_999) {
    throw new Error('Account serial out of range');
  }
  const payload = `${branchCode}${PRODUCT_CODES[product]}${String(serial).padStart(5, '0')}`;
  return `${payload}${luhnCheckDigit(payload)}`;
}

export function isValidAccountNumber(value: string): boolean {
  return /^\d{12}$/.test(value) && isValidLuhn(value);
}
