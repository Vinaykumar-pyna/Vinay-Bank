import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, type Types } from 'mongoose';
import { isValidAccountNumber, maskAccountNumber } from '@app/shared';
import { isOwnIfsc } from '../../common/constants/branches';
import { AccountStatus } from '../../common/enums/banking.enums';
import { DomainEvents, type BeneficiaryAddedEvent } from '../../common/events/domain-events';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { AuthUser, RequestContext } from '../../common/types/auth.types';
import type { AppConfig } from '../../config/configuration';
import { AccountsService } from '../accounts/accounts.service';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { IfscService } from '../integrations/ifsc.service';
import { UsersService } from '../users/users.service';
import { Beneficiary, BeneficiaryDocument, BeneficiaryStatus } from './beneficiary.schema';
import type { AddBeneficiaryDto } from './dto/beneficiary.dto';

export interface BeneficiaryView {
  id: string;
  name: string;
  nickname?: string;
  accountNumber: string;
  maskedAccount: string;
  ifsc: string;
  bankName: string;
  branchName?: string;
  isInternal: boolean;
  inCoolingPeriod: boolean;
  coolingUntil: string;
  createdAt: string;
}

export function toBeneficiaryView(b: Beneficiary & { _id: Types.ObjectId }): BeneficiaryView {
  return {
    id: b._id.toString(),
    name: b.name,
    nickname: b.nickname,
    accountNumber: b.accountNumber,
    maskedAccount: maskAccountNumber(b.accountNumber),
    ifsc: b.ifsc,
    bankName: b.bankName,
    branchName: b.branchName,
    isInternal: b.isInternal,
    inCoolingPeriod: b.coolingUntil > new Date(),
    coolingUntil: b.coolingUntil.toISOString(),
    createdAt: b.createdAt.toISOString(),
  };
}

@Injectable()
export class BeneficiariesService {
  private readonly coolingHours: number;

  constructor(
    @InjectModel(Beneficiary.name) private readonly beneficiaries: Model<Beneficiary>,
    private readonly ifsc: IfscService,
    private readonly accounts: AccountsService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    config: ConfigService<AppConfig, true>,
  ) {
    this.coolingHours = config.get('banking', { infer: true }).beneficiaryCoolingHours;
  }

  async list(ownerId: string): Promise<BeneficiaryView[]> {
    const rows = await this.beneficiaries
      .find({ ownerId, status: BeneficiaryStatus.ACTIVE })
      .sort({ name: 1 })
      .lean();
    return rows.map(toBeneficiaryView);
  }

  async getOwned(id: string, ownerId: string): Promise<BeneficiaryDocument> {
    if (!isValidObjectId(id)) throw AppException.notFound('Beneficiary');
    const beneficiary = await this.beneficiaries.findOne({
      _id: id,
      ownerId,
      status: BeneficiaryStatus.ACTIVE,
    });
    if (!beneficiary) throw AppException.notFound('Beneficiary');
    return beneficiary;
  }

  async add(user: AuthUser, dto: AddBeneficiaryDto, ctx: RequestContext): Promise<BeneficiaryView> {
    if (dto.accountNumber !== dto.confirmAccountNumber) {
      throw AppException.validation([
        { field: 'confirmAccountNumber', messages: ['Account numbers do not match'] },
      ]);
    }
    const branch = await this.ifsc.lookup(dto.ifsc);

    let internalAccountId: Types.ObjectId | undefined;
    if (isOwnIfsc(dto.ifsc)) {
      // For Vinay Bank payees we can verify the account immediately (like a "penny drop" check).
      if (!isValidAccountNumber(dto.accountNumber)) {
        throw AppException.validation([
          { field: 'accountNumber', messages: ['This is not a valid Vinay Bank account number'] },
        ]);
      }
      const account = await this.accounts.findByNumber(dto.accountNumber);
      if (!account || ![AccountStatus.ACTIVE, AccountStatus.FROZEN].includes(account.status)) {
        throw AppException.unprocessable(
          ErrorCode.ACCOUNT_NOT_ACTIVE,
          'No active Vinay Bank account has this number',
        );
      }
      if (account.customerId.toString() === user.id) {
        throw AppException.unprocessable(
          ErrorCode.UNPROCESSABLE,
          'This is your own account. Use "Between my accounts" to transfer to it.',
        );
      }
      if (account.ifsc !== dto.ifsc) {
        throw AppException.validation([
          { field: 'ifsc', messages: [`This account belongs to IFSC ${account.ifsc}`] },
        ]);
      }
      internalAccountId = account._id;
    }

    const exists = await this.beneficiaries.exists({
      ownerId: user.id,
      accountNumber: dto.accountNumber,
      ifsc: dto.ifsc,
      status: BeneficiaryStatus.ACTIVE,
    });
    if (exists)
      throw AppException.conflict(
        'This beneficiary is already in your list',
        ErrorCode.DUPLICATE_RESOURCE,
      );

    const beneficiary = await this.beneficiaries.create({
      ownerId: user.id,
      name: dto.name,
      nickname: dto.nickname,
      accountNumber: dto.accountNumber,
      ifsc: dto.ifsc,
      bankName: branch.bank,
      branchName: branch.branch,
      isInternal: Boolean(internalAccountId),
      internalAccountId,
      coolingUntil: new Date(Date.now() + this.coolingHours * 3_600_000),
    });

    await this.audit.record({
      action: AuditAction.BENEFICIARY_ADDED,
      actor: { id: user.id, role: user.role },
      entity: { type: 'Beneficiary', id: beneficiary.id },
      context: ctx,
      details: { bank: branch.bank, ifsc: dto.ifsc, account: maskAccountNumber(dto.accountNumber) },
    });
    this.events.emit(DomainEvents.BENEFICIARY_ADDED, {
      userId: user.id,
      beneficiaryName: dto.name,
      maskedAccount: maskAccountNumber(dto.accountNumber),
      bankName: branch.bank,
    } satisfies BeneficiaryAddedEvent);
    return toBeneficiaryView(beneficiary.toObject());
  }

  async remove(user: AuthUser, id: string, ctx: RequestContext): Promise<void> {
    const beneficiary = await this.getOwned(id, user.id);
    beneficiary.status = BeneficiaryStatus.DELETED;
    await beneficiary.save();
    await this.audit.record({
      action: AuditAction.BENEFICIARY_REMOVED,
      actor: { id: user.id, role: user.role },
      entity: { type: 'Beneficiary', id },
      context: ctx,
      details: { account: maskAccountNumber(beneficiary.accountNumber) },
    });
  }
}
