import type { Types } from 'mongoose';
import type { Role } from '../../common/enums/role.enum';
import type { Address, KycStatus, User, UserStatus } from './user.schema';

/**
 * Public representation of a user. Responses are always built through a mapper
 * like this, never by returning a raw document, so secrets such as the password
 * hash or encrypted fields can never leak by accident.
 */
export interface UserProfile {
  id: string;
  role: Role;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth?: string;
  address?: Address;
  customerId?: string;
  employeeId?: string;
  branchCode?: string;
  status: UserStatus;
  kyc: { status: KycStatus; panMasked?: string; reviewedAt?: string; remarks?: string };
  mfaEnabled: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

type UserLike = User & { _id: Types.ObjectId };

export function toUserProfile(user: UserLike): UserProfile {
  return {
    id: user._id.toString(),
    role: user.role,
    email: user.email,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`,
    dateOfBirth: user.dateOfBirth?.toISOString().slice(0, 10),
    address: user.address
      ? {
          line1: user.address.line1,
          line2: user.address.line2,
          city: user.address.city,
          state: user.address.state,
          pincode: user.address.pincode,
        }
      : undefined,
    customerId: user.customerId,
    employeeId: user.employeeId,
    branchCode: user.branchCode,
    status: user.status,
    kyc: {
      status: user.kyc?.status,
      panMasked: user.kyc?.panMasked,
      reviewedAt: user.kyc?.reviewedAt?.toISOString(),
      remarks: user.kyc?.remarks,
    },
    mfaEnabled: Boolean(user.mfa?.enabled),
    lastLoginAt: user.lastLoginAt?.toISOString(),
    createdAt: user.createdAt?.toISOString(),
  };
}
