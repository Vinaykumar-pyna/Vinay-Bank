import type {
  RiskAssessment,
  RiskContext,
  RiskDecision,
  RiskLevel,
  RiskRuleHit,
} from './risk.types';

const RUPEE = 100;

/** A rule inspects the context and returns a hit (points + reason) or null. */
export interface RiskRule {
  readonly id: string;
  evaluate(ctx: RiskContext): RiskRuleHit | null;
}

const rule = (id: string, evaluate: (ctx: RiskContext) => [number, string] | null): RiskRule => ({
  id,
  evaluate: (ctx) => {
    const result = evaluate(ctx);
    return result ? { rule: id, points: result[0], reason: result[1] } : null;
  },
});

/**
 * Local fraud rules. They mirror the rules in the Java risk-engine
 * microservice (services/risk-engine), so decisions stay consistent when the
 * engine is unreachable and the API falls back to this implementation.
 */
export const RISK_RULES: readonly RiskRule[] = [
  rule('HIGH_AMOUNT', ({ amount }) => {
    if (amount >= 500_000 * RUPEE) return [35, 'Very large amount (Rs 5 lakh or more)'];
    if (amount >= 100_000 * RUPEE) return [20, 'Large amount (Rs 1 lakh or more)'];
    return null;
  }),
  rule('NEW_BENEFICIARY', ({ beneficiaryAgeHours }) => {
    if (beneficiaryAgeHours === null) return null;
    if (beneficiaryAgeHours < 1) return [35, 'Payee was added less than an hour ago'];
    if (beneficiaryAgeHours < 24) return [25, 'Payee was added in the last 24 hours'];
    return null;
  }),
  rule('VELOCITY', ({ transfersLastHour }) =>
    transfersLastHour >= 5 ? [20, `${transfersLastHour} transfers in the last hour`] : null,
  ),
  rule('DAILY_VOLUME', ({ amount, amountLast24h, dailyLimit }) =>
    dailyLimit > 0 && amountLast24h + amount >= 0.8 * dailyLimit
      ? [15, 'Close to the daily transfer limit']
      : null,
  ),
  rule('ODD_HOUR', ({ hourOfDayIst }) =>
    hourOfDayIst < 5 ? [10, 'Unusual time of day (midnight to 5 AM)'] : null,
  ),
  rule('UNUSUAL_AMOUNT', ({ amount, averageDebit90d }) =>
    averageDebit90d > 0 && amount > 5 * averageDebit90d && amount > 25_000 * RUPEE
      ? [20, 'Much larger than your usual payments']
      : null,
  ),
  rule('ROUND_AMOUNT', ({ amount }) =>
    amount >= 50_000 * RUPEE && amount % (10_000 * RUPEE) === 0
      ? [5, 'Large round-figure amount']
      : null,
  ),
  rule('NEW_ACCOUNT', ({ accountAgeDays }) =>
    accountAgeDays < 7 ? [10, 'Account opened in the last 7 days'] : null,
  ),
  rule('KYC_PENDING', ({ kycVerified }) => (kycVerified ? null : [10, 'KYC not yet verified'])),
];

export const LOCAL_ENGINE_VERSION = 'local-rules-1.0';

export function levelFor(score: number): RiskLevel {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

export function decisionFor(level: RiskLevel): RiskDecision {
  return ({ LOW: 'ALLOW', MEDIUM: 'STEP_UP', HIGH: 'REVIEW', CRITICAL: 'BLOCK' } as const)[level];
}

/** Scores a transfer: the sum of rule points, capped at 100. Own-account moves are trusted. */
export function assessLocally(
  ctx: RiskContext,
  rules: readonly RiskRule[] = RISK_RULES,
): RiskAssessment {
  const hits: RiskRuleHit[] = ctx.ownAccountTransfer
    ? []
    : rules.map((r) => r.evaluate(ctx)).filter((hit): hit is RiskRuleHit => hit !== null);
  const score = Math.min(
    100,
    hits.reduce((sum, hit) => sum + hit.points, 0),
  );
  const level = levelFor(score);
  return {
    score,
    level,
    decision: decisionFor(level),
    reasons: hits.map((hit) => hit.reason),
    hits,
    source: 'LOCAL_RULES',
    engineVersion: LOCAL_ENGINE_VERSION,
  };
}
