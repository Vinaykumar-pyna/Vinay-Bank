import {
  formatMoney,
  formatIp,
  formatRelative,
  formatRupees,
  initials,
  maskAccount,
  paiseToRupeeInput,
  plural,
  rupeesToPaise,
  titleCase,
} from './format';

describe('format helpers', () => {
  it('formats paise as Indian rupees', () => {
    expect(formatMoney(12345678)).toBe('₹1,23,456.78');
    expect(formatMoney(5)).toBe('₹0.05');
  });

  it('parses rupee input into paise without floating point errors', () => {
    expect(rupeesToPaise('1500')).toBe(150000);
    expect(rupeesToPaise('0.29')).toBe(29);
    expect(rupeesToPaise('1,25,000.5')).toBe(12500050);
    expect(rupeesToPaise('12.345')).toBeNull();
    expect(rupeesToPaise('-5')).toBeNull();
    expect(rupeesToPaise('abc')).toBeNull();
  });

  it('converts paise back to an editable rupee string', () => {
    expect(paiseToRupeeInput(150000)).toBe('1500');
    expect(paiseToRupeeInput(150005)).toBe('1500.05');
  });

  it('formats relative times', () => {
    const now = new Date('2026-11-13T12:00:00Z');
    expect(formatRelative('2026-11-13T11:58:00Z', now)).toBe('2 minutes ago');
    expect(formatRelative('2026-11-12T12:00:00Z', now)).toBe('yesterday');
    expect(formatRelative('2026-11-13T11:59:50Z', now)).toBe('just now');
  });

  it('shows loopback addresses as localhost', () => {
    expect(formatIp('::1')).toBe('localhost');
    expect(formatIp('::ffff:10.0.0.7')).toBe('10.0.0.7');
    expect(formatIp(undefined)).toBe('Unknown IP');
  });

  it('masks account numbers in groups of four', () => {
    expect(maskAccount('000110000427')).toBe('XXXX XXXX 0427');
  });

  it('builds initials and title case labels', () => {
    expect(initials('Priya', 'Sharma')).toBe('PS');
    expect(initials()).toBe('?');
    expect(titleCase('PENDING_APPROVAL')).toBe('Pending Approval');
  });

  it('formats whole-rupee thresholds without paise', () => {
    expect(formatRupees(200_000 * 100)).toBe('₹2,00,000');
    expect(formatRupees(50_000 * 100)).toBe('₹50,000');
  });

  it('pluralises counts with Indian digit grouping', () => {
    expect(plural(1, 'transaction')).toBe('1 transaction');
    expect(plural(0, 'transaction')).toBe('0 transactions');
    expect(plural(125000, 'account')).toBe('1,25,000 accounts');
  });

  it('groups masked account numbers from the right', () => {
    expect(maskAccount('000110000427')).toBe('XXXX XXXX 0427');
    expect(maskAccount('50100234567812')).toBe('XX XXXX XXXX 7812');
  });
});
