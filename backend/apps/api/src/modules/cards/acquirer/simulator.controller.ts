import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/auth.decorators';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AppConfig } from '../../../config/configuration';
import { CardSeeder } from '../card-seeder.service';
import { CardSimulatorService } from './card-simulator.service';
import { SimulatorRequestDto } from './simulator.dto';

/**
 * Card network simulator: a stand-in for ATMs and shop terminals, which in
 * real life are separate devices. Available only in demo mode.
 */
@ApiTags('Card network simulator')
@Public()
@Controller('simulator')
export class SimulatorController {
  constructor(
    private readonly simulator: CardSimulatorService,
    private readonly seeder: CardSeeder,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private assertDemoMode(): void {
    if (!this.config.get('demoMode', { infer: true })) throw AppException.notFound('Simulator');
  }

  @Get('terminals')
  @ApiOperation({ summary: 'Simulated ATM and POS terminals' })
  terminals() {
    this.assertDemoMode();
    return this.simulator.terminals();
  }

  @Get('demo-card')
  @ApiOperation({ summary: "The demo customer's card number and expiry (demo mode only)" })
  demoCard() {
    this.assertDemoMode();
    return this.seeder.demoCard();
  }

  @Post('card-network')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Send an ISO 8583 message through the card switch and show the exchange',
  })
  run(@Body() dto: SimulatorRequestDto) {
    this.assertDemoMode();
    return this.simulator.run(dto);
  }
}
