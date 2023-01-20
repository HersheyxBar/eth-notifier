export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private lastRefill: number;
  private queue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];
  private processing: boolean = false;

  constructor(maxTokens: number, refillRatePerSecond: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRatePerSecond;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      this.refill();

      if (this.tokens >= 1) {
        this.tokens -= 1;
        const item = this.queue.shift();
        item?.resolve();
      } else {
        const waitTime = (1 - this.tokens) / this.refillRate * 1000;
        await new Promise(r => setTimeout(r, Math.ceil(waitTime)));
      }
    }

    this.processing = false;
  }

  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }
}

export class NotificationRateLimiter {
  private limiters: Map<string, RateLimiter> = new Map();

  constructor() {
    // Discord: 30 requests per minute per webhook
    this.limiters.set('discord', new RateLimiter(5, 0.5));
    // Telegram: 30 messages per second to same chat (but be conservative)
    this.limiters.set('telegram', new RateLimiter(20, 1));
  }

  async acquire(channel: string): Promise<void> {
    const limiter = this.limiters.get(channel);
    if (limiter) {
      await limiter.acquire();
    }
  }
}
