import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BANKS } from '../../common/constants/banks';

@ApiTags('Integrations')
@ApiBearerAuth('access-token')
@Controller('banks')
export class BanksController {
  @Get()
  @ApiOperation({
    summary: 'Banks payees can be added at: IFSC bank code, name and an example branch IFSC',
  })
  list() {
    return BANKS;
  }
}
