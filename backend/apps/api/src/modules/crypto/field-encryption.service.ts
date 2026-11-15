import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decryptAesGcm, encryptAesGcm, hmacSha256Hex, type EncryptionKey } from '@app/shared';
import type { AppConfig } from '../../config/configuration';

/**
 * Field-level encryption for sensitive data (PAN, card numbers, MFA secrets).
 *
 * Values are encrypted with AES-256-GCM before they reach MongoDB, so a database
 * dump or backup does not expose them. Because ciphertexts are randomized,
 * exact-match lookups use a *blind index*: an HMAC of the normalized value under
 * a separate key (e.g. to enforce "one customer per PAN").
 */
@Injectable()
export class FieldEncryptionService {
  private readonly keys: EncryptionKey[];
  private readonly blindIndexKey: Buffer;

  constructor(config: ConfigService<AppConfig, true>) {
    const security = config.get('security', { infer: true });
    this.keys = security.dataKeys;
    this.blindIndexKey = security.blindIndexKey;
  }

  /** `context` becomes AAD, e.g. "user:<id>:pan", binding the ciphertext to its record. */
  encrypt(plaintext: string, context: string): string {
    return encryptAesGcm(plaintext, this.keys[0], context);
  }

  decrypt(ciphertext: string, context: string): string {
    return decryptAesGcm(ciphertext, this.keys, context);
  }

  /** Deterministic keyed hash for equality search. `purpose` separates index domains. */
  blindIndex(value: string, purpose: string): string {
    return hmacSha256Hex(this.blindIndexKey, `${purpose}:${value.trim().toUpperCase()}`);
  }

  /** True when data was encrypted with an older key and should be re-encrypted. */
  isStale(ciphertext: string): boolean {
    return ciphertext.split('.')[1] !== this.keys[0].id;
  }
}
