import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsModule } from '../accounts/accounts.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { UsersModule } from '../users/users.module';
import { BeneficiariesController } from './beneficiaries.controller';
import { BeneficiariesService } from './beneficiaries.service';
import { Beneficiary, BeneficiarySchema } from './beneficiary.schema';

@Module({
  imports: [
    AccountsModule,
    IntegrationsModule,
    UsersModule,
    MongooseModule.forFeature([{ name: Beneficiary.name, schema: BeneficiarySchema }]),
  ],
  controllers: [BeneficiariesController],
  providers: [BeneficiariesService],
  exports: [BeneficiariesService, MongooseModule],
})
export class BeneficiariesModule {}
