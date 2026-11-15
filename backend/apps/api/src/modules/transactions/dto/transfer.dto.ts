import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaymentRail } from '../../../common/enums/banking.enums';

export const TRANSFER_PURPOSES = [
  'TRANSFER',
  'RENT',
  'BILLS',
  'FAMILY',
  'SHOPPING',
  'EDUCATION',
  'INVESTMENT',
  'OTHER',
] as const;
export type TransferPurpose = (typeof TRANSFER_PURPOSES)[number];

export class TransferRequestDto {
  @IsMongoId()
  fromAccountId: string;

  /** OWN: between the customer's accounts. BENEFICIARY: to a saved payee. */
  @IsIn(['OWN', 'BENEFICIARY'])
  mode: 'OWN' | 'BENEFICIARY';

  @ValidateIf((o: TransferRequestDto) => o.mode === 'OWN')
  @IsMongoId()
  toAccountId?: string;

  @ValidateIf((o: TransferRequestDto) => o.mode === 'BENEFICIARY')
  @IsMongoId()
  beneficiaryId?: string;

  /** For other banks: IMPS (default), NEFT or RTGS. Ignored for ArthaBank payees. */
  @IsOptional()
  @IsIn([PaymentRail.IMPS, PaymentRail.NEFT, PaymentRail.RTGS])
  rail?: PaymentRail;

  /** Amount in paise (Rs 1 to Rs 10 crore) */
  @IsInt({ message: 'Amount must be a whole number of paise' })
  @Min(100, { message: 'The minimum transfer is Rs 1' })
  @Max(10_000_000_000, { message: 'The maximum transfer is Rs 10 crore' })
  amount: number;

  @IsOptional()
  @IsIn(TRANSFER_PURPOSES)
  purpose?: TransferPurpose;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(60)
  @Matches(/^[A-Za-z0-9 .,&()/'-]*$/, {
    message: 'Remarks can contain letters, digits and basic punctuation',
  })
  remarks?: string;
}

export class ExecuteTransferDto {
  @IsString()
  @MaxLength(4096)
  quoteToken: string;

  /** SMS OTP, authenticator code or recovery code, when the quote asked for one */
  @IsOptional()
  @Matches(/^(\d{6}|[A-Za-z2-7]{4}-?[A-Za-z2-7]{4})$/, { message: 'Enter the 6-digit code' })
  otp?: string;
}
