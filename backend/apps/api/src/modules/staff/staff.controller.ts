import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Matches } from 'class-validator';
import { CurrentUser, ReqContext, Roles } from '../../common/decorators/auth.decorators';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser, RequestContext } from '../../common/types/auth.types';
import { IdempotencyService } from '../idempotency/idempotency.service';
import type { TransactionView } from '../transactions/transaction.mapper';
import { CashService } from './cash.service';
import { CustomersAdminService } from './customers-admin.service';
import {
  CashOperationDto,
  CreateStaffDto,
  CustomerSearchDto,
  KycDecisionDto,
  UserStatusDto,
} from './dto/staff.dto';
import { StaffOverviewService } from './staff-overview.service';
import { StaffUsersService } from './staff-users.service';

class AccountLookupDto {
  @Matches(/^\d{12}$/, { message: 'Enter the 12-digit Vinay Bank account number' })
  accountNumber: string;
}

@ApiTags('Staff portal')
@ApiBearerAuth('access-token')
@Roles(Role.TELLER, Role.MANAGER, Role.ADMIN)
@Controller('staff')
export class StaffController {
  constructor(
    private readonly overviewService: StaffOverviewService,
    private readonly customers: CustomersAdminService,
    private readonly cash: CashService,
    private readonly staffUsers: StaffUsersService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'KPIs: customers, deposits, volumes, approvals, fraud flags' })
  overview(@CurrentUser() user: AuthUser) {
    return this.overviewService.overview(user);
  }

  @Get('customers')
  @ApiOperation({ summary: 'Search customers (name, email, mobile, customer id) with KYC filter' })
  searchCustomers(@Query() query: CustomerSearchDto, @CurrentUser() user: AuthUser) {
    return this.customers.search(query, user);
  }

  @Get('customers/:id')
  @ApiOperation({ summary: 'Customer profile, accounts and recent transactions' })
  customer(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.customers.detail(id, user);
  }

  @Post('customers/:id/kyc')
  @Roles(Role.MANAGER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify or reject a customer’s KYC (manager)' })
  reviewKyc(
    @Param('id') id: string,
    @Body() dto: KycDecisionDto,
    @CurrentUser() user: AuthUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.customers.reviewKyc(user, id, dto.decision, dto.remarks, ctx);
  }

  @Post('users/:id/status')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enable or disable any user; disabling signs them out everywhere (admin)',
  })
  setUserStatus(
    @Param('id') id: string,
    @Body() dto: UserStatusDto,
    @CurrentUser() user: AuthUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.customers.setStatus(user, id, dto.status, dto.reason, ctx);
  }

  @Get('accounts/lookup')
  @ApiOperation({ summary: 'Find an account by number (teller counter)' })
  lookup(@Query() query: AccountLookupDto) {
    return this.cash.lookup(query.accountNumber);
  }

  @Post('cash/deposit')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Unique per cash slip (UUID)',
  })
  @ApiOperation({
    summary: 'Cash deposit at the branch (Rs 2 lakh or more needs approval; idempotent)',
  })
  async deposit(
    @Body() dto: CashOperationDto,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @ReqContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = IdempotencyService.validateKey(idempotencyKey);
    return this.cashResponse(res, await this.cash.operate('DEPOSIT', user, dto, key, ctx));
  }

  @Post('cash/withdrawal')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Unique per cash slip (UUID)',
  })
  @ApiOperation({
    summary: 'Cash withdrawal at the branch (Rs 50,000 or more needs approval; idempotent)',
  })
  async withdraw(
    @Body() dto: CashOperationDto,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @ReqContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = IdempotencyService.validateKey(idempotencyKey);
    return this.cashResponse(res, await this.cash.operate('WITHDRAWAL', user, dto, key, ctx));
  }

  /** 201 for a new posting, 200 with Idempotent-Replayed for a safe retry. */
  private cashResponse(
    res: Response,
    { transaction, replayed }: { transaction: TransactionView; replayed: boolean },
  ) {
    if (replayed) res.setHeader('Idempotent-Replayed', 'true');
    res.status(replayed ? HttpStatus.OK : HttpStatus.CREATED);
    return transaction;
  }

  @Get('users')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Staff directory (admin)' })
  listStaff() {
    return this.staffUsers.list();
  }

  @Post('users')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a staff user (admin)' })
  createStaff(
    @Body() dto: CreateStaffDto,
    @CurrentUser() user: AuthUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.staffUsers.create(user, dto, ctx);
  }
}
