import {
  IFSC_REGEX,
  isAdult,
  MOBILE_REGEX,
  PAN_REGEX,
  passwordSchema,
  passwordStrength,
} from './validation';

describe('client validation rules', () => {
  it('matches the server rules for PAN, mobile and IFSC', () => {
    expect(PAN_REGEX.test('ABCPE1234F')).toBe(true);
    expect(PAN_REGEX.test('ABCXE1234F')).toBe(false);
    expect(MOBILE_REGEX.test('9876543210')).toBe(true);
    expect(MOBILE_REGEX.test('1234567890')).toBe(false);
    expect(IFSC_REGEX.test('ARTH0000001')).toBe(true);
  });

  it('enforces the password policy with specific messages', () => {
    expect(passwordSchema.safeParse('Str0ng@Pass').success).toBe(true);
    const weak = passwordSchema.safeParse('password');
    expect(weak.success).toBe(false);
    if (!weak.success) {
      const messages = weak.error.issues.map((issue) => issue.message);
      expect(messages).toEqual(
        expect.arrayContaining([
          'Add an uppercase letter',
          'Add a number',
          'Add a symbol such as @ or #',
        ]),
      );
    }
  });

  it('scores password strength', () => {
    expect(passwordStrength('').label).toBe('Too weak');
    expect(passwordStrength('abcdefgh').score).toBeLessThan(2);
    expect(passwordStrength('Str0ng@Passw0rd').label).toBe('Strong');
  });

  it('checks the minimum age', () => {
    const today = new Date('2026-11-13T00:00:00Z');
    expect(isAdult('2008-11-13', 18, today)).toBe(true);
    expect(isAdult('2010-01-01', 18, today)).toBe(false);
    expect(isAdult('not-a-date', 18, today)).toBe(false);
  });
});
