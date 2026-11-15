import { assessLocally, decisionFor, levelFor } from './risk-rules';
import type { RiskContext } from './risk.types';

const RUPEE = 100;
const base: RiskContext = {
  amount: 5_000 * RUPEE,
  rail: 'IMPS',
  channel: 'NET_BANKING',
  ownAccountTransfer: false,
  beneficiaryAgeHours: 24 * 30,
  transfersLastHour: 0,
  amountLast24h: 0,
  dailyLimit: 500_000 * RUPEE,
  averageDebit90d: 3_000 * RUPEE,
  hourOfDayIst: 14,
  accountAgeDays: 400,
  kycVerified: true,
};

describe('local risk rules', () => {
  it('allows an ordinary payment to an established payee', () => {
    expect(assessLocally(base)).toMatchObject({
      score: 0,
      level: 'LOW',
      decision: 'ALLOW',
      reasons: [],
    });
  });

  it('asks for step-up verification on a large payment', () => {
    const result = assessLocally({
      ...base,
      amount: 150_000 * RUPEE,
      averageDebit90d: 50_000 * RUPEE,
    });
    expect(result.decision).toBe('ALLOW');
    // 20 (large) + 25 (new payee) + 5 (round figure) = 50 -> MEDIUM
    const bigToNewPayee = assessLocally({
      ...base,
      amount: 150_000 * RUPEE,
      beneficiaryAgeHours: 5,
      averageDebit90d: 50_000 * RUPEE,
    });
    expect(bigToNewPayee.level).toBe('MEDIUM');
    expect(bigToNewPayee.decision).toBe('STEP_UP');
  });

  it('sends a risky combination to a manager for review', () => {
    // 20 (large) + 25 (new payee) + 20 (unusual vs average) = 65 -> HIGH
    const result = assessLocally({
      ...base,
      amount: 123_456 * RUPEE,
      beneficiaryAgeHours: 3,
      averageDebit90d: 2_000 * RUPEE,
    });
    expect(result.score).toBe(65);
    expect(result.decision).toBe('REVIEW');
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'Payee was added in the last 24 hours',
        'Much larger than your usual payments',
      ]),
    );
  });

  it('blocks the classic account-takeover pattern', () => {
    const result = assessLocally({
      ...base,
      amount: 500_000 * RUPEE,
      beneficiaryAgeHours: 0.2,
      hourOfDayIst: 2,
      transfersLastHour: 6,
    });
    expect(result.score).toBe(100);
    expect(result.decision).toBe('BLOCK');
  });

  it('trusts transfers between the customer’s own accounts', () => {
    const result = assessLocally({
      ...base,
      amount: 900_000 * RUPEE,
      ownAccountTransfer: true,
      beneficiaryAgeHours: null,
    });
    expect(result).toMatchObject({ score: 0, decision: 'ALLOW' });
  });

  it('maps scores to levels and decisions at the boundaries', () => {
    expect(levelFor(29)).toBe('LOW');
    expect(levelFor(30)).toBe('MEDIUM');
    expect(levelFor(60)).toBe('HIGH');
    expect(levelFor(80)).toBe('CRITICAL');
    expect(decisionFor('HIGH')).toBe('REVIEW');
  });
});
