const { BaseProvider } = require('./base')
const { ProviderType } = require('../types')

class ChainstackProvider extends BaseProvider {
  constructor(config) { super(config); this.type = ProviderType.CHAINSTACK }
  get capabilities() { return { websocket: true, pendingTransactions: false, addressFilteredPending: false, tokenMetadata: false, nftMetadata: false } }
  buildHttpUrl() { if (this.config.httpUrl) return this.config.httpUrl; throw new Error('Chainstack requires httpUrl') }
  buildWsUrl() { return this.config.wsUrl || null }
}

module.exports = { ChainstackProvider }
