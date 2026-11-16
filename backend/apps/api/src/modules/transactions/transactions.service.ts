import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  isValidObjectId,
  type ClientSession,
  type FilterQuery,
  type Model,
  type Types,
} from 'mongoose';
import { istDateStamp, randomDigits, startOfIstDay } from '@app/shared';
import { PaginatedResult } from '../../common/dto/paginated-result';
import { TransactionStatus, TransactionType } from '../../common/enums/banking.enums';
import { isStaff } from '../../common/enums/role.enum';
import { AppException } from '../../common/exceptions/app.exception';
import type { AuthUser } from '../../common/types/auth.types';
import { escapeRegex } from '../../common/utils/text';
import type { TransactionQueryDto } from './dto/transaction-query.dto';
import { toTransactionView, type TransactionView } from './transaction.mapper';
import { Transaction, TransactionDocument } from './schemas/transaction.schema';

/** Statuses that consume the daily limit (money has left or is reserved). */
const LIMIT_STATUSES = [
  TransactionStatus.COMPLETED,
  TransactionStatus.PROCESSING,
  TransactionStatus.PENDING_APPROVAL,
];

@Injectable()
export class TransactionsService {
  constructor(@InjectModel(Transaction.name) private readonly transactions: Model<Transaction>) {}

  get model(): Model<Transaction> {
    return this.transactions;
  }

  /** Customer-facing reference, e.g. AB261113 + 8 random digits (like a UTR). */
  generateReference(): string {
    return `VB${istDateStamp().slice(2)}${randomDigits(8)}`;
  }

  async create(data: Partial<Transaction>, session: ClientSession): Promise<TransactionDocument> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const [txn] = await this.transactions.create(
          [{ ...data, reference: data.reference ?? this.generateReference() }],
          {
            session,
          },
        );
        return txn;
      } catch (error) {
        const duplicateReference =
          (error as { code?: number; keyPattern?: Record<string, unknown> }).code === 11000 &&
          'reference' in ((error as { keyPattern?: Record<string, unknown> }).keyPattern ?? {});
        if (!duplicateReference || data.reference) throw error;
      }
    }
    throw new Error('Could not generate a unique transaction reference');
  }

  /** Sum of today's (IST) outgoing transfer amounts from an account. */
  async debitedToday(accountId: Types.ObjectId, session?: ClientSession): Promise<number> {
    const [row] = await this.transactions
      .aggregate<{ total: number }>([
        {
          $match: {
            'from.accountId': accountId,
            createdAt: { $gte: startOfIstDay() },
            status: { $in: LIMIT_STATUSES },
            type: { $in: [TransactionType.TRANSFER, TransactionType.BULK_TRANSFER] },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ])
      .session(session ?? null);
    return row?.total ?? 0;
  }

  async outgoingSince(
    accountId: Types.ObjectId,
    since: Date,
  ): Promise<{ count: number; total: number }> {
    const [row] = await this.transactions.aggregate<{ count: number; total: number }>([
      {
        $match: {
          'from.accountId': accountId,
          createdAt: { $gte: since },
          status: { $in: LIMIT_STATUSES },
        },
      },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amount' } } },
    ]);
    return { count: row?.count ?? 0, total: row?.total ?? 0 };
  }

  async list(
    user: AuthUser,
    query: TransactionQueryDto,
  ): Promise<PaginatedResult<TransactionView>> {
    const filter: FilterQuery<Transaction> = {};
    if (!isStaff(user.role)) {
      filter.$or = [{ 'from.customerId': user.id }, { 'to.customerId': user.id }];
    }
    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;
    if (query.rail) filter.rail = query.rail;
    if (query.riskLevel) filter['risk.level'] = query.riskLevel;
    if (query.accountId && isValidObjectId(query.accountId)) {
      const accountFilter = [
        { 'from.accountId': query.accountId },
        { 'to.accountId': query.accountId },
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: accountFilter }];
        delete filter.$or;
      } else {
        filter.$or = accountFilter;
      }
    }
    if (query.search) filter.reference = new RegExp(`^${escapeRegex(query.search.toUpperCase())}`);

    const [items, total] = await Promise.all([
      this.transactions
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      this.transactions.countDocuments(filter),
    ]);
    return PaginatedResult.of(
      items.map((txn) => toTransactionView(txn, user)),
      total,
      query.page,
      query.limit,
    );
  }

  async getForUser(id: string, user: AuthUser): Promise<TransactionView> {
    if (!isValidObjectId(id)) throw AppException.notFound('Transaction');
    const txn = await this.transactions.findById(id).lean();
    const involved =
      txn &&
      (txn.from?.customerId?.toString() === user.id || txn.to?.customerId?.toString() === user.id);
    if (!txn || (!isStaff(user.role) && !involved)) throw AppException.notFound('Transaction');
    return toTransactionView(txn, user);
  }
}
