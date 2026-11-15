import { TransactionStatus as S } from '../../common/enums/banking.enums';
import { assertTransition, canTransition, isFinal } from './transaction-state';

describe('transaction state machine', () => {
  it('allows the normal lifecycle', () => {
    expect(canTransition(S.PENDING_APPROVAL, S.PROCESSING)).toBe(true);
    expect(canTransition(S.PROCESSING, S.COMPLETED)).toBe(true);
    expect(canTransition(S.COMPLETED, S.REVERSED)).toBe(true);
    expect(canTransition(S.PENDING_APPROVAL, S.REJECTED)).toBe(true);
  });

  it('rejects illegal moves', () => {
    expect(canTransition(S.COMPLETED, S.PENDING_APPROVAL)).toBe(false);
    expect(canTransition(S.REJECTED, S.COMPLETED)).toBe(false);
    expect(() => assertTransition(S.REVERSED, S.COMPLETED)).toThrow(
      'Illegal transaction status change',
    );
  });

  it('identifies final states', () => {
    expect(isFinal(S.REJECTED)).toBe(true);
    expect(isFinal(S.REVERSED)).toBe(true);
    expect(isFinal(S.PROCESSING)).toBe(false);
  });
});
