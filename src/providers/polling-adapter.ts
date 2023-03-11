import { EthereumProvider, SubscriptionHandle } from './types'

export class BlockPoller {
  private provider: EthereumProvider
  private intervalMs: number
  private running = false
  private lastBlock = 0
  private callbacks: Set<(n:number)=>void> = new Set()
  private timeoutId?: NodeJS.Timeout

  constructor(provider:EthereumProvider, intervalMs=2000) { this.provider = provider; this.intervalMs = intervalMs }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    this.lastBlock = await this.provider.getBlockNumber()
    this.schedulePoll()
  }

  stop(): void { this.running = false; if (this.timeoutId) { clearTimeout(this.timeoutId); this.timeoutId = undefined } }

  subscribe(callback:(n:number)=>void): SubscriptionHandle {
    this.callbacks.add(callback)
    return { unsubscribe: async () => { this.callbacks.delete(callback) } }
  }

  private schedulePoll(): void {
    if (!this.running) return
    this.timeoutId = setTimeout(async () => { await this.poll(); this.schedulePoll() }, this.intervalMs)
  }

  private async poll(): Promise<void> {
    try {
      const cur = await this.provider.getBlockNumber()
      if (cur > this.lastBlock) {
        const gap = cur - this.lastBlock
        const start = gap > 100 ? cur - 10 : this.lastBlock + 1
        for (let b = start; b <= cur; b++) this.callbacks.forEach(cb => { try { cb(b) } catch {} })
        this.lastBlock = cur
      }
    } catch {}
  }
}

export async function createPollingSubscription(provider:EthereumProvider, callback:(n:number)=>void, intervalMs=2000): Promise<SubscriptionHandle> {
  const poller = new BlockPoller(provider, intervalMs)
  const handle = poller.subscribe(callback)
  await poller.start()
  return { unsubscribe: async () => { await handle.unsubscribe(); poller.stop() } }
}
