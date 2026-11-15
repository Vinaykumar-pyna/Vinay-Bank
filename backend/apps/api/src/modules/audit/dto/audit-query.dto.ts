import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class AuditQueryDto extends PaginationQueryDto {
  /** One record by its sequence number, e.g. the one a failed verification points to */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seq?: number;

  /** Filter by action, e.g. TRANSFER_COMPLETED */
  @IsOptional()
  @Matches(/^[A-Z_]{3,60}$/)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  actorId?: string;

  @IsOptional()
  @Matches(/^[A-Za-z]{2,40}$/)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
