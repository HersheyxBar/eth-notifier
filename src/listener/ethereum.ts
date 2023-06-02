import { Alchemy, Network, AlchemySubscription, AlchemyMinedTransactionsAddress } from 'alchemy-sdk'
import { formatEther, formatUnits } from 'ethers'
import { ContractWatcher, WalletWatcher, DecodedTransaction, TrackingConfig, TokenTransferEvent, NftTransferEvent, DexSwapEvent, LargeTransferEvent, ContractDeployEvent, GasAlertEvent, KNOWN_DEX_ROUTERS, ERC20_TRANSFER_TOPIC, ERC1155_SINGLE_TRANSFER_TOPIC, ERC1155_BATCH_TRANSFER_TOPIC } from '../types'
import { decodeTransaction } from '../decoder/transaction'
import { ENV } from '../config'
import { ExponentialBackoff, sleep } from '../utils/retry'
import { StatePersistence } from '../utils/persistence'
import { ProviderManager, EthereumProvider, SubscriptionHandle, TransactionResponse, AlchemyProvider } from '../providers'

type TxCallback = (d: DecodedTransaction) => void
type ListenerOpts = { watchers: Map<string, ContractWatcher>; walletWatchers?: Map<string, WalletWatcher>; trackingConfig?: TrackingConfig; onTransaction: TxCallback; persistence?: StatePersistence; providerManager?: ProviderManager; apiKeys?: string[] }
const MAX_SEEN = 10000, PRUNE_AT = 8000
const NETWORKS: Record<string, Network> = { mainnet: Network.ETH_MAINNET, goerli: Network.ETH_GOERLI, sepolia: Network.ETH_SEPOLIA, polygon: Network.MATIC_MAINNET, arbitrum: Network.ARB_MAINNET, optimism: Network.OPT_MAINNET, base: Network.BASE_MAINNET }

export class EthereumListener {
  private pm?: ProviderManager
  private alchemy?: Alchemy
  private apiKeys: string[] = []
  private keyIdx = 0
  private network: Network = Network.ETH_MAINNET
  private failures: Map<number, number> = new Map()
  private watchers: Map<string, ContractWatcher>
  private walletWatchers: Map<string, WalletWatcher>
  private tracking: TrackingConfig
  private onTx: TxCallback
  private running = false
  private seen: Map<string, number> = new Map()
  private dedupeMs: number
  private backoff: ExponentialBackoff
  private reconnecting = false
  private persistence?: StatePersistence
  private gasInterval?: NodeJS.Timeout
  private lastGasAlert = 0
  private subs: SubscriptionHandle[] = []

  constructor(opts: ListenerOpts) {
    this.network = NETWORKS[ENV.NETWORK] || Network.ETH_MAINNET
    this.watchers = opts.watchers
    this.walletWatchers = opts.walletWatchers || new Map()
    this.tracking = opts.trackingConfig || {}
    this.onTx = opts.onTransaction
    this.dedupeMs = Math.max(0, ENV.NOTIFY_DEDUPE_SECONDS) * 1000
    this.backoff = new ExponentialBackoff(1000, 60000)
    this.persistence = opts.persistence
    if (opts.providerManager) { this.pm = opts.providerManager; console.log('[Listener] Using ProviderManager') }
    else { this.apiKeys = opts.apiKeys || ENV.ALCHEMY_API_KEYS; if (!this.apiKeys.length) throw new Error('No Alchemy API key'); console.log(`[Listener] Legacy: ${this.apiKeys.length} provider(s)`); this.alchemy = this.makeAlchemy(this.keyIdx) }
    if (this.persistence) { this.seen = this.persistence.getSeenTransactions(); console.log(`[Listener] Loaded ${this.seen.size} seen txs`) }
  }

  private makeAlchemy(idx: number): Alchemy { return new Alchemy({ apiKey: this.apiKeys[idx], network: this.network }) }
  private switchProvider(): boolean { if (this.pm) return true; const next = (this.keyIdx + 1) % this.apiKeys.length; this.failures.set(this.keyIdx, (this.failures.get(this.keyIdx) || 0) + 1); this.keyIdx = next; console.log(`[Listener] Switch to provider ${this.keyIdx + 1}/${this.apiKeys.length}`); this.alchemy!.ws.removeAllListeners(); this.alchemy = this.makeAlchemy(this.keyIdx); return true }
  getProviderStatus(): { current: number; total: number; failures: Record<number, number>; providers?: any[] } { if (this.pm) { const i = this.pm.getCurrentProviderInfo(), h = this.pm.getHealthStatus(); return { current: i.index + 1, total: i.total, failures: {}, providers: h } } const f: Record<number, number> = {}; this.failures.forEach((c, i) => f[i] = c); return { current: this.keyIdx + 1, total: this.apiKeys.length, failures: f } }
  static create(watchers: Map<string, ContractWatcher>, onTx: TxCallback, walletWatchers?: Map<string, WalletWatcher>, apiKeys?: string[]): EthereumListener { return new EthereumListener({ watchers, walletWatchers, onTransaction: onTx, apiKeys }) }

  async start(): Promise<void> { if (this.running) return; if (this.pm) await this.pm.initialize(); await this.setupSubs(); this.setupMonitor(); this.startGasMonitor() }

  private async setupSubs(): Promise<void> {
    const cAddrs = Array.from(this.watchers.keys()), wAddrs = Array.from(this.walletWatchers.keys())
    const hasTrack = !!(this.tracking.tokenTransfers?.enabled || this.tracking.nftTransfers?.enabled || this.tracking.dexSwaps?.enabled || this.tracking.largeTransfers?.enabled || this.tracking.contractDeploys?.enabled)
    const hasGas = !!this.tracking.gasAlerts?.enabled
    if (!cAddrs.length && !wAddrs.length && !hasTrack) {
      if (hasGas) { console.warn('[Listener] Gas alerts enabled (no watchers)'); this.running = true; return }
      console.warn('[Listener] Nothing to watch'); return
    }
    if (cAddrs.length) { console.log(`[Listener] ${cAddrs.length} contract(s)`); cAddrs.forEach(a => console.log(`  - ${this.watchers.get(a)!.name} (${a})`)) }
    if (wAddrs.length) { console.log(`[Listener] ${wAddrs.length} wallet(s)`); wAddrs.forEach(a => console.log(`  - ${this.walletWatchers.get(a)!.name} (${a})`)) }
    this.running = true
    if (this.pm) await this.setupPmSubs(cAddrs, wAddrs, hasTrack)
    else await this.setupLegacySubs(cAddrs, wAddrs, hasTrack)
    console.log('[Listener] Subscriptions active'); this.backoff.reset()
  }

  private async setupPmSubs(cAddrs: string[], wAddrs: string[], hasTrack: boolean): Promise<void> {
    const provider = this.pm!.getSubscriptionProvider()
    const alchP = this.pm!.getProviderWithCapability('addressFilteredPending')
    if (alchP && alchP instanceof AlchemyProvider) await this.setupAlchemyEnhanced(alchP, cAddrs, wAddrs)
    else await this.setupGenericSubs(provider, cAddrs, wAddrs)
    if (hasTrack) { const h = await provider.subscribeToBlocks(async n => { try { await this.processBlock(n) } catch (e) { console.error('[Listener] Block error:', e) } }); this.subs.push(h); this.logTracking() }
  }

  private async setupAlchemyEnhanced(p: AlchemyProvider, cAddrs: string[], wAddrs: string[]): Promise<void> {
    if (cAddrs.length) { const h1 = await p.subscribeToPendingTransactions({ toAddress: cAddrs }, tx => this.handlePendingPm(tx)); if (h1) this.subs.push(h1); const h2 = await p.subscribeToMinedTransactions({ to: cAddrs }, (tx, bn) => this.handleMinedPm(tx, bn)); this.subs.push(h2) }
    if (wAddrs.length) { const h1 = await p.subscribeToPendingTransactions({ fromAddress: wAddrs }, tx => this.handleWalletPendingPm(tx)); if (h1) this.subs.push(h1); const h2 = await p.subscribeToMinedTransactions({ from: wAddrs }, (tx, bn) => this.handleWalletMinedPm(tx, bn)); this.subs.push(h2) }
  }

  private async setupGenericSubs(p: EthereumProvider, cAddrs: string[], wAddrs: string[]): Promise<void> {
    if (cAddrs.length || wAddrs.length) {
      const h = await p.subscribeToPendingTransactions({ toAddress: cAddrs.length ? cAddrs : undefined, fromAddress: wAddrs.length ? wAddrs : undefined }, tx => { if (tx.to && cAddrs.includes(tx.to.toLowerCase())) this.handlePendingPm(tx); if (tx.from && wAddrs.includes(tx.from.toLowerCase())) this.handleWalletPendingPm(tx) })
      if (h) this.subs.push(h)
      console.log('[Listener] Client-side filtering')
    }
  }

  private async setupLegacySubs(cAddrs: string[], wAddrs: string[], hasTrack: boolean): Promise<void> {
    if (cAddrs.length) { this.alchemy!.ws.on({ method: AlchemySubscription.PENDING_TRANSACTIONS, toAddress: cAddrs }, tx => this.handlePending(tx)); this.alchemy!.ws.on({ method: AlchemySubscription.MINED_TRANSACTIONS, addresses: cAddrs.map(a => ({ to: a })) as [AlchemyMinedTransactionsAddress, ...AlchemyMinedTransactionsAddress[]] }, tx => this.handleMined(tx)) }
    if (wAddrs.length) { this.alchemy!.ws.on({ method: AlchemySubscription.PENDING_TRANSACTIONS, fromAddress: wAddrs }, tx => this.handleWalletPending(tx)); this.alchemy!.ws.on({ method: AlchemySubscription.MINED_TRANSACTIONS, addresses: wAddrs.map(a => ({ from: a })) as [AlchemyMinedTransactionsAddress, ...AlchemyMinedTransactionsAddress[]] }, tx => this.handleWalletMined(tx)) }
    if (hasTrack) { this.alchemy!.ws.on('block', async n => { try { await this.processBlock(n) } catch (e) { console.error('[Listener] Block error:', e) } }); this.logTracking() }
  }

  private logTracking(): void { const f = [this.tracking.tokenTransfers?.enabled && 'Tokens', this.tracking.nftTransfers?.enabled && 'NFTs', this.tracking.dexSwaps?.enabled && 'DEX', this.tracking.largeTransfers?.enabled && 'Large', this.tracking.contractDeploys?.enabled && 'Deploys', this.tracking.gasAlerts?.enabled && 'Gas'].filter(Boolean); console.log(`[Listener] Tracking: ${f.join(', ')}`) }

  private async processBlock(bn: number): Promise<void> {
    let block: any
    if (this.pm) block = await this.pm.executeWithFailover(p => p.getBlockWithTransactions(bn))
    else block = await this.alchemy!.core.getBlockWithTransactions(bn)
    if (!block) return
    this.persistence?.setLastBlockNumber(bn)
    for (const tx of block.transactions) {
      if (this.tracking.largeTransfers?.enabled) await this.checkLarge(tx, bn)
      if (this.tracking.contractDeploys?.enabled && !tx.to) await this.checkDeploy(tx, bn)
      if (this.tracking.dexSwaps?.enabled && tx.to) await this.checkDex(tx, bn)
    }
    if (this.tracking.tokenTransfers?.enabled || this.tracking.nftTransfers?.enabled) await this.processLogs(bn)
  }

  private async processLogs(bn: number): Promise<void> {
    const topics: string[] = []
    if (this.tracking.tokenTransfers?.enabled || this.tracking.nftTransfers?.enabled) topics.push(ERC20_TRANSFER_TOPIC)
    if (this.tracking.nftTransfers?.enabled) { topics.push(ERC1155_SINGLE_TRANSFER_TOPIC); topics.push(ERC1155_BATCH_TRANSFER_TOPIC) }
    if (!topics.length) return
    try {
      let logs: any[]
      if (this.pm) logs = await this.pm.executeWithFailover(p => p.getLogs({ fromBlock: bn, toBlock: bn, topics: [topics] }))
      else logs = await this.alchemy!.core.getLogs({ fromBlock: bn, toBlock: bn, topics: [topics] })
      for (const log of logs) {
        const topic0 = log.topics?.[0]
        if (topic0 === ERC20_TRANSFER_TOPIC) {
          if (log.topics.length === 3 && this.tracking.tokenTransfers?.enabled) await this.handleErc20Log(log, bn)
          else if (log.topics.length === 4 && this.tracking.nftTransfers?.enabled) await this.handleErc721Log(log, bn)
        } else if ((topic0 === ERC1155_SINGLE_TRANSFER_TOPIC || topic0 === ERC1155_BATCH_TRANSFER_TOPIC) && this.tracking.nftTransfers?.enabled) {
          await this.handleNftLog(log, bn)
        }
      }
    } catch (e) { console.error(`[Listener] Log error block ${bn}:`, e) }
  }

  private async handleErc20Log(log: any, bn: number): Promise<void> {
    try {
      const from = '0x' + log.topics[1].slice(26), to = '0x' + log.topics[2].slice(26)
      const toks = this.tracking.tokenTransfers?.tokens; if (toks?.length && !toks.some(t => t.toLowerCase() === log.address.toLowerCase())) return
      const amt = BigInt(log.data), info = await this.getToken(log.address), amtFmt = formatUnits(amt, info.decimals)
      const ev: TokenTransferEvent = { sourceType: 'token_transfer', tokenAddress: log.address, tokenSymbol: info.symbol, tokenName: info.name, tokenDecimals: info.decimals, amount: amt.toString(), amountFormatted: amtFmt, transactionHash: log.transactionHash, from, to, value: '0', blockNumber: bn }
      if (this.shouldNotify(log.transactionHash + log.address)) { console.log(`[Listener] Token: ${amtFmt} ${info.symbol}`); this.onTx(ev) }
    } catch (e) { console.error('[Listener] Token log error:', e) }
  }

  private async handleErc721Log(log: any, bn: number): Promise<void> {
    try {
      const cols = this.tracking.nftTransfers?.collections; if (cols?.length && !cols.some(c => c.toLowerCase() === log.address.toLowerCase())) return
      const from = '0x' + log.topics[1].slice(26), to = '0x' + log.topics[2].slice(26)
      const tokenId = BigInt(log.topics[3]).toString()
      const ev: NftTransferEvent = { sourceType: 'nft_transfer', contractAddress: log.address, collectionName: await this.getCollection(log.address), tokenId, tokenType: 'ERC721', transactionHash: log.transactionHash, from, to, value: '0', blockNumber: bn }
      if (this.shouldNotify(log.transactionHash + log.address + tokenId)) { console.log(`[Listener] NFT: ${ev.collectionName} #${tokenId}`); this.onTx(ev) }
    } catch (e) { console.error('[Listener] ERC721 log error:', e) }
  }

  private async handleNftLog(log: any, bn: number): Promise<void> {
    try {
      const cols = this.tracking.nftTransfers?.collections; if (cols?.length && !cols.some(c => c.toLowerCase() === log.address.toLowerCase())) return
      const from = '0x' + log.topics[2].slice(26), to = '0x' + log.topics[3].slice(26)
      const ev: NftTransferEvent = { sourceType: 'nft_transfer', contractAddress: log.address, collectionName: await this.getCollection(log.address), tokenId: 'batch', tokenType: 'ERC1155', transactionHash: log.transactionHash, from, to, value: '0', blockNumber: bn }
      if (this.shouldNotify(log.transactionHash + log.address)) { console.log(`[Listener] ERC1155: ${ev.collectionName}`); this.onTx(ev) }
    } catch (e) { console.error('[Listener] NFT log error:', e) }
  }

  private async checkLarge(tx: any, bn: number): Promise<void> {
    try {
      const val = BigInt(tx.value?.toString() || '0'), eth = parseFloat(formatEther(val)), min = this.tracking.largeTransfers?.minEth ?? 100
      if (eth >= min) { const ev: LargeTransferEvent = { sourceType: 'large_transfer', valueEth: formatEther(val), transactionHash: tx.hash, from: tx.from, to: tx.to || '', value: formatEther(val), blockNumber: bn }; if (this.shouldNotify(tx.hash)) { console.log(`[Listener] Large: ${ev.valueEth} ETH`); this.onTx(ev) } }
    } catch (e) { console.error('[Listener] Large check error:', e) }
  }

  private async checkDeploy(tx: any, bn: number): Promise<void> {
    try {
      const creators = this.tracking.contractDeploys?.watchCreators; if (creators?.length && !creators.some(c => c.toLowerCase() === tx.from.toLowerCase())) return
      let receipt: any; if (this.pm) receipt = await this.pm.executeWithFailover(p => p.getTransactionReceipt(tx.hash)); else receipt = await this.alchemy!.core.getTransactionReceipt(tx.hash)
      if (!receipt?.contractAddress) return
      const ev: ContractDeployEvent = { sourceType: 'contract_deploy', deployer: tx.from, contractAddress: receipt.contractAddress, bytecodeSize: tx.data ? (tx.data.length - 2) / 2 : 0, transactionHash: tx.hash, from: tx.from, to: receipt.contractAddress, value: formatEther(BigInt(tx.value?.toString() || '0')), blockNumber: bn }
      if (this.shouldNotify(tx.hash)) { console.log(`[Listener] Deploy: ${receipt.contractAddress}`); this.onTx(ev) }
    } catch (e) { console.error('[Listener] Deploy check error:', e) }
  }

  private async checkDex(tx: any, bn: number): Promise<void> {
    try {
      const to = tx.to?.toLowerCase(); if (!to) return
      const dex = KNOWN_DEX_ROUTERS[to]; if (!dex) return
      const dexes = this.tracking.dexSwaps?.dexes; if (dexes?.length && !dexes.some(d => dex.toLowerCase().includes(d.toLowerCase()))) return
      const val = formatEther(BigInt(tx.value?.toString() || '0'))
      const ev: DexSwapEvent = { sourceType: 'dex_swap', dexName: dex, dexAddress: to, tokenIn: { address: '', symbol: 'ETH', amount: val }, tokenOut: { address: '', symbol: 'Unknown', amount: '?' }, transactionHash: tx.hash, from: tx.from, to, value: val, blockNumber: bn }
      if (this.shouldNotify(tx.hash + 'swap')) { console.log(`[Listener] DEX: ${dex}`); this.onTx(ev) }
    } catch (e) { console.error('[Listener] DEX check error:', e) }
  }

  private startGasMonitor(): void {
    if (!this.tracking.gasAlerts?.enabled) return
    const interval = this.tracking.gasAlerts.checkIntervalSeconds || 60, threshold = this.tracking.gasAlerts.alertThresholdGwei
    console.log(`[Listener] Gas monitor: ${threshold} gwei`)
    this.gasInterval = setInterval(async () => {
      try {
        let gas: bigint; if (this.pm) gas = await this.pm.executeWithFailover(p => p.getGasPrice()); else { const p = await this.alchemy!.core.getGasPrice(); gas = BigInt(p.toString()) }
        const gwei = parseFloat(formatUnits(gas.toString(), 'gwei'))
        if (gwei >= threshold) { const now = Date.now(); if (now - this.lastGasAlert > 300000) { this.lastGasAlert = now; const ev: GasAlertEvent = { sourceType: 'gas_alert', currentGwei: Math.round(gwei * 100) / 100, thresholdGwei: threshold, timestamp: now, transactionHash: '', from: '', to: '', value: '0' }; console.log(`[Listener] Gas: ${ev.currentGwei} gwei`); this.onTx(ev) } }
      } catch (e) { console.error('[Listener] Gas check error:', e) }
    }, interval * 1000)
  }

  private async getToken(addr: string): Promise<{ symbol: string; name: string; decimals: number }> {
    try { if (this.pm) { const p = this.pm.getProviderWithCapability('tokenMetadata'); if (p) { const m = await p.getTokenMetadata(addr); return { symbol: m.symbol || 'UNKNOWN', name: m.name || 'Unknown', decimals: m.decimals || 18 } } }; const m = await this.alchemy!.core.getTokenMetadata(addr); return { symbol: m.symbol || 'UNKNOWN', name: m.name || 'Unknown', decimals: m.decimals || 18 } } catch { return { symbol: 'UNKNOWN', name: 'Unknown', decimals: 18 } }
  }

  private async getCollection(addr: string): Promise<string> {
    try { if (this.pm) { const p = this.pm.getProviderWithCapability('nftMetadata'); if (p) { const m = await p.getNftContractMetadata(addr); return m.name || addr.slice(0, 10) + '...' } }; const m = await this.alchemy!.nft.getContractMetadata(addr); return m.name || addr.slice(0, 10) + '...' } catch { return addr.slice(0, 10) + '...' }
  }

  private setupMonitor(): void { if (this.pm) return; this.alchemy!.ws.on('error', e => { console.error('[Listener] WS error:', e); this.handleDisconnect() }) }

  private async handleDisconnect(): Promise<void> {
    if (this.reconnecting) return
    this.reconnecting = true; console.log('[Listener] Reconnecting...')
    let switches = 0; const maxSwitches = this.apiKeys.length * 2
    while (this.running) {
      if (this.apiKeys.length > 1 && switches < maxSwitches) { this.switchProvider(); switches++; try { await this.setupSubs(); console.log(`[Listener] Reconnected via ${this.keyIdx + 1}`); this.backoff.reset(); this.reconnecting = false; return } catch { continue } }
      const delay = this.backoff.getNextDelay(); console.log(`[Listener] Retry in ${delay}ms`); await sleep(delay); switches = 0
      try { this.alchemy!.ws.removeAllListeners(); await this.setupSubs(); console.log('[Listener] Reconnected'); this.reconnecting = false; return } catch (e) { console.error('[Listener] Reconnect failed:', e) }
    }
    this.reconnecting = false
  }

  private handlePendingPm(tx: TransactionResponse): void { const to = tx.to?.toLowerCase(); if (!to) return; const w = this.watchers.get(to); if (!w) return; const d = decodeTransaction({ hash: tx.hash, from: tx.from, to: tx.to || '', value: tx.value, data: tx.data || '0x' }, w); if (d && this.shouldNotify(d.transactionHash + ':pending')) { console.log(`[Listener] Pending: ${d.functionName}() on ${d.contractName}`); this.onTx(d as DecodedTransaction) } }
  private handleMinedPm(tx: TransactionResponse, bn: number): void { const to = tx.to?.toLowerCase(); if (!to) return; const w = this.watchers.get(to); if (!w) return; const d = decodeTransaction({ hash: tx.hash, from: tx.from, to: tx.to || '', value: tx.value, data: tx.data || '0x', blockNumber: bn }, w); if (d && this.shouldNotify(d.transactionHash + ':mined')) { console.log(`[Listener] Mined: ${d.functionName}() on ${d.contractName} (${bn})`); this.persistence?.setLastBlockNumber(bn); this.onTx(d as DecodedTransaction) } }
  private handleWalletPendingPm(tx: TransactionResponse): void { const from = tx.from?.toLowerCase(); if (!from) return; const w = this.walletWatchers.get(from); if (!w) return; const d = this.makeWalletTxPm(tx, w); if (this.shouldNotify(d.transactionHash + ':pending')) { console.log(`[Listener] Wallet pending: ${w.name}`); this.onTx(d) } }
  private handleWalletMinedPm(tx: TransactionResponse, bn: number): void { const from = tx.from?.toLowerCase(); if (!from) return; const w = this.walletWatchers.get(from); if (!w) return; const d = this.makeWalletTxPm(tx, w, bn); if (this.shouldNotify(d.transactionHash + ':mined')) { console.log(`[Listener] Wallet mined: ${w.name} (${bn})`); this.persistence?.setLastBlockNumber(bn); this.onTx(d) } }
  private makeWalletTxPm(tx: TransactionResponse, w: WalletWatcher, bn?: number): DecodedTransaction { const data = tx.data || '0x', sig = data.length >= 10 ? data.slice(0, 10) : data, val = formatEther(tx.value); return { sourceType: 'wallet', walletName: w.name, contractName: w.name, contractAddress: w.address, functionName: sig === '0x' ? 'transfer' : sig, functionArgs: { to: tx.to || '(create)', data: data.length > 20 ? data.slice(0, 20) + '...' : data }, transactionHash: tx.hash, from: tx.from, to: tx.to || '', value: val, blockNumber: bn } }

  private handlePending(tx: any): void { const to = tx.to?.toLowerCase(); if (!to) return; const w = this.watchers.get(to); if (!w) return; const d = decodeTransaction({ hash: tx.hash, from: tx.from, to: tx.to, value: this.parseBigInt(tx.value), data: tx.input || tx.data || '0x' }, w); if (d && this.shouldNotify(d.transactionHash + ':pending')) { console.log(`[Listener] Pending: ${d.functionName}() on ${d.contractName}`); this.onTx(d as DecodedTransaction) } }
  private handleMined(tx: any): void { const t = tx.transaction; if (!t) return; const to = t.to?.toLowerCase(); if (!to) return; const w = this.watchers.get(to); if (!w) return; const d = decodeTransaction({ hash: t.hash, from: t.from, to: t.to, value: this.parseBigInt(t.value), data: t.input || t.data || '0x', blockNumber: tx.blockNumber }, w); if (d && this.shouldNotify(d.transactionHash + ':mined')) { console.log(`[Listener] Mined: ${d.functionName}() on ${d.contractName} (${tx.blockNumber})`); this.persistence?.setLastBlockNumber(tx.blockNumber); this.onTx(d as DecodedTransaction) } }
  private handleWalletPending(tx: any): void { const from = tx.from?.toLowerCase(); if (!from) return; const w = this.walletWatchers.get(from); if (!w) return; const d = this.makeWalletTx(tx, w); if (this.shouldNotify(d.transactionHash + ':pending')) { console.log(`[Listener] Wallet pending: ${w.name}`); this.onTx(d) } }
  private handleWalletMined(tx: any): void { const t = tx.transaction; if (!t) return; const from = t.from?.toLowerCase(); if (!from) return; const w = this.walletWatchers.get(from); if (!w) return; const d = this.makeWalletTx(t, w, tx.blockNumber); if (this.shouldNotify(d.transactionHash + ':mined')) { console.log(`[Listener] Wallet mined: ${w.name} (${tx.blockNumber})`); this.persistence?.setLastBlockNumber(tx.blockNumber); this.onTx(d) } }
  private makeWalletTx(tx: any, w: WalletWatcher, bn?: number): DecodedTransaction { const data = tx.input || tx.data || '0x', sig = data.length >= 10 ? data.slice(0, 10) : data, val = formatEther(this.parseBigInt(tx.value)); return { sourceType: 'wallet', walletName: w.name, contractName: w.name, contractAddress: w.address, functionName: sig === '0x' ? 'transfer' : sig, functionArgs: { to: tx.to || '(create)', data: data.length > 20 ? data.slice(0, 20) + '...' : data }, transactionHash: tx.hash, from: tx.from, to: tx.to || '', value: val, blockNumber: bn } }
  private parseBigInt(v: any): bigint { try { if (v === undefined || v === null) return BigInt(0); if (typeof v === 'bigint') return v; if (typeof v === 'string') return BigInt(v); if (typeof v === 'number') return BigInt(Math.floor(v)); return BigInt(0) } catch { return BigInt(0) } }

  async stop(): Promise<void> {
    if (this.gasInterval) { clearInterval(this.gasInterval); this.gasInterval = undefined }
    if (!this.running) return
    console.log('[Listener] Stopping...'); this.running = false
    for (const h of this.subs) try { await h.unsubscribe() } catch {}
    this.subs = []
    if (this.pm) await this.pm.shutdown()
    else if (this.alchemy) this.alchemy.ws.removeAllListeners()
    if (this.persistence) { this.persistence.setSeenTransactions(this.seen); this.persistence.forceSave() }
    console.log('[Listener] Stopped')
  }

  private shouldNotify(hash: string): boolean {
    if (this.dedupeMs === 0) return true
    const now = Date.now(), last = this.seen.get(hash)
    if (last && now - last < this.dedupeMs) return false
    this.seen.set(hash, now)
    if (this.seen.size > PRUNE_AT) this.prune(now)
    if (this.seen.size > MAX_SEEN) this.forceReduce()
    return true
  }

  private prune(now: number): void { const thresh = this.dedupeMs * 2; for (const [h, t] of this.seen) if (now - t > thresh) this.seen.delete(h) }
  private forceReduce(): void { const entries = Array.from(this.seen.entries()).sort((a, b) => b[1] - a[1]); this.seen = new Map(entries.slice(0, Math.floor(MAX_SEEN / 2))) }
}
