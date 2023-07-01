const { Alchemy, Network, AlchemySubscription } = require('alchemy-sdk')
const { BaseProvider } = require('./base')
const { ProviderType } = require('../types')

const NETWORKS = { mainnet: Network.ETH_MAINNET, goerli: Network.ETH_GOERLI, sepolia: Network.ETH_SEPOLIA, polygon: Network.MATIC_MAINNET, arbitrum: Network.ARB_MAINNET, optimism: Network.OPT_MAINNET, base: Network.BASE_MAINNET }

class AlchemyProvider extends BaseProvider {
  constructor(config) { super(config); this.alchemy = null; this.type = ProviderType.ALCHEMY }
  get capabilities() { return { websocket: true, pendingTransactions: true, addressFilteredPending: true, tokenMetadata: true, nftMetadata: true } }
  buildHttpUrl() { return this.config.httpUrl || `https://${this.config.network === 'polygon' ? 'polygon' : 'eth'}-${this.config.network === 'mainnet' ? 'mainnet' : this.config.network}.g.alchemy.com/v2/${this.config.apiKey}` }
  buildWsUrl() { return this.config.wsUrl || `wss://${this.config.network === 'polygon' ? 'polygon' : 'eth'}-${this.config.network === 'mainnet' ? 'mainnet' : this.config.network}.g.alchemy.com/v2/${this.config.apiKey}` }

  async connect() { await super.connect(); this.alchemy = new Alchemy({ apiKey: this.config.apiKey, network: NETWORKS[this.config.network] || Network.ETH_MAINNET }) }
  async disconnect() { await super.disconnect(); if (this.alchemy) { this.alchemy.ws.removeAllListeners(); this.alchemy = null } }
  async getTokenMetadata(addr) { const m = await this.alchemy.core.getTokenMetadata(addr); return { name: m.name || 'Unknown', symbol: m.symbol || 'UNKNOWN', decimals: m.decimals || 18 } }
  async getNftContractMetadata(addr) { const m = await this.alchemy.nft.getContractMetadata(addr); return { name: m.name || addr.slice(0, 10) + '...', symbol: m.symbol || 'NFT', tokenType: m.tokenType || 'ERC721' } }

  async subscribeToBlocks(cb) { this.alchemy.ws.on('block', cb); return { unsubscribe: () => this.alchemy.ws.off('block', cb) } }
  async subscribeToPendingTransactions(config, cb) {
    const handler = tx => { if (tx.to) cb({ hash: tx.hash, from: tx.from, to: tx.to ?? null, value: BigInt(tx.value || 0), data: tx.input || '0x' }) }
    const subConfig = { method: AlchemySubscription.PENDING_TRANSACTIONS }
    if (config.toAddress) subConfig.toAddress = config.toAddress
    if (config.fromAddress) subConfig.fromAddress = config.fromAddress
    this.alchemy.ws.on(subConfig, handler)
    return { unsubscribe: () => this.alchemy.ws.off(subConfig, handler) }
  }
  async subscribeToMinedTransactions(config, cb) {
    const addrs = config.to ? config.to.map(a => ({ to: a })) : config.from ? config.from.map(a => ({ from: a })) : []
    if (!addrs.length) return { unsubscribe: () => {} }
    const handler = tx => { if (tx.transaction) cb({ hash: tx.transaction.hash, from: tx.transaction.from, to: tx.transaction.to ?? null, value: BigInt(tx.transaction.value || 0), data: tx.transaction.input || '0x' }, tx.blockNumber) }
    const subConfig = { method: AlchemySubscription.MINED_TRANSACTIONS, addresses: addrs }
    this.alchemy.ws.on(subConfig, handler)
    return { unsubscribe: () => this.alchemy.ws.off(subConfig, handler) }
  }
}

module.exports = { AlchemyProvider }
