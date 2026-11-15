import { z } from 'zod';

/**
 * Client-side validation rules. They mirror the API's rules so users get
 * instant feedback; the server still validates everything independently.
 */
export const PAN_REGEX = /^[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]$/;
export const MOBILE_REGEX = /^[6-9]\d{9}$/;
export const PINCODE_REGEX = /^[1-9]\d{5}$/;
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const NAME_REGEX = /^[A-Za-z][A-Za-z .'-]*$/;

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(64, 'Use at most 64 characters')
  .regex(/[a-z]/, 'Add a lowercase letter')
  .regex(/[A-Z]/, 'Add an uppercase letter')
  .regex(/\d/, 'Add a number')
  .regex(/[^A-Za-z0-9]/, 'Add a symbol such as @ or #');

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email')
  .email('Enter a valid email address');

export function isAdult(isoDate: string, minAge = 18, today = new Date()): boolean {
  const dob = new Date(isoDate);
  if (Number.isNaN(dob.getTime()) || dob.getFullYear() < 1900) return false;
  const cutoff = new Date(today);
  cutoff.setFullYear(cutoff.getFullYear() - minAge);
  return dob <= cutoff;
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too weak' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  variant: 'danger' | 'warning' | 'info' | 'success';
}

export function passwordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: 'Too weak', variant: 'danger' };
  let points = 0;
  if (password.length >= 8) points++;
  if (password.length >= 12) points++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points++;
  if (/\d/.test(password)) points++;
  if (/[^A-Za-z0-9]/.test(password)) points++;
  const score = Math.min(4, Math.max(0, points - 1)) as PasswordStrength['score'];
  const table: Record<PasswordStrength['score'], Omit<PasswordStrength, 'score'>> = {
    0: { label: 'Too weak', variant: 'danger' },
    1: { label: 'Weak', variant: 'danger' },
    2: { label: 'Fair', variant: 'warning' },
    3: { label: 'Good', variant: 'info' },
    4: { label: 'Strong', variant: 'success' },
  };
  return { score, ...table[score] };
}

export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const;
