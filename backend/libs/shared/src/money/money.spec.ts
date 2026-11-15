import {
  InvalidAmountError,
  applyBasisPoints,
  formatInr,
  isValidPaise,
  paiseToRupeeString,
  rupeesToPaise,
} from './money';

describe('money helpers', () => {
  describe('rupeesToPaise', () => {
    it.each([
      ['1500', 150000],
      ['1500.5', 150050],
      ['1500.50', 150050],
      ['0.01', 1],
      ['  42.07 ', 4207],
      ['0', 0],
    ])('parses %p as %p paise', (input, expected) => {
      expect(rupeesToPaise(input)).toBe(expected);
    });

    it('avoids floating point drift that Number parsing would introduce', () => {
      // parseFloat('0.29') * 100 === 28.999999999999996
      expect(rupeesToPaise('0.29')).toBe(29);
      expect(rupeesToPaise('1.15')).toBe(115);
    });

    it.each(['-10', '10.123', 'abc', '', '1e5', '10.', '.5', '12,000'])(
      'rejects invalid input %p',
      (input) => {
        expect(() => rupeesToPaise(input)).toThrow(InvalidAmountError);
      },
    );
  });

  describe('paiseToRupeeString', () => {
    it('formats with exactly two decimals', () => {
      expect(paiseToRupeeString(150050)).toBe('1500.50');
      expect(paiseToRupeeString(5)).toBe('0.05');
      expect(paiseToRupeeString(-250)).toBe('-2.50');
      expect(paiseToRupeeString(0)).toBe('0.00');
    });

    it('round-trips with rupeesToPaise', () => {
      for (const paise of [1, 99, 100, 123456789, 999999999999]) {
        expect(rupeesToPaise(paiseToRupeeString(paise))).toBe(paise);
      }
    });

    it('rejects non-integers', () => {
      expect(() => paiseToRupeeString(10.5)).toThrow(InvalidAmountError);
    });
  });

  describe('formatInr', () => {
    it('uses Indian digit grouping (lakhs and crores)', () => {
      expect(formatInr(12345678)).toBe('₹1,23,456.78');
      expect(formatInr(1000000000)).toBe('₹1,00,00,000.00');
    });
  });

  describe('isValidPaise', () => {
    it('accepts positive safe integers only', () => {
      expect(isValidPaise(100)).toBe(true);
      expect(isValidPaise(0)).toBe(false);
      expect(isValidPaise(-1)).toBe(false);
      expect(isValidPaise(1.5)).toBe(false);
      expect(isValidPaise(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
      expect(isValidPaise('100')).toBe(false);
    });
  });

  describe('applyBasisPoints', () => {
    it('computes percentages with half-up rounding', () => {
      expect(applyBasisPoints(500, 1800)).toBe(90); // 18% of 5.00 = 0.90
      expect(applyBasisPoints(333, 1800)).toBe(60); // 59.94 -> 60
      expect(applyBasisPoints(100000, 25)).toBe(250); // 0.25%
    });
  });
});
