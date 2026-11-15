import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { findBranchByCode } from '../../common/constants/branches';
import { STAFF_ROLES } from '../../common/enums/role.enum';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { AuthUser, RequestContext } from '../../common/types/auth.types';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { CountersService } from '../counters/counters.service';
import { toUserProfile, type UserProfile } from '../users/user.mapper';
import { KycStatus, User } from '../users/user.schema';
import type { CreateStaffDto } from './dto/staff.dto';

/** Administration of bank staff accounts (admins only). */
@Injectable()
export class StaffUsersService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly passwords: PasswordService,
    private readonly counters: CountersService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<UserProfile[]> {
    const staff = await this.users
      .find({ role: { $in: STAFF_ROLES } })
      .sort({ role: 1, firstName: 1 })
      .lean();
    return staff.map(toUserProfile);
  }

  async create(admin: AuthUser, dto: CreateStaffDto, ctx: RequestContext): Promise<UserProfile> {
    if (!findBranchByCode(dto.branchCode)) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Unknown branch code');
    }
    const email = dto.email.toLowerCase();
    if (await this.users.exists({ $or: [{ email }, { phone: dto.phone }] })) {
      throw AppException.conflict(
        'A user with this email or mobile number already exists',
        ErrorCode.DUPLICATE_RESOURCE,
      );
    }
    const employeeId = `EMP${1000 + (await this.counters.next('employee'))}`;
    const created = await this.users.create({
      role: dto.role,
      email,
      phone: dto.phone,
      firstName: dto.firstName,
      lastName: dto.lastName,
      passwordHash: await this.passwords.hash(dto.password),
      employeeId,
      branchCode: dto.branchCode,
      kyc: { status: KycStatus.VERIFIED },
    });
    await this.audit.record({
      action: AuditAction.STAFF_CREATED,
      actor: { id: admin.id, role: admin.role },
      entity: { type: 'User', id: created.id },
      context: ctx,
      details: { employeeId, role: dto.role, branchCode: dto.branchCode },
    });
    return toUserProfile(created.toObject());
  }
}
