const { BaseProvider } = require('./base')
const { ProviderType } = require('../types')
const CHAIN_IDS = { mainnet: '0x1', goerli: '0x5', sepolia: '0xaa36a7', polygon: '0x89', arbitrum: '0xa4b1', optimism: '0xa', base: '0x2105', bsc: '0x38' }

class MoralisProvider extends BaseProvider {
  constructor(config) { super(config); this.type = ProviderType.MORALIS }
  get capabilities() { return { websocket: true, pendingTransactions: false, addressFilteredPending: false, tokenMetadata: true, nftMetadata: true } }
  buildHttpUrl() { const chainId = CHAIN_IDS[this.config.network] || '0x1'; return this.config.httpUrl || `https://site1.moralis-nodes.com/${this.config.network === 'mainnet' ? 'eth' : this.config.network}/${this.config.apiKey}` }
  buildWsUrl() { return this.config.wsUrl || null }
}

module.exports = { MoralisProvider }
