const { BaseProvider } = require('./base')
const { ProviderType } = require('../types')
const NETWORKS = { mainnet: 'mainnet', goerli: 'goerli', sepolia: 'sepolia', polygon: 'polygon-mainnet', arbitrum: 'arbitrum-mainnet', optimism: 'optimism-mainnet' }

class InfuraProvider extends BaseProvider {
  constructor(config) { super(config); this.type = ProviderType.INFURA }
  get capabilities() { return { websocket: true, pendingTransactions: true, addressFilteredPending: false, tokenMetadata: false, nftMetadata: false } }
  buildHttpUrl() { return this.config.httpUrl || `https://${NETWORKS[this.config.network] || 'mainnet'}.infura.io/v3/${this.config.apiKey}` }
  buildWsUrl() { return this.config.wsUrl || `wss://${NETWORKS[this.config.network] || 'mainnet'}.infura.io/ws/v3/${this.config.apiKey}` }
}

module.exports = { InfuraProvider }
