import { EthereumProvider, ProviderType, ProviderConfig, ProvidersConfig, ProviderHealth, ProviderCapabilities, FailoverStrategy } from './types'
import { createProvider, parseProviderConfig } from './factory'

const HEALTH_INTERVAL = 30000, MAX_FAILURES = 3

type ManagedProvider = { provider:EthereumProvider, config:ProviderConfig, health:ProviderHealth, priority:number }

export class ProviderManager {
  private providers: ManagedProvider[] = []
  private currentIdx = 0
  private strategy: FailoverStrategy
  private healthInterval?: NodeJS.Timeout
  private initialized = false

  constructor(config?:ProvidersConfig) {
    this.strategy = config?.strategy || 'priority'
    if (config) {
      this.addProvider(config.primary, 0)
      config.fallbacks?.forEach((f, i) => this.addProvider(f, i+1))
    }
  }

  private addProvider(raw:any, priority:number): void {
    const config = parseProviderConfig(raw)
    config.priority = priority
    this.providers.push({ provider: createProvider(config), config, health: { type: config.type, healthy: false, consecutiveFailures: 0 }, priority })
  }

  addProviderFromEnv(type:ProviderType, apiKey:string, network:string): void {
    const config: ProviderConfig = { type, apiKey, network, priority: this.providers.length }
    this.providers.push({ provider: createProvider(config), config, health: { type, healthy: false, consecutiveFailures: 0 }, priority: config.priority! })
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    this.providers.sort((a, b) => a.priority - b.priority)
    await Promise.allSettled(this.providers.map(async m => {
      try { await m.provider.connect(); m.health.healthy = true }
      catch (e) { m.health.healthy = false; m.health.lastError = e instanceof Error ? e.message : String(e) }
    }))
    const idx = this.providers.findIndex(p => p.health.healthy)
    if (idx < 0) throw new Error('No healthy providers')
    this.currentIdx = idx
    this.healthInterval = setInterval(() => this.performHealthChecks(), HEALTH_INTERVAL)
    this.initialized = true
  }

  async shutdown(): Promise<void> {
    if (this.healthInterval) { clearInterval(this.healthInterval); this.healthInterval = undefined }
    await Promise.allSettled(this.providers.map(m => m.provider.disconnect()))
    this.initialized = false
  }

  getProvider(): EthereumProvider {
    if (!this.providers.length) throw new Error('No providers')
    const m = this.providers[this.currentIdx]
    if (!m.health.healthy) { const f = this.findHealthy(); if (f) return f }
    return m.provider
  }

  getProviderWithCapability(cap:keyof ProviderCapabilities): EthereumProvider|null {
    const cur = this.providers[this.currentIdx]
    if (cur.health.healthy && cur.provider.capabilities[cap]) return cur.provider
    for (const m of this.providers) if (m.health.healthy && m.provider.capabilities[cap]) return m.provider
    return null
  }

  getSubscriptionProvider(): EthereumProvider { return this.getProviderWithCapability('websocket') || this.getProvider() }
  getAllProviders(): EthereumProvider[] { return this.providers.map(p => p.provider) }
  getHealthStatus(): ProviderHealth[] { return this.providers.map(p => ({ ...p.health, type: p.config.type })) }
  getCurrentProviderInfo(): { type:ProviderType, index:number, total:number } { return { type: this.providers[this.currentIdx].config.type, index: this.currentIdx, total: this.providers.length } }

  private findHealthy(): EthereumProvider|null {
    if (this.strategy === 'round-robin') {
      for (let i = 1; i < this.providers.length; i++) { const idx = (this.currentIdx + i) % this.providers.length; if (this.providers[idx].health.healthy) { this.currentIdx = idx; return this.providers[idx].provider } }
    } else {
      for (const m of this.providers) if (m.health.healthy) { this.currentIdx = this.providers.indexOf(m); return m.provider }
    }
    return null
  }

  async healthCheck(): Promise<void> { await this.performHealthChecks() }

  private async performHealthChecks(): Promise<void> {
    await Promise.all(this.providers.map(async m => {
      try {
        const h = await m.provider.healthCheck()
        m.health = h
        if (!h.healthy && h.consecutiveFailures >= MAX_FAILURES && this.providers[this.currentIdx] === m) this.findHealthy()
        else if (h.healthy && m.priority < this.providers[this.currentIdx].priority) this.currentIdx = this.providers.indexOf(m)
      } catch (e) { m.health.healthy = false; m.health.consecutiveFailures++; m.health.lastError = e instanceof Error ? e.message : String(e) }
    }))
  }

  async executeWithFailover<T>(fn:(p:EthereumProvider)=>Promise<T>): Promise<T> {
    let lastErr: Error|undefined
    const tried = new Set<number>()
    while (tried.size < this.providers.length) {
      const m = this.providers[this.currentIdx]
      tried.add(this.currentIdx)
      if (!m.health.healthy && tried.size < this.providers.length) { this.findHealthy(); continue }
      try { const r = await fn(m.provider); m.health.consecutiveFailures = 0; m.health.healthy = true; return r }
      catch (e) { lastErr = e instanceof Error ? e : new Error(String(e)); m.health.consecutiveFailures++; m.health.lastError = lastErr.message; if (m.health.consecutiveFailures >= MAX_FAILURES) m.health.healthy = false; if (!this.findHealthy()) this.currentIdx = (this.currentIdx + 1) % this.providers.length }
    }
    throw lastErr || new Error('All providers failed')
  }
}
