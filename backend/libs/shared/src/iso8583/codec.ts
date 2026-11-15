import { ISO8583_FIELDS, MTI_NAMES, type FieldSpec } from './fields';

export type FieldValue = string | Buffer;

/** A decoded message: the MTI plus data elements keyed by field number. */
export interface IsoMessage {
  mti: string;
  fields: Partial<Record<number, FieldValue>>;
}

export class Iso8583Error extends Error {
  constructor(
    message: string,
    readonly field?: number,
  ) {
    super(field ? `Field ${field}: ${message}` : message);
    this.name = 'Iso8583Error';
  }
}

const CHARSETS: Record<Exclude<FieldSpec['format'], 'b'>, RegExp> = {
  n: /^\d*$/,
  an: /^[A-Za-z0-9 ]*$/,
  ans: /^[\x20-\x7E]*$/,
};

function specFor(field: number): FieldSpec {
  const spec = ISO8583_FIELDS[field];
  if (!spec) throw new Iso8583Error('not supported by this codec', field);
  return spec;
}

function setBit(bitmap: Buffer, field: number): void {
  const index = field - 1;
  bitmap[index >> 3] |= 0x80 >> (index & 7);
}

export function hasBit(bitmap: Buffer, field: number): boolean {
  const index = field - 1;
  return (bitmap[index >> 3] & (0x80 >> (index & 7))) !== 0;
}

/** Field numbers present in a message, ascending. */
export function presentFields(message: IsoMessage): number[] {
  return Object.keys(message.fields)
    .map(Number)
    .filter((field) => message.fields[field] !== undefined)
    .sort((a, b) => a - b);
}

function lengthPrefix(spec: FieldSpec, length: number): Buffer {
  if (spec.lengthType === 'FIXED') return Buffer.alloc(0);
  const digits = spec.lengthType === 'LLVAR' ? 2 : 3;
  return Buffer.from(String(length).padStart(digits, '0'), 'ascii');
}

function encodeField(field: number, value: FieldValue): Buffer {
  const spec = specFor(field);
  if (spec.format === 'b') {
    if (!Buffer.isBuffer(value)) throw new Iso8583Error('binary field needs a Buffer', field);
    if (spec.lengthType === 'FIXED' && value.length !== spec.length) {
      throw new Iso8583Error(`must be exactly ${spec.length} bytes`, field);
    }
    if (value.length > spec.length)
      throw new Iso8583Error(`longer than ${spec.length} bytes`, field);
    return Buffer.concat([lengthPrefix(spec, value.length), value]);
  }
  if (typeof value !== 'string') throw new Iso8583Error('text field needs a string', field);
  if (value.length > spec.length) {
    throw new Iso8583Error(`"${spec.name}" is longer than ${spec.length} characters`, field);
  }
  if (!CHARSETS[spec.format].test(value)) {
    throw new Iso8583Error(
      `"${spec.name}" has characters not allowed in format ${spec.format}`,
      field,
    );
  }
  let text = value;
  if (spec.lengthType === 'FIXED') {
    text = spec.format === 'n' ? value.padStart(spec.length, '0') : value.padEnd(spec.length, ' ');
  }
  return Buffer.concat([lengthPrefix(spec, text.length), Buffer.from(text, 'ascii')]);
}

/** Encodes a message: MTI, bitmap(s), then each present field in ascending order. */
export function pack(message: IsoMessage): Buffer {
  if (!/^\d{4}$/.test(message.mti)) throw new Iso8583Error(`Invalid MTI "${message.mti}"`);
  const fields = presentFields(message);
  if (fields.includes(1)) throw new Iso8583Error('bit 1 is reserved for the secondary bitmap', 1);
  if (fields.some((field) => field < 1 || field > 128))
    throw new Iso8583Error('Field numbers run from 2 to 128');

  const secondary = fields.some((field) => field > 64);
  const bitmap = Buffer.alloc(secondary ? 16 : 8);
  if (secondary) setBit(bitmap, 1);
  const parts: Buffer[] = [];
  for (const field of fields) {
    setBit(bitmap, field);
    parts.push(encodeField(field, message.fields[field] as FieldValue));
  }
  return Buffer.concat([Buffer.from(message.mti, 'ascii'), bitmap, ...parts]);
}

/** Decodes a message, rejecting unknown fields, bad lengths and trailing bytes. */
export function unpack(data: Buffer): IsoMessage {
  if (data.length < 12) throw new Iso8583Error('Message is shorter than an MTI and a bitmap');
  const mti = data.toString('ascii', 0, 4);
  if (!/^\d{4}$/.test(mti)) throw new Iso8583Error(`Invalid MTI "${mti}"`);

  let offset = 4;
  let bitmap = data.subarray(offset, offset + 8);
  offset += 8;
  const secondary = hasBit(bitmap, 1);
  if (secondary) {
    if (data.length < offset + 8) throw new Iso8583Error('Secondary bitmap is missing');
    bitmap = data.subarray(4, 20);
    offset += 8;
  }

  const fields: IsoMessage['fields'] = {};
  for (let field = 2; field <= (secondary ? 128 : 64); field++) {
    if (!hasBit(bitmap, field)) continue;
    const spec = specFor(field);
    let length = spec.length;
    if (spec.lengthType !== 'FIXED') {
      const digits = spec.lengthType === 'LLVAR' ? 2 : 3;
      const prefix = data.toString('ascii', offset, offset + digits);
      if (!/^\d+$/.test(prefix) || prefix.length !== digits) {
        throw new Iso8583Error('invalid length prefix', field);
      }
      length = Number(prefix);
      offset += digits;
      if (length > spec.length)
        throw new Iso8583Error(`length ${length} exceeds ${spec.length}`, field);
    }
    if (offset + length > data.length)
      throw new Iso8583Error('runs past the end of the message', field);
    const raw = data.subarray(offset, offset + length);
    offset += length;
    if (spec.format === 'b') {
      fields[field] = Buffer.from(raw);
    } else {
      const text = raw.toString('ascii');
      if (!CHARSETS[spec.format].test(text)) {
        throw new Iso8583Error(`has characters not allowed in format ${spec.format}`, field);
      }
      fields[field] = text;
    }
  }
  if (offset !== data.length) {
    throw new Iso8583Error(`${data.length - offset} unexpected byte(s) after the last field`);
  }
  return { mti, fields };
}

/** Request MTI to response MTI: 0200 -> 0210, 0420 -> 0430, 0800 -> 0810. */
export function responseMti(mti: string): string {
  const fn = Number(mti[2]);
  if (!/^\d{4}$/.test(mti) || fn % 2 !== 0) throw new Iso8583Error(`${mti} is not a request MTI`);
  return `${mti.slice(0, 2)}${fn + 1}${mti[3]}`;
}

/** Text value of a field with padding removed, or undefined. */
export function text(message: IsoMessage, field: number): string | undefined {
  const value = message.fields[field];
  return typeof value === 'string' ? value.trim() : undefined;
}

export interface DescribedField {
  field: number;
  name: string;
  value: string;
}

export interface DescribedMessage {
  mti: string;
  mtiName: string;
  bitmap: string;
  fields: DescribedField[];
}

export function maskPan(pan: string): string {
  return pan.length < 13
    ? '*'.repeat(pan.length)
    : `${pan.slice(0, 6)}${'*'.repeat(pan.length - 10)}${pan.slice(-4)}`;
}

/**
 * Human-readable view for logs and the message inspector. Cardholder data is
 * never shown: the PAN is masked to first six and last four digits, and the PIN
 * block and expiry date are hidden.
 */
export function describeMessage(message: IsoMessage): DescribedMessage {
  const packed = pack(message);
  const secondary = presentFields(message).some((field) => field > 64);
  return {
    mti: message.mti,
    mtiName: MTI_NAMES[message.mti] ?? 'Unknown message type',
    bitmap: packed
      .subarray(4, secondary ? 20 : 12)
      .toString('hex')
      .toUpperCase(),
    fields: presentFields(message).map((field) => {
      const spec = specFor(field);
      const value = message.fields[field] as FieldValue;
      let shown: string;
      if (spec.sensitive === 'hidden') shown = '[hidden]';
      else if (spec.sensitive === 'pan') shown = maskPan(String(value));
      else shown = Buffer.isBuffer(value) ? value.toString('hex').toUpperCase() : value;
      return { field, name: spec.name, value: shown };
    }),
  };
}

/**
 * Hex dump of a frame with sensitive bytes blanked out (PAN digits, PIN block,
 * expiry), so it can be shown in the inspector or written to a log.
 */
export function redactedHex(message: IsoMessage): string {
  const redacted: IsoMessage = { mti: message.mti, fields: { ...message.fields } };
  for (const field of presentFields(message)) {
    const spec = specFor(field);
    const value = redacted.fields[field] as FieldValue;
    if (spec.sensitive === 'pan' && typeof value === 'string')
      redacted.fields[field] = maskPan(value).replace(/\*/g, '0');
    if (spec.sensitive === 'hidden') {
      redacted.fields[field] = Buffer.isBuffer(value)
        ? Buffer.alloc(value.length)
        : '0'.repeat(value.length);
    }
  }
  return pack(redacted).toString('hex').toUpperCase();
}
