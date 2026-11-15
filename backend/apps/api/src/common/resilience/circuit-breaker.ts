export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Consecutive failures that open the circuit */
  failureThreshold: number;
  /** How long the circuit stays open before one trial call is allowed */
  cooldownMs: number;
  /** Injected clock, for tests */
  now?: () => number;
}

export interface CircuitSnapshot {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt?: string;
  lastError?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
}

/** Thrown without calling the dependency while the circuit is open. */
export class CircuitOpenError extends Error {
  constructor(message = 'Circuit is open') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Circuit breaker (the resilience pattern from Michael Nygard's "Release It!").
 *
 *   CLOSED     calls go through; consecutive failures are counted
 *   OPEN       after `failureThreshold` failures: calls fail fast, nothing is sent
 *   HALF_OPEN  after `cooldownMs`: exactly one trial call; success closes the
 *              circuit, failure opens it again for another cooldown
 *
 * Failing fast protects both sides: callers stop waiting on timeouts, and a
 * struggling service is not hammered while it recovers.
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private openedAt = 0;
  private trialInFlight = false;
  private lastError?: string;
  private lastSuccessAt?: number;
  private lastFailureAt?: number;
  private readonly now: () => number;

  constructor(private readonly options: CircuitBreakerOptions) {
    this.now = options.now ?? Date.now;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.now() - this.openedAt < this.options.cooldownMs) throw new CircuitOpenError();
      this.state = 'HALF_OPEN';
    }
    const trial = this.state === 'HALF_OPEN';
    if (trial) {
      if (this.trialInFlight) throw new CircuitOpenError('A trial call is already in progress');
      this.trialInFlight = true;
    }
    try {
      const result = await operation();
      this.succeeded();
      return result;
    } catch (error) {
      this.failed(error, trial);
      throw error;
    } finally {
      if (trial) this.trialInFlight = false;
    }
  }

  private succeeded(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.lastSuccessAt = this.now();
  }

  private failed(error: unknown, trial: boolean): void {
    this.failures += 1;
    this.lastFailureAt = this.now();
    this.lastError = error instanceof Error ? error.message : String(error);
    if (trial || this.failures >= this.options.failureThreshold) {
      this.state = 'OPEN';
      this.openedAt = this.now();
    }
  }

  snapshot(): CircuitSnapshot {
    const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : undefined);
    return {
      state: this.state,
      consecutiveFailures: this.failures,
      openedAt: this.state === 'CLOSED' ? undefined : iso(this.openedAt),
      lastError: this.lastError,
      lastSuccessAt: iso(this.lastSuccessAt),
      lastFailureAt: iso(this.lastFailureAt),
    };
  }
}
