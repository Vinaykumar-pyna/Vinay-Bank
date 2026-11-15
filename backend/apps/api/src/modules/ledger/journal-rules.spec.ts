import { GL, isBalanced, journalLines, reversalLines, splitFee } from './journal-rules';

const SAVINGS = '000210000014';
const CURRENT = '000120000013';
const id = 'x';

describe('journal rules (double entry)', () => {
  it('moves deposits between two customers for an internal transfer', () => {
    const lines = journalLines({
      type: 'TRANSFER',
      rail: 'INTERNAL',
      amount: 50_000,
      fee: 0,
      from: { accountId: id, accountNumber: SAVINGS },
      to: { accountId: id, accountNumber: CURRENT },
    });
    expect(lines).toEqual([
      { glCode: GL.SAVINGS_DEPOSITS, accountNumber: SAVINGS, debit: 50_000, credit: 0 },
      { glCode: GL.CURRENT_DEPOSITS, accountNumber: CURRENT, debit: 0, credit: 50_000 },
    ]);
  });

  it('books the charge and GST separately on an IMPS payment', () => {
    // Rs 15 + 18% GST = Rs 17.70
    expect(splitFee(1_770)).toEqual({ base: 1_500, gst: 270 });
    const lines = journalLines({
      type: 'TRANSFER',
      rail: 'IMPS',
      amount: 2_00_000_00,
      fee: 1_770,
      from: { accountId: id, accountNumber: SAVINGS },
      to: { accountNumber: '50100234567812' },
    });
    expect(lines).toEqual(
      expect.arrayContaining([
        { glCode: GL.SAVINGS_DEPOSITS, accountNumber: SAVINGS, debit: 2_00_017_70, credit: 0 },
        { glCode: GL.CLEARING, accountNumber: null, debit: 0, credit: 2_00_000_00 },
        { glCode: GL.FEE_INCOME, accountNumber: null, debit: 0, credit: 1_500 },
        { glCode: GL.GST_PAYABLE, accountNumber: null, debit: 0, credit: 270 },
      ]),
    );
    expect(isBalanced(lines)).toBe(true);
  });

  it.each([
    ['CASH_DEPOSIT', 'CASH', GL.CASH as string],
    ['INTEREST_CREDIT', 'SYSTEM', GL.INTEREST_EXPENSE as string],
    ['SALARY_CREDIT', 'NEFT', GL.CLEARING as string],
  ])('credits the customer for %s against the right source', (type, rail, gl) => {
    const lines = journalLines({
      type,
      rail,
      amount: 1_000,
      fee: 0,
      to: { accountId: id, accountNumber: SAVINGS },
    });
    expect(lines[0]).toEqual({ glCode: gl, accountNumber: null, debit: 1_000, credit: 0 });
    expect(isBalanced(lines)).toBe(true);
  });

  it.each([
    ['CASH_WITHDRAWAL', 'CASH', GL.CASH as string],
    ['ATM_WITHDRAWAL', 'CARD', GL.CARD_SETTLEMENT as string],
    ['CARD_PAYMENT', 'CARD', GL.CARD_SETTLEMENT as string],
  ])('debits the customer for %s against the right destination', (type, rail, gl) => {
    const lines = journalLines({
      type,
      rail,
      amount: 2_000,
      fee: 0,
      from: { accountId: id, accountNumber: CURRENT },
    });
    expect(lines[1]).toEqual({ glCode: gl, accountNumber: null, debit: 0, credit: 2_000 });
  });

  it('reverses an entry by swapping debits and credits', () => {
    const original = journalLines({
      type: 'ATM_WITHDRAWAL',
      rail: 'CARD',
      amount: 3_000,
      fee: 0,
      from: { accountId: id, accountNumber: SAVINGS },
    });
    const reversed = reversalLines(original);
    expect(reversed[0]).toMatchObject({ accountNumber: SAVINGS, debit: 0, credit: 3_000 });
    expect(isBalanced(reversed)).toBe(true);
  });
});
