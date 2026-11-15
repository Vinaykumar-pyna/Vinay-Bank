import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsJWT,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  INDIAN_MOBILE_PATTERN,
  IsAdult,
  IsBankPassword,
  PAN_PATTERN,
  PINCODE_PATTERN,
} from '../../../common/validators/banking.validators';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upperTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const NAME_PATTERN = /^[A-Za-z][A-Za-z .'-]*$/;

export class AddressDto {
  @Transform(trim)
  @IsString()
  @Length(3, 120)
  line1: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  line2?: string;

  @Transform(trim)
  @IsString()
  @Length(2, 60)
  city: string;

  @Transform(trim)
  @IsString()
  @Length(2, 60)
  state: string;

  @Matches(PINCODE_PATTERN, { message: 'Enter a valid 6-digit PIN code' })
  pincode: string;
}

export class RegisterDto {
  @Transform(trim)
  @IsString()
  @Length(2, 50)
  @Matches(NAME_PATTERN, { message: 'First name can contain letters, spaces, dots and hyphens' })
  firstName: string;

  @Transform(trim)
  @IsString()
  @Length(1, 50)
  @Matches(NAME_PATTERN, { message: 'Last name can contain letters, spaces, dots and hyphens' })
  lastName: string;

  @Transform(trim)
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(120)
  email: string;

  /** 10-digit Indian mobile number */
  @Matches(INDIAN_MOBILE_PATTERN, { message: 'Enter a valid 10-digit Indian mobile number' })
  phone: string;

  @IsBankPassword()
  password: string;

  /** ISO date, YYYY-MM-DD */
  @IsDateString({ strict: true }, { message: 'Enter your date of birth as YYYY-MM-DD' })
  @IsAdult(18)
  dateOfBirth: string;

  /** Permanent Account Number, e.g. ABCPE1234F */
  @Transform(upperTrim)
  @Matches(PAN_PATTERN, { message: 'Enter a valid PAN, for example ABCPE1234F' })
  pan: string;

  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @IsBoolean()
  @Equals(true, { message: 'Please accept the terms and conditions' })
  acceptTerms: boolean;
}

export class LoginDto {
  @Transform(trim)
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(120)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class MfaLoginDto {
  @IsJWT()
  mfaToken: string;

  /** 6-digit code from the authenticator app, or a recovery code like ABCD-EFGH */
  @Transform(trim)
  @Matches(/^(\d{6}|[A-Za-z2-7]{4}-?[A-Za-z2-7]{4})$/, {
    message: 'Enter the 6-digit code or a recovery code',
  })
  code: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @IsBankPassword()
  newPassword: string;
}

export class MfaCodeDto {
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from your authenticator app' })
  code: string;
}

export class DisableMfaDto {
  @IsString()
  @MaxLength(128)
  password: string;

  @Transform(trim)
  @Matches(/^(\d{6}|[A-Za-z2-7]{4}-?[A-Za-z2-7]{4})$/, {
    message: 'Enter the 6-digit code or a recovery code',
  })
  code: string;
}
