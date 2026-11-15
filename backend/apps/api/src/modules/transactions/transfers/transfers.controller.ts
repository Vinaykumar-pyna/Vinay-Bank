import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser, ReqContext, Roles } from '../../../common/decorators/auth.decorators';
import { Role } from '../../../common/enums/role.enum';
import type { AuthUser, RequestContext } from '../../../common/types/auth.types';
import { IdempotencyService } from '../../idempotency/idempotency.service';
import { ExecuteTransferDto, TransferRequestDto } from '../dto/transfer.dto';
import { describeRails } from '../rails/payment-rails';
import { TransfersService } from './transfers.service';

@ApiTags('Transfers')
@ApiBearerAuth('access-token')
@Roles(Role.CUSTOMER)
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get('rails')
  @ApiOperation({ summary: 'Payment rails available for other banks (IMPS, NEFT, RTGS)' })
  rails() {
    return describeRails();
  }

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Step 1: validate and price a transfer, run fraud checks, send OTP if needed',
  })
  quote(
    @CurrentUser() user: AuthUser,
    @Body() dto: TransferRequestDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.transfers.quote(user, dto, ctx);
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Unique per transfer attempt (UUID)',
  })
  @ApiOperation({
    summary: 'Step 2: confirm the quoted transfer (idempotent, OTP-verified, atomic)',
  })
  async execute(
    @CurrentUser() user: AuthUser,
    @Body() dto: ExecuteTransferDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @ReqContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = IdempotencyService.validateKey(idempotencyKey);
    const { transaction, replayed } = await this.transfers.execute(user, dto, key, ctx);
    if (replayed) res.setHeader('Idempotent-Replayed', 'true');
    res.status(replayed ? HttpStatus.OK : HttpStatus.CREATED);
    return transaction;
  }
}
