import { Injectable } from '@nestjs/common';
import { create } from 'xmlbuilder2';
import { XmlParser, Xslt } from 'xslt-processor';
import { formatInr, maskAccountNumber, paiseToRupeeString } from '@app/shared';
import { BANK_NAME } from '../../common/constants/app.constants';
import { findBranchByCode } from '../../common/constants/branches';
import { PostingDirection } from '../../common/enums/banking.enums';
import type { AuthUser } from '../../common/types/auth.types';
import { AccountsService } from './accounts.service';
import type { StatementQueryDto } from './dto/accounts.dto';
import { STATEMENT_XSL } from './statement.xsl';

const istDate = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
const istDateTime = (d: Date) =>
  new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 16).replace('T', ' ');

/**
 * Account statements as XML (machine-readable, for accounting software) and
 * as a printable HTML page produced from that XML by an XSLT transform.
 * Amounts are decimal rupees; each also carries a display-formatted copy.
 */
@Injectable()
export class StatementXmlService {
  private readonly parser = new XmlParser();
  private readonly stylesheet = this.parser.xmlParse(STATEMENT_XSL);

  constructor(private readonly accounts: AccountsService) {}

  async xml(accountId: string, user: AuthUser, query: StatementQueryDto) {
    const { account, holderName, rows } = await this.accounts.statementExport(
      accountId,
      user,
      query,
    );
    const branch = findBranchByCode(account.branchCode);
    const credits = rows
      .filter((r) => r.direction === PostingDirection.CREDIT)
      .reduce((s, r) => s + r.amount, 0);
    const debits = rows
      .filter((r) => r.direction === PostingDirection.DEBIT)
      .reduce((s, r) => s + r.amount, 0);
    const first = rows[0];
    const opening = first
      ? first.balanceAfter +
        (first.direction === PostingDirection.DEBIT ? first.amount : -first.amount)
      : account.ledgerBalance;
    const closing = rows.length ? rows[rows.length - 1].balanceAfter : account.ledgerBalance;
    const money = (paise: number) => ({
      '@formatted': formatInr(paise),
      '#': paiseToRupeeString(paise),
    });

    const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele('Statement', {
      generatedAt: new Date().toISOString(),
      currency: 'INR',
    });
    doc.ele('Bank', {
      name: BANK_NAME,
      ifsc: account.ifsc,
      branch: branch?.name ?? account.branchCode,
    });
    doc
      .ele('Account', {
        number: account.accountNumber,
        masked: maskAccountNumber(account.accountNumber),
        type: account.type,
        status: account.status,
      })
      .ele('Holder')
      .txt(holderName);
    doc.ele('Period', {
      from: query.from
        ? istDate(query.from)
        : first
          ? istDate(first.createdAt)
          : istDate(new Date()),
      to: query.to ? istDate(query.to) : istDate(new Date()),
    });
    const summary = doc.ele('Summary', { count: rows.length });
    summary
      .ele('OpeningBalance', { formatted: formatInr(opening) })
      .txt(paiseToRupeeString(opening));
    summary.ele('TotalCredits', { formatted: formatInr(credits) }).txt(paiseToRupeeString(credits));
    summary.ele('TotalDebits', { formatted: formatInr(debits) }).txt(paiseToRupeeString(debits));
    summary
      .ele('ClosingBalance', { formatted: formatInr(closing) })
      .txt(paiseToRupeeString(closing));

    const entries = doc.ele('Entries');
    for (const row of rows) {
      const entry = entries.ele('Entry', {
        reference: row.reference,
        date: istDateTime(row.createdAt),
        direction: row.direction,
        category: row.category,
        channel: row.channel,
      });
      entry.ele('Narration').txt(row.narration);
      if (row.counterpartyName) entry.ele('Counterparty').txt(row.counterpartyName);
      entry.ele({ Amount: money(row.amount) });
      entry.ele({ BalanceAfter: money(row.balanceAfter) });
    }

    return {
      filename: `ArthaBank-${account.accountNumber.slice(-4)}-statement`,
      xml: doc.end({ prettyPrint: true }),
    };
  }

  /** XML first, then XSLT to HTML: the same data as the XML download, rendered for print. */
  async html(accountId: string, user: AuthUser, query: StatementQueryDto) {
    const { filename, xml } = await this.xml(accountId, user, query);
    const html = await new Xslt().xsltProcess(this.parser.xmlParse(xml), this.stylesheet);
    return { filename, html: `<!DOCTYPE html>\n${html}` };
  }
}
