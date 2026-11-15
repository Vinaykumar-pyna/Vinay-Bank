import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Types, type FilterQuery, type Model } from 'mongoose';
import { maskPhone } from '@app/shared';
import { PaginatedResult } from '../../common/dto/paginated-result';
import { Role } from '../../common/enums/role.enum';
import { DomainEvents } from '../../common/events/domain-events';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { AuthUser, RequestContext } from '../../common/types/auth.types';
import { escapeRegex } from '../../common/utils/text';
import { toAccountView } from '../accounts/account.mapper';
import { Account } from '../accounts/schemas/account.schema';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { SessionsService } from '../auth/sessions.service';
import { Transaction } from '../transactions/schemas/transaction.schema';
import { toTransactionView } from '../transactions/transaction.mapper';
import { toUserProfile } from '../users/user.mapper';
import { KycStatus, User, UserStatus } from '../users/user.schema';
import type { CustomerSearchDto } from './dto/staff.dto';

export interface CustomerSummary {
  id: string;
  customerId?: string;
  fullName: string;
  email: string;
  phone: string;
  kycStatus: KycStatus;
  status: UserStatus;
  accounts: number;
  totalBalance: number;
  createdAt: string;
}

export interface KycReviewedEvent {
  userId: string;
  decision: KycStatus;
  remarks: string;
}

@Injectable()
export class CustomersAdminService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Account.name) private readonly accounts: Model<Account>,
    @InjectModel(Transaction.name) private readonly transactions: Model<Transaction>,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  /** Customer search with account counts and balances joined in one aggregation ($lookup). */
  async search(
    query: CustomerSearchDto,
    viewer: AuthUser,
  ): Promise<PaginatedResult<CustomerSummary>> {
    const filter: FilterQuery<User> = { role: Role.CUSTOMER };
    if (query.kycStatus) filter['kyc.status'] = query.kycStatus;
    if (query.search) {
      const pattern = new RegExp(`^${escapeRegex(query.search)}`, 'i');
      filter.$or = [
        { firstName: pattern },
        { lastName: pattern },
        { email: pattern },
        { phone: pattern },
        { customerId: pattern },
      ];
    }
    const [rows, total] = await Promise.all([
      this.users.aggregate<
        User & { _id: Types.ObjectId; accountCount: number; totalBalance: number }
      >([
        { $match: filter },
        { $sort: { createdAt: -1 } },
        { $skip: (query.page - 1) * query.limit },
        { $limit: query.limit },
        {
          $lookup: { from: 'accounts', localField: '_id', foreignField: 'customerId', as: 'accts' },
        },
        {
          $addFields: {
            accountCount: { $size: '$accts' },
            totalBalance: { $sum: '$accts.ledgerBalance' },
          },
        },
        {
          $project: { accts: 0, passwordHash: 0, 'mfa.secretEncrypted': 0, 'kyc.panEncrypted': 0 },
        },
      ]),
      this.users.countDocuments(filter),
    ]);
    // Tellers see masked mobile numbers (need-to-know); managers and admins see them in full.
    const maskContact = viewer.role === Role.TELLER;
    return PaginatedResult.of(
      rows.map((u) => ({
        id: u._id.toString(),
        customerId: u.customerId,
        fullName: `${u.firstName} ${u.lastName}`,
        email: u.email,
        phone: maskContact ? maskPhone(u.phone) : u.phone,
        kycStatus: u.kyc?.status,
        status: u.status,
        accounts: u.accountCount,
        totalBalance: u.totalBalance,
        createdAt: u.createdAt.toISOString(),
      })),
      total,
      query.page,
      query.limit,
    );
  }

  async detail(id: string, viewer: AuthUser) {
    const user = await this.loadCustomer(id);
    const accounts = await this.accounts
      .find({ customerId: user._id })
      .sort({ createdAt: 1 })
      .lean();
    const recent = await this.transactions
      .find({ $or: [{ 'from.customerId': user._id }, { 'to.customerId': user._id }] })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    return {
      profile: toUserProfile(user.toObject()),
      accounts: accounts.map(toAccountView),
      recentTransactions: recent.map((t) => toTransactionView(t, viewer)),
    };
  }

  async reviewKyc(
    actor: AuthUser,
    id: string,
    decision: KycStatus.VERIFIED | KycStatus.REJECTED,
    remarks: string,
    ctx: RequestContext,
  ) {
    const user = await this.loadCustomer(id);
    if (user.kyc?.status === KycStatus.VERIFIED && decision === KycStatus.VERIFIED) {
      throw AppException.conflict('KYC is already verified');
    }
    user.kyc.status = decision;
    user.kyc.reviewedBy = new Types.ObjectId(actor.id);
    user.kyc.reviewedAt = new Date();
    user.kyc.remarks = remarks;
    await user.save();
    await this.audit.record({
      action: decision === KycStatus.VERIFIED ? AuditAction.KYC_VERIFIED : AuditAction.KYC_REJECTED,
      actor: { id: actor.id, role: actor.role },
      entity: { type: 'User', id: user.id },
      context: ctx,
      details: { customerId: user.customerId, remarks },
    });
    this.events.emit(DomainEvents.KYC_REVIEWED, {
      userId: user.id,
      decision,
      remarks,
    } satisfies KycReviewedEvent);
    return toUserProfile(user.toObject());
  }

  /** Disabling a profile also signs it out everywhere, immediately. */
  async setStatus(
    actor: AuthUser,
    id: string,
    status: UserStatus,
    reason: string,
    ctx: RequestContext,
  ) {
    if (actor.id === id) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'You cannot change your own status',
        HttpStatus.FORBIDDEN,
      );
    }
    if (!isValidObjectId(id)) throw AppException.notFound('User');
    const user = await this.users.findById(id);
    if (!user) throw AppException.notFound('User');
    const previous = user.status;
    user.status = status;
    await user.save();
    const signedOut =
      status === UserStatus.DISABLED
        ? await this.sessions.revokeAllForUser(user._id.toString(), 'USER_DISABLED')
        : 0;
    await this.audit.record({
      action: AuditAction.USER_STATUS_CHANGED,
      actor: { id: actor.id, role: actor.role },
      entity: { type: 'User', id: user.id },
      context: ctx,
      details: { from: previous, to: status, reason, sessionsRevoked: signedOut },
    });
    return toUserProfile(user.toObject());
  }

  private async loadCustomer(id: string) {
    if (!isValidObjectId(id)) throw AppException.notFound('Customer');
    const user = await this.users.findOne({ _id: id, role: Role.CUSTOMER });
    if (!user) throw AppException.notFound('Customer');
    return user;
  }
}
