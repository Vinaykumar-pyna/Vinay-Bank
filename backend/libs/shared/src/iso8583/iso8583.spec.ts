import { randomBytes } from 'node:crypto';
import {
  describeMessage,
  Iso8583Error,
  pack,
  redactedHex,
  responseMti,
  unpack,
  type IsoMessage,
} from './codec';
import { frame, FrameDecoder } from './framing';
import {
  buildPinBlock,
  decryptPinBlock,
  encryptPinBlock,
  packWithMac,
  readPinBlock,
  translatePinBlock,
  verifyMac,
} from './security';

const PAN = '6528451000000017';

function financialRequest(overrides: IsoMessage['fields'] = {}): IsoMessage {
  return {
    mti: '0200',
    fields: {
      2: PAN,
      3: '010000',
      4: '150000',
      7: '1114101530',
      11: '000123',
      12: '154530',
      13: '1114',
      14: '3111',
      18: '6011',
      22: '051',
      25: '00',
      32: '600001',
      37: '631810000123',
      41: 'ATMMUM01',
      42: 'ARTHABANKATM001',
      43: 'ArthaBank ATM Fort Mumbai IN',
      49: '356',
      52: Buffer.alloc(8, 0xab),
      ...overrides,
    },
  };
}

describe('ISO 8583 codec', () => {
  it('round-trips a financial request, padding fixed fields', () => {
    const decoded = unpack(pack(financialRequest()));
    expect(decoded.mti).toBe('0200');
    expect(decoded.fields[2]).toBe(PAN);
    expect(decoded.fields[4]).toBe('000000150000'); // n12, zero-padded
    expect(decoded.fields[43]).toHaveLength(40); // ans40, space-padded
    expect(decoded.fields[52]).toEqual(Buffer.alloc(8, 0xab));
  });

  it('builds the primary bitmap from the present fields', () => {
    const packed = pack({ mti: '0800', fields: { 3: '000000', 7: '1114101530', 11: '000001' } });
    // Fields 3, 7 and 11 set bits 3, 7 and 11: 0010 0010 0010 0000 ...
    expect(packed.subarray(4, 12).toString('hex')).toBe('2220000000000000');
  });

  it('adds a secondary bitmap for fields above 64', () => {
    const packed = pack({ mti: '0800', fields: { 7: '1114101530', 11: '000001', 70: '301' } });
    expect(packed[4] & 0x80).toBe(0x80); // bit 1: secondary bitmap present
    expect(unpack(packed).fields[70]).toBe('301');
  });

  it('writes LLVAR length prefixes', () => {
    const packed = pack({ mti: '0200', fields: { 2: PAN } });
    expect(packed.subarray(12).toString('ascii')).toBe(`16${PAN}`);
  });

  it('rejects malformed values and messages', () => {
    expect(() => pack(financialRequest({ 4: '15.00' }))).toThrow(Iso8583Error);
    expect(() => pack(financialRequest({ 3: '0100000' }))).toThrow(/longer than 6/);
    expect(() => pack({ mti: '0200', fields: { 99: 'x' } })).toThrow(/not supported/);
    expect(() => pack({ mti: '200', fields: {} })).toThrow(/Invalid MTI/);
    const packed = pack(financialRequest());
    expect(() => unpack(packed.subarray(0, packed.length - 3))).toThrow(/past the end/);
    expect(() => unpack(Buffer.concat([packed, Buffer.from('X')]))).toThrow(/unexpected byte/);
  });

  it('maps request MTIs to response MTIs', () => {
    expect(responseMti('0200')).toBe('0210');
    expect(responseMti('0420')).toBe('0430');
    expect(responseMti('0800')).toBe('0810');
    expect(() => responseMti('0210')).toThrow();
  });

  it('never shows cardholder data when describing a message', () => {
    const message = financialRequest();
    const described = describeMessage(message);
    const value = (field: number) => described.fields.find((f) => f.field === field)?.value;
    expect(value(2)).toBe('652845******0017');
    expect(value(52)).toBe('[hidden]');
    expect(value(14)).toBe('[hidden]');
    expect(described.mtiName).toBe('Financial transaction request');
    const hex = redactedHex(message);
    expect(hex).not.toContain(Buffer.from(PAN).toString('hex').toUpperCase());
    expect(hex).not.toContain('ABABABABABABABAB');
  });
});

describe('ISO 8583 framing', () => {
  it('reassembles frames split across reads and merged into one read', () => {
    const a = frame(pack(financialRequest()));
    const b = frame(pack({ mti: '0800', fields: { 7: '1114101530', 11: '000002', 70: '301' } }));
    const decoder = new FrameDecoder();
    const received: Buffer[] = [];
    const stream = Buffer.concat([a, b]);
    for (let i = 0; i < stream.length; i += 7)
      received.push(...decoder.push(stream.subarray(i, i + 7)));
    expect(received.map((f) => unpack(f).mti)).toEqual(['0200', '0800']);
    expect(decoder.pendingBytes).toBe(0);
  });

  it('rejects a frame header that claims an oversized message', () => {
    expect(() => new FrameDecoder().push(Buffer.from([0xff, 0xff, 0x00]))).toThrow(
      /Invalid frame length/,
    );
  });
});

describe('PIN blocks and zone keys', () => {
  it('builds an ISO format 0 PIN block (known answer)', () => {
    // PIN field 041234FFFFFFFFFF XOR PAN field 0000111111111111
    expect(buildPinBlock('1234', '4111111111111111').toString('hex').toUpperCase()).toBe(
      '041225EEEEEEEEEE',
    );
    expect(readPinBlock(buildPinBlock('987654', PAN), PAN)).toBe('987654');
  });

  it('binds the PIN block to the card number', () => {
    const block = buildPinBlock('1234', PAN);
    expect(() => readPinBlock(block, '6528451000000025')).toThrow(/Malformed/);
  });

  it('translates a PIN block between zone keys without exposing it', () => {
    const acquirerZpk = randomBytes(16);
    const issuerZpk = randomBytes(16);
    const clear = buildPinBlock('2468', PAN);
    const underAcquirer = encryptPinBlock(clear, acquirerZpk);
    expect(underAcquirer.equals(clear)).toBe(false);
    const underIssuer = translatePinBlock(underAcquirer, acquirerZpk, issuerZpk);
    expect(readPinBlock(decryptPinBlock(underIssuer, issuerZpk), PAN)).toBe('2468');
  });
});

describe('message authentication code', () => {
  const key = randomBytes(32);

  it('detects any change to a signed message', () => {
    const packed = packWithMac(financialRequest(), key);
    expect(verifyMac(packed, unpack(packed), key)).toBe(true);

    const tampered = Buffer.from(packed);
    const amountAt = tampered.indexOf('000000150000');
    tampered.write('000009150000', amountAt, 'ascii');
    expect(verifyMac(tampered, unpack(tampered), key)).toBe(false);
    expect(verifyMac(packed, unpack(packed), randomBytes(32))).toBe(false);
  });

  it('uses field 128 when a secondary bitmap is present', () => {
    const packed = packWithMac(
      { mti: '0800', fields: { 7: '1114101530', 11: '000003', 70: '301' } },
      key,
    );
    const decoded = unpack(packed);
    expect(decoded.fields[128]).toBeInstanceOf(Buffer);
    expect(decoded.fields[64]).toBeUndefined();
    expect(verifyMac(packed, decoded, key)).toBe(true);
  });
});
