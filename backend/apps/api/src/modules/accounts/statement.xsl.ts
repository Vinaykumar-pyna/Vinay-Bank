/**
 * XSLT 1.0 stylesheet that turns the XML statement into a printable HTML page.
 * Kept as a TypeScript string so the bundled build needs no asset copying.
 * Values are inserted with xsl:value-of, so the processor escapes them.
 *
 * The web app opens the page from a blob: URL, where the API's HTTP security
 * headers do not apply, so the page carries its own Content-Security-Policy:
 * no scripts and nothing external (defence in depth on top of the escaping).
 */
export const STATEMENT_XSL = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"/>
        <title>Statement <xsl:value-of select="Statement/Account/@masked"/></title>
        <style>
          body { font-family: Inter, system-ui, sans-serif; color: #0f172a; margin: 32px; }
          header { display: flex; justify-content: space-between; border-bottom: 3px solid #4f46e5; padding-bottom: 12px; }
          h1 { font-size: 22px; margin: 0; color: #312e81; }
          .muted { color: #64748b; font-size: 12px; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 20px 0; }
          .tile { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; }
          .tile b { display: block; font-size: 16px; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { text-align: left; background: #f1f5f9; padding: 8px; }
          td { padding: 7px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
          .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
          .credit { color: #047857; }
          footer { margin-top: 24px; }
          @media print { body { margin: 12mm; } }
        </style>
      </head>
      <body>
        <header>
          <div>
            <h1><xsl:value-of select="Statement/Bank/@name"/> account statement</h1>
            <div class="muted">
              <xsl:value-of select="Statement/Bank/@branch"/> branch, IFSC <xsl:value-of select="Statement/Bank/@ifsc"/>
            </div>
          </div>
          <div style="text-align:right">
            <div><b><xsl:value-of select="Statement/Account/Holder"/></b></div>
            <div class="muted">
              <xsl:value-of select="Statement/Account/@type"/> account <xsl:value-of select="Statement/Account/@number"/>
            </div>
            <div class="muted">
              Period <xsl:value-of select="Statement/Period/@from"/> to <xsl:value-of select="Statement/Period/@to"/>
            </div>
          </div>
        </header>

        <section class="grid">
          <div class="tile"><span class="muted">Opening balance</span><b><xsl:value-of select="Statement/Summary/OpeningBalance/@formatted"/></b></div>
          <div class="tile"><span class="muted">Money in</span><b class="credit"><xsl:value-of select="Statement/Summary/TotalCredits/@formatted"/></b></div>
          <div class="tile"><span class="muted">Money out</span><b><xsl:value-of select="Statement/Summary/TotalDebits/@formatted"/></b></div>
          <div class="tile"><span class="muted">Closing balance</span><b><xsl:value-of select="Statement/Summary/ClosingBalance/@formatted"/></b></div>
        </section>

        <table>
          <thead>
            <tr><th>Date</th><th>Details</th><th>Reference</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr>
          </thead>
          <tbody>
            <xsl:for-each select="Statement/Entries/Entry">
              <tr>
                <td><xsl:value-of select="@date"/></td>
                <td><xsl:value-of select="Narration"/></td>
                <td class="muted"><xsl:value-of select="@reference"/></td>
                <td class="num"><xsl:if test="@direction = 'DEBIT'"><xsl:value-of select="Amount/@formatted"/></xsl:if></td>
                <td class="num credit"><xsl:if test="@direction = 'CREDIT'"><xsl:value-of select="Amount/@formatted"/></xsl:if></td>
                <td class="num"><xsl:value-of select="BalanceAfter/@formatted"/></td>
              </tr>
            </xsl:for-each>
          </tbody>
        </table>
        <xsl:if test="count(Statement/Entries/Entry) = 0">
          <p class="muted">No transactions in this period.</p>
        </xsl:if>

        <footer class="muted">
          <xsl:value-of select="count(Statement/Entries/Entry)"/> transactions. Generated
          <xsl:value-of select="Statement/@generatedAt"/> from XML by an XSLT 1.0 transform. This is a
          computer-generated statement and does not need a signature.
        </footer>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
`;
