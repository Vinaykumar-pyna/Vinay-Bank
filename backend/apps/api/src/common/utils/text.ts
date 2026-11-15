/** Escapes user input before it is used inside a RegExp (prevents ReDoS and regex injection). */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Makes a value safe for a CSV cell: quotes it, and neutralises leading
 * =, +, -, @ (and tab/CR) so spreadsheet apps do not execute it as a formula
 * ("CSV injection", OWASP).
 */
export type CsvValue = string | number | boolean | null | undefined;

export function csvCell(value: CsvValue): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: CsvValue[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
