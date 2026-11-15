import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Field-level encryption with AES-256-GCM (authenticated encryption).
 *
 *  - A fresh random 96-bit IV for every encryption, so equal plaintexts encrypt differently.
 *  - The 128-bit auth tag detects any modification of the ciphertext.
 *  - Optional AAD (additional authenticated data) binds a ciphertext to its record,
 *    e.g. "user:<id>:pan": copying the value into another record fails to decrypt.
 *  - The output names the key it was encrypted with, so keys can be rotated:
 *    new data uses the current key and old data still decrypts with previous keys.
 *
 * Format: v1.<keyId>.<iv>.<tag>.<ciphertext>   (base64url segments)
 */
export interface EncryptionKey {
  id: string;
  key: Buffer;
}

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const VERSION = 'v1';

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptionError';
  }
}

/** Short, non-secret identifier of a key (first 8 hex chars of its SHA-256). */
export function keyFingerprint(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 8);
}

export function toEncryptionKey(base64Key: string): EncryptionKey {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('AES-256 keys must be exactly 32 bytes');
  return { id: keyFingerprint(key), key };
}

export function encryptAesGcm(plaintext: string, key: EncryptionKey, aad?: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key.key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    key.id,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptAesGcm(payload: string, keys: EncryptionKey[], aad?: string): string {
  const parts = payload.split('.');
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new DecryptionError('Unsupported ciphertext format');
  }
  const [, keyId, iv, tag, ciphertext] = parts;
  const key = keys.find((candidate) => candidate.id === keyId);
  if (!key) throw new DecryptionError(`No key available for key id ${keyId}`);
  try {
    const decipher = createDecipheriv(ALGORITHM, key.key, Buffer.from(iv, 'base64url'));
    if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Wrong key, wrong AAD, or tampered ciphertext/tag: GCM authentication failed.
    throw new DecryptionError('Ciphertext failed authentication');
  }
}
