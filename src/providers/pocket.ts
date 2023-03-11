import { BaseProvider } from './base'
import { ProviderType, ProviderCapabilities, SubscriptionHandle } from './types'
import { createPollingSubscription } from './polling-adapter'

const NETWORKS: Record<string, string> = { mainnet: 'eth-mainnet', goerli: 'eth-goerli', polygon: 'poly-mainnet', arbitrum: 'arbitrum-one', optimism: 'optimism-mainnet', base: 'base-mainnet', bsc: 'bsc-mainnet', avalanche: 'avax-mainnet' }

export class PocketProvider extends BaseProvider {
  readonly type = ProviderType.POCKET
  readonly capabilities: ProviderCapabilities = { websocket: false, pendingTransactions: false, addressFilteredPending: false, tokenMetadata: false, nftMetadata: false }
  buildHttpUrl(): string { if (this.config.apiKey) return this.config.httpUrl || `https://${NETWORKS[this.config.network] || 'eth-mainnet'}.gateway.pokt.network/v1/lb/${this.config.apiKey}`; throw new Error('Pocket requires apiKey') }
  buildWsUrl(): string|null { return null }
  async subscribeToBlocks(callback:(n:number)=>void): Promise<SubscriptionHandle> { return createPollingSubscription(this, callback) }
  async subscribeToPendingTransactions(): Promise<SubscriptionHandle|null> { return null }
}
