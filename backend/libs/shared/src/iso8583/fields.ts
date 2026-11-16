/**
 * ISO 8583:1987 data elements used by the Vinay Bank card network (ASCII variant).
 *
 * Encoding rules:
 *  - MTI, numeric (n), alphanumeric (an) and special (ans) fields are ASCII.
 *  - Fixed numeric fields are left-padded with zeros, fixed text fields right-padded with spaces.
 *  - LLVAR / LLLVAR fields carry a 2 or 3 digit ASCII length prefix.
 *  - Binary (b) fields such as the PIN block and MAC are raw bytes.
 *  - Bitmaps are binary: 8 bytes (fields 1-64), plus 8 more when bit 1 flags a
 *    secondary bitmap (fields 65-128).
 */
export type FieldFormat = 'n' | 'an' | 'ans' | 'b';
export type LengthType = 'FIXED' | 'LLVAR' | 'LLLVAR';

export interface FieldSpec {
  name: string;
  format: FieldFormat;
  lengthType: LengthType;
  /** Exact length (FIXED) or maximum length (LLVAR/LLLVAR), in characters (bytes for format 'b'). */
  length: number;
  /** Cardholder data: masked (PAN) or hidden (PIN block, expiry) in logs and the message inspector. */
  sensitive?: 'pan' | 'hidden';
}

export const ISO8583_FIELDS: Readonly<Record<number, FieldSpec>> = {
  2: {
    name: 'Primary account number',
    format: 'n',
    lengthType: 'LLVAR',
    length: 19,
    sensitive: 'pan',
  },
  3: { name: 'Processing code', format: 'n', lengthType: 'FIXED', length: 6 },
  4: { name: 'Amount, transaction', format: 'n', lengthType: 'FIXED', length: 12 },
  7: { name: 'Transmission date and time', format: 'n', lengthType: 'FIXED', length: 10 },
  11: { name: 'System trace audit number', format: 'n', lengthType: 'FIXED', length: 6 },
  12: { name: 'Time, local transaction', format: 'n', lengthType: 'FIXED', length: 6 },
  13: { name: 'Date, local transaction', format: 'n', lengthType: 'FIXED', length: 4 },
  14: {
    name: 'Date, expiration',
    format: 'n',
    lengthType: 'FIXED',
    length: 4,
    sensitive: 'hidden',
  },
  18: { name: 'Merchant category code', format: 'n', lengthType: 'FIXED', length: 4 },
  22: { name: 'POS entry mode', format: 'n', lengthType: 'FIXED', length: 3 },
  25: { name: 'POS condition code', format: 'n', lengthType: 'FIXED', length: 2 },
  32: { name: 'Acquiring institution ID', format: 'n', lengthType: 'LLVAR', length: 11 },
  37: { name: 'Retrieval reference number', format: 'an', lengthType: 'FIXED', length: 12 },
  38: { name: 'Authorization ID response', format: 'an', lengthType: 'FIXED', length: 6 },
  39: { name: 'Response code', format: 'an', lengthType: 'FIXED', length: 2 },
  41: { name: 'Card acceptor terminal ID', format: 'ans', lengthType: 'FIXED', length: 8 },
  42: { name: 'Card acceptor ID code', format: 'ans', lengthType: 'FIXED', length: 15 },
  43: { name: 'Card acceptor name and location', format: 'ans', lengthType: 'FIXED', length: 40 },
  49: { name: 'Currency code, transaction', format: 'n', lengthType: 'FIXED', length: 3 },
  52: { name: 'PIN data', format: 'b', lengthType: 'FIXED', length: 8, sensitive: 'hidden' },
  54: { name: 'Additional amounts', format: 'ans', lengthType: 'LLLVAR', length: 120 },
  64: { name: 'Message authentication code', format: 'b', lengthType: 'FIXED', length: 8 },
  70: { name: 'Network management information code', format: 'n', lengthType: 'FIXED', length: 3 },
  90: { name: 'Original data elements', format: 'n', lengthType: 'FIXED', length: 42 },
  128: { name: 'Message authentication code', format: 'b', lengthType: 'FIXED', length: 8 },
};

export const MTI_NAMES: Readonly<Record<string, string>> = {
  '0200': 'Financial transaction request',
  '0210': 'Financial transaction response',
  '0420': 'Reversal advice',
  '0430': 'Reversal advice response',
  '0800': 'Network management request',
  '0810': 'Network management response',
};

/** Field 3, positions 1-2 (transaction type); account types left as 00 (default). */
export const PROCESSING_CODES = {
  PURCHASE: '000000',
  CASH_WITHDRAWAL: '010000',
  BALANCE_INQUIRY: '310000',
} as const;

/** Field 70 values. */
export const NETWORK_CODES = { SIGN_ON: '001', SIGN_OFF: '002', ECHO_TEST: '301' } as const;

/** ISO 4217 numeric code for the Indian rupee (amounts in field 4 are in paise). */
export const CURRENCY_INR = '356';

/** Field 39 values used by the issuer and the switch. */
export const RESPONSE_CODES = {
  '00': 'Approved',
  '05': 'Do not honour',
  '12': 'Invalid transaction',
  '13': 'Invalid amount',
  '14': 'Invalid card number',
  '25': 'Unable to locate original transaction',
  '30': 'Format error',
  '41': 'Lost card, pick up',
  '51': 'Insufficient funds',
  '54': 'Expired card',
  '55': 'Incorrect PIN',
  '57': 'Transaction not permitted to cardholder',
  '61': 'Exceeds withdrawal amount limit',
  '62': 'Restricted card',
  '63': 'Security violation',
  '75': 'Allowable number of PIN tries exceeded',
  '91': 'Issuer or switch inoperative',
  '94': 'Duplicate transmission',
  '96': 'System malfunction',
} as const;

export type ResponseCode = keyof typeof RESPONSE_CODES;

export function describeResponseCode(code: string): string {
  return (RESPONSE_CODES as Record<string, string>)[code] ?? 'Unknown response';
}
