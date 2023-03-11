import { BaseProvider } from './base'
import { ProviderType, ProviderCapabilities } from './types'

const NETWORKS: Record<string, string> = { mainnet: 'eth-mainnet', goerli: 'eth-goerli', sepolia: 'eth-sepolia', polygon: 'polygon-mainnet', arbitrum: 'arbitrum-one', optimism: 'optimism-mainnet', base: 'base-mainnet', bsc: 'bsc-mainnet' }

export class BlastProvider extends BaseProvider {
  readonly type = ProviderType.BLAST
  readonly capabilities: ProviderCapabilities = { websocket: true, pendingTransactions: true, addressFilteredPending: false, tokenMetadata: false, nftMetadata: false }
  buildHttpUrl(): string { return this.config.httpUrl || `https://${NETWORKS[this.config.network] || 'eth-mainnet'}.blastapi.io/${this.config.apiKey}` }
  buildWsUrl(): string|null { return this.config.wsUrl || `wss://${NETWORKS[this.config.network] || 'eth-mainnet'}.blastapi.io/${this.config.apiKey}` }
}
