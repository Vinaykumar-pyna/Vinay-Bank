import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApprovalsModule } from '../approvals/approvals.module';
import { UsersModule } from '../users/users.module';
import { AccountLedgerService } from './account-ledger.service';
import { AccountOpeningHandler } from './account-opening.handler';
import { AccountsController } from './accounts.controller';
import { AccountsListener } from './accounts.listener';
import { AccountsService } from './accounts.service';
import { StatementXmlService } from './statement-xml.service';
import { Account, AccountSchema } from './schemas/account.schema';
import { Posting, PostingSchema } from './schemas/posting.schema';

@Module({
  imports: [
    UsersModule,
    ApprovalsModule,
    MongooseModule.forFeature([
      { name: Account.name, schema: AccountSchema },
      { name: Posting.name, schema: PostingSchema },
    ]),
  ],
  controllers: [AccountsController],
  providers: [
    AccountsService,
    AccountLedgerService,
    AccountsListener,
    AccountOpeningHandler,
    StatementXmlService,
  ],
  exports: [AccountsService, AccountLedgerService, MongooseModule],
})
export class AccountsModule {}
