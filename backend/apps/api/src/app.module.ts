import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import mongoose from 'mongoose';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RolesGuard } from './common/guards/roles.guard';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { MongoSanitizePipe } from './common/pipes/mongo-sanitize.pipe';
import { createValidationPipe } from './common/pipes/validation.pipe';
import type { TypedConfigService } from './config/config.types';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { buildLoggerConfig } from './config/logger.config';
import { AccountsModule } from './modules/accounts/accounts.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { BeneficiariesModule } from './modules/beneficiaries/beneficiaries.module';
import { BulkPaymentsModule } from './modules/bulk-payments/bulk-payments.module';
import { CardsModule } from './modules/cards/cards.module';
import { CountersModule } from './modules/counters/counters.module';
import { CryptoModule } from './modules/crypto/crypto.module';
import { HealthModule } from './modules/health/health.module';
import { IdempotencyModule } from './modules/idempotency/idempotency.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OtpModule } from './modules/otp/otp.module';
import { RiskModule } from './modules/risk/risk.module';
import { SeedModule } from './modules/seed/seed.module';
import { SoapModule } from './modules/soap/soap.module';
import { StaffModule } from './modules/staff/staff.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { UsersModule } from './modules/users/users.module';

// Drop filter keys that are not part of a schema instead of passing them to MongoDB.
mongoose.set('strictQuery', true);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false, allowUnknown: true },
      // Tests configure the environment explicitly and must never touch the dev database.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: TypedConfigService) => buildLoggerConfig(config),
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: TypedConfigService) => ({
        uri: config.get('mongo.uri', { infer: true }),
        // Indexes are declared on the schemas and built automatically at startup.
        autoIndex: true,
        serverSelectionTimeoutMS: 15_000,
        retryAttempts: 10,
        retryDelay: 3_000,
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: TypedConfigService) => {
        const { ttlMs, limit } = config.get('throttle', { infer: true });
        return { throttlers: [{ name: 'default', ttl: ttlMs, limit }] };
      },
    }),
    // In-process domain events (observer pattern) decouple modules from each other.
    EventEmitterModule.forRoot({ wildcard: false, ignoreErrors: false }),
    // Background jobs (NEFT settlement) register themselves with the scheduler registry.
    ScheduleModule.forRoot(),
    CryptoModule,
    CountersModule,
    IdempotencyModule,
    AuditModule,
    UsersModule,
    AuthModule,
    OtpModule,
    ApprovalsModule,
    AccountsModule,
    IntegrationsModule,
    BeneficiariesModule,
    RiskModule,
    TransactionsModule,
    NotificationsModule,
    CardsModule,
    BulkPaymentsModule,
    SoapModule,
    LedgerModule,
    StaffModule,
    HealthModule,
    SeedModule,
  ],
  providers: [
    // Pipes run in registration order: sanitize first, then validate and transform.
    { provide: APP_PIPE, useClass: MongoSanitizePipe },
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    // Guards run in this order: rate limit -> authenticate -> authorize by role.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
