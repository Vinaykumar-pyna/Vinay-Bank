import {
  IFSC_PATTERN,
  INDIAN_MOBILE_PATTERN,
  PAN_PATTERN,
  PINCODE_PATTERN,
  isAdult,
  isStrongPassword,
} from './banking.validators';

describe('banking validators', () => {
  it('validates PAN numbers', () => {
    expect(PAN_PATTERN.test('ABCPE1234F')).toBe(true);
    expect(PAN_PATTERN.test('ABCXE1234F')).toBe(false); // X is not a valid holder type
    expect(PAN_PATTERN.test('abcpe1234f')).toBe(false);
    expect(PAN_PATTERN.test('ABCPE12345')).toBe(false);
  });

  it('validates Indian mobile numbers, IFSC codes and PIN codes', () => {
    expect(INDIAN_MOBILE_PATTERN.test('9876543210')).toBe(true);
    expect(INDIAN_MOBILE_PATTERN.test('5876543210')).toBe(false);
    expect(IFSC_PATTERN.test('HDFC0001234')).toBe(true);
    expect(IFSC_PATTERN.test('HDFC1001234')).toBe(false);
    expect(PINCODE_PATTERN.test('411001')).toBe(true);
    expect(PINCODE_PATTERN.test('011001')).toBe(false);
  });

  it('enforces the password policy, including the bcrypt 72-byte limit', () => {
    expect(isStrongPassword('Str0ng@Pass')).toBe(true);
    expect(isStrongPassword('weakpass')).toBe(false);
    expect(isStrongPassword('NoSymbol123')).toBe(false);
    expect(isStrongPassword('S@1a')).toBe(false);
    // 24 three-byte characters = 72 bytes plus the required classes pushes past 72 bytes
    expect(isStrongPassword(`Aa1@${'€'.repeat(24)}`)).toBe(false);
  });

  it('checks minimum age', () => {
    const today = new Date('2026-11-13T00:00:00Z');
    expect(isAdult(new Date('2008-11-13T00:00:00Z'), 18, today)).toBe(true);
    expect(isAdult(new Date('2008-11-14T00:00:00Z'), 18, today)).toBe(false);
  });
});
