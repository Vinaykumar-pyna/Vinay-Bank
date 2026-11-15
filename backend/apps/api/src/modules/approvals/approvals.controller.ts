import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, ReqContext, Roles } from '../../common/decorators/auth.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser, RequestContext } from '../../common/types/auth.types';
import { ApprovalStatus, ApprovalType } from './approval.schema';
import { ApprovalsService } from './approvals.service';

class ApprovalQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ApprovalStatus)
  status?: ApprovalStatus;

  @IsOptional()
  @IsEnum(ApprovalType)
  type?: ApprovalType;
}

class DecisionDto {
  @IsIn([ApprovalStatus.APPROVED, ApprovalStatus.REJECTED])
  decision: ApprovalStatus.APPROVED | ApprovalStatus.REJECTED;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Type(() => String)
  remarks?: string;
}

@ApiTags('Approvals (maker-checker)')
@ApiBearerAuth('access-token')
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  @Roles(Role.TELLER, Role.MANAGER, Role.ADMIN)
  @ApiOperation({ summary: 'Approval queue (pending first)' })
  list(@Query() query: ApprovalQueryDto) {
    return this.approvals.list(query);
  }

  @Post(':id/decision')
  @Roles(Role.MANAGER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject a request (checker only, never the maker)' })
  decide(
    @Param('id') id: string,
    @Body() dto: DecisionDto,
    @CurrentUser() user: AuthUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.approvals.decide(id, user, dto.decision, dto.remarks, ctx);
  }
}
