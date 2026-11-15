import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsModule } from '../accounts/accounts.module';
import { Approval, ApprovalSchema } from '../approvals/approval.schema';
import { AuthModule } from '../auth/auth.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { UsersModule } from '../users/users.module';
import { Notification, NotificationSchema } from './notification.schema';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsListener } from './notifications.listener';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AccountsModule,
    TransactionsModule,
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: Approval.name, schema: ApprovalSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway, NotificationsListener],
  exports: [NotificationsService],
})
export class NotificationsModule {}
