const { BaseProvider } = require('./base')
const { ProviderType } = require('../types')
const NETWORKS = { mainnet: 'eth-mainnet', goerli: 'eth-goerli', sepolia: 'eth-sepolia', polygon: 'polygon-mainnet', arbitrum: 'arbitrum-one', optimism: 'optimism-mainnet', base: 'base-mainnet' }

class BlastProvider extends BaseProvider {
  constructor(config) { super(config); this.type = ProviderType.BLAST }
  get capabilities() { return { websocket: true, pendingTransactions: false, addressFilteredPending: false, tokenMetadata: false, nftMetadata: false } }
  buildHttpUrl() { return this.config.httpUrl || `https://${NETWORKS[this.config.network] || 'eth-mainnet'}.blastapi.io/${this.config.apiKey}` }
  buildWsUrl() { return this.config.wsUrl || `wss://${NETWORKS[this.config.network] || 'eth-mainnet'}.blastapi.io/${this.config.apiKey}` }
}

module.exports = { BlastProvider }
