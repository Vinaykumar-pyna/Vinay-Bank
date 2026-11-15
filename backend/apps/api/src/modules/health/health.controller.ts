import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, MongooseHealthIndicator } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { APP_NAME, APP_VERSION } from '../../common/constants/app.constants';
import { Public } from '../../common/decorators/auth.decorators';

@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoose: MongooseHealthIndicator,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe: the process is up and serving requests' })
  @ApiOkResponse({ description: 'Service is alive' })
  liveness() {
    return {
      status: 'ok',
      service: `${APP_NAME} API`,
      version: APP_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe: required dependencies (MongoDB) are reachable' })
  readiness() {
    return this.health.check([() => this.mongoose.pingCheck('mongodb', { timeout: 1500 })]);
  }
}
