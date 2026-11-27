import { IFSC_PATTERN } from '../validators/banking.validators';
import { BANK_IFSC_PREFIX } from './app.constants';
import { BANKS, findBankByIfsc } from './banks';

describe('supported banks', () => {
  it('lists Vinay Bank first, then each bank once with a valid example IFSC', () => {
    expect(BANKS[0]).toMatchObject({ code: BANK_IFSC_PREFIX, isInternal: true });
    expect(new Set(BANKS.map((b) => b.code)).size).toBe(BANKS.length);
    for (const b of BANKS) {
      expect(b.code).toMatch(/^[A-Z]{4}$/);
      expect(IFSC_PATTERN.test(b.exampleIfsc)).toBe(true);
      expect(b.exampleIfsc.startsWith(b.code)).toBe(true);
    }
    expect(BANKS.filter((b) => b.isInternal)).toHaveLength(1);
  });

  it('includes Bank of Baroda alongside the other banks', () => {
    expect(BANKS.map((b) => b.name)).toEqual(
      expect.arrayContaining(['Bank of Baroda', 'State Bank of India', 'HDFC Bank', 'ICICI Bank']),
    );
    expect(findBankByIfsc('BARB0ANDHER')?.name).toBe('Bank of Baroda');
  });

  it('finds the bank from any IFSC of it, in any letter case', () => {
    expect(findBankByIfsc(' barb0vjmumb ')?.code).toBe('BARB');
    expect(findBankByIfsc('SBIN0001234')?.name).toBe('State Bank of India');
    expect(findBankByIfsc('ZZZZ0000001')).toBeUndefined();
  });
});
