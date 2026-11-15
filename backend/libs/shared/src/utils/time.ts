/** India Standard Time is UTC+05:30 and has no daylight saving. */
export const IST_OFFSET_MINUTES = 330;
const OFFSET_MS = IST_OFFSET_MINUTES * 60_000;

/** Midnight IST of the given instant, as a UTC Date. Daily limits reset at this moment. */
export function startOfIstDay(at: Date = new Date()): Date {
  const shifted = new Date(at.getTime() + OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - OFFSET_MS);
}

/** Hour of day (0-23) in IST. */
export function istHour(at: Date = new Date()): number {
  return new Date(at.getTime() + OFFSET_MS).getUTCHours();
}

/** YYYYMMDD in IST, e.g. for reference numbers and batch ids. */
export function istDateStamp(at: Date = new Date()): string {
  return new Date(at.getTime() + OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, '');
}

/** First day of the IST month `monthsBack` months before `at`. */
export function startOfIstMonth(at: Date = new Date(), monthsBack = 0): Date {
  const shifted = new Date(at.getTime() + OFFSET_MS);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() - monthsBack, 1);
  return new Date(start - OFFSET_MS);
}
