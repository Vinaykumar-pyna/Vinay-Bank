import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { Role } from '../../../common/enums/role.enum';
import {
  INDIAN_MOBILE_PATTERN,
  IsBankPassword,
} from '../../../common/validators/banking.validators';
import { KycStatus, UserStatus } from '../../users/user.schema';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CustomerSearchDto extends PaginationQueryDto {
  /** Name, email, mobile or customer id (prefix match) */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  search?: string;

  @IsOptional()
  @IsEnum(KycStatus)
  kycStatus?: KycStatus;
}

export class KycDecisionDto {
  @IsIn([KycStatus.VERIFIED, KycStatus.REJECTED])
  decision: KycStatus.VERIFIED | KycStatus.REJECTED;

  @Transform(trim)
  @IsString()
  @Length(3, 300)
  remarks: string;
}

export class UserStatusDto {
  @IsEnum(UserStatus)
  status: UserStatus;

  @Transform(trim)
  @IsString()
  @Length(3, 200)
  reason: string;
}

export class CashOperationDto {
  @Matches(/^\d{12}$/, { message: 'Enter the 12-digit Vinay Bank account number' })
  accountNumber: string;

  /** Amount in paise (Rs 100 to Rs 50 lakh) */
  @IsInt()
  @Min(10_000)
  @Max(500_000_000)
  amount: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  @Matches(/^[A-Za-z0-9 .,&()/'-]*$/)
  remarks?: string;

  /** Who handed over or collected the cash, if not the account holder */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  @Matches(/^[A-Za-z .'-]*$/)
  counterpartyName?: string;
}

export class CreateStaffDto {
  @Transform(trim)
  @IsString()
  @Length(2, 50)
  firstName: string;

  @Transform(trim)
  @IsString()
  @Length(1, 50)
  lastName: string;

  @Transform(trim)
  @IsEmail()
  email: string;

  @Matches(INDIAN_MOBILE_PATTERN, { message: 'Enter a valid 10-digit mobile number' })
  phone: string;

  @IsIn([Role.TELLER, Role.MANAGER, Role.ADMIN])
  role: Role.TELLER | Role.MANAGER | Role.ADMIN;

  @Matches(/^\d{4}$/)
  branchCode: string;

  @IsBankPassword()
  password: string;
}
