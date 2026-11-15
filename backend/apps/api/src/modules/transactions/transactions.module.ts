import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsModule } from '../accounts/accounts.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { BeneficiariesModule } from '../beneficiaries/beneficiaries.module';
import { OtpModule } from '../otp/otp.module';
import { RiskModule } from '../risk/risk.module';
import { UsersModule } from '../users/users.module';
import { Transaction, TransactionSchema } from './schemas/transaction.schema';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { QuoteTokenService } from './transfers/quote-token.service';
import { SettlementService } from './transfers/settlement.service';
import { TransferApprovalHandler } from './transfers/transfer-approval.handler';
import { TransfersController } from './transfers/transfers.controller';
import { TransfersService } from './transfers/transfers.service';

@Module({
  imports: [
    AccountsModule,
    BeneficiariesModule,
    ApprovalsModule,
    RiskModule,
    OtpModule,
    UsersModule,
    MongooseModule.forFeature([{ name: Transaction.name, schema: TransactionSchema }]),
  ],
  controllers: [TransfersController, TransactionsController],
  providers: [
    TransactionsService,
    TransfersService,
    QuoteTokenService,
    SettlementService,
    TransferApprovalHandler,
  ],
  exports: [TransactionsService, TransfersService, MongooseModule],
})
export class TransactionsModule {}
