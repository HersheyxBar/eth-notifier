const { BaseProvider } = require('./base')
const { ProviderType } = require('../types')
const NETWORKS = { mainnet: 'eth-mainnet', goerli: 'eth-goerli', polygon: 'poly-mainnet', arbitrum: 'arbitrum-one', optimism: 'optimism-mainnet', base: 'base-mainnet', bsc: 'bsc-mainnet', avalanche: 'avax-mainnet' }

class PocketProvider extends BaseProvider {
  constructor(config) { super(config); this.type = ProviderType.POCKET }
  get capabilities() { return { websocket: false, pendingTransactions: false, addressFilteredPending: false, tokenMetadata: false, nftMetadata: false } }
  buildHttpUrl() { if (this.config.apiKey) return this.config.httpUrl || `https://${NETWORKS[this.config.network] || 'eth-mainnet'}.gateway.pokt.network/v1/lb/${this.config.apiKey}`; throw new Error('Pocket requires apiKey') }
  buildWsUrl() { return null }
}

module.exports = { PocketProvider }
