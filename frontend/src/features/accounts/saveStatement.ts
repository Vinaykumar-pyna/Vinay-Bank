export type StatementFormat = 'csv' | 'xml' | 'html';

/**
 * Saves a statement file, or shows the printable (XSLT) statement in a new tab.
 *
 * Call it straight from the click handler: the tab is opened before the first
 * await, while the click still counts as a user action (browsers, Safari in
 * particular, block window.open after an await). The tab gets no handle back
 * to this window. If a popup blocker refuses the tab, the page is downloaded
 * instead.
 */
export async function saveStatement(
  format: StatementFormat,
  fetchFile: () => Promise<Blob>,
  baseName: string,
): Promise<void> {
  const printTab = format === 'html' ? window.open('', '_blank') : null;
  if (printTab) printTab.opener = null;
  try {
    const url = URL.createObjectURL(await fetchFile());
    if (printTab) {
      printTab.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    Object.assign(document.createElement('a'), {
      href: url,
      download: `${baseName}.${format}`,
    }).click();
    URL.revokeObjectURL(url);
  } catch (error) {
    printTab?.close();
    throw error;
  }
}
