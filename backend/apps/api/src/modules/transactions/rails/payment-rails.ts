import { applyBasisPoints, formatInr } from '@app/shared';
import { LAKH, RUPEE } from '../../../common/constants/limits';
import { PaymentRail } from '../../../common/enums/banking.enums';

const GST_BPS = 1800; // 18% GST on bank charges

/**
 * Strategy pattern: each payment rail encapsulates its own rules (limits,
 * charges, settlement timing). Adding UPI later means adding one class, not
 * editing if/else chains across the transfer service (Open/Closed principle).
 */
export interface RailPolicy {
  readonly rail: PaymentRail;
  readonly label: string;
  readonly settlement: 'INSTANT' | 'DEFERRED';
  readonly description: string;
  /** Returns an error message, or null when the amount is allowed on this rail. */
  validate(amount: number): string | null;
  /** Total charge in paise, including GST. */
  fee(amount: number): number;
}

class InternalRail implements RailPolicy {
  readonly rail = PaymentRail.INTERNAL;
  readonly label = 'Vinay Bank transfer';
  readonly settlement = 'INSTANT' as const;
  readonly description = 'Instant, free, 24x7 between Vinay Bank accounts';
  validate(): string | null {
    return null;
  }
  fee(): number {
    return 0;
  }
}

/** Immediate Payment Service: instant, 24x7, up to Rs 5 lakh per transaction. */
class ImpsRail implements RailPolicy {
  readonly rail = PaymentRail.IMPS;
  readonly label = 'IMPS';
  readonly settlement = 'INSTANT' as const;
  readonly description = 'Instant, 24x7, up to Rs 5 lakh';
  validate(amount: number): string | null {
    return amount > 5 * LAKH ? `IMPS allows at most ${formatInr(5 * LAKH)} per transfer` : null;
  }
  fee(amount: number): number {
    if (amount <= 1_000 * RUPEE) return 0;
    const base = amount <= LAKH ? 5 * RUPEE : 15 * RUPEE;
    return base + applyBasisPoints(base, GST_BPS);
  }
}

/** National Electronic Funds Transfer: settled in half-hourly batches, free online. */
class NeftRail implements RailPolicy {
  readonly rail = PaymentRail.NEFT;
  readonly label = 'NEFT';
  readonly settlement = 'DEFERRED' as const;
  readonly description = 'Settles in the next half-hourly batch, free';
  validate(amount: number): string | null {
    return amount < RUPEE ? 'NEFT needs at least Rs 1' : null;
  }
  fee(): number {
    return 0;
  }
}

/** Real Time Gross Settlement: high-value, instant, minimum Rs 2 lakh. */
class RtgsRail implements RailPolicy {
  readonly rail = PaymentRail.RTGS;
  readonly label = 'RTGS';
  readonly settlement = 'INSTANT' as const;
  readonly description = 'Real-time, for Rs 2 lakh and above, free';
  validate(amount: number): string | null {
    return amount < 2 * LAKH ? `RTGS is only for amounts of ${formatInr(2 * LAKH)} or more` : null;
  }
  fee(): number {
    return 0;
  }
}

const POLICIES: Partial<Record<PaymentRail, RailPolicy>> = {
  [PaymentRail.INTERNAL]: new InternalRail(),
  [PaymentRail.IMPS]: new ImpsRail(),
  [PaymentRail.NEFT]: new NeftRail(),
  [PaymentRail.RTGS]: new RtgsRail(),
};

export function railPolicy(rail: PaymentRail): RailPolicy {
  const policy = POLICIES[rail];
  if (!policy) throw new Error(`No transfer policy for rail ${rail}`);
  return policy;
}

export const EXTERNAL_RAILS = [PaymentRail.IMPS, PaymentRail.NEFT, PaymentRail.RTGS] as const;

export function describeRails() {
  return EXTERNAL_RAILS.map((rail) => {
    const policy = railPolicy(rail);
    return {
      rail,
      label: policy.label,
      description: policy.description,
      settlement: policy.settlement,
    };
  });
}
