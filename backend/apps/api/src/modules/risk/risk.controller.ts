import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/auth.decorators';
import { Role } from '../../common/enums/role.enum';
import { RiskService } from './risk.service';

@ApiTags('Risk')
@ApiBearerAuth('access-token')
@Roles(Role.MANAGER, Role.ADMIN)
@Controller('risk')
export class RiskController {
  constructor(private readonly risk: RiskService) {}

  @Get('engine')
  @ApiOperation({ summary: 'Java risk engine connection and circuit breaker state' })
  async engine() {
    return { ...this.risk.engineStatus(), health: (await this.risk.engineHealth()).health };
  }
}
