import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { RiskEngineClient } from './risk-engine.client';
import { RiskController } from './risk.controller';
import { RiskService } from './risk.service';

@Module({
  imports: [HttpModule.register({ headers: { 'User-Agent': 'ArthaBank-API/1.0' } })],
  controllers: [RiskController],
  providers: [RiskService, RiskEngineClient],
  exports: [RiskService],
})
export class RiskModule {}
