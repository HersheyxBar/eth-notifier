import { BaseProvider } from './base'
import { ProviderType, ProviderCapabilities } from './types'

const NETWORKS: Record<string, string> = { mainnet: 'mainnet', goerli: 'goerli', sepolia: 'sepolia', polygon: 'polygon', arbitrum: 'arbitrum', optimism: 'optimism', base: 'base', bsc: 'bsc' }

export class MoralisProvider extends BaseProvider {
  readonly type = ProviderType.MORALIS
  readonly capabilities: ProviderCapabilities = { websocket: true, pendingTransactions: true, addressFilteredPending: false, tokenMetadata: true, nftMetadata: true }
  buildHttpUrl(): string { return this.config.httpUrl || `https://site1.moralis-nodes.com/${NETWORKS[this.config.network] || 'mainnet'}/${this.config.apiKey}` }
  buildWsUrl(): string|null { return this.config.wsUrl || `wss://site1.moralis-nodes.com/${NETWORKS[this.config.network] || 'mainnet'}/${this.config.apiKey}` }
}
