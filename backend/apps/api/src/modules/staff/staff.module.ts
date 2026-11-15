import { Module } from '@nestjs/common';
import { RiskModule } from '../risk/risk.module';
import { AccountsModule } from '../accounts/accounts.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AuthModule } from '../auth/auth.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { UsersModule } from '../users/users.module';
import { CashService } from './cash.service';
import { CustomersAdminService } from './customers-admin.service';
import { StaffOverviewService } from './staff-overview.service';
import { StaffUsersService } from './staff-users.service';
import { StaffController } from './staff.controller';

@Module({
  imports: [
    UsersModule,
    AuthModule,
    AccountsModule,
    TransactionsModule,
    ApprovalsModule,
    RiskModule,
  ],
  controllers: [StaffController],
  providers: [StaffOverviewService, CustomersAdminService, CashService, StaffUsersService],
})
export class StaffModule {}
