import { niceTicks } from './niceTicks';

describe('niceTicks', () => {
  it('produces round steps covering the maximum', () => {
    // Rs 1,20,044 in paise -> steps of Rs 50,000
    expect(niceTicks(12_004_400)).toEqual([0, 5_000_000, 10_000_000, 15_000_000]);
    expect(niceTicks(9_000)).toEqual([0, 2_500, 5_000, 7_500, 10_000]);
    expect(niceTicks(100)).toEqual([0, 25, 50, 75, 100]);
  });

  it('handles empty data', () => {
    expect(niceTicks(0)).toEqual([0]);
    expect(niceTicks(Number.NaN)).toEqual([0]);
  });
});
