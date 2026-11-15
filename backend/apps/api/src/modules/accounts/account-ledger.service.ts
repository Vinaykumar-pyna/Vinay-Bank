import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model, Types } from 'mongoose';
import { AccountStatus } from '../../common/enums/banking.enums';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { Account, AccountDocument } from './schemas/account.schema';
import { Posting } from './schemas/posting.schema';

type Id = Types.ObjectId | string;

/**
 * Low-level balance operations. Every method must run inside a MongoDB
 * transaction (session) together with the postings it creates.
 *
 * Overdraft protection is a *conditional atomic update*: the filter only
 * matches when the available balance covers the amount, and the decrement
 * happens in the same operation. Two concurrent debits can never both pass a
 * stale balance check (no read-then-write race).
 */
@Injectable()
export class AccountLedgerService {
  constructor(
    @InjectModel(Account.name) private readonly accounts: Model<Account>,
    @InjectModel(Posting.name) private readonly postings: Model<Posting>,
  ) {}

  /**
   * Debits `amount`. If `fromHold` is given, that much previously held money is
   * released in the same update (used when an approved transfer executes).
   */
  async debit(
    accountId: Id,
    amount: number,
    session: ClientSession,
    fromHold = 0,
  ): Promise<AccountDocument> {
    const updated = await this.accounts.findOneAndUpdate(
      {
        _id: accountId,
        status: AccountStatus.ACTIVE,
        holdAmount: { $gte: fromHold },
        $expr: { $gte: [{ $subtract: ['$ledgerBalance', '$holdAmount'] }, amount - fromHold] },
      },
      { $inc: { ledgerBalance: -amount, holdAmount: -fromHold } },
      { new: true, session },
    );
    if (!updated) throw await this.explainDebitFailure(accountId, session);
    return updated;
  }

  /** Credits are allowed on ACTIVE and FROZEN (debit-freeze) accounts. */
  async credit(accountId: Id, amount: number, session: ClientSession): Promise<AccountDocument> {
    const updated = await this.accounts.findOneAndUpdate(
      { _id: accountId, status: { $in: [AccountStatus.ACTIVE, AccountStatus.FROZEN] } },
      { $inc: { ledgerBalance: amount } },
      { new: true, session },
    );
    if (!updated) {
      throw AppException.unprocessable(
        ErrorCode.ACCOUNT_NOT_ACTIVE,
        'The receiving account cannot accept payments',
      );
    }
    return updated;
  }

  /** Earmarks funds (a lien) while a transfer waits for approval. */
  async placeHold(accountId: Id, amount: number, session: ClientSession): Promise<AccountDocument> {
    const updated = await this.accounts.findOneAndUpdate(
      {
        _id: accountId,
        status: AccountStatus.ACTIVE,
        $expr: { $gte: [{ $subtract: ['$ledgerBalance', '$holdAmount'] }, amount] },
      },
      { $inc: { holdAmount: amount } },
      { new: true, session },
    );
    if (!updated) throw await this.explainDebitFailure(accountId, session);
    return updated;
  }

  async releaseHold(
    accountId: Id,
    amount: number,
    session: ClientSession,
  ): Promise<AccountDocument> {
    const updated = await this.accounts.findOneAndUpdate(
      { _id: accountId, holdAmount: { $gte: amount } },
      { $inc: { holdAmount: -amount } },
      { new: true, session },
    );
    if (!updated)
      throw new Error(`Cannot release hold of ${amount} on account ${String(accountId)}`);
    return updated;
  }

  async post(postings: Partial<Posting>[], session: ClientSession): Promise<void> {
    await this.postings.insertMany(postings, { session });
  }

  private async explainDebitFailure(accountId: Id, session: ClientSession): Promise<AppException> {
    const account = await this.accounts.findById(accountId).session(session).lean();
    if (!account) return AppException.notFound('Account');
    if (account.status !== AccountStatus.ACTIVE) {
      return AppException.unprocessable(
        ErrorCode.ACCOUNT_NOT_ACTIVE,
        account.status === AccountStatus.FROZEN
          ? 'This account is frozen for debits. Please contact your branch.'
          : 'This account cannot be used for payments',
      );
    }
    return new AppException(
      ErrorCode.INSUFFICIENT_FUNDS,
      'Insufficient balance for this transaction',
      HttpStatus.UNPROCESSABLE_ENTITY,
      { available: account.ledgerBalance - account.holdAmount },
    );
  }
}
