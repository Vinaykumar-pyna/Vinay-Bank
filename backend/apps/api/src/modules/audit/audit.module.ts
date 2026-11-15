import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/user.schema';
import { AuditLog, AuditLogSchema } from './audit-log.schema';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService, MongooseModule],
})
export class AuditModule {}
