class BlockPoller {
  constructor(provider, cb, intervalMs = 2000) { this.provider = provider; this.cb = cb; this.interval = intervalMs; this.lastBlock = 0; this.timer = null; this.running = false }
  async start() { this.running = true; this.poll() }
  async poll() {
    if (!this.running) return
    try { const n = await this.provider.getBlockNumber(); if (n > this.lastBlock) { if (this.lastBlock > 0) for (let i = this.lastBlock + 1; i <= n; i++) this.cb(i); this.lastBlock = n } } catch {}
    this.timer = setTimeout(() => this.poll(), this.interval)
  }
  stop() { this.running = false; if (this.timer) clearTimeout(this.timer) }
}

async function createPollingSubscription(provider, cb, intervalMs = 2000) {
  const poller = new BlockPoller(provider, cb, intervalMs)
  await poller.start()
  return { unsubscribe: () => poller.stop() }
}

module.exports = { BlockPoller, createPollingSubscription }
