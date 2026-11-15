import { registerDecorator, type ValidationOptions } from 'class-validator';

/** Indian PAN: 5 letters, 4 digits, 1 letter; the 4th letter encodes the holder type. */
export const PAN_PATTERN = /^[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]$/;
/** Indian mobile number: 10 digits starting with 6-9. */
export const INDIAN_MOBILE_PATTERN = /^[6-9]\d{9}$/;
/** IFSC: 4-letter bank code, a literal 0, then a 6-character branch code. */
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
/** Indian PIN code: 6 digits, the first is 1-9. */
export const PINCODE_PATTERN = /^[1-9]\d{5}$/;

export const PASSWORD_RULES =
  'Password must be 8-64 characters and include upper and lower case letters, a number and a symbol';

/**
 * Password policy. bcrypt only uses the first 72 bytes of input, so the byte
 * length is capped as well (multi-byte characters count as several bytes).
 */
export function isStrongPassword(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return (
    value.length >= 8 &&
    value.length <= 64 &&
    Buffer.byteLength(value, 'utf8') <= 72 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

export function IsBankPassword(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isBankPassword',
      target: target.constructor,
      propertyName,
      options: { message: PASSWORD_RULES, ...options },
      validator: { validate: isStrongPassword },
    });
}

/** True when the person is at least `minAge` years old on `today`. */
export function isAdult(dateOfBirth: Date, minAge = 18, today: Date = new Date()): boolean {
  const cutoff = new Date(today);
  cutoff.setFullYear(cutoff.getFullYear() - minAge);
  return dateOfBirth <= cutoff;
}

export function IsAdult(minAge = 18, options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isAdult',
      target: target.constructor,
      propertyName,
      options: { message: `You must be at least ${minAge} years old`, ...options },
      validator: {
        validate: (value: unknown) => {
          const date = new Date(value as string);
          return (
            !Number.isNaN(date.getTime()) && isAdult(date, minAge) && date.getFullYear() > 1900
          );
        },
      },
    });
}
