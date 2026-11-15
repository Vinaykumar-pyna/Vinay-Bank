export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * What happens next:
 *  ALLOW   proceed normally
 *  STEP_UP require an extra verification (OTP / authenticator code)
 *  REVIEW  hold the funds and send to a branch manager (maker-checker)
 *  BLOCK   refuse the transaction
 */
export type RiskDecision = 'ALLOW' | 'STEP_UP' | 'REVIEW' | 'BLOCK';

/** Facts about a transfer that the rules look at. Amounts in paise. */
export interface RiskContext {
  amount: number;
  rail: string;
  channel: string;
  ownAccountTransfer: boolean;
  /** Hours since the beneficiary was added; null for own-account transfers. */
  beneficiaryAgeHours: number | null;
  transfersLastHour: number;
  amountLast24h: number;
  dailyLimit: number;
  averageDebit90d: number;
  hourOfDayIst: number;
  accountAgeDays: number;
  kycVerified: boolean;
}

export interface RiskRuleHit {
  rule: string;
  points: number;
  reason: string;
}

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  decision: RiskDecision;
  reasons: string[];
  hits: RiskRuleHit[];
  /** JAVA_ENGINE: Spring Boot risk microservice; LOCAL_RULES: in-process fallback */
  source: 'JAVA_ENGINE' | 'LOCAL_RULES';
  engineVersion: string;
}
