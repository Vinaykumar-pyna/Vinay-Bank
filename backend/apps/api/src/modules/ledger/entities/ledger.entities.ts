import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export type GlAccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

/**
 * Chart of accounts. Column types are given as JavaScript constructors
 * (String, Number, Date) so TypeORM picks the right type per database
 * (SQLite here, Oracle VARCHAR2/NUMBER/TIMESTAMP in production).
 */
@Entity({ name: 'gl_accounts' })
export class GlAccount {
  @PrimaryColumn({ type: String, length: 10 })
  code: string;

  @Column({ type: String, length: 80 })
  name: string;

  @Column({ type: String, length: 10 })
  type: GlAccountType;
}

/** One balanced accounting entry, posted once per core banking transaction (and once more if reversed). */
@Entity({ name: 'journal_entries' })
@Unique('uq_journal_source', ['sourceId', 'kind'])
export class JournalEntry {
  @PrimaryGeneratedColumn()
  id: number;

  /** MongoDB transaction id: the link back to the core system, and the idempotency key */
  @Column({ name: 'source_id', type: String, length: 24 })
  sourceId: string;

  @Column({ type: String, length: 10 })
  kind: 'POSTING' | 'REVERSAL';

  @Column({ type: String, length: 32 })
  reference: string;

  @Column({ name: 'txn_type', type: String, length: 30 })
  transactionType: string;

  @Column({ type: String, length: 12 })
  rail: string;

  @Column({ type: String, length: 200 })
  narration: string;

  @Index('ix_journal_posted_at')
  @Column({ name: 'posted_at', type: Date })
  postedAt: Date;

  @OneToMany(() => JournalLine, (line) => line.entry, { cascade: ['insert'] })
  lines: JournalLine[];
}

/** A debit or a credit to one GL account, optionally for one customer account (the sub-ledger). */
@Entity({ name: 'journal_lines' })
@Check('ck_line_amounts', 'debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0)')
export class JournalLine {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => JournalEntry, (entry) => entry.lines, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'entry_id' })
  entry: JournalEntry;

  @Index('ix_line_gl_code')
  @Column({ name: 'gl_code', type: String, length: 10 })
  glCode: string;

  /** Customer account number for deposit lines (the customer sub-ledger) */
  @Index('ix_line_account')
  @Column({ name: 'account_number', type: String, length: 20, nullable: true })
  accountNumber: string | null;

  /** Paise */
  @Column({ type: Number, default: 0 })
  debit: number;

  /** Paise */
  @Column({ type: Number, default: 0 })
  credit: number;
}

export const LEDGER_ENTITIES = [GlAccount, JournalEntry, JournalLine];
