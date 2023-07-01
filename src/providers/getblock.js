const { BaseProvider } = require('./base')
const { ProviderType } = require('../types')
const NETWORKS = { mainnet: 'eth', goerli: 'eth', sepolia: 'eth', polygon: 'matic', arbitrum: 'arbitrum', optimism: 'optimism', bsc: 'bsc' }

class GetBlockProvider extends BaseProvider {
  constructor(config) { super(config); this.type = ProviderType.GETBLOCK }
  get capabilities() { return { websocket: false, pendingTransactions: false, addressFilteredPending: false, tokenMetadata: false, nftMetadata: false } }
  buildHttpUrl() { const chain = NETWORKS[this.config.network] || 'eth'; const net = this.config.network === 'mainnet' ? 'mainnet' : this.config.network; return this.config.httpUrl || `https://${chain}.getblock.io/${net}/${this.config.apiKey}` }
  buildWsUrl() { return null }
}

module.exports = { GetBlockProvider }
