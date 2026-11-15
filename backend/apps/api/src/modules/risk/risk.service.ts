import { Injectable, Logger } from '@nestjs/common';
import { CircuitOpenError } from '../../common/resilience/circuit-breaker';
import { RiskEngineClient } from './risk-engine.client';
import { assessLocally } from './risk-rules';
import type { RiskAssessment, RiskContext } from './risk.types';

/**
 * Entry point for fraud risk scoring. The Java (Spring Boot) risk engine is
 * asked first, through a circuit breaker; if it is disabled, slow, down or
 * returns something unexpected, the same rules run locally. A payment is never
 * blocked just because the risk service is unavailable, and every assessment
 * records which engine produced it (`source`).
 */
@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  constructor(private readonly engine: RiskEngineClient) {}

  async assess(context: RiskContext): Promise<RiskAssessment> {
    if (!this.engine.enabled) return assessLocally(context);
    try {
      return await this.engine.assess(context);
    } catch (error) {
      if (!(error instanceof CircuitOpenError)) {
        this.logger.warn(`Risk engine unavailable, using local rules: ${(error as Error).message}`);
      }
      return assessLocally(context);
    }
  }

  engineStatus() {
    return this.engine.status();
  }

  /** For dashboards: is the Java engine up right now, and what is the breaker doing? */
  async engineHealth() {
    const status = this.engine.status();
    return { health: await this.engine.probe(), state: status.circuit.state, url: status.url };
  }
}
