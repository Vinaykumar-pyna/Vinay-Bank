import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';

describe('CircuitBreaker', () => {
  let clock: number;
  let breaker: CircuitBreaker;
  const ok = () => Promise.resolve('ok');
  const boom = () => Promise.reject(new Error('connection refused'));

  beforeEach(() => {
    clock = 1_000_000;
    breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 30_000, now: () => clock });
  });

  it('passes calls through while closed and resets the count on success', async () => {
    await expect(breaker.execute(boom)).rejects.toThrow('connection refused');
    await expect(breaker.execute(boom)).rejects.toThrow();
    await expect(breaker.execute(ok)).resolves.toBe('ok');
    expect(breaker.snapshot()).toMatchObject({ state: 'CLOSED', consecutiveFailures: 0 });
  });

  it('opens after the threshold and then fails fast without calling', async () => {
    for (let i = 0; i < 3; i++) await expect(breaker.execute(boom)).rejects.toThrow();
    expect(breaker.snapshot().state).toBe('OPEN');
    const operation = jest.fn(ok);
    await expect(breaker.execute(operation)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(operation).not.toHaveBeenCalled();
  });

  it('allows one trial after the cooldown and closes again when it succeeds', async () => {
    for (let i = 0; i < 3; i++) await expect(breaker.execute(boom)).rejects.toThrow();
    clock += 30_000;
    await expect(breaker.execute(ok)).resolves.toBe('ok');
    expect(breaker.snapshot()).toMatchObject({ state: 'CLOSED', consecutiveFailures: 0 });
  });

  it('re-opens for another cooldown when the trial fails', async () => {
    for (let i = 0; i < 3; i++) await expect(breaker.execute(boom)).rejects.toThrow();
    clock += 30_000;
    await expect(breaker.execute(boom)).rejects.toThrow('connection refused');
    expect(breaker.snapshot().state).toBe('OPEN');
    clock += 10_000;
    await expect(breaker.execute(ok)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('lets only one trial call through while half-open', async () => {
    for (let i = 0; i < 3; i++) await expect(breaker.execute(boom)).rejects.toThrow();
    clock += 30_000;
    let release!: () => void;
    const slow = () => new Promise<string>((resolve) => (release = () => resolve('slow')));
    const trial = breaker.execute(slow);
    await expect(breaker.execute(ok)).rejects.toBeInstanceOf(CircuitOpenError);
    release();
    await expect(trial).resolves.toBe('slow');
    expect(breaker.snapshot().state).toBe('CLOSED');
  });
});
