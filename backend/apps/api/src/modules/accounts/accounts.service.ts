import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Types, type ClientSession, type FilterQuery, type Model } from 'mongoose';
import { buildAccountNumber, formatInr, paiseToRupeeString, startOfIstMonth } from '@app/shared';
import { DEFAULT_BRANCH_CODE, findBranchByCode } from '../../common/constants/branches';
import { DAILY_LIMITS } from '../../common/constants/limits';
import { PaginatedResult } from '../../common/dto/paginated-result';
import { AccountStatus, AccountType, PostingDirection } from '../../common/enums/banking.enums';
import { isStaff, Role } from '../../common/enums/role.enum';
import { DomainEvents, type AccountEvent } from '../../common/events/domain-events';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { AuthUser, RequestContext } from '../../common/types/auth.types';
import { escapeRegex, toCsv } from '../../common/utils/text';
import { ApprovalType } from '../approvals/approval.schema';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { CountersService } from '../counters/counters.service';
import { UsersService } from '../users/users.service';
import { toAccountView, toPostingView, type AccountView, type PostingView } from './account.mapper';
import type { OpenAccountDto, StatementQueryDto, UpdateAccountDto } from './dto/accounts.dto';
import { Account, AccountDocument } from './schemas/account.schema';
import { Posting } from './schemas/posting.schema';

const INTEREST_BPS: Record<AccountType, number> = {
  [AccountType.SAVINGS]: 300,
  [AccountType.CURRENT]: 0,
};

export interface OpenAccountInput {
  customerId: string | Types.ObjectId;
  type: AccountType;
  status: AccountStatus;
  branchCode?: string;
  nickname?: string;
  approvedBy?: string;
}

export interface AccountOverview {
  totalBalance: number;
  totalAvailable: number;
  accounts: AccountView[];
  cashflow: { month: string; label: string; inflow: number; outflow: number }[];
  spendingByCategory: { category: string; amount: number }[];
  recent: PostingView[];
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectModel(Account.name) private readonly accounts: Model<Account>,
    @InjectModel(Posting.name) private readonly postings: Model<Posting>,
    private readonly counters: CountersService,
    private readonly approvals: ApprovalsService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  get model(): Model<Account> {
    return this.accounts;
  }

  /** Creates an account with a Luhn-checked number from a per-branch, per-product sequence. */
  async open(input: OpenAccountInput, session?: ClientSession): Promise<AccountDocument> {
    const branchCode = input.branchCode ?? DEFAULT_BRANCH_CODE;
    const branch = findBranchByCode(branchCode);
    if (!branch) throw new AppException(ErrorCode.VALIDATION_FAILED, 'Unknown branch');
    const serial = await this.counters.next(`account:${branchCode}:${input.type}`, session);
    const active = input.status === AccountStatus.ACTIVE;
    const [account] = await this.accounts.create(
      [
        {
          accountNumber: buildAccountNumber(branchCode, input.type, serial),
          customerId: input.customerId,
          type: input.type,
          status: input.status,
          branchCode,
          ifsc: branch.ifsc,
          dailyTransferLimit: DAILY_LIMITS[input.type].default,
          interestRateBps: INTEREST_BPS[input.type],
          nickname: input.nickname,
          openedAt: active ? new Date() : undefined,
          approvedBy: input.approvedBy,
        },
      ],
      { session },
    );
    return account;
  }

  /** A customer asks for an additional account; a branch manager must approve it. */
  async request(user: AuthUser, dto: OpenAccountDto, ctx: RequestContext): Promise<AccountView> {
    const customer = await this.users.findByIdOrThrow(user.id);
    const pending = await this.accounts.countDocuments({
      customerId: user.id,
      status: AccountStatus.PENDING_APPROVAL,
    });
    if (pending >= 2) {
      throw AppException.conflict('You already have account requests waiting for approval');
    }
    const account = await this.open({
      customerId: user.id,
      type: dto.type,
      status: AccountStatus.PENDING_APPROVAL,
      branchCode: dto.branchCode,
      nickname: dto.nickname,
    });
    const approval = await this.approvals.create({
      type: ApprovalType.ACCOUNT_OPENING,
      entityType: 'Account',
      entityId: account._id,
      title: `Open ${dto.type.toLowerCase()} account`,
      customerId: customer._id,
      customerName: `${customer.firstName} ${customer.lastName}`,
      accountNumber: account.accountNumber,
      details: { kycStatus: customer.kyc?.status, customerId: customer.customerId },
      maker: { id: user.id, role: user.role, name: `${customer.firstName} ${customer.lastName}` },
      branchCode: account.branchCode,
    });
    await this.accounts.updateOne(
      { _id: account._id },
      { $set: { statusReason: 'Awaiting branch approval' } },
    );
    this.approvals.announce(approval);
    await this.audit.record({
      action: AuditAction.ACCOUNT_REQUESTED,
      actor: { id: user.id, role: user.role },
      entity: { type: 'Account', id: account.id },
      context: ctx,
      details: { type: dto.type, accountNumber: account.accountNumber },
    });
    this.events.emit(DomainEvents.ACCOUNT_REQUESTED, {
      accountId: account.id,
      customerId: user.id,
    } satisfies AccountEvent);
    return toAccountView((await this.accounts.findById(account._id).lean())!);
  }

  async listForCustomer(customerId: string): Promise<AccountView[]> {
    const accounts = await this.accounts
      .find({ customerId, status: { $nin: [AccountStatus.REJECTED] } })
      .sort({ createdAt: 1 })
      .lean();
    return accounts.map(toAccountView);
  }

  /** Customers may only access their own accounts; staff may access any account. */
  async getAccessible(accountId: string, user: AuthUser): Promise<AccountDocument> {
    if (!isValidObjectId(accountId)) throw AppException.notFound('Account');
    const account = await this.accounts.findById(accountId);
    if (!account) throw AppException.notFound('Account');
    if (!isStaff(user.role) && account.customerId.toString() !== user.id) {
      // 404 rather than 403: do not reveal that the account exists.
      throw AppException.notFound('Account');
    }
    return account;
  }

  async findByNumber(accountNumber: string, session?: ClientSession) {
    return this.accounts.findOne({ accountNumber }).session(session ?? null);
  }

  async updateSettings(
    accountId: string,
    user: AuthUser,
    dto: UpdateAccountDto,
  ): Promise<AccountView> {
    const account = await this.getAccessible(accountId, user);
    if (dto.dailyTransferLimit !== undefined) {
      const max = DAILY_LIMITS[account.type].max;
      if (dto.dailyTransferLimit > max) {
        throw new AppException(
          ErrorCode.LIMIT_EXCEEDED,
          `The maximum daily limit for this account is ${formatInr(max)}`,
        );
      }
      account.dailyTransferLimit = dto.dailyTransferLimit;
    }
    if (dto.nickname !== undefined) account.nickname = dto.nickname || undefined;
    await account.save();
    return toAccountView(account.toObject());
  }

  /** Everything the customer dashboard needs, computed with aggregation pipelines. */
  async overview(customerId: string): Promise<AccountOverview> {
    const accounts = await this.accounts
      .find({ customerId, status: { $in: [AccountStatus.ACTIVE, AccountStatus.FROZEN] } })
      .sort({ createdAt: 1 })
      .lean();
    const allAccounts = await this.accounts
      .find({ customerId, status: { $nin: [AccountStatus.REJECTED] } })
      .sort({ createdAt: 1 })
      .lean();
    const ids = accounts.map((a) => a._id);
    const sixMonthsAgo = startOfIstMonth(new Date(), 5);
    const thisMonth = startOfIstMonth(new Date(), 0);

    const [cashflowRows, categoryRows, recent] = await Promise.all([
      this.postings.aggregate<{
        _id: { month: string; direction: PostingDirection };
        total: number;
      }>([
        {
          $match: {
            accountId: { $in: ids },
            createdAt: { $gte: sixMonthsAgo },
            selfTransfer: false,
          },
        },
        {
          $group: {
            _id: {
              month: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: '+05:30' } },
              direction: '$direction',
            },
            total: { $sum: '$amount' },
          },
        },
      ]),
      this.postings.aggregate<{ _id: string; total: number }>([
        {
          $match: {
            accountId: { $in: ids },
            direction: PostingDirection.DEBIT,
            createdAt: { $gte: thisMonth },
            selfTransfer: false,
          },
        },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } },
      ]),
      this.postings
        .find({ accountId: { $in: ids } })
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),
    ]);

    const cashflow = Array.from({ length: 6 }, (_, i) => {
      const start = startOfIstMonth(new Date(), 5 - i);
      const ist = new Date(start.getTime() + 330 * 60_000);
      const month = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
      const pick = (direction: PostingDirection) =>
        cashflowRows.find((r) => r._id.month === month && r._id.direction === direction)?.total ??
        0;
      return {
        month,
        label: ist.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }),
        inflow: pick(PostingDirection.CREDIT),
        outflow: pick(PostingDirection.DEBIT),
      };
    });

    return {
      totalBalance: accounts.reduce((sum, a) => sum + a.ledgerBalance, 0),
      totalAvailable: accounts.reduce((sum, a) => sum + a.ledgerBalance - a.holdAmount, 0),
      accounts: allAccounts.map(toAccountView),
      cashflow,
      spendingByCategory: categoryRows.map((r) => ({ category: r._id, amount: r.total })),
      recent: recent.map(toPostingView),
    };
  }

  async statement(accountId: string, user: AuthUser, query: StatementQueryDto) {
    const account = await this.getAccessible(accountId, user);
    const filter = this.statementFilter(account._id, query);
    const [items, total] = await Promise.all([
      this.postings
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      this.postings.countDocuments(filter),
    ]);
    return PaginatedResult.of(items.map(toPostingView), total, query.page, query.limit);
  }

  /** CSV statement (max 5,000 rows) for spreadsheets and accounting software. */
  /** Account, holder and every statement line in the period (oldest first), for exports. */
  async statementExport(accountId: string, user: AuthUser, query: StatementQueryDto) {
    const account = await this.getAccessible(accountId, user);
    const [rows, holder] = await Promise.all([
      this.postings
        .find(this.statementFilter(account._id, query))
        .sort({ createdAt: 1, _id: 1 })
        .limit(5000)
        .lean(),
      this.users.findById(account.customerId.toString()),
    ]);
    return {
      account: account.toObject(),
      holderName: holder ? `${holder.firstName} ${holder.lastName}` : 'Account holder',
      rows,
    };
  }

  async statementCsv(accountId: string, user: AuthUser, query: StatementQueryDto) {
    const { account, rows } = await this.statementExport(accountId, user, query);
    const csv = toCsv([
      [
        'Date',
        'Reference',
        'Narration',
        'Category',
        'Debit (INR)',
        'Credit (INR)',
        'Balance (INR)',
      ],
      ...rows.map((p) => [
        p.createdAt.toISOString(),
        p.reference,
        p.narration,
        p.category,
        p.direction === PostingDirection.DEBIT ? paiseToRupeeString(p.amount) : '',
        p.direction === PostingDirection.CREDIT ? paiseToRupeeString(p.amount) : '',
        paiseToRupeeString(p.balanceAfter),
      ]),
    ]);
    return { filename: `VinayBank-${account.accountNumber.slice(-4)}-statement.csv`, csv };
  }

  async setStatus(
    accountId: string,
    status: AccountStatus.ACTIVE | AccountStatus.FROZEN | AccountStatus.CLOSED,
    reason: string,
    actor: AuthUser,
    ctx: RequestContext,
  ): Promise<AccountView> {
    if (actor.role === Role.CUSTOMER) throw AppException.forbidden();
    const account = await this.getAccessible(accountId, actor);
    if (
      account.status === AccountStatus.PENDING_APPROVAL ||
      account.status === AccountStatus.REJECTED
    ) {
      throw AppException.unprocessable(ErrorCode.INVALID_STATE, 'This account is not open yet');
    }
    if (
      status === AccountStatus.CLOSED &&
      (account.ledgerBalance !== 0 || account.holdAmount !== 0)
    ) {
      throw AppException.unprocessable(
        ErrorCode.INVALID_STATE,
        'Only accounts with a zero balance can be closed',
      );
    }
    const previous = account.status;
    account.status = status;
    account.statusReason = reason;
    await account.save();
    await this.audit.record({
      action: AuditAction.ACCOUNT_STATUS_CHANGED,
      actor: { id: actor.id, role: actor.role },
      entity: { type: 'Account', id: account.id },
      context: ctx,
      details: { from: previous, to: status, reason, accountNumber: account.accountNumber },
    });
    this.events.emit(DomainEvents.ACCOUNT_STATUS_CHANGED, {
      accountId: account.id,
      customerId: account.customerId.toString(),
    } satisfies AccountEvent);
    return toAccountView(account.toObject());
  }

  private statementFilter(
    accountId: Types.ObjectId,
    query: StatementQueryDto,
  ): FilterQuery<Posting> {
    const filter: FilterQuery<Posting> = { accountId };
    if (query.from || query.to) {
      filter.createdAt = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: endOfDay(query.to) } : {}),
      };
    }
    if (query.direction && query.direction !== 'ALL') filter.direction = query.direction;
    if (query.search) {
      const pattern = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ narration: pattern }, { counterpartyName: pattern }, { reference: pattern }];
    }
    return filter;
  }
}

function endOfDay(date: Date): Date {
  const end = new Date(date);
  if (end.getUTCHours() === 0 && end.getUTCMinutes() === 0) end.setUTCHours(23, 59, 59, 999);
  return end;
}
