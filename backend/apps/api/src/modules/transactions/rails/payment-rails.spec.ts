import { PaymentRail } from '../../../common/enums/banking.enums';
import { railPolicy } from './payment-rails';

const RUPEE = 100;
const LAKH = 100_000 * RUPEE;

describe('payment rail policies', () => {
  it('IMPS: free up to Rs 1,000, then Rs 5 or Rs 15 plus 18% GST, max Rs 5 lakh', () => {
    const imps = railPolicy(PaymentRail.IMPS);
    expect(imps.fee(1_000 * RUPEE)).toBe(0);
    expect(imps.fee(1_001 * RUPEE)).toBe(590); // Rs 5.90
    expect(imps.fee(2 * LAKH)).toBe(1770); // Rs 17.70
    expect(imps.validate(5 * LAKH)).toBeNull();
    expect(imps.validate(5 * LAKH + 1)).toContain('at most');
    expect(imps.settlement).toBe('INSTANT');
  });

  it('NEFT: free and settled in deferred batches', () => {
    const neft = railPolicy(PaymentRail.NEFT);
    expect(neft.fee(10 * LAKH)).toBe(0);
    expect(neft.settlement).toBe('DEFERRED');
    expect(neft.validate(50)).toContain('at least');
  });

  it('RTGS: minimum Rs 2 lakh', () => {
    const rtgs = railPolicy(PaymentRail.RTGS);
    expect(rtgs.validate(2 * LAKH - 1)).toContain('2,00,000');
    expect(rtgs.validate(2 * LAKH)).toBeNull();
  });

  it('internal transfers are free and unrestricted', () => {
    const internal = railPolicy(PaymentRail.INTERNAL);
    expect(internal.fee(10_000_000)).toBe(0);
    expect(internal.validate(10_000_000)).toBeNull();
  });

  it('throws for rails without a transfer policy', () => {
    expect(() => railPolicy(PaymentRail.CARD)).toThrow();
  });
});
