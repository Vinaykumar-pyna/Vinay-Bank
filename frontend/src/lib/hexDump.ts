/** Classic hex dump: offset, 16 bytes in hex, then printable ASCII. */
export function hexDump(hex: string): string {
  const rows: string[] = [];
  for (let i = 0; i < hex.length; i += 32) {
    const chunk = hex.slice(i, i + 32);
    const bytes = chunk.match(/.{1,2}/g) ?? [];
    const ascii = bytes
      .map((b) => {
        const code = Number.parseInt(b, 16);
        return code >= 0x20 && code <= 0x7e ? String.fromCharCode(code) : '.';
      })
      .join('');
    rows.push(`${(i / 2).toString(16).padStart(4, '0')}  ${bytes.join(' ').padEnd(47)}  ${ascii}`);
  }
  return rows.join('\n');
}
