import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsModule } from '../accounts/accounts.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OtpModule } from '../otp/otp.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { UsersModule } from '../users/users.module';
import { BulkBatch, BulkBatchSchema } from './bulk-batch.schema';
import { BulkPaymentsController } from './bulk-payments.controller';
import { BulkPaymentsService } from './bulk-payments.service';

/** ISO 20022 pain.001 bulk payments: XML parsed and validated with XPath. */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: BulkBatch.name, schema: BulkBatchSchema }]),
    AccountsModule,
    TransactionsModule,
    IntegrationsModule,
    UsersModule,
    OtpModule,
    NotificationsModule,
  ],
  controllers: [BulkPaymentsController],
  providers: [BulkPaymentsService],
})
export class BulkPaymentsModule {}
