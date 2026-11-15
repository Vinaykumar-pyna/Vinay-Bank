import { randomBytes } from 'node:crypto';
import {
  DecryptionError,
  decryptAesGcm,
  encryptAesGcm,
  keyFingerprint,
  toEncryptionKey,
} from './aes-gcm';
import { base32Decode, base32Encode } from './base32';
import { hmacSha256Hex, randomDigits, randomToken, safeEqual, sha256Hex } from './hashing';
import {
  buildOtpAuthUri,
  generateTotp,
  generateTotpSecret,
  hotp,
  totpTimeStep,
  verifyTotp,
} from './totp';

describe('base32 (RFC 4648 test vectors)', () => {
  it.each([
    ['', ''],
    ['f', 'MY======'],
    ['fo', 'MZXQ===='],
    ['foo', 'MZXW6==='],
    ['foob', 'MZXW6YQ='],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI======'],
  ])('encodes %p as %p', (input, expected) => {
    expect(base32Encode(Buffer.from(input), true)).toBe(expected);
    expect(base32Decode(expected).toString()).toBe(input);
  });

  it('round-trips random data and rejects invalid characters', () => {
    const data = randomBytes(37);
    expect(base32Decode(base32Encode(data)).equals(data)).toBe(true);
    expect(() => base32Decode('ABC1')).toThrow('Invalid base32 character');
  });
});

describe('HOTP (RFC 4226 appendix D test vectors)', () => {
  const secret = Buffer.from('12345678901234567890');
  const expected = [
    '755224',
    '287082',
    '359152',
    '969429',
    '338314',
    '254676',
    '287922',
    '162583',
    '399871',
    '520489',
  ];
  it.each(expected.map((code, counter) => [counter, code]))('counter %p -> %p', (counter, code) => {
    expect(hotp(secret, counter)).toBe(code);
  });
});

describe('TOTP (RFC 6238 appendix B, SHA-1, 8 digits)', () => {
  const secretBase32 = base32Encode(Buffer.from('12345678901234567890'));
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('T=%p -> %p', (seconds, code) => {
    expect(generateTotp(secretBase32, seconds * 1000, { digits: 8 })).toBe(code);
  });
});

describe('verifyTotp', () => {
  const secret = generateTotpSecret();
  const now = Date.UTC(2026, 10, 13, 10, 0, 15);

  it('accepts the current code and reports its time step', () => {
    const code = generateTotp(secret, now);
    expect(verifyTotp(code, secret, { timeMs: now })).toEqual({
      valid: true,
      timeStep: totpTimeStep(now),
    });
  });

  it('tolerates one step of clock drift but not more', () => {
    const previous = generateTotp(secret, now - 30_000);
    const old = generateTotp(secret, now - 90_000);
    expect(verifyTotp(previous, secret, { timeMs: now }).valid).toBe(true);
    expect(verifyTotp(old, secret, { timeMs: now }).valid).toBe(false);
  });

  it('rejects malformed codes', () => {
    expect(verifyTotp('12345', secret, { timeMs: now }).valid).toBe(false);
    expect(verifyTotp('abcdef', secret, { timeMs: now }).valid).toBe(false);
  });

  it('builds an otpauth URI for authenticator apps', () => {
    const uri = buildOtpAuthUri({
      secret: 'JBSWY3DPEHPK3PXP',
      account: 'a@b.co',
      issuer: 'ArthaBank',
    });
    expect(uri).toBe(
      'otpauth://totp/ArthaBank:a%40b.co?secret=JBSWY3DPEHPK3PXP&issuer=ArthaBank&algorithm=SHA1&digits=6&period=30',
    );
  });
});

describe('AES-256-GCM field encryption', () => {
  const key = toEncryptionKey(randomBytes(32).toString('base64'));

  it('round-trips and produces a different ciphertext every time (random IV)', () => {
    const a = encryptAesGcm('ABCDE1234F', key);
    const b = encryptAesGcm('ABCDE1234F', key);
    expect(a).not.toBe(b);
    expect(a.startsWith(`v1.${key.id}.`)).toBe(true);
    expect(decryptAesGcm(a, [key])).toBe('ABCDE1234F');
  });

  it('detects tampering via the authentication tag', () => {
    const parts = encryptAesGcm('secret', key).split('.');
    const ct = Buffer.from(parts[4], 'base64url');
    ct[0] ^= 0x01;
    parts[4] = ct.toString('base64url');
    expect(() => decryptAesGcm(parts.join('.'), [key])).toThrow(DecryptionError);
  });

  it('binds ciphertext to its record with AAD', () => {
    const sealed = encryptAesGcm('ABCDE1234F', key, 'user:1:pan');
    expect(decryptAesGcm(sealed, [key], 'user:1:pan')).toBe('ABCDE1234F');
    expect(() => decryptAesGcm(sealed, [key], 'user:2:pan')).toThrow(DecryptionError);
  });

  it('supports key rotation: old data decrypts with the previous key', () => {
    const oldKey = toEncryptionKey(randomBytes(32).toString('base64'));
    const sealedWithOld = encryptAesGcm('legacy', oldKey);
    expect(decryptAesGcm(sealedWithOld, [key, oldKey])).toBe('legacy');
    expect(() => decryptAesGcm(sealedWithOld, [key])).toThrow('No key available');
  });

  it('rejects keys that are not 32 bytes', () => {
    expect(() => toEncryptionKey(randomBytes(16).toString('base64'))).toThrow();
    expect(keyFingerprint(key.key)).toHaveLength(8);
  });
});

describe('hashing helpers', () => {
  it('computes SHA-256 and HMAC-SHA256 (RFC 4231 test case 2)', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(hmacSha256Hex('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  it('compares in constant time and handles different lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('generates secure random digits and tokens', () => {
    expect(randomDigits(6)).toMatch(/^\d{6}$/);
    expect(randomToken(32)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
