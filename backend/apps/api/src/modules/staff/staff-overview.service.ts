import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { istDateStamp, startOfIstDay } from '@app/shared';
import { AccountStatus, TransactionStatus } from '../../common/enums/banking.enums';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser } from '../../common/types/auth.types';
import { Account } from '../accounts/schemas/account.schema';
import { ApprovalStatus } from '../approvals/approval.schema';
import { ApprovalsService } from '../approvals/approvals.service';
import { RiskService } from '../risk/risk.service';
import { AuditLog } from '../audit/audit-log.schema';
import { Transaction } from '../transactions/schemas/transaction.schema';
import { toTransactionView } from '../transactions/transaction.mapper';
import { KycStatus, User } from '../users/user.schema';

const DAY = 86_400_000;
const SETTLED = [TransactionStatus.COMPLETED, TransactionStatus.PROCESSING];

/** Branch and bank-wide KPIs for the staff dashboard, computed with aggregation pipelines. */
@Injectable()
export class StaffOverviewService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Account.name) private readonly accounts: Model<Account>,
    @InjectModel(Transaction.name) private readonly transactions: Model<Transaction>,
    @InjectModel(AuditLog.name) private readonly auditLogs: Model<AuditLog>,
    private readonly approvals: ApprovalsService,
    private readonly risk: RiskService,
  ) {}

  async overview(viewer: AuthUser) {
    const today = startOfIstDay();
    const weekStart = new Date(today.getTime() - 6 * DAY);
    const monthAgo = new Date(Date.now() - 30 * DAY);

    const [
      customers,
      kycPending,
      accountStats,
      todayStats,
      pendingApprovals,
      flaggedCount,
      volume,
      railMix,
      recentFlagged,
      recentAudit,
      riskEngine,
    ] = await Promise.all([
      this.users.countDocuments({ role: Role.CUSTOMER }),
      this.users.countDocuments({ role: Role.CUSTOMER, 'kyc.status': KycStatus.PENDING }),
      this.accounts.aggregate<{ _id: AccountStatus; count: number; balance: number }>([
        { $group: { _id: '$status', count: { $sum: 1 }, balance: { $sum: '$ledgerBalance' } } },
      ]),
      this.transactions.aggregate<{ count: number; volume: number }>([
        { $match: { createdAt: { $gte: today }, status: { $in: SETTLED } } },
        { $group: { _id: null, count: { $sum: 1 }, volume: { $sum: '$amount' } } },
      ]),
      this.approvals.countPending(),
      this.transactions.countDocuments({
        createdAt: { $gte: weekStart },
        'risk.level': { $in: ['HIGH', 'CRITICAL'] },
      }),
      this.transactions.aggregate<{ _id: string; count: number; amount: number }>([
        { $match: { createdAt: { $gte: weekStart }, status: { $in: SETTLED } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y%m%d', date: '$createdAt', timezone: '+05:30' } },
            count: { $sum: 1 },
            amount: { $sum: '$amount' },
          },
        },
      ]),
      this.transactions.aggregate<{ _id: string; count: number; amount: number }>([
        { $match: { createdAt: { $gte: monthAgo }, status: { $in: SETTLED } } },
        { $group: { _id: '$rail', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
        { $sort: { amount: -1 } },
      ]),
      this.transactions
        .find({ 'risk.level': { $in: ['MEDIUM', 'HIGH', 'CRITICAL'] } })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      this.auditLogs.find().sort({ seq: -1 }).limit(8).lean(),
      this.risk.engineHealth(),
    ]);

    const byStatus = (status: AccountStatus) => accountStats.find((s) => s._id === status);
    const volume7d = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(weekStart.getTime() + i * DAY);
      const stamp = istDateStamp(new Date(day.getTime() + DAY / 2));
      const row = volume.find((v) => v._id === stamp);
      return {
        date: stamp,
        label: new Date(day.getTime() + DAY / 2).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          timeZone: 'Asia/Kolkata',
        }),
        count: row?.count ?? 0,
        amount: row?.amount ?? 0,
      };
    });

    return {
      customers: { total: customers, kycPending },
      accounts: {
        total: accountStats.reduce((sum, s) => sum + s.count, 0),
        active: byStatus(AccountStatus.ACTIVE)?.count ?? 0,
        frozen: byStatus(AccountStatus.FROZEN)?.count ?? 0,
        pendingApproval: byStatus(AccountStatus.PENDING_APPROVAL)?.count ?? 0,
      },
      deposits: {
        total: accountStats
          .filter((s) => s._id === AccountStatus.ACTIVE || s._id === AccountStatus.FROZEN)
          .reduce((sum, s) => sum + s.balance, 0),
      },
      today: { count: todayStats[0]?.count ?? 0, volume: todayStats[0]?.volume ?? 0 },
      approvals: { pending: pendingApprovals, status: ApprovalStatus.PENDING },
      flagged: { last7Days: flaggedCount },
      volume7d,
      railMix: railMix.map((r) => ({ rail: r._id, count: r.count, amount: r.amount })),
      recentFlagged: recentFlagged.map((t) => toTransactionView(t, viewer)),
      riskEngine,
      // Tellers do not get audit-trail access (need-to-know); managers and admins do.
      recentAudit: (viewer.role === Role.TELLER ? [] : recentAudit).map((a) => ({
        seq: a.seq,
        at: a.at.toISOString(),
        action: a.action,
        outcome: a.outcome,
        actorLabel: a.actorLabel,
        actorRole: a.actorRole,
        entityType: a.entityType,
      })),
    };
  }
}
