import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import type { Model } from 'mongoose';
import { Repository } from 'typeorm';
import { maskAccountNumber } from '@app/shared';
import { Account } from '../accounts/schemas/account.schema';
import { Transaction } from '../transactions/schemas/transaction.schema';
import { JournalEntry, JournalLine } from './entities/ledger.entities';
import { CHART_OF_ACCOUNTS } from './journal-rules';
import { LedgerProjector } from './ledger-projector.service';

export interface TrialBalanceRow {
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
  /** Debit minus credit */
  balance: number;
}

/**
 * Accounting reports, computed in SQL: the trial balance (GROUP BY over every
 * journal line) and a reconciliation of the customer sub-ledger against the
 * balances held by the core banking system in MongoDB.
 */
@Injectable()
export class LedgerReportsService {
  constructor(
    @InjectRepository(JournalLine) private readonly lines: Repository<JournalLine>,
    @InjectRepository(JournalEntry) private readonly entries: Repository<JournalEntry>,
    @InjectModel(Account.name) private readonly accounts: Model<Account>,
    @InjectModel(Transaction.name) private readonly transactions: Model<Transaction>,
    private readonly projector: LedgerProjector,
  ) {}

  async trialBalance() {
    const raw = await this.lines
      .createQueryBuilder('l')
      .select('l.glCode', 'code')
      .addSelect('SUM(l.debit)', 'debit')
      .addSelect('SUM(l.credit)', 'credit')
      .groupBy('l.glCode')
      .getRawMany<{ code: string; debit: number | string; credit: number | string }>();
    const totals = new Map(
      raw.map((r) => [r.code, { debit: Number(r.debit), credit: Number(r.credit) }]),
    );
    const rows: TrialBalanceRow[] = CHART_OF_ACCOUNTS.map((gl) => {
      const t = totals.get(gl.code) ?? { debit: 0, credit: 0 };
      return { ...gl, debit: t.debit, credit: t.credit, balance: t.debit - t.credit };
    });
    const debit = rows.reduce((s, r) => s + r.debit, 0);
    const credit = rows.reduce((s, r) => s + r.credit, 0);
    return {
      generatedAt: new Date().toISOString(),
      entries: await this.entries.count(),
      rows,
      totals: { debit, credit },
      balanced: debit === credit,
    };
  }

  /** Every customer account: core balance (MongoDB) against the SQL sub-ledger. */
  async reconciliation() {
    const ledger = await this.lines
      .createQueryBuilder('l')
      .select('l.accountNumber', 'accountNumber')
      .addSelect('SUM(l.credit) - SUM(l.debit)', 'balance')
      .where('l.accountNumber IS NOT NULL')
      .groupBy('l.accountNumber')
      .getRawMany<{ accountNumber: string; balance: number | string }>();
    const ledgerBalances = new Map(ledger.map((r) => [r.accountNumber, Number(r.balance)]));
    const core = await this.accounts.find().select('accountNumber ledgerBalance status').lean();
    const mismatches = core
      .map((a) => ({
        accountNumber: a.accountNumber,
        maskedNumber: maskAccountNumber(a.accountNumber),
        status: a.status,
        coreBalance: a.ledgerBalance,
        ledgerBalance: ledgerBalances.get(a.accountNumber) ?? 0,
      }))
      .map((a) => ({ ...a, difference: a.coreBalance - a.ledgerBalance }))
      .filter((a) => a.difference !== 0);
    return {
      generatedAt: new Date().toISOString(),
      accountsChecked: core.length,
      matched: core.length - mismatches.length,
      mismatches,
      pendingTransactions: await this.transactions.countDocuments(this.projector.pendingFilter()),
    };
  }

  async journal(page: number, limit: number) {
    const [entries, total] = await this.entries.findAndCount({
      order: { id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: { lines: true },
    });
    return {
      total,
      items: entries.map((e) => ({
        id: e.id,
        sourceId: e.sourceId,
        kind: e.kind,
        reference: e.reference,
        transactionType: e.transactionType,
        rail: e.rail,
        narration: e.narration,
        postedAt: new Date(e.postedAt).toISOString(),
        lines: e.lines
          .sort((a, b) => b.debit - a.debit)
          .map((l) => ({
            glCode: l.glCode,
            glName: CHART_OF_ACCOUNTS.find((g) => g.code === l.glCode)?.name ?? l.glCode,
            accountNumber: l.accountNumber ? maskAccountNumber(l.accountNumber) : null,
            debit: Number(l.debit),
            credit: Number(l.credit),
          })),
      })),
    };
  }
}
