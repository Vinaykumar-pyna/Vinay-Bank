import { AccountType } from '../enums/banking.enums';

/** Amounts in paise. 1 lakh = 1,00,000 rupees = 1,00,00,000 paise. */
export const RUPEE = 100;
export const LAKH = 100_000 * RUPEE;

export const DAILY_LIMITS: Record<AccountType, { default: number; max: number }> = {
  [AccountType.SAVINGS]: { default: 5 * LAKH, max: 10 * LAKH },
  [AccountType.CURRENT]: { default: 20 * LAKH, max: 50 * LAKH },
};

/** Until KYC is verified, customers can move at most this much per day. */
export const KYC_PENDING_DAILY_LIMIT = 50_000 * RUPEE;

/** Cap per transfer to a beneficiary that is still in its cooling period. */
export const COOLING_PERIOD_TRANSFER_LIMIT = 50_000 * RUPEE;

export const OTP_TTL_SECONDS = 300;
export const OTP_MAX_ATTEMPTS = 3;
export const QUOTE_TTL_SECONDS = 600;
