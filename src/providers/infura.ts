import { BaseProvider } from './base'
import { ProviderType, ProviderCapabilities } from './types'

const NETWORKS: Record<string, string> = { mainnet: 'mainnet', goerli: 'goerli', sepolia: 'sepolia', polygon: 'polygon-mainnet', arbitrum: 'arbitrum-mainnet', optimism: 'optimism-mainnet', base: 'base-mainnet' }

export class InfuraProvider extends BaseProvider {
  readonly type = ProviderType.INFURA
  readonly capabilities: ProviderCapabilities = { websocket: true, pendingTransactions: true, addressFilteredPending: false, tokenMetadata: false, nftMetadata: false }
  buildHttpUrl(): string { return this.config.httpUrl || `https://${NETWORKS[this.config.network] || 'mainnet'}.infura.io/v3/${this.config.apiKey}` }
  buildWsUrl(): string|null { return this.config.wsUrl || `wss://${NETWORKS[this.config.network] || 'mainnet'}.infura.io/ws/v3/${this.config.apiKey}` }
}
