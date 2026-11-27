import { BANK_IFSC_PREFIX, BANK_NAME } from './app.constants';

export interface Bank {
  /** The first four letters of every IFSC the bank issues. */
  code: string;
  name: string;
  /** A real branch IFSC of the bank, shown as an example when adding a payee. */
  exampleIfsc: string;
  /** Payees at Vinay Bank itself are paid instantly over the internal rail. */
  isInternal: boolean;
}

const bank = (code: string, name: string, exampleIfsc: string): Bank => ({
  code,
  name,
  exampleIfsc,
  isInternal: false,
});

/**
 * The banks customers pick from when adding a payee: Vinay Bank first, then
 * the other banks alphabetically. It is the single list used everywhere: the
 * web app's bank picker (GET /banks) and the IFSC lookup, which names the
 * bank from its code when the live IFSC directory cannot be reached. Payees
 * at banks not listed here can still be added by IFSC while the directory is up.
 */
export const BANKS: readonly Bank[] = [
  { code: BANK_IFSC_PREFIX, name: BANK_NAME, exampleIfsc: 'VINB0000001', isInternal: true },
  bank('UTIB', 'Axis Bank', 'UTIB0000004'),
  bank('BARB', 'Bank of Baroda', 'BARB0ANDHER'),
  bank('BKID', 'Bank of India', 'BKID0000001'),
  bank('CNRB', 'Canara Bank', 'CNRB0000102'),
  bank('FDRL', 'Federal Bank', 'FDRL0001001'),
  bank('HDFC', 'HDFC Bank', 'HDFC0000240'),
  bank('ICIC', 'ICICI Bank', 'ICIC0000001'),
  bank('IDFB', 'IDFC First Bank', 'IDFB0040101'),
  bank('IDIB', 'Indian Bank', 'IDIB000C001'),
  bank('INDB', 'IndusInd Bank', 'INDB0000001'),
  bank('KKBK', 'Kotak Mahindra Bank', 'KKBK0000958'),
  bank('PUNB', 'Punjab National Bank', 'PUNB0015300'),
  bank('SBIN', 'State Bank of India', 'SBIN0000300'),
  bank('UBIN', 'Union Bank of India', 'UBIN0530778'),
  bank('YESB', 'Yes Bank', 'YESB0000004'),
];

/** The bank that issued an IFSC, from its first four letters. */
export function findBankByIfsc(ifsc: string): Bank | undefined {
  const code = ifsc.trim().slice(0, 4).toUpperCase();
  return BANKS.find((b) => b.code === code);
}
