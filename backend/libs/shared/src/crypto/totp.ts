import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { base32Decode, base32Encode } from './base32';

/**
 * HOTP (RFC 4226) and TOTP (RFC 6238), the algorithms behind Google
 * Authenticator, Microsoft Authenticator, Authy and similar apps.
 *
 * TOTP = HOTP(secret, floor(unixTime / 30)): both sides share a secret and
 * derive the same 6-digit code from the current 30-second time step.
 */
export type TotpAlgorithm = 'sha1' | 'sha256' | 'sha512';

export interface TotpOptions {
  digits?: number;
  periodSeconds?: number;
  algorithm?: TotpAlgorithm;
}

const DEFAULTS: Required<TotpOptions> = { digits: 6, periodSeconds: 30, algorithm: 'sha1' };

/** RFC 4226 section 5.3: HMAC, dynamic truncation, then modulo 10^digits. */
export function hotp(
  secret: Buffer,
  counter: number | bigint,
  digits = DEFAULTS.digits,
  algorithm: TotpAlgorithm = DEFAULTS.algorithm,
): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(algorithm, secret).update(message).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function totpTimeStep(timeMs: number, periodSeconds = DEFAULTS.periodSeconds): number {
  return Math.floor(timeMs / 1000 / periodSeconds);
}

export function generateTotp(
  secretBase32: string,
  timeMs = Date.now(),
  options: TotpOptions = {},
): string {
  const { digits, periodSeconds, algorithm } = { ...DEFAULTS, ...options };
  return hotp(base32Decode(secretBase32), totpTimeStep(timeMs, periodSeconds), digits, algorithm);
}

export interface TotpVerification {
  valid: boolean;
  /** The time step that matched; store it to block replay of the same code. */
  timeStep?: number;
}

/**
 * Verifies a code, accepting `window` steps of clock drift either side
 * (window 1 = about +/-30 s). Comparison is constant-time.
 */
export function verifyTotp(
  code: string,
  secretBase32: string,
  {
    window = 1,
    timeMs = Date.now(),
    ...options
  }: TotpOptions & { window?: number; timeMs?: number } = {},
): TotpVerification {
  const { digits, periodSeconds, algorithm } = { ...DEFAULTS, ...options };
  if (!new RegExp(`^\\d{${digits}}$`).test(code)) return { valid: false };
  const secret = base32Decode(secretBase32);
  const current = totpTimeStep(timeMs, periodSeconds);
  for (let delta = -window; delta <= window; delta++) {
    const step = current + delta;
    if (step < 0) continue;
    const candidate = Buffer.from(hotp(secret, step, digits, algorithm));
    if (timingSafeEqual(candidate, Buffer.from(code))) return { valid: true, timeStep: step };
  }
  return { valid: false };
}

/** 160-bit random secret (RFC 4226 recommends at least 128 bits). */
export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

/** otpauth:// URI understood by authenticator apps (usually shown as a QR code). */
export function buildOtpAuthUri(params: {
  secret: string;
  account: string;
  issuer: string;
}): string {
  const label = `${encodeURIComponent(params.issuer)}:${encodeURIComponent(params.account)}`;
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: 'SHA1',
    digits: String(DEFAULTS.digits),
    period: String(DEFAULTS.periodSeconds),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
