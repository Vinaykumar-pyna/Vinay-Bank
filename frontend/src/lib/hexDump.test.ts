import { hexDump } from './hexDump';

describe('hexDump', () => {
  it('prints offset, bytes and printable ASCII', () => {
    expect(hexDump('30383030')).toBe(`0000  30 38 30 30${' '.repeat(36)}  0800`);
  });

  it('wraps every 16 bytes and shows non-printable bytes as dots', () => {
    const lines = hexDump('00'.repeat(17)).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1].startsWith('0010  00')).toBe(true);
    expect(lines[0].endsWith('.'.repeat(16))).toBe(true);
  });
});
