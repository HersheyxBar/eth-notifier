import { BaseProvider } from './base'
import { ProviderType, ProviderCapabilities, SubscriptionHandle } from './types'
import { createPollingSubscription } from './polling-adapter'

const NETWORKS: Record<string, string> = { mainnet: 'eth', goerli: 'goerli', sepolia: 'sepolia', polygon: 'matic', arbitrum: 'arbitrum', optimism: 'optimism', base: 'base', bsc: 'bsc' }

export class GetBlockProvider extends BaseProvider {
  readonly type = ProviderType.GETBLOCK
  readonly capabilities: ProviderCapabilities = { websocket: false, pendingTransactions: false, addressFilteredPending: false, tokenMetadata: false, nftMetadata: false }
  buildHttpUrl(): string { return this.config.httpUrl || `https://${NETWORKS[this.config.network] || 'eth'}.getblock.io/${this.config.apiKey}/mainnet/` }
  buildWsUrl(): string|null { return null }
  async subscribeToBlocks(callback:(n:number)=>void): Promise<SubscriptionHandle> { return createPollingSubscription(this, callback) }
  async subscribeToPendingTransactions(): Promise<SubscriptionHandle|null> { return null }
}
