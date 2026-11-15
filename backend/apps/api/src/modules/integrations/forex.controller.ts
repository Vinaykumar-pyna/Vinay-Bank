import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ForexService } from './forex.service';

@ApiTags('Integrations')
@ApiBearerAuth('access-token')
@Controller('forex')
export class ForexController {
  constructor(private readonly forex: ForexService) {}

  @Get('rates')
  @ApiOperation({
    summary: 'Reference exchange rates against the rupee (Frankfurter / ECB, cached)',
  })
  rates() {
    return this.forex.rates();
  }
}
