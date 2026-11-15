import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  decryptPinBlock,
  hmacSha256,
  hmacSha256Hex,
  luhnCheckDigit,
  randomDigits,
  readPinBlock,
  safeEqual,
} from '@app/shared';
import type { AppConfig } from '../../config/configuration';
import { FieldEncryptionService } from '../crypto/field-encryption.service';

/** Service code printed in the magnetic stripe (international, normal authorization, PIN required). */
const SERVICE_CODE = '226';

/**
 * Decimalisation as used for CVV/PVV: take the decimal digits of a hex string
 * in order, then map the remaining A-F nibbles to 0-5.
 */
export function decimalise(hex: string, length: number): string {
  const upper = hex.toUpperCase();
  const digits = [...upper].filter((c) => c >= '0' && c <= '9');
  const letters = [...upper]
    .filter((c) => c >= 'A' && c <= 'F')
    .map((c) => String(c.charCodeAt(0) - 65));
  return [...digits, ...letters].slice(0, length).join('');
}

/** PINs a thief would try first: one repeated digit, or a straight run such as 1234 or 9876. */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;
  const steps = [...pin].slice(1).map((d, i) => Number(d) - Number(pin[i]));
  return steps.every((step) => step === 1) || steps.every((step) => step === -1);
}

/** Issuer-side card cryptography (in production this lives in a hardware security module). */
@Injectable()
export class CardSecurityService {
  private readonly cards: AppConfig['cards'];

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly fields: FieldEncryptionService,
  ) {
    this.cards = config.get('cards', { infer: true });
  }

  get bin(): string {
    return this.cards.bin;
  }

  /** BIN + product code 10 + 7 random digits + Luhn check digit = 16 digits. */
  generatePan(): string {
    const body = `${this.cards.bin}10${randomDigits(7)}`;
    return `${body}${luhnCheckDigit(body)}`;
  }

  panIndex(pan: string): string {
    return this.fields.blindIndex(pan, 'card-pan');
  }

  encryptPan(pan: string, cardId: string): string {
    return this.fields.encrypt(pan, `card:${cardId}:pan`);
  }

  decryptPan(ciphertext: string, cardId: string): string {
    return this.fields.decrypt(ciphertext, `card:${cardId}:pan`);
  }

  /** CVV2 derived from the card verification key: never stored, recomputed when needed. */
  cvv(pan: string, expiry: string): string {
    return decimalise(
      hmacSha256(this.cards.keys.cvk, `${pan}|${expiry}|${SERVICE_CODE}`).toString('hex'),
      3,
    );
  }

  pinVerificationValue(pan: string, pin: string): string {
    return hmacSha256Hex(this.cards.keys.pvk, `${pan}|${pin}`);
  }

  /**
   * Checks a PIN block received from the switch: decrypt under the issuer zone
   * PIN key, read the PIN, compare verification values in constant time. The
   * clear block is wiped afterwards; a malformed block counts as a wrong PIN.
   */
  verifyPinBlock(pinBlockHex: string, pan: string, expectedPvv: string): boolean {
    const clear = decryptPinBlock(Buffer.from(pinBlockHex, 'hex'), this.cards.keys.zpkIssuer);
    try {
      return safeEqual(this.pinVerificationValue(pan, readPinBlock(clear, pan)), expectedPvv);
    } catch {
      return false;
    } finally {
      clear.fill(0);
    }
  }
}
