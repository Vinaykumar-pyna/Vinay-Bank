import { maskAccountNumber, maskCardNumber, maskEmail, maskPhone, maskTail } from './mask';

describe('mask helpers', () => {
  it('masks account numbers except the last four digits', () => {
    expect(maskAccountNumber('000110000427')).toBe('XXXXXXXX0427');
    expect(maskAccountNumber('123')).toBe('123');
  });

  it('masks card numbers per PCI DSS (first 6, last 4)', () => {
    expect(maskCardNumber('6001231234564321')).toBe('600123******4321');
    expect(maskCardNumber('6001 2312 3456 4321')).toBe('600123******4321');
    expect(maskCardNumber('1234')).toBe('****');
  });

  it('masks e-mail local parts', () => {
    expect(maskEmail('priya.sharma@example.com')).toBe('p**********a@example.com');
    expect(maskEmail('ab@example.com')).toBe('a*@example.com');
    expect(maskEmail('not-an-email')).toBe('***');
  });

  it('masks phone numbers', () => {
    expect(maskPhone('+91 98765 43210')).toBe('********3210');
    expect(maskPhone('9876543210')).toBe('******3210');
  });

  it('masks generic identifiers', () => {
    expect(maskTail('ABCDE1234F')).toBe('XXXXXX234F');
    expect(maskTail('ABCDE1234F', 2, '*')).toBe('********4F');
  });
});
