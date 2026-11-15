import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CARD_LIMIT_CAPS, HotlistReason } from '../schemas/card.schema';

export class IssueCardDto {
  /** Account the debit card draws from */
  @IsMongoId()
  accountId: string;
}

export class OtpProofDto {
  @IsMongoId()
  challengeId: string;

  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code' })
  otp: string;
}

export class SetPinDto extends OtpProofDto {
  /** 4-digit PIN; trivial PINs such as 1111 or 1234 are refused */
  @Matches(/^\d{4}$/, { message: 'The PIN must be 4 digits' })
  pin: string;
}

class CardControlsDto {
  @IsOptional() @IsBoolean() atm?: boolean;
  @IsOptional() @IsBoolean() pos?: boolean;
  @IsOptional() @IsBoolean() ecommerce?: boolean;
  @IsOptional() @IsBoolean() contactless?: boolean;
  @IsOptional() @IsBoolean() international?: boolean;
}

class CardLimitsDto {
  /** Paise, up to Rs 50,000 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(CARD_LIMIT_CAPS.atmDaily)
  atmDaily?: number;

  /** Paise, up to Rs 2,00,000 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(CARD_LIMIT_CAPS.posDaily)
  posDaily?: number;
}

export class UpdateCardSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CardControlsDto)
  controls?: CardControlsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CardLimitsDto)
  limits?: CardLimitsDto;
}

export class HotlistCardDto {
  @IsEnum(HotlistReason)
  reason: HotlistReason;
}
