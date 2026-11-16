import { BANK_IFSC_PREFIX } from './app.constants';

export interface Branch {
  code: string;
  name: string;
  city: string;
  state: string;
  address: string;
  ifsc: string;
}

const branch = (
  code: string,
  name: string,
  city: string,
  state: string,
  address: string,
): Branch => ({
  code,
  name,
  city,
  state,
  address,
  ifsc: `${BANK_IFSC_PREFIX}0${code.padStart(6, '0')}`,
});

/** Vinay Bank branches. IFSC = "VINB" + "0" + 6-character branch code. */
export const BRANCHES: readonly Branch[] = [
  branch(
    '0001',
    'Mumbai Fort (Main Branch)',
    'Mumbai',
    'Maharashtra',
    '21 Dalal Street, Fort, Mumbai 400001',
  ),
  branch('0002', 'Pune Koregaon Park', 'Pune', 'Maharashtra', 'Lane 5, Koregaon Park, Pune 411001'),
  branch(
    '0003',
    'Bengaluru Indiranagar',
    'Bengaluru',
    'Karnataka',
    '100 Feet Road, Indiranagar, Bengaluru 560038',
  ),
  branch(
    '0004',
    'New Delhi Connaught Place',
    'New Delhi',
    'Delhi',
    'Block A, Connaught Place, New Delhi 110001',
  ),
];

export const DEFAULT_BRANCH_CODE = '0001';

export function findBranchByCode(code: string): Branch | undefined {
  return BRANCHES.find((b) => b.code === code);
}

export function findBranchByIfsc(ifsc: string): Branch | undefined {
  return BRANCHES.find((b) => b.ifsc === ifsc.toUpperCase());
}

export function isOwnIfsc(ifsc: string): boolean {
  return ifsc.toUpperCase().startsWith(BANK_IFSC_PREFIX);
}
