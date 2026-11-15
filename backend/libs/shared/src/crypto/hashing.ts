import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function hmacSha256(key: Buffer | string, data: string | Buffer): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

export function hmacSha256Hex(key: Buffer | string, data: string | Buffer): string {
  return hmacSha256(key, data).toString('hex');
}

/**
 * Constant-time string comparison. A normal `===` stops at the first differing
 * character, and that timing difference can leak secrets byte by byte.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Cryptographically secure random digits (OTPs, account numbers), not Math.random(). */
export function randomDigits(length: number): string {
  let digits = '';
  for (let i = 0; i < length; i++) digits += String(randomInt(0, 10));
  return digits;
}

/** URL-safe random token, e.g. 32 bytes = 256 bits of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
