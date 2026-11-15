import type { GlAccountType } from './entities/ledger.entities';

/** General ledger accounts used by ArthaBank (a simplified Indian bank chart of accounts). */
export const GL = {
  CASH: '1001',
  CLEARING: '1101',
  CARD_SETTLEMENT: '1201',
  SAVINGS_DEPOSITS: '2001',
  CURRENT_DEPOSITS: '2002',
  GST_PAYABLE: '2301',
  FEE_INCOME: '4001',
  INTEREST_EXPENSE: '5001',
} as const;

export const CHART_OF_ACCOUNTS: { code: string; name: string; type: GlAccountType }[] = [
  { code: GL.CASH, name: 'Cash in branch vaults', type: 'ASSET' },
  { code: GL.CLEARING, name: 'Settlement with RBI (NEFT, RTGS, IMPS)', type: 'ASSET' },
  { code: GL.CARD_SETTLEMENT, name: 'Card network settlement (ATM, POS)', type: 'ASSET' },
  { code: GL.SAVINGS_DEPOSITS, name: 'Customer deposits: savings', type: 'LIABILITY' },
  { code: GL.CURRENT_DEPOSITS, name: 'Customer deposits: current', type: 'LIABILITY' },
  { code: GL.GST_PAYABLE, name: 'GST payable on charges', type: 'LIABILITY' },
  { code: GL.FEE_INCOME, name: 'Fee and commission income', type: 'INCOME' },
  { code: GL.INTEREST_EXPENSE, name: 'Interest paid on deposits', type: 'EXPENSE' },
];

/** The fields of a core banking transaction that accounting needs. */
export interface LedgerTransaction {
  type: string;
  rail: string;
  amount: number;
  fee: number;
  from?: { accountId?: unknown; accountNumber: string; name?: string };
  to?: { accountId?: unknown; accountNumber: string; name?: string };
}

export interface LineDraft {
  glCode: string;
  accountNumber: string | null;
  debit: number;
  credit: number;
}

/** Deposit GL by product: account numbers carry the product code in digits 5-6 (10 savings, 20 current). */
export function depositGl(accountNumber: string): string {
  return accountNumber.slice(4, 6) === '20' ? GL.CURRENT_DEPOSITS : GL.SAVINGS_DEPOSITS;
}

/** Charges include 18% GST: fee = base + GST, so base = fee / 1.18. */
export function splitFee(fee: number): { base: number; gst: number } {
  const base = Math.round((fee * 100) / 118);
  return { base, gst: fee - base };
}

/** Where money comes from when it does not come from one of our customers' accounts. */
function externalSource(type: string): string {
  if (type === 'CASH_DEPOSIT') return GL.CASH;
  if (type === 'INTEREST_CREDIT') return GL.INTEREST_EXPENSE;
  return GL.CLEARING;
}

/** Where money goes when it does not go to one of our customers' accounts. */
function externalDestination(type: string, rail: string): string {
  if (type === 'CASH_WITHDRAWAL') return GL.CASH;
  if (rail === 'CARD' || type === 'ATM_WITHDRAWAL' || type === 'CARD_PAYMENT')
    return GL.CARD_SETTLEMENT;
  return GL.CLEARING;
}

/**
 * Double-entry lines for a completed (or, for NEFT, debited) transaction.
 * From the bank's side, customer deposits are liabilities: money leaving a
 * customer account is a debit to deposits, money arriving is a credit.
 * The result always balances: total debits equal total credits.
 */
export function journalLines(txn: LedgerTransaction): LineDraft[] {
  const { base, gst } = splitFee(txn.fee);
  const lines: LineDraft[] = [];
  const internalFrom = Boolean(txn.from?.accountId);
  const internalTo = Boolean(txn.to?.accountId);

  lines.push(
    internalFrom
      ? {
          glCode: depositGl(txn.from!.accountNumber),
          accountNumber: txn.from!.accountNumber,
          debit: txn.amount + txn.fee,
          credit: 0,
        }
      : {
          glCode: externalSource(txn.type),
          accountNumber: null,
          debit: txn.amount + txn.fee,
          credit: 0,
        },
  );
  lines.push(
    internalTo
      ? {
          glCode: depositGl(txn.to!.accountNumber),
          accountNumber: txn.to!.accountNumber,
          debit: 0,
          credit: txn.amount,
        }
      : {
          glCode: externalDestination(txn.type, txn.rail),
          accountNumber: null,
          debit: 0,
          credit: txn.amount,
        },
  );
  if (base > 0) lines.push({ glCode: GL.FEE_INCOME, accountNumber: null, debit: 0, credit: base });
  if (gst > 0) lines.push({ glCode: GL.GST_PAYABLE, accountNumber: null, debit: 0, credit: gst });
  return lines;
}

/** A reversal mirrors the original entry: every debit becomes a credit and vice versa. */
export function reversalLines(original: LineDraft[]): LineDraft[] {
  return original.map((line) => ({ ...line, debit: line.credit, credit: line.debit }));
}

export function isBalanced(lines: LineDraft[]): boolean {
  const debit = lines.reduce((sum, l) => sum + l.debit, 0);
  const credit = lines.reduce((sum, l) => sum + l.credit, 0);
  return debit === credit && debit > 0;
}
