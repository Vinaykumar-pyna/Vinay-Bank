import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MfaService } from './mfa.service';
import { PasswordService } from './password.service';
import { Session, SessionSchema } from './session.schema';
import { SessionsService } from './sessions.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([{ name: Session.name, schema: SessionSchema }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    SessionsService,
    PasswordService,
    MfaService,
    JwtAuthGuard,
  ],
  exports: [AuthService, TokenService, SessionsService, PasswordService, MfaService, JwtAuthGuard],
})
export class AuthModule {}
