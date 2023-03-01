import { BaseProvider } from './base'
import { ProviderType, ProviderCapabilities, SubscriptionHandle } from './types'
import { createPollingSubscription } from './polling-adapter'

const NETWORKS: Record<string, string> = { mainnet: 'eth', polygon: 'polygon', arbitrum: 'arbitrum', optimism: 'optimism', base: 'base', bsc: 'bsc', avalanche: 'avalanche' }

export class AnkrProvider extends BaseProvider {
  readonly type = ProviderType.ANKR
  readonly capabilities: ProviderCapabilities = { websocket: false, pendingTransactions: false, addressFilteredPending: false, tokenMetadata: true, nftMetadata: true }
  buildHttpUrl(): string { const net = NETWORKS[this.config.network] || 'eth'; return this.config.httpUrl || (this.config.apiKey ? `https://rpc.ankr.com/${net}/${this.config.apiKey}` : `https://rpc.ankr.com/${net}`) }
  buildWsUrl(): string|null { return null }
  async subscribeToBlocks(callback:(n:number)=>void): Promise<SubscriptionHandle> { return createPollingSubscription(this, callback) }
  async subscribeToPendingTransactions(): Promise<SubscriptionHandle|null> { return null }
}
