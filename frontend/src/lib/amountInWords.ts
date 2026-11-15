const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}

function belowThousand(n: number): string {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return [hundred ? `${ONES[hundred]} Hundred` : '', rest ? belowHundred(rest) : '']
    .filter(Boolean)
    .join(' ');
}

/**
 * Whole rupees in words using the Indian numbering system (lakh, crore),
 * as printed on cheques and transfer confirmations.
 * 12500050 paise -> "Rupees One Lakh Twenty Five Thousand and Fifty Paise Only"
 */
export function amountInWords(paise: number): string {
  if (!Number.isFinite(paise) || paise < 0) return '';
  const rupees = Math.floor(paise / 100);
  const remainder = Math.round(paise % 100);
  if (rupees === 0 && remainder === 0) return 'Rupees Zero Only';

  const parts: string[] = [];
  let n = rupees;
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;

  if (crore)
    parts.push(
      `${crore >= 1000 ? amountInWords(crore * 100).replace(/^Rupees | Only$/g, '') : belowThousand(crore)} Crore`,
    );
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));

  const words = parts.join(' ');
  const paiseWords = remainder ? `${words ? ' and ' : ''}${belowHundred(remainder)} Paise` : '';
  return `Rupees ${words}${paiseWords} Only`.replace(/\s+/g, ' ');
}
