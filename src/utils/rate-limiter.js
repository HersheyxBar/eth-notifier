class RateLimiter {
  constructor(maxTokens, refillRate) { this.max = maxTokens; this.tokens = maxTokens; this.rate = refillRate; this.lastRefill = Date.now(); this.queue = []; this.processing = false }
  refill() { const now = Date.now(), elapsed = (now - this.lastRefill) / 1000; this.tokens = Math.min(this.max, this.tokens + elapsed * this.rate); this.lastRefill = now }
  async acquire() { return new Promise((resolve, reject) => { this.queue.push({ resolve, reject }); this.processQueue() }) }
  async processQueue() {
    if (this.processing) return
    this.processing = true
    while (this.queue.length > 0) { this.refill(); if (this.tokens >= 1) { this.tokens--; this.queue.shift()?.resolve() } else { await new Promise(r => setTimeout(r, Math.ceil((1 - this.tokens) / this.rate * 1000))) } }
    this.processing = false
  }
  getAvailable() { this.refill(); return this.tokens }
}

class NotificationRateLimiter {
  constructor() { this.limiters = new Map([['discord', new RateLimiter(5, 0.5)], ['telegram', new RateLimiter(20, 1)]]) }
  async acquire(channel) { await this.limiters.get(channel)?.acquire() }
}

module.exports = { RateLimiter, NotificationRateLimiter }
