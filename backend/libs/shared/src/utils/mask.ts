/**
 * Masking helpers for showing sensitive identifiers in UIs, logs and
 * notifications without revealing the full value.
 */

/** "123456789012" -> "XXXXXXXX9012" */
export function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber;
  return 'X'.repeat(accountNumber.length - 4) + accountNumber.slice(-4);
}

/** PCI DSS allows showing at most the first 6 and last 4 digits: "6001231234564321" -> "600123******4321" */
export function maskCardNumber(pan: string): string {
  const digits = pan.replace(/\D/g, '');
  if (digits.length < 13) return '*'.repeat(digits.length);
  return digits.slice(0, 6) + '*'.repeat(digits.length - 10) + digits.slice(-4);
}

/** "priya.sharma@example.com" -> "p**********a@example.com" */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || !local) return '***';
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${'*'.repeat(local.length - 2)}${local.slice(-1)}@${domain}`;
}

/** "9876543210" -> "******3210" */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return '*'.repeat(digits.length - 4) + digits.slice(-4);
}

/** Masks all but the last `visible` characters of a generic identifier. */
export function maskTail(value: string, visible = 4, maskChar = 'X'): string {
  if (value.length <= visible) return value;
  return maskChar.repeat(value.length - visible) + value.slice(-visible);
}
