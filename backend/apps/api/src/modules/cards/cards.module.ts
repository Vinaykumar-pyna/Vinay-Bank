import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsModule } from '../accounts/accounts.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OtpModule } from '../otp/otp.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { UsersModule } from '../users/users.module';
import { AcquirerClient } from './acquirer/acquirer-client.service';
import { CardSimulatorService } from './acquirer/card-simulator.service';
import { SimulatorController } from './acquirer/simulator.controller';
import { CardAuthorizationService } from './card-authorization.service';
import { CardNetworkController } from './card-network.controller';
import { CardSecurityService } from './card-security.service';
import { CardSeeder } from './card-seeder.service';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { Card, CardSchema } from './schemas/card.schema';

/**
 * Debit cards: customer self-service (REST), issuer authorization for the card
 * switch (microservice message handlers) and the acquirer-side simulator.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Card.name, schema: CardSchema }]),
    AccountsModule,
    TransactionsModule,
    UsersModule,
    OtpModule,
    NotificationsModule,
  ],
  controllers: [CardsController, CardNetworkController, SimulatorController],
  providers: [
    CardSecurityService,
    CardsService,
    CardAuthorizationService,
    CardSeeder,
    AcquirerClient,
    CardSimulatorService,
  ],
  exports: [CardSeeder],
})
export class CardsModule {}
