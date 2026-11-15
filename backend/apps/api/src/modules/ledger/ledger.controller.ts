import { Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/auth.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Role } from '../../common/enums/role.enum';
import { LedgerProjector } from './ledger-projector.service';
import { LedgerReportsService } from './ledger-reports.service';

@ApiTags('General ledger (SQL)')
@ApiBearerAuth('access-token')
@Roles(Role.MANAGER, Role.ADMIN)
@Controller('ledger')
export class LedgerController {
  constructor(
    private readonly projector: LedgerProjector,
    private readonly reports: LedgerReportsService,
  ) {}

  @Get('trial-balance')
  @ApiOperation({ summary: 'Trial balance by GL account (posts anything pending first)' })
  async trialBalance() {
    await this.projector.sync();
    return this.reports.trialBalance();
  }

  @Get('reconciliation')
  @ApiOperation({ summary: 'Customer balances in MongoDB versus the SQL sub-ledger' })
  async reconciliation() {
    await this.projector.sync();
    return this.reports.reconciliation();
  }

  @Get('journal')
  @ApiOperation({ summary: 'Journal entries with their debit and credit lines (newest first)' })
  journal(@Query() query: PaginationQueryDto) {
    return this.reports.journal(query.page, query.limit);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Post pending core transactions to the ledger now' })
  sync() {
    return this.projector.sync();
  }
}
