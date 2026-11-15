import { IsEnum, IsIn, IsMongoId, IsOptional, IsString, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  PaymentRail,
  TransactionStatus,
  TransactionType,
} from '../../../common/enums/banking.enums';

export class TransactionQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsEnum(PaymentRail)
  rail?: PaymentRail;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  riskLevel?: string;

  @IsOptional()
  @IsMongoId()
  accountId?: string;

  /** Reference prefix, e.g. AB2611 */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{2,20}$/)
  search?: string;
}
