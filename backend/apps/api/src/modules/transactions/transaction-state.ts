import { TransactionStatus as S } from '../../common/enums/banking.enums';

/**
 * Transaction lifecycle as an explicit state machine (State pattern). Any code
 * that changes a status must go through `assertTransition`, so an illegal move
 * such as COMPLETED -> PENDING_APPROVAL fails loudly instead of corrupting data.
 *
 *   PENDING_APPROVAL --approve--> PROCESSING --settle--> COMPLETED --return--> REVERSED
 *          |                         |
 *          +--reject--> REJECTED     +--fail--> FAILED
 */
const ALLOWED: Record<S, readonly S[]> = {
  [S.PENDING_APPROVAL]: [S.PROCESSING, S.COMPLETED, S.REJECTED, S.FAILED],
  [S.PROCESSING]: [S.COMPLETED, S.FAILED, S.REVERSED],
  [S.COMPLETED]: [S.REVERSED],
  [S.FAILED]: [],
  [S.REJECTED]: [],
  [S.REVERSED]: [],
};

export function canTransition(from: S, to: S): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: S, to: S): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal transaction status change ${from} -> ${to}`);
  }
}

export function isFinal(status: S): boolean {
  return ALLOWED[status].length === 0;
}
