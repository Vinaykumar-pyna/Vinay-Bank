import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { OtpChallenge, OtpChallengeSchema } from './otp-challenge.schema';
import { OtpService } from './otp.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: OtpChallenge.name, schema: OtpChallengeSchema }]),
  ],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
