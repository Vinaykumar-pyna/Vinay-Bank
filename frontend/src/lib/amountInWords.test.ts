import { amountInWords } from './amountInWords';

describe('amountInWords (Indian numbering)', () => {
  it.each([
    [0, 'Rupees Zero Only'],
    [100, 'Rupees One Only'],
    [1_500_00, 'Rupees One Thousand Five Hundred Only'],
    [12_500_050, 'Rupees One Lakh Twenty Five Thousand and Fifty Paise Only'],
    [2_00_000_00, 'Rupees Two Lakh Only'],
    [10_00_00_000_00, 'Rupees Ten Crore Only'],
    [99, 'Rupees Ninety Nine Paise Only'],
    [
      1_23_45_678_90,
      'Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Ninety Paise Only',
    ],
  ])('%p paise -> %p', (paise, words) => {
    expect(amountInWords(paise)).toBe(words);
  });

  it('returns an empty string for invalid input', () => {
    expect(amountInWords(-1)).toBe('');
    expect(amountInWords(Number.NaN)).toBe('');
  });
});
