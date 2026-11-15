import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type { Model, Types } from 'mongoose';
import { DataSource, Repository } from 'typeorm';
import { PaymentRail, TransactionStatus } from '../../common/enums/banking.enums';
import { DomainEvents } from '../../common/events/domain-events';
import type { AppConfig } from '../../config/configuration';
import { Transaction } from '../transactions/schemas/transaction.schema';
import { GlAccount, JournalEntry, JournalLine } from './entities/ledger.entities';
import { CHART_OF_ACCOUNTS, isBalanced, journalLines, reversalLines } from './journal-rules';

export interface SyncResult {
  posted: number;
  reversed: number;
  skipped: number;
}

type LeanTransaction = Transaction & { _id: Types.ObjectId };

function isDuplicateEntry(error: unknown): boolean {
  const message = (error as Error)?.message ?? '';
  return /UNIQUE constraint failed|ORA-00001|duplicate key/i.test(message);
}

/**
 * Projects core banking transactions (MongoDB) into the double-entry general
 * ledger (SQL). It is an idempotent consumer: each transaction is posted at
 * most once per kind, guarded by a unique (source_id, kind) constraint, and
 * marked in MongoDB only after the SQL commit. A crash between the two steps
 * is harmless: the next run hits the constraint and just sets the marker.
 */
@Injectable()
export class LedgerProjector implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(LedgerProjector.name);
  private running?: Promise<SyncResult>;
  private timer?: NodeJS.Timeout;
  private debounce?: NodeJS.Timeout;
  private readonly background: boolean;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(GlAccount) private readonly glAccounts: Repository<GlAccount>,
    @InjectModel(Transaction.name) private readonly transactions: Model<Transaction>,
    config: ConfigService<AppConfig, true>,
  ) {
    this.background = config.get('banking', { infer: true }).schedulersEnabled;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.glAccounts.upsert(CHART_OF_ACCOUNTS, ['code']);
    if (!this.background) return;
    void this.sync().catch((error: Error) =>
      this.logger.error(`Ledger backfill failed: ${error.message}`),
    );
    // Safety net for anything not announced by an event (e.g. bulk NEFT debits).
    this.timer = setInterval(() => void this.sync().catch(() => undefined), 15_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
    clearTimeout(this.debounce);
  }

  @OnEvent(DomainEvents.TRANSACTION_COMPLETED, { async: true })
  @OnEvent(DomainEvents.TRANSACTION_PROCESSING, { async: true })
  @OnEvent(DomainEvents.TRANSACTION_REVERSED, { async: true })
  onTransactionEvent(): void {
    if (!this.background || this.debounce) return;
    this.debounce = setTimeout(() => {
      this.debounce = undefined;
      void this.sync().catch((error: Error) =>
        this.logger.error(`Ledger sync failed: ${error.message}`),
      );
    }, 250);
  }

  /** Posts everything not yet in the ledger. Single-flight: concurrent callers share one run. */
  sync(limit = 1_000): Promise<SyncResult> {
    this.running ??= this.run(limit).finally(() => (this.running = undefined));
    return this.running;
  }

  /** Transactions that have moved money and are not fully in the ledger yet. */
  pendingFilter() {
    return {
      $or: [
        {
          ledgerPosted: { $ne: true },
          status: { $in: [TransactionStatus.COMPLETED, TransactionStatus.REVERSED] },
        },
        // NEFT debits the customer at initiation, before the batch settles.
        {
          ledgerPosted: { $ne: true },
          status: TransactionStatus.PROCESSING,
          rail: PaymentRail.NEFT,
        },
        { status: TransactionStatus.REVERSED, ledgerReversalPosted: { $ne: true } },
      ],
    };
  }

  private async run(limit: number): Promise<SyncResult> {
    const result: SyncResult = { posted: 0, reversed: 0, skipped: 0 };
    const pending = await this.transactions
      .find(this.pendingFilter())
      .sort({ createdAt: 1, _id: 1 })
      .limit(limit)
      .lean<LeanTransaction[]>();
    for (const txn of pending) {
      if (!txn.ledgerPosted) {
        if (await this.post(txn, 'POSTING')) {
          await this.transactions.updateOne({ _id: txn._id }, { $set: { ledgerPosted: true } });
          result.posted++;
        } else {
          result.skipped++;
          continue;
        }
      }
      if (txn.status === TransactionStatus.REVERSED && !txn.ledgerReversalPosted) {
        if (await this.post(txn, 'REVERSAL')) {
          await this.transactions.updateOne(
            { _id: txn._id },
            { $set: { ledgerReversalPosted: true } },
          );
          result.reversed++;
        }
      }
    }
    if (result.posted || result.reversed) {
      this.logger.log(`Ledger: posted ${result.posted} entries, ${result.reversed} reversals`);
    }
    return result;
  }

  private async post(txn: LeanTransaction, kind: 'POSTING' | 'REVERSAL'): Promise<boolean> {
    const draft = journalLines(txn);
    const lines = kind === 'REVERSAL' ? reversalLines(draft) : draft;
    if (!isBalanced(lines)) {
      this.logger.error(`Unbalanced entry for ${txn.reference}; not posted`);
      return false;
    }
    try {
      await this.dataSource.transaction(async (manager) => {
        const entry = manager.create(JournalEntry, {
          sourceId: txn._id.toString(),
          kind,
          reference: txn.reference,
          transactionType: txn.type,
          rail: txn.rail,
          narration:
            `${kind === 'REVERSAL' ? 'Reversal: ' : ''}${txn.type} ${txn.from?.name ?? txn.from?.accountNumber ?? 'bank'} to ${txn.to?.name ?? 'bank'}`.slice(
              0,
              200,
            ),
          postedAt:
            kind === 'REVERSAL'
              ? (txn.updatedAt ?? new Date())
              : (txn.completedAt ?? txn.createdAt),
          lines: lines.map((line) => manager.create(JournalLine, line)),
        });
        await manager.save(entry);
      });
    } catch (error) {
      if (!isDuplicateEntry(error)) throw error;
    }
    return true;
  }
}
