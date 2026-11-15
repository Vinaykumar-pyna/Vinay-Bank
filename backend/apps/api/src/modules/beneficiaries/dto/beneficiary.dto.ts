import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { IFSC_PATTERN } from '../../../common/validators/banking.validators';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const NAME_PATTERN = /^[A-Za-z][A-Za-z .&'-]*$/;

export class AddBeneficiaryDto {
  @Transform(trim)
  @IsString()
  @Length(2, 60)
  @Matches(NAME_PATTERN, { message: 'Enter the account holder name as letters' })
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  nickname?: string;

  @Transform(trim)
  @Matches(/^\d{9,18}$/, { message: 'Account numbers have 9 to 18 digits' })
  accountNumber: string;

  @Transform(trim)
  @Matches(/^\d{9,18}$/, { message: 'Account numbers have 9 to 18 digits' })
  confirmAccountNumber: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(IFSC_PATTERN, { message: 'Enter a valid 11-character IFSC code' })
  ifsc: string;
}
