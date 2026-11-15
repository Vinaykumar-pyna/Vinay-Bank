import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { UsersModule } from '../users/users.module';
import { SoapBankingService } from './soap-banking.service';

/** SOAP 1.1 partner service; mounted on Express by soap.setup.ts (node-soap). */
@Module({
  imports: [AccountsModule, UsersModule, IntegrationsModule],
  providers: [SoapBankingService],
  exports: [SoapBankingService],
})
export class SoapModule {}
