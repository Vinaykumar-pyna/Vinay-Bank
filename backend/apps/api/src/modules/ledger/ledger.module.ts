import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { AppConfig } from '../../config/configuration';
import type { TypedConfigService } from '../../config/config.types';
import { AccountsModule } from '../accounts/accounts.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { LEDGER_ENTITIES } from './entities/ledger.entities';
import { LedgerProjector } from './ledger-projector.service';
import { LedgerReportsService } from './ledger-reports.service';
import { LedgerController } from './ledger.controller';

/**
 * Relational side of the polyglot persistence: MongoDB holds the operational
 * core banking data; the general ledger lives in SQL. Locally that is SQLite
 * (sql.js, nothing to install); in production the same entities map to
 * Oracle (see database/oracle for the DDL, PL/SQL package and reports).
 */
export function ledgerDataSource(ledger: AppConfig['ledger']): TypeOrmModuleOptions {
  if (ledger.type === 'oracle') {
    return {
      type: 'oracle',
      connectString: ledger.oracle.connectString,
      username: ledger.oracle.username,
      password: ledger.oracle.password,
      entities: LEDGER_ENTITIES,
      synchronize: false, // schema managed by database/oracle/*.sql
      logging: ['error'],
    };
  }
  return {
    type: 'sqljs',
    location: ledger.sqlitePath || undefined,
    autoSave: Boolean(ledger.sqlitePath),
    entities: LEDGER_ENTITIES,
    synchronize: true,
    logging: ['error'],
  };
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: TypedConfigService) =>
        ledgerDataSource(config.get('ledger', { infer: true })),
    }),
    TypeOrmModule.forFeature(LEDGER_ENTITIES),
    AccountsModule,
    TransactionsModule,
  ],
  controllers: [LedgerController],
  providers: [LedgerProjector, LedgerReportsService],
})
export class LedgerModule {}
