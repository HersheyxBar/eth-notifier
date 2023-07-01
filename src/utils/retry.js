const sleep = ms => new Promise(r => setTimeout(r, ms))

async function withRetry(fn, opts = {}) {
  const { maxAttempts = 10, baseDelayMs = 1000, maxDelayMs = 60000, onRetry } = opts
  let lastErr = null
  for (let i = 1; i <= maxAttempts; i++) {
    try { return await fn() }
    catch (e) { lastErr = e instanceof Error ? e : new Error(String(e)); if (i === maxAttempts) break; onRetry?.(i, lastErr); await sleep(Math.min(baseDelayMs * 2 ** (i - 1), maxDelayMs)) }
  }
  throw lastErr
}

class ExponentialBackoff {
  constructor(baseMs = 1000, maxMs = 60000) { this.baseMs = baseMs; this.maxMs = maxMs; this.attempt = 0 }
  getNextDelay() { const d = Math.min(this.baseMs * 2 ** this.attempt, this.maxMs); this.attempt++; return d }
  reset() { this.attempt = 0 }
  getAttempt() { return this.attempt }
}

module.exports = { sleep, withRetry, ExponentialBackoff }
