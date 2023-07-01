const { BaseProvider } = require('./base')
const { ProviderType } = require('../types')
const NETWORKS = { mainnet: 'eth', goerli: 'eth_goerli', polygon: 'polygon', arbitrum: 'arbitrum', optimism: 'optimism', base: 'base', bsc: 'bsc', avalanche: 'avalanche' }

class AnkrProvider extends BaseProvider {
  constructor(config) { super(config); this.type = ProviderType.ANKR }
  get capabilities() { return { websocket: false, pendingTransactions: false, addressFilteredPending: false, tokenMetadata: true, nftMetadata: true } }
  buildHttpUrl() { return this.config.httpUrl || `https://rpc.ankr.com/${NETWORKS[this.config.network] || 'eth'}/${this.config.apiKey || ''}` }
  buildWsUrl() { return null }
}

module.exports = { AnkrProvider }
