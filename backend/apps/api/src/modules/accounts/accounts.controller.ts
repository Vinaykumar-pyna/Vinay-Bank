import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, Length } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser, ReqContext, Roles } from '../../common/decorators/auth.decorators';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { AccountStatus } from '../../common/enums/banking.enums';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser, RequestContext } from '../../common/types/auth.types';
import { BRANCHES } from '../../common/constants/branches';
import { toAccountView } from './account.mapper';
import { AccountsService } from './accounts.service';
import { StatementXmlService } from './statement-xml.service';
import { OpenAccountDto, StatementQueryDto, UpdateAccountDto } from './dto/accounts.dto';

class AccountStatusDto {
  @IsIn([AccountStatus.ACTIVE, AccountStatus.FROZEN, AccountStatus.CLOSED])
  status: AccountStatus.ACTIVE | AccountStatus.FROZEN | AccountStatus.CLOSED;

  @IsString()
  @Length(3, 200)
  reason: string;
}

@ApiTags('Accounts')
@ApiBearerAuth('access-token')
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly statements: StatementXmlService,
  ) {}

  @Get()
  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: 'My accounts' })
  list(@CurrentUser() user: AuthUser) {
    return this.accounts.listForCustomer(user.id);
  }

  @Get('overview')
  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: 'Dashboard data: balances, 6-month cash flow, spending by category' })
  overview(@CurrentUser() user: AuthUser) {
    return this.accounts.overview(user.id);
  }

  @Get('branches')
  @ApiOperation({ summary: 'ArthaBank branches and IFSC codes' })
  branches() {
    return BRANCHES;
  }

  @Post()
  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: 'Request a new account (needs branch approval)' })
  request(
    @CurrentUser() user: AuthUser,
    @Body() dto: OpenAccountDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.accounts.request(user, dto, ctx);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Account details (owner or staff)' })
  async get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return toAccountView((await this.accounts.getAccessible(id, user)).toObject());
  }

  @Patch(':id')
  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: 'Update nickname or daily transfer limit' })
  update(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: UpdateAccountDto) {
    return this.accounts.updateSettings(id, user, dto);
  }

  @Get(':id/statement')
  @ApiOperation({ summary: 'Statement lines with running balance (filter by date, type, text)' })
  statement(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query() query: StatementQueryDto,
  ) {
    return this.accounts.statement(id, user, query);
  }

  @Get(':id/statement.csv')
  @SkipEnvelope()
  @ApiOperation({ summary: 'Download the statement as CSV' })
  async statementCsv(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query() query: StatementQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, csv } = await this.accounts.statementCsv(id, user, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // UTF-8 byte order mark so Excel renders the rupee symbol and names correctly.
    return new StreamableFile(Buffer.from(`\uFEFF${csv}`, 'utf8'));
  }

  @Get(':id/statement.xml')
  @SkipEnvelope()
  @ApiOperation({ summary: 'Download the statement as XML' })
  async statementXml(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query() query: StatementQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, xml } = await this.statements.xml(id, user, query);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xml"`);
    return new StreamableFile(Buffer.from(xml, 'utf8'));
  }

  @Get(':id/statement.html')
  @SkipEnvelope()
  @ApiOperation({ summary: 'Printable statement: the XML statement transformed to HTML with XSLT' })
  async statementHtml(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query() query: StatementQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { html } = await this.statements.html(id, user, query);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(Buffer.from(html, 'utf8'));
  }

  @Post(':id/status')
  @Roles(Role.MANAGER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Freeze, unfreeze or close an account (staff)' })
  setStatus(
    @Param('id') id: string,
    @Body() dto: AccountStatusDto,
    @CurrentUser() user: AuthUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.accounts.setStatus(id, dto.status, dto.reason, user, ctx);
  }
}
