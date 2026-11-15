import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { AccountType } from '../../../common/enums/banking.enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class OpenAccountDto {
  @IsEnum(AccountType)
  type: AccountType;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  nickname?: string;

  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'Choose a valid branch' })
  branchCode?: string;
}

export class UpdateAccountDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  nickname?: string;

  /** New daily transfer limit in paise (up to the product maximum). */
  @IsOptional()
  @IsInt()
  @Min(100_000)
  dailyTransferLimit?: number;
}

export class StatementQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @IsIn(['ALL', 'DEBIT', 'CREDIT'])
  direction?: 'ALL' | 'DEBIT' | 'CREDIT';

  /** Free-text search in narration, counterparty and reference */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  search?: string;
}
