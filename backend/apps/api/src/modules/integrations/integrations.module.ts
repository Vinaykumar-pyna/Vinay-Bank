import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { IfscService } from './ifsc.service';
import { ForexController } from './forex.controller';
import { ForexService } from './forex.service';
import { IntegrationsController } from './integrations.controller';

@Module({
  imports: [HttpModule.register({ headers: { 'User-Agent': 'ArthaBank-API/1.0' } })],
  controllers: [IntegrationsController, ForexController],
  providers: [IfscService, ForexService],
  exports: [IfscService, ForexService],
})
export class IntegrationsModule {}
