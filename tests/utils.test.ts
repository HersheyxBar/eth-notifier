import { ExponentialBackoff, sleep, RateLimiter } from '../src/utils';

describe('ExponentialBackoff', () => {
  it('should start with base delay', () => {
    const backoff = new ExponentialBackoff(1000, 60000);
    expect(backoff.getNextDelay()).toBe(1000);
  });

  it('should double delay on each attempt', () => {
    const backoff = new ExponentialBackoff(1000, 60000);
    expect(backoff.getNextDelay()).toBe(1000);
    expect(backoff.getNextDelay()).toBe(2000);
    expect(backoff.getNextDelay()).toBe(4000);
    expect(backoff.getNextDelay()).toBe(8000);
  });

  it('should cap at max delay', () => {
    const backoff = new ExponentialBackoff(1000, 5000);
    backoff.getNextDelay(); // 1000
    backoff.getNextDelay(); // 2000
    backoff.getNextDelay(); // 4000
    expect(backoff.getNextDelay()).toBe(5000); // capped
    expect(backoff.getNextDelay()).toBe(5000); // still capped
  });

  it('should reset attempt counter', () => {
    const backoff = new ExponentialBackoff(1000, 60000);
    backoff.getNextDelay();
    backoff.getNextDelay();
    expect(backoff.getAttempt()).toBe(2);

    backoff.reset();
    expect(backoff.getAttempt()).toBe(0);
    expect(backoff.getNextDelay()).toBe(1000);
  });
});

describe('sleep', () => {
  it('should resolve after specified time', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45);
    expect(elapsed).toBeLessThan(100);
  });
});

describe('RateLimiter', () => {
  it('should allow requests within limit', async () => {
    const limiter = new RateLimiter(3, 10);

    const start = Date.now();
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    const elapsed = Date.now() - start;

    // Should be nearly instant for first 3
    expect(elapsed).toBeLessThan(50);
  });

  it('should delay requests when limit exceeded', async () => {
    const limiter = new RateLimiter(1, 10);

    await limiter.acquire(); // First one is instant

    const start = Date.now();
    await limiter.acquire(); // This should wait
    const elapsed = Date.now() - start;

    // Should wait about 100ms (1/10 per second = 100ms per token)
    expect(elapsed).toBeGreaterThanOrEqual(50);
  });

  it('should report available tokens', () => {
    const limiter = new RateLimiter(5, 1);
    expect(limiter.getAvailableTokens()).toBe(5);
  });
});
