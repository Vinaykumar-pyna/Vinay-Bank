import { createCipheriv, createDecipheriv, createHmac, timingSafeEqual } from 'node:crypto';
import { Iso8583Error, pack, presentFields, type IsoMessage } from './codec';

// ---------------------------------------------------------------------------
// PIN blocks (ISO 9564-1 format 0) and zone PIN keys
// ---------------------------------------------------------------------------

function xor(a: Buffer, b: Buffer): Buffer {
  return Buffer.from(a.map((byte, i) => byte ^ b[i]));
}

/** "0000" + the 12 rightmost PAN digits, excluding the check digit. */
function panField(pan: string): Buffer {
  if (!/^\d{13,19}$/.test(pan)) throw new Iso8583Error('PAN must be 13 to 19 digits');
  return Buffer.from(`0000${pan.slice(-13, -1)}`, 'hex');
}

/**
 * Clear ISO format 0 PIN block: (0 | PIN length | PIN | F padding) XOR (0000 | PAN digits).
 * Binding the PAN in means a captured block cannot be replayed with another card.
 */
export function buildPinBlock(pin: string, pan: string): Buffer {
  if (!/^\d{4,12}$/.test(pin)) throw new Iso8583Error('PIN must be 4 to 12 digits');
  const pinField = Buffer.from(`0${pin.length.toString(16)}${pin}`.padEnd(16, 'F'), 'hex');
  return xor(pinField, panField(pan));
}

/** Recovers the PIN from a clear format 0 block, validating its structure. */
export function readPinBlock(block: Buffer, pan: string): string {
  if (block.length !== 8) throw new Iso8583Error('PIN block must be 8 bytes');
  const pinField = xor(block, panField(pan)).toString('hex').toUpperCase();
  const length = Number.parseInt(pinField[1], 16);
  const pin = pinField.slice(2, 2 + length);
  if (
    pinField[0] !== '0' ||
    length < 4 ||
    length > 12 ||
    !/^\d+$/.test(pin) ||
    !/^F*$/.test(pinField.slice(2 + length))
  ) {
    throw new Iso8583Error('Malformed PIN block');
  }
  return pin;
}

function tdesCipher(key: Buffer): string {
  if (key.length === 16) return 'des-ede'; // double-length key (2-key triple DES)
  if (key.length === 24) return 'des-ede3';
  throw new Iso8583Error('A zone PIN key must be 16 or 24 bytes (triple DES)');
}

/** Encrypts an 8-byte PIN block under a zone PIN key (triple DES, single block). */
export function encryptPinBlock(clear: Buffer, zpk: Buffer): Buffer {
  const cipher = createCipheriv(tdesCipher(zpk), zpk, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(clear), cipher.final()]);
}

export function decryptPinBlock(encrypted: Buffer, zpk: Buffer): Buffer {
  const decipher = createDecipheriv(tdesCipher(zpk), zpk, null);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/**
 * PIN translation, as a hardware security module does at a switch: decrypt
 * under the incoming zone key, re-encrypt under the outgoing one. The clear
 * block exists only inside this function and is wiped before returning.
 */
export function translatePinBlock(encrypted: Buffer, fromZpk: Buffer, toZpk: Buffer): Buffer {
  const clear = decryptPinBlock(encrypted, fromZpk);
  try {
    return encryptPinBlock(clear, toZpk);
  } finally {
    clear.fill(0);
  }
}

// ---------------------------------------------------------------------------
// Message authentication code
// ---------------------------------------------------------------------------

export const MAC_LENGTH = 8;

/** HMAC-SHA256 over every byte before the MAC field, truncated to 8 bytes. */
export function computeMac(macInput: Buffer, key: Buffer): Buffer {
  return createHmac('sha256', key).update(macInput).digest().subarray(0, MAC_LENGTH);
}

/** The MAC is always the last field: 128 when a secondary bitmap is present, otherwise 64. */
function macFieldFor(message: IsoMessage): 64 | 128 {
  return presentFields(message).some((field) => field > 64 && field !== 128) ? 128 : 64;
}

/** Packs a message and fills in its MAC, so any change in transit is detected. */
export function packWithMac(message: IsoMessage, key: Buffer): Buffer {
  const fields = { ...message.fields };
  delete fields[64];
  delete fields[128];
  const macField = macFieldFor({ mti: message.mti, fields });
  fields[macField] = Buffer.alloc(MAC_LENGTH);
  const packed = pack({ mti: message.mti, fields });
  computeMac(packed.subarray(0, packed.length - MAC_LENGTH), key).copy(
    packed,
    packed.length - MAC_LENGTH,
  );
  return packed;
}

/** Verifies the MAC of a received frame (constant-time comparison). */
export function verifyMac(packed: Buffer, message: IsoMessage, key: Buffer): boolean {
  const mac = message.fields[macFieldFor(message)];
  if (!Buffer.isBuffer(mac) || mac.length !== MAC_LENGTH) return false;
  const expected = computeMac(packed.subarray(0, packed.length - MAC_LENGTH), key);
  return timingSafeEqual(mac, expected);
}
