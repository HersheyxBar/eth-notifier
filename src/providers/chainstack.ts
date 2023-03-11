import { BaseProvider } from './base'
import { ProviderType, ProviderCapabilities } from './types'

export class ChainstackProvider extends BaseProvider {
  readonly type = ProviderType.CHAINSTACK
  readonly capabilities: ProviderCapabilities = { websocket: true, pendingTransactions: true, addressFilteredPending: false, tokenMetadata: false, nftMetadata: false }
  buildHttpUrl(): string { if (this.config.httpUrl) return this.config.httpUrl; throw new Error('Chainstack requires httpUrl') }
  buildWsUrl(): string|null { return this.config.wsUrl || (this.config.httpUrl?.replace('https://', 'wss://').replace('http://', 'ws://') || null) }
}
