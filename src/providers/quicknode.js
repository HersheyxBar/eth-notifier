const { BaseProvider } = require('./base')
const { ProviderType } = require('../types')

class QuickNodeProvider extends BaseProvider {
  constructor(config) { super(config); this.type = ProviderType.QUICKNODE }
  get capabilities() { return { websocket: true, pendingTransactions: true, addressFilteredPending: false, tokenMetadata: false, nftMetadata: false } }
  buildHttpUrl() { if (this.config.httpUrl) return this.config.httpUrl; throw new Error('QuickNode requires httpUrl') }
  buildWsUrl() { return this.config.wsUrl || null }
}

module.exports = { QuickNodeProvider }
