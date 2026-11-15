import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { CircuitBreaker, type CircuitSnapshot } from '../../common/resilience/circuit-breaker';
import type { AppConfig } from '../../config/configuration';
import type { RiskAssessment, RiskContext } from './risk.types';

const LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const DECISIONS = ['ALLOW', 'STEP_UP', 'REVIEW', 'BLOCK'];

export interface RiskEngineStatus {
  enabled: boolean;
  url: string;
  circuit: CircuitSnapshot;
}

/**
 * HTTP client for the Java (Spring Boot) risk engine, wrapped in a circuit
 * breaker with a short timeout. Every response is checked before it is
 * trusted: a malformed answer counts as a failure, like a timeout.
 */
@Injectable()
export class RiskEngineClient {
  private readonly settings: AppConfig['riskEngine'];
  private readonly breaker: CircuitBreaker;

  constructor(
    private readonly http: HttpService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.settings = config.get('riskEngine', { infer: true });
    this.breaker = new CircuitBreaker({
      failureThreshold: this.settings.failureThreshold,
      cooldownMs: this.settings.cooldownMs,
    });
  }

  get enabled(): boolean {
    return this.settings.enabled && Boolean(this.settings.apiKey);
  }

  assess(context: RiskContext): Promise<RiskAssessment> {
    return this.breaker.execute(async () => {
      const { data } = await firstValueFrom(
        this.http.post<RiskAssessment>(`${this.settings.url}/api/v1/risk/assess`, context, {
          timeout: this.settings.timeoutMs,
          headers: { 'X-Api-Key': this.settings.apiKey },
        }),
      );
      if (
        !data ||
        typeof data.score !== 'number' ||
        !LEVELS.includes(data.level) ||
        !DECISIONS.includes(data.decision) ||
        !Array.isArray(data.reasons)
      ) {
        throw new Error('Malformed response from the risk engine');
      }
      return {
        score: data.score,
        level: data.level,
        decision: data.decision,
        reasons: data.reasons,
        hits: Array.isArray(data.hits) ? data.hits : [],
        source: 'JAVA_ENGINE',
        engineVersion: data.engineVersion ?? 'java',
      };
    });
  }

  /** Live health probe (Spring Boot Actuator), outside the circuit breaker. */
  async probe(): Promise<'UP' | 'DOWN' | 'DISABLED'> {
    if (!this.enabled) return 'DISABLED';
    try {
      const { data } = await firstValueFrom(
        this.http.get<{ status?: string }>(`${this.settings.url}/actuator/health`, {
          timeout: 500,
        }),
      );
      return data?.status === 'UP' ? 'UP' : 'DOWN';
    } catch {
      return 'DOWN';
    }
  }

  status(): RiskEngineStatus {
    return { enabled: this.enabled, url: this.settings.url, circuit: this.breaker.snapshot() };
  }
}
