const { JsonRpcProvider, WebSocketProvider, formatEther } = require('ethers')

class BaseProvider {
  constructor(config) { this.config = config; this.httpProvider = null; this.wsProvider = null; this.consecutiveFailures = 0; this.lastError = null }
  buildHttpUrl() { throw new Error('Not implemented') }
  buildWsUrl() { return null }
  get capabilities() { return { websocket: false, pendingTransactions: false, addressFilteredPending: false, tokenMetadata: false, nftMetadata: false } }

  async connect() {
    const httpUrl = this.buildHttpUrl(); if (httpUrl) this.httpProvider = new JsonRpcProvider(httpUrl)
    const wsUrl = this.buildWsUrl(); if (wsUrl) try { this.wsProvider = new WebSocketProvider(wsUrl) } catch (e) { console.warn(`[${this.config.type}] WS failed:`, e.message) }
  }
  async disconnect() { if (this.wsProvider) { await this.wsProvider.destroy(); this.wsProvider = null } }
  getProvider() { return this.wsProvider || this.httpProvider }

  async getBlockNumber() { try { const n = await this.getProvider().getBlockNumber(); this.consecutiveFailures = 0; return n } catch (e) { this.lastError = e.message; this.consecutiveFailures++; throw e } }
  async getBlockWithTransactions(n) { const b = await this.getProvider().getBlock(n, true); if (!b) return null; return { number: b.number, hash: b.hash, timestamp: b.timestamp, transactions: b.prefetchedTransactions.map(tx => ({ hash: tx.hash, from: tx.from, to: tx.to, value: tx.value, data: tx.data, blockNumber: b.number })) } }
  async getLogs(filter) { return this.getProvider().getLogs({ fromBlock: filter.fromBlock, toBlock: filter.toBlock, topics: filter.topics }) }
  async getTransactionReceipt(hash) { const r = await this.getProvider().getTransactionReceipt(hash); if (!r) return null; return { transactionHash: r.hash, blockNumber: r.blockNumber, from: r.from, to: r.to, contractAddress: r.contractAddress, status: r.status, logs: r.logs } }
  async getGasPrice() { const fee = await this.getProvider().getFeeData(); return fee.gasPrice || 0n }
  async getTokenMetadata(addr) { return require('./metadata-fallback').MetadataFallback.getTokenMetadata(this.getProvider(), addr) }
  async getNftContractMetadata(addr) { return require('./metadata-fallback').MetadataFallback.getNftContractMetadata(this.getProvider(), addr) }
  async subscribeToBlocks(cb) { return require('./polling-adapter').createPollingSubscription(this, cb) }
  async subscribeToPendingTransactions() { return null }
  async healthCheck() { const start = Date.now(); try { const bn = await this.getBlockNumber(); return { type: this.config.type, healthy: true, consecutiveFailures: 0, latencyMs: Date.now() - start, blockNumber: bn } } catch (e) { return { type: this.config.type, healthy: false, consecutiveFailures: this.consecutiveFailures, lastError: e.message, latencyMs: Date.now() - start } } }
}

module.exports = { BaseProvider }
