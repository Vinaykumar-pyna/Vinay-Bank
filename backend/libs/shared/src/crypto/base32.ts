/**
 * RFC 4648 base32 (alphabet A-Z, 2-7). Authenticator apps expect TOTP secrets in
 * this encoding because it avoids ambiguous characters such as 0/O and 1/l.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(data: Uint8Array, padding = false): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1; // keep only the unconsumed bits
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  if (padding) while (output.length % 8 !== 0) output += '=';
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/\s+/g, '').replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Invalid base32 character "${char}"`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  return Buffer.from(bytes);
}
