import { csvCell, escapeRegex, toCsv } from './text';

describe('text utilities', () => {
  it('escapes regex metacharacters so user input matches literally', () => {
    const pattern = new RegExp(escapeRegex('a.b*c(1)'));
    expect(pattern.test('a.b*c(1)')).toBe(true);
    expect(pattern.test('aXbbbc1')).toBe(false);
  });

  it('neutralises spreadsheet formulas in CSV cells (CSV injection)', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell('-2+3')).toBe('"\'-2+3"');
    expect(csvCell('Salary')).toBe('"Salary"');
    expect(csvCell(null)).toBe('""');
  });

  it('builds CRLF-separated CSV', () => {
    expect(
      toCsv([
        ['a', 1],
        ['b', 2],
      ]),
    ).toBe('"a","1"\r\n"b","2"');
  });
});
