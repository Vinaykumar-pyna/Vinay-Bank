import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsMongoId, IsString, Matches, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser, ReqContext, Roles } from '../../common/decorators/auth.decorators';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser, RequestContext } from '../../common/types/auth.types';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { BulkPaymentsService, type BulkResult } from './bulk-payments.service';
import { MAX_PAIN001_CHARS } from './pain001.parser';

class BulkFileDto {
  /** The pain.001 XML document */
  @IsString()
  @MaxLength(MAX_PAIN001_CHARS)
  xml: string;
}

class BulkSubmitDto extends BulkFileDto {
  @IsMongoId()
  challengeId: string;

  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code' })
  otp: string;
}

class SampleQueryDto {
  @IsMongoId()
  accountId: string;
}

@ApiTags('Bulk payments (ISO 20022)')
@ApiBearerAuth('access-token')
@Roles(Role.CUSTOMER)
@Controller('bulk-payments')
export class BulkPaymentsController {
  constructor(private readonly bulk: BulkPaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'My recent bulk payment files' })
  list(@CurrentUser() user: AuthUser) {
    return this.bulk.list(user);
  }

  @Get('sample')
  @SkipEnvelope()
  @ApiOperation({ summary: 'Download a sample pain.001.001.03 file for one of my accounts' })
  async sample(
    @CurrentUser() user: AuthUser,
    @Query() query: SampleQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, xml } = await this.bulk.sample(user, query.accountId);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(Buffer.from(xml, 'utf8'));
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Step 1: validate a pain.001 file (XPath) and send an OTP if it is valid',
  })
  preview(@CurrentUser() user: AuthUser, @Body() dto: BulkFileDto) {
    return this.bulk.preview(user, dto.xml);
  }

  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Unique per submission (UUID)',
  })
  @ApiOperation({
    summary: 'Step 2: pay every payment in the file atomically (OTP verified, idempotent)',
  })
  async submit(
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkSubmitDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @ReqContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<BulkResult> {
    const key = IdempotencyService.validateKey(idempotencyKey);
    const { result, replayed } = await this.bulk.submit(
      user,
      dto.xml,
      dto.challengeId,
      dto.otp,
      key,
      ctx,
    );
    if (replayed) res.setHeader('Idempotent-Replayed', 'true');
    res.status(replayed ? HttpStatus.OK : HttpStatus.CREATED);
    return result;
  }
}
