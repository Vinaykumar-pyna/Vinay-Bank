import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IfscService } from './ifsc.service';

@ApiTags('Integrations')
@ApiBearerAuth('access-token')
@Controller('ifsc')
export class IntegrationsController {
  constructor(private readonly ifsc: IfscService) {}

  @Get(':code')
  @ApiOperation({ summary: 'Look up a bank branch by IFSC code (live directory with fallback)' })
  lookup(@Param('code') code: string) {
    return this.ifsc.lookup(code);
  }
}
