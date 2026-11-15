/**
 * Round axis ticks (0, 25K, 50K, ...) instead of whatever the chart library
 * picks. The step is 1, 2, 2.5 or 5 times a power of ten, chosen so that about
 * `count` intervals cover `max`. Works on paise, rounding steps to whole rupees.
 */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= raw)!;
  const ticks: number[] = [];
  for (let value = 0; value < max + step; value += step) {
    ticks.push(Math.round(value));
    if (value >= max) break;
  }
  return ticks;
}
