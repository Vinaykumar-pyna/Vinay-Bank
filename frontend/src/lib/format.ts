/**
 * Formatting helpers. Amounts arrive from the API as integer paise.
 */
const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrCompact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** 12345678 paise -> "₹1,23,456.78" */
export function formatMoney(paise: number): string {
  return inr.format(paise / 100);
}

/** 1234567800 paise -> "₹1.2 Cr" (for charts and stat tiles) */
export function formatMoneyCompact(paise: number): string {
  return inrCompact.format(paise / 100);
}

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** 20000000 paise -> "₹2,00,000" (whole rupees, for limits and thresholds) */
export function formatRupees(paise: number): string {
  return inrWhole.format(paise / 100);
}

/** plural(1, 'transaction') -> "1 transaction"; plural(1200, 'account') -> "1,200 accounts" */
export function plural(count: number, noun: string): string {
  return `${count.toLocaleString('en-IN')} ${noun}${count === 1 ? '' : 's'}`;
}

/** "Good morning" / "Good afternoon" / "Good evening" for the local time. */
export function greeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const RUPEE_INPUT = /^(\d{1,13})(?:\.(\d{1,2}))?$/;

/**
 * Converts a rupee amount typed by the user ("1500.5") into paise using string
 * arithmetic, avoiding floating point errors. Returns null for invalid input.
 */
export function rupeesToPaise(input: string): number | null {
  const match = RUPEE_INPUT.exec(input.trim().replace(/,/g, ''));
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

export function paiseToRupeeInput(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const fraction = paise % 100;
  return fraction === 0 ? String(rupees) : `${rupees}.${String(fraction).padStart(2, '0')}`;
}

const dateTime = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const dateOnly = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function formatDateTime(value: string | Date): string {
  return dateTime.format(new Date(value));
}

export function formatDate(value: string | Date): string {
  return dateOnly.format(new Date(value));
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

/** "2 minutes ago", "yesterday", "just now" */
export function formatRelative(value: string | Date, now: Date = new Date()): string {
  const seconds = Math.round((new Date(value).getTime() - now.getTime()) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.trunc(seconds / size), unit);
  }
  return 'just now';
}

/** "000110000427" -> "XXXX XXXX 0427" */
export function maskAccount(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber;
  const masked = 'X'.repeat(accountNumber.length - 4) + accountNumber.slice(-4);
  // Group in fours from the right, so the last four digits always stay together.
  return masked.replace(/\B(?=(.{4})+$)/g, ' ');
}

export function initials(firstName?: string, lastName?: string): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

/** Readable client IP: loopback addresses (IPv4, IPv6, IPv4-mapped IPv6) become "localhost". */
export function formatIp(ip?: string): string {
  if (!ip) return 'Unknown IP';
  if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') return 'localhost';
  return ip.replace(/^::ffff:/, '');
}
