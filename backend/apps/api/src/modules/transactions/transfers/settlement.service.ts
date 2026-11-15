import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection } from '@nestjs/mongoose';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { Connection, Types } from 'mongoose';
import {
  Category,
  PaymentRail,
  PostingDirection,
  TransactionStatus,
} from '../../../common/enums/banking.enums';
import { DomainEvents, type TransactionEvent } from '../../../common/events/domain-events';
import type { AppConfig } from '../../../config/configuration';
import { AccountLedgerService } from '../../accounts/account-ledger.service';
import { assertTransition } from '../transaction-state';
import { TransactionsService } from '../transactions.service';

const JOB_NAME = 'neft-settlement';
const POLL_MS = 15_000;

/**
 * Simulates NEFT clearing. NEFT settles in half-hourly batches, so an outward
 * NEFT stays PROCESSING (money already debited) until its batch runs. Then:
 *  - normally the beneficiary bank accepts it: COMPLETED
 *  - if the beneficiary account is invalid the bank returns it: the money is
 *    credited back and the transfer becomes REVERSED.
 * Demo rule: payee account numbers ending in 0000 are "closed" and get returned.
 */
@Injectable()
export class SettlementService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SettlementService.name);
  private running = false;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly transactions: TransactionsService,
    private readonly ledger: AccountLedgerService,
    private readonly events: EventEmitter2,
    private readonly scheduler: SchedulerRegistry,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  onModuleInit(): void {
    if (!this.config.get('banking', { infer: true }).schedulersEnabled) return;
    const timer = setInterval(() => void this.settleDue(), POLL_MS);
    this.scheduler.addInterval(JOB_NAME, timer);
  }

  onModuleDestroy(): void {
    if (this.scheduler.doesExist('interval', JOB_NAME)) this.scheduler.deleteInterval(JOB_NAME);
  }

  /** Settles every NEFT transfer whose batch time has passed. Returns how many were processed. */
  async settleDue(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const due = await this.transactions.model
        .find({
          rail: PaymentRail.NEFT,
          status: TransactionStatus.PROCESSING,
          settlementDueAt: { $lte: now },
        })
        .select('_id')
        .limit(100)
        .lean();
      for (const { _id } of due) {
        try {
          await this.settleOne(_id);
        } catch (error) {
          this.logger.error(`Failed to settle NEFT ${_id.toString()}`, (error as Error).stack);
        }
      }
      if (due.length) this.logger.log(`NEFT batch settled ${due.length} transfer(s)`);
      return due.length;
    } finally {
      this.running = false;
    }
  }

  private async settleOne(id: Types.ObjectId): Promise<void> {
    const outcome = await this.connection.transaction(async (session) => {
      const txn = await this.transactions.model
        .findOne({ _id: id, status: TransactionStatus.PROCESSING })
        .session(session);
      if (!txn) return null;

      if (txn.to?.accountNumber.endsWith('0000')) {
        const total = txn.amount + txn.fee;
        const credited = await this.ledger.credit(txn.from!.accountId!, total, session);
        await this.ledger.post(
          [
            {
              accountId: credited._id,
              transactionId: txn._id,
              reference: txn.reference,
              direction: PostingDirection.CREDIT,
              amount: total,
              balanceAfter: credited.ledgerBalance,
              narration: `NEFT return: beneficiary account closed (${txn.reference})`,
              counterpartyName: txn.to.name,
              category: Category.REFUND,
              channel: txn.channel,
              selfTransfer: false,
            },
          ],
          session,
        );
        assertTransition(txn.status, TransactionStatus.REVERSED);
        txn.status = TransactionStatus.REVERSED;
        txn.failureReason = 'Returned by the beneficiary bank: account closed';
        await txn.save({ session });
        return { event: DomainEvents.TRANSACTION_REVERSED, id: txn.id as string };
      }

      assertTransition(txn.status, TransactionStatus.COMPLETED);
      txn.status = TransactionStatus.COMPLETED;
      txn.completedAt = new Date();
      await txn.save({ session });
      return { event: DomainEvents.TRANSACTION_COMPLETED, id: txn.id as string };
    });
    if (outcome)
      this.events.emit(outcome.event, { transactionId: outcome.id } satisfies TransactionEvent);
  }
}
