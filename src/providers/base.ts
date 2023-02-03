import { JsonRpcProvider, WebSocketProvider, Contract } from 'ethers'
import { EthereumProvider, ProviderType, ProviderCapabilities, ProviderConfig, LogFilter, TokenMetadata, NftContractMetadata, SubscriptionHandle, PendingTransactionConfig, BlockWithTransactions, TransactionResponse, TransactionReceipt, Log, ProviderHealth } from './types'

const ERC20_ABI = ['function name() view returns (string)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)']
const NFT_ABI = ['function name() view returns (string)', 'function symbol() view returns (string)', 'function totalSupply() view returns (uint256)']

export abstract class BaseProvider implements EthereumProvider {
  abstract readonly type: ProviderType
  abstract readonly capabilities: ProviderCapabilities
  protected httpProvider: JsonRpcProvider|null = null
  protected wsProvider: WebSocketProvider|null = null
  protected config: ProviderConfig
  protected _isConnected = false
  protected consecutiveFailures = 0
  protected lastError?: string
  protected tokenCache: Map<string, TokenMetadata> = new Map()
  protected nftCache: Map<string, NftContractMetadata> = new Map()

  constructor(config:ProviderConfig) { this.config = config }
  get isConnected(): boolean { return this._isConnected }
  abstract buildHttpUrl(): string
  abstract buildWsUrl(): string|null

  async connect(): Promise<void> {
    try {
      this.httpProvider = new JsonRpcProvider(this.buildHttpUrl())
      await this.httpProvider.getBlockNumber()
      const wsUrl = this.buildWsUrl()
      if (wsUrl && this.capabilities.websocket) {
        try {
          this.wsProvider = new WebSocketProvider(wsUrl)
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('WebSocket timeout')), 10000)
            this.wsProvider!.getBlockNumber().then(() => { clearTimeout(timeout); resolve() }).catch(reject)
          })
        } catch { this.wsProvider = null }
      }
      this._isConnected = true
      this.consecutiveFailures = 0
    } catch (e) { this.lastError = e instanceof Error ? e.message : String(e); this.consecutiveFailures++; throw e }
  }

  async disconnect(): Promise<void> {
    if (this.wsProvider) { await this.wsProvider.destroy(); this.wsProvider = null }
    if (this.httpProvider) { await this.httpProvider.destroy(); this.httpProvider = null }
    this._isConnected = false
  }

  protected getProvider(): JsonRpcProvider { if (!this.httpProvider) throw new Error(`${this.type} not connected`); return this.httpProvider }
  protected getWsProvider(): WebSocketProvider|null { return this.wsProvider }

  async getBlockNumber(): Promise<number> {
    try { const n = await this.getProvider().getBlockNumber(); this.consecutiveFailures = 0; return n }
    catch (e) { this.lastError = e instanceof Error ? e.message : String(e); this.consecutiveFailures++; throw e }
  }

  async getBlock(blockNumber:number): Promise<BlockWithTransactions|null> { return this.getBlockWithTransactions(blockNumber) }

  async getBlockWithTransactions(blockNumber:number): Promise<BlockWithTransactions|null> {
    try {
      const block = await this.getProvider().getBlock(blockNumber, true)
      if (!block) return null
      const txs: TransactionResponse[] = (block.prefetchedTransactions || []).map(tx => ({
        hash: tx.hash, from: tx.from, to: tx.to, value: tx.value, data: tx.data, nonce: tx.nonce, gasLimit: tx.gasLimit,
        gasPrice: tx.gasPrice || undefined, maxFeePerGas: tx.maxFeePerGas || undefined, maxPriorityFeePerGas: tx.maxPriorityFeePerGas || undefined,
        blockNumber: tx.blockNumber || undefined, blockHash: tx.blockHash || undefined
      }))
      this.consecutiveFailures = 0
      return { number: block.number, hash: block.hash!, timestamp: block.timestamp, transactions: txs }
    } catch (e) { this.lastError = e instanceof Error ? e.message : String(e); this.consecutiveFailures++; throw e }
  }

  async getLogs(filter:LogFilter): Promise<Log[]> {
    try {
      const logs = await this.getProvider().getLogs({ fromBlock: filter.fromBlock, toBlock: filter.toBlock, address: filter.address, topics: filter.topics })
      this.consecutiveFailures = 0
      return logs.map(l => ({ address: l.address, topics: [...l.topics], data: l.data, blockNumber: l.blockNumber, blockHash: l.blockHash, transactionHash: l.transactionHash, transactionIndex: l.transactionIndex, logIndex: l.index }))
    } catch (e) { this.lastError = e instanceof Error ? e.message : String(e); this.consecutiveFailures++; throw e }
  }

  async getTransactionReceipt(hash:string): Promise<TransactionReceipt|null> {
    try {
      const r = await this.getProvider().getTransactionReceipt(hash)
      if (!r) return null
      this.consecutiveFailures = 0
      return { hash: r.hash, blockNumber: r.blockNumber, blockHash: r.blockHash, from: r.from, to: r.to, contractAddress: r.contractAddress, status: r.status ?? 1, gasUsed: r.gasUsed,
        logs: r.logs.map(l => ({ address: l.address, topics: [...l.topics], data: l.data, blockNumber: l.blockNumber, blockHash: l.blockHash, transactionHash: l.transactionHash, transactionIndex: l.transactionIndex, logIndex: l.index })) }
    } catch (e) { this.lastError = e instanceof Error ? e.message : String(e); this.consecutiveFailures++; throw e }
  }

  async getGasPrice(): Promise<bigint> {
    try { const f = await this.getProvider().getFeeData(); this.consecutiveFailures = 0; return f.gasPrice || 0n }
    catch (e) { this.lastError = e instanceof Error ? e.message : String(e); this.consecutiveFailures++; throw e }
  }

  async getTokenMetadata(address:string): Promise<TokenMetadata> {
    const addr = address.toLowerCase()
    if (this.tokenCache.has(addr)) return this.tokenCache.get(addr)!
    const m = await this.fetchTokenMetadata(address)
    this.tokenCache.set(addr, m)
    return m
  }

  protected async fetchTokenMetadata(address:string): Promise<TokenMetadata> {
    try {
      const c = new Contract(address, ERC20_ABI, this.getProvider())
      const [name, symbol, decimals] = await Promise.all([c.name().catch(() => 'Unknown'), c.symbol().catch(() => 'UNKNOWN'), c.decimals().catch(() => 18)])
      return { name, symbol, decimals: Number(decimals) }
    } catch { return { name: 'Unknown Token', symbol: 'UNKNOWN', decimals: 18 } }
  }

  async getNftContractMetadata(address:string): Promise<NftContractMetadata> {
    const addr = address.toLowerCase()
    if (this.nftCache.has(addr)) return this.nftCache.get(addr)!
    const m = await this.fetchNftMetadata(address)
    this.nftCache.set(addr, m)
    return m
  }

  protected async fetchNftMetadata(address:string): Promise<NftContractMetadata> {
    try {
      const c = new Contract(address, NFT_ABI, this.getProvider())
      const [name, symbol, totalSupply] = await Promise.all([c.name().catch(() => address.slice(0,10)+'...'), c.symbol().catch(() => undefined), c.totalSupply().catch(() => undefined)])
      return { name, symbol, totalSupply: totalSupply?.toString() }
    } catch { return { name: address.slice(0,10)+'...' } }
  }

  async subscribeToBlocks(callback:(blockNumber:number)=>void): Promise<SubscriptionHandle> {
    const ws = this.getWsProvider()
    if (ws) { await ws.on('block', callback); return { unsubscribe: async () => { ws.off('block', callback) } } }
    // polling fallback
    let lastBlock = await this.getBlockNumber(), running = true
    const poll = async () => {
      while (running) {
        try { const cur = await this.getBlockNumber(); if (cur > lastBlock) { for (let b = lastBlock+1; b <= cur; b++) callback(b); lastBlock = cur } }
        catch {}
        await new Promise(r => setTimeout(r, 2000))
      }
    }
    poll()
    return { unsubscribe: async () => { running = false } }
  }

  async subscribeToPendingTransactions(config:PendingTransactionConfig, callback:(tx:TransactionResponse)=>void): Promise<SubscriptionHandle|null> {
    if (!this.capabilities.pendingTransactions) return null
    const ws = this.getWsProvider()
    if (!ws) return null
    const handler = async (txHash:string) => {
      try {
        const tx = await this.getProvider().getTransaction(txHash)
        if (!tx) return
        if (config.toAddress?.length && !(tx.to && config.toAddress.some(a => a.toLowerCase() === tx.to!.toLowerCase()))) return
        if (config.fromAddress?.length && !config.fromAddress.some(a => a.toLowerCase() === tx.from.toLowerCase())) return
        callback({ hash: tx.hash, from: tx.from, to: tx.to, value: tx.value, data: tx.data, nonce: tx.nonce, gasLimit: tx.gasLimit, gasPrice: tx.gasPrice || undefined, maxFeePerGas: tx.maxFeePerGas || undefined, maxPriorityFeePerGas: tx.maxPriorityFeePerGas || undefined })
      } catch {}
    }
    await ws.on('pending', handler)
    return { unsubscribe: async () => { ws.off('pending', handler) } }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now()
    try { const n = await this.getBlockNumber(); return { type: this.type, healthy: true, latencyMs: Date.now()-start, blockNumber: n, consecutiveFailures: this.consecutiveFailures } }
    catch (e) { return { type: this.type, healthy: false, lastError: e instanceof Error ? e.message : String(e), consecutiveFailures: this.consecutiveFailures } }
  }
}
