/**
 * Luhn (mod 10) check digit, ISO/IEC 7812. Used on card numbers and on
 * Vinay Bank account numbers: it catches every single-digit typo and most
 * transpositions of adjacent digits before a payment is attempted.
 */
export function luhnCheckDigit(payload: string): number {
  if (!/^\d+$/.test(payload)) throw new Error('Luhn payload must contain digits only');
  let sum = 0;
  // Walk from the right; the rightmost payload digit is doubled (the check digit goes after it).
  for (let i = 0; i < payload.length; i++) {
    let digit = Number(payload[payload.length - 1 - i]);
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidLuhn(value: string): boolean {
  if (!/^\d{2,}$/.test(value)) return false;
  return luhnCheckDigit(value.slice(0, -1)) === Number(value.slice(-1));
}
