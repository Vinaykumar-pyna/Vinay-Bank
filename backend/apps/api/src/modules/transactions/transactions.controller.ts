import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser } from '../../common/types/auth.types';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { TransactionsService } from './transactions.service';
import { SettlementService } from './transfers/settlement.service';

@ApiTags('Transactions')
@ApiBearerAuth('access-token')
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly settlement: SettlementService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Transactions (customers: their own; staff: all, with risk filters)' })
  list(@CurrentUser() user: AuthUser, @Query() query: TransactionQueryDto) {
    return this.transactions.list(user, query);
  }

  @Post('settlement/run')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Run the NEFT settlement batch now (operations)' })
  async runSettlement() {
    return { settled: await this.settlement.settleDue() };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Transaction details' })
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.transactions.getForUser(id, user);
  }
}
