import { Alchemy, Network, AlchemySubscription, AlchemyMinedTransactionsAddress } from 'alchemy-sdk'
import { EthereumProvider, ProviderType, ProviderCapabilities, ProviderConfig, LogFilter, TokenMetadata, NftContractMetadata, SubscriptionHandle, PendingTransactionConfig, BlockWithTransactions, TransactionResponse, TransactionReceipt, Log, ProviderHealth } from './types'

const NETWORKS: Record<string, Network> = { mainnet: Network.ETH_MAINNET, goerli: Network.ETH_GOERLI, sepolia: Network.ETH_SEPOLIA, polygon: Network.MATIC_MAINNET, arbitrum: Network.ARB_MAINNET, optimism: Network.OPT_MAINNET, base: Network.BASE_MAINNET }

export class AlchemyProvider implements EthereumProvider {
  readonly type = ProviderType.ALCHEMY
  readonly capabilities: ProviderCapabilities = { websocket: true, pendingTransactions: true, addressFilteredPending: true, tokenMetadata: true, nftMetadata: true }
  private alchemy: Alchemy|null = null
  private config: ProviderConfig
  private _isConnected = false
  private consecutiveFailures = 0
  private lastError?: string

  constructor(config:ProviderConfig) { this.config = config }
  get isConnected(): boolean { return this._isConnected }

  async connect(): Promise<void> {
    try {
      this.alchemy = new Alchemy({ apiKey: this.config.apiKey, network: NETWORKS[this.config.network] || Network.ETH_MAINNET })
      await this.alchemy.core.getBlockNumber()
      this._isConnected = true; this.consecutiveFailures = 0
    } catch (e) { this.lastError = e instanceof Error ? e.message : String(e); this.consecutiveFailures++; throw e }
  }

  async disconnect(): Promise<void> { if (this.alchemy) this.alchemy.ws.removeAllListeners(); this.alchemy = null; this._isConnected = false }
  private getAlchemy(): Alchemy { if (!this.alchemy) throw new Error('Alchemy not connected'); return this.alchemy }

  async getBlockNumber(): Promise<number> {
    try { const n = await this.getAlchemy().core.getBlockNumber(); this.consecutiveFailures = 0; return n }
    catch (e) { this.lastError = e instanceof Error ? e.message : String(e); this.consecutiveFailures++; throw e }
  }

  async getBlock(n:number): Promise<BlockWithTransactions|null> { return this.getBlockWithTransactions(n) }

  async getBlockWithTransactions(n:number): Promise<BlockWithTransactions|null> {
    try {
      const block = await this.getAlchemy().core.getBlockWithTransactions(n)
      if (!block) return null
      const txs: TransactionResponse[] = block.transactions.map(tx => ({ hash: tx.hash, from: tx.from, to: tx.to ?? null, value: BigInt(tx.value?.toString() || '0'), data: tx.data, nonce: tx.nonce, gasLimit: BigInt(tx.gasLimit?.toString() || '0'), gasPrice: tx.gasPrice ? BigInt(tx.gasPrice.toString()) : undefined, maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas.toString()) : undefined, maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? BigInt(tx.maxPriorityFeePerGas.toString()) : undefined, blockNumber: tx.blockNumber || undefined, blockHash: tx.blockHash || undefined }))
      this.consecutiveFailures = 0
      return { number: block.number, hash: block.hash, timestamp: block.timestamp, transactions: txs }
    } catch (e) { this.lastError = e instanceof Error ? e.message : String(e); this.consecutiveFailures++; throw e }
  }

  async getLogs(filter:LogFilter): Promise<Log[]> {
    try {
      const logs = await this.getAlchemy().core.getLogs({ fromBlock: filter.fromBlock, toBlock: filter.toBlock, address: filter.address, topics: filter.topics })
      this.consecutiveFailures = 0
      return logs.map(l => ({ address: l.address, topics: [...l.topics], data: l.data, blockNumber: l.blockNumber, blockHash: l.blockHash, transactionHash: l.transactionHash, transactionIndex: l.transactionIndex, logIndex: l.logIndex }))
    } catch (e) { this.lastError = e instanceof Error ? e.message : String(e); this.consecutiveFailures++; throw e }
  }

  async getTransactionReceipt(hash:string): Promise<TransactionReceipt|null> {
    try {
      const r = await this.getAlchemy().core.getTransactionReceipt(hash)
      if (!r) return null
      this.consecutiveFailures = 0
      return { hash: r.transactionHash, blockNumber: r.blockNumber, blockHash: r.blockHash, from: r.from, to: r.to, contractAddress: r.contractAddress, status: r.status ?? 1, gasUsed: BigInt(r.gasUsed.toString()), logs: r.logs.map(l => ({ address: l.address, topics: [...l.topics], data: l.data, blockNumber: l.blockNumber, blockHash: l.blockHash, transactionHash: l.transactionHash, transactionIndex: l.transactionIndex, logIndex: l.logIndex })) }
    } catch (e) { this.lastError = e instanceof Error ? e.message : String(e); this.consecutiveFailures++; throw e }
  }

  async getGasPrice(): Promise<bigint> {
    try { const p = await this.getAlchemy().core.getGasPrice(); this.consecutiveFailures = 0; return BigInt(p.toString()) }
    catch (e) { this.lastError = e instanceof Error ? e.message : String(e); this.consecutiveFailures++; throw e }
  }

  async getTokenMetadata(address:string): Promise<TokenMetadata> {
    try { const m = await this.getAlchemy().core.getTokenMetadata(address); return { name: m.name || 'Unknown Token', symbol: m.symbol || 'UNKNOWN', decimals: m.decimals || 18, logo: m.logo || undefined } }
    catch { return { name: 'Unknown Token', symbol: 'UNKNOWN', decimals: 18 } }
  }

  async getNftContractMetadata(address:string): Promise<NftContractMetadata> {
    try { const m = await this.getAlchemy().nft.getContractMetadata(address); return { name: m.name || address.slice(0,10)+'...', symbol: m.symbol || undefined, tokenType: m.tokenType || undefined, totalSupply: m.totalSupply || undefined, openSea: m.openSeaMetadata ? { floorPrice: m.openSeaMetadata.floorPrice || undefined, collectionName: m.openSeaMetadata.collectionName || undefined, imageUrl: m.openSeaMetadata.imageUrl || undefined, description: m.openSeaMetadata.description || undefined } : undefined } }
    catch { return { name: address.slice(0,10)+'...' } }
  }

  async subscribeToBlocks(callback:(n:number)=>void): Promise<SubscriptionHandle> {
    this.getAlchemy().ws.on('block', callback)
    return { unsubscribe: async () => { this.getAlchemy().ws.off('block', callback) } }
  }

  async subscribeToPendingTransactions(config:PendingTransactionConfig, callback:(tx:TransactionResponse)=>void): Promise<SubscriptionHandle|null> {
    const alchemy = this.getAlchemy()
    const sub: any = { method: AlchemySubscription.PENDING_TRANSACTIONS }
    if (config.toAddress?.length) sub.toAddress = config.toAddress
    if (config.fromAddress?.length) sub.fromAddress = config.fromAddress
    const handler = (tx:any) => callback({ hash: tx.hash, from: tx.from, to: tx.to, value: BigInt(tx.value?.toString() || '0'), data: tx.input || tx.data || '0x', nonce: tx.nonce || 0, gasLimit: BigInt(tx.gas?.toString() || '0'), gasPrice: tx.gasPrice ? BigInt(tx.gasPrice.toString()) : undefined })
    alchemy.ws.on(sub, handler)
    return { unsubscribe: async () => { alchemy.ws.off(sub, handler) } }
  }

  async subscribeToMinedTransactions(addresses:{to?:string[], from?:string[]}, callback:(tx:TransactionResponse, blockNumber:number)=>void): Promise<SubscriptionHandle> {
    const alchemy = this.getAlchemy()
    const minedAddrs: AlchemyMinedTransactionsAddress[] = [...(addresses.to || []).map(a => ({ to: a })), ...(addresses.from || []).map(a => ({ from: a }))]
    const handler = (r:any) => { const tx = r.transaction; if (!tx) return; callback({ hash: tx.hash, from: tx.from, to: tx.to, value: BigInt(tx.value?.toString() || '0'), data: tx.input || tx.data || '0x', nonce: tx.nonce || 0, gasLimit: BigInt(tx.gas?.toString() || '0'), gasPrice: tx.gasPrice ? BigInt(tx.gasPrice.toString()) : undefined, blockNumber: r.blockNumber }, r.blockNumber) }
    alchemy.ws.on({ method: AlchemySubscription.MINED_TRANSACTIONS, addresses: minedAddrs as [AlchemyMinedTransactionsAddress, ...AlchemyMinedTransactionsAddress[]] }, handler)
    return { unsubscribe: async () => { alchemy.ws.removeAllListeners() } }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now()
    try { const n = await this.getBlockNumber(); return { type: this.type, healthy: true, latencyMs: Date.now()-start, blockNumber: n, consecutiveFailures: this.consecutiveFailures } }
    catch (e) { return { type: this.type, healthy: false, lastError: e instanceof Error ? e.message : String(e), consecutiveFailures: this.consecutiveFailures } }
  }
}
