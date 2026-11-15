import { istDateStamp, istHour, startOfIstDay, startOfIstMonth } from '../utils/time';
import { buildAccountNumber, isValidAccountNumber } from './account-number';
import { isValidLuhn, luhnCheckDigit } from './luhn';

describe('Luhn check digit', () => {
  it('matches known card number test values', () => {
    expect(luhnCheckDigit('7992739871')).toBe(3); // classic example: 79927398713
    expect(isValidLuhn('79927398713')).toBe(true);
    expect(isValidLuhn('4111111111111111')).toBe(true); // Visa test card
    expect(isValidLuhn('4111111111111112')).toBe(false);
  });

  it('detects single-digit typos and adjacent transpositions', () => {
    const valid = '000110000427'.slice(0, 11);
    const full = `${valid}${luhnCheckDigit(valid)}`;
    expect(isValidLuhn(full)).toBe(true);
    const typo = `${full.slice(0, 5)}${(Number(full[5]) + 1) % 10}${full.slice(6)}`;
    expect(isValidLuhn(typo)).toBe(false);
    const swapped = `${full.slice(0, 7)}${full[8]}${full[7]}${full.slice(9)}`;
    if (full[7] !== full[8]) expect(isValidLuhn(swapped)).toBe(false);
  });

  it('rejects non-digit input', () => {
    expect(() => luhnCheckDigit('12a4')).toThrow();
    expect(isValidLuhn('abc')).toBe(false);
  });
});

describe('account numbers', () => {
  it('encodes branch, product and serial with a check digit', () => {
    const number = buildAccountNumber('0001', 'SAVINGS', 42);
    expect(number).toHaveLength(12);
    expect(number.startsWith('00011000042')).toBe(true);
    expect(isValidAccountNumber(number)).toBe(true);
    expect(buildAccountNumber('0002', 'CURRENT', 1).slice(4, 6)).toBe('20');
  });

  it('rejects invalid inputs', () => {
    expect(() => buildAccountNumber('1', 'SAVINGS', 1)).toThrow();
    expect(() => buildAccountNumber('0001', 'SAVINGS', 0)).toThrow();
    expect(isValidAccountNumber('000110000420')).toBe(isValidLuhn('000110000420'));
    expect(isValidAccountNumber('12345')).toBe(false);
  });
});

describe('IST time helpers', () => {
  it('computes the IST day boundary', () => {
    // 2026-11-13 20:00 UTC is 2026-11-14 01:30 IST, so the IST day began 2026-11-13 18:30 UTC.
    expect(startOfIstDay(new Date('2026-11-13T20:00:00Z')).toISOString()).toBe(
      '2026-11-13T18:30:00.000Z',
    );
    expect(startOfIstDay(new Date('2026-11-13T10:00:00Z')).toISOString()).toBe(
      '2026-11-12T18:30:00.000Z',
    );
  });

  it('reports IST hours, date stamps and month starts', () => {
    expect(istHour(new Date('2026-11-13T20:00:00Z'))).toBe(1);
    expect(istDateStamp(new Date('2026-11-13T20:00:00Z'))).toBe('20261114');
    expect(startOfIstMonth(new Date('2026-11-13T10:00:00Z'), 1).toISOString()).toBe(
      '2026-09-30T18:30:00.000Z',
    );
  });
});
