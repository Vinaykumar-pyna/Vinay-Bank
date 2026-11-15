import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { AccountsModule } from '../accounts/accounts.module';
import { AuthModule } from '../auth/auth.module';
import { BeneficiariesModule } from '../beneficiaries/beneficiaries.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { UsersModule } from '../users/users.module';
import { BankingSeeder } from './banking-seeder';
import { SeedService } from './seed.service';

@Module({
  imports: [
    UsersModule,
    AuthModule,
    AccountsModule,
    BeneficiariesModule,
    TransactionsModule,
    CardsModule,
  ],
  providers: [SeedService, BankingSeeder],
  exports: [SeedService],
})
export class SeedModule {}
