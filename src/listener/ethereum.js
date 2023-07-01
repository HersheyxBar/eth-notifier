const { Alchemy, Network, AlchemySubscription } = require('alchemy-sdk')
const { formatEther, formatUnits } = require('ethers')
const { KNOWN_DEX_ROUTERS, ERC20_TRANSFER_TOPIC, ERC1155_SINGLE_TRANSFER_TOPIC, ERC1155_BATCH_TRANSFER_TOPIC } = require('../types')
const { decodeTransaction } = require('../decoder/transaction')
const { ENV } = require('../config')
const { ExponentialBackoff, sleep } = require('../utils/retry')
const { AlchemyProvider } = require('../providers/alchemy')

const MAX_SEEN = 10000, PRUNE_AT = 8000
const NETWORKS = { mainnet: Network.ETH_MAINNET, goerli: Network.ETH_GOERLI, sepolia: Network.ETH_SEPOLIA, polygon: Network.MATIC_MAINNET, arbitrum: Network.ARB_MAINNET, optimism: Network.OPT_MAINNET, base: Network.BASE_MAINNET }

class EthereumListener {
  constructor(opts) {
    this.network = NETWORKS[ENV.NETWORK] || Network.ETH_MAINNET
    this.watchers = opts.watchers; this.walletWatchers = opts.walletWatchers || new Map(); this.tracking = opts.trackingConfig || {}; this.onTx = opts.onTransaction
    this.dedupeMs = Math.max(0, ENV.NOTIFY_DEDUPE_SECONDS) * 1000; this.backoff = new ExponentialBackoff(1000, 60000); this.persistence = opts.persistence
    this.pm = null; this.alchemy = null; this.apiKeys = []; this.keyIdx = 0; this.failures = new Map(); this.running = false; this.seen = new Map(); this.reconnecting = false; this.gasInterval = null; this.lastGasAlert = 0; this.subs = []
    if (opts.providerManager) { this.pm = opts.providerManager; console.log('[Listener] Using ProviderManager') }
    else { this.apiKeys = opts.apiKeys || ENV.ALCHEMY_API_KEYS; if (!this.apiKeys.length) throw new Error('No Alchemy API key'); console.log(`[Listener] ${this.apiKeys.length} provider(s)`); this.alchemy = new Alchemy({ apiKey: this.apiKeys[0], network: this.network }) }
    if (this.persistence) { this.seen = this.persistence.getSeenTransactions(); console.log(`[Listener] ${this.seen.size} seen txs`) }
  }

  async start() { if (this.running) return; if (this.pm) await this.pm.initialize(); await this.setupSubs(); this.setupMonitor(); this.startGasMonitor() }

  async setupSubs() {
    const cAddrs = Array.from(this.watchers.keys()), wAddrs = Array.from(this.walletWatchers.keys())
    const hasTrack = !!(this.tracking.tokenTransfers?.enabled || this.tracking.nftTransfers?.enabled || this.tracking.dexSwaps?.enabled || this.tracking.largeTransfers?.enabled || this.tracking.contractDeploys?.enabled)
    if (!cAddrs.length && !wAddrs.length && !hasTrack) { if (this.tracking.gasAlerts?.enabled) { this.running = true; return }; console.warn('[Listener] Nothing to watch'); return }
    if (cAddrs.length) { console.log(`[Listener] ${cAddrs.length} contract(s)`); cAddrs.forEach(a => console.log(`  - ${this.watchers.get(a).name} (${a})`)) }
    if (wAddrs.length) { console.log(`[Listener] ${wAddrs.length} wallet(s)`); wAddrs.forEach(a => console.log(`  - ${this.walletWatchers.get(a).name} (${a})`)) }
    this.running = true
    if (this.pm) await this.setupPmSubs(cAddrs, wAddrs, hasTrack); else await this.setupLegacySubs(cAddrs, wAddrs, hasTrack)
    console.log('[Listener] Subscriptions active'); this.backoff.reset()
  }

  async setupPmSubs(cAddrs, wAddrs, hasTrack) {
    const provider = this.pm.getSubscriptionProvider(), alchP = this.pm.getProviderWithCapability('addressFilteredPending')
    if (alchP && alchP instanceof AlchemyProvider) await this.setupAlchemyEnhanced(alchP, cAddrs, wAddrs); else await this.setupGenericSubs(provider, cAddrs, wAddrs)
    if (hasTrack) { const h = await provider.subscribeToBlocks(async n => { try { await this.processBlock(n) } catch (e) { console.error('[Listener] Block error:', e) } }); this.subs.push(h); this.logTracking() }
  }

  async setupAlchemyEnhanced(p, cAddrs, wAddrs) {
    if (cAddrs.length) { const h1 = await p.subscribeToPendingTransactions({ toAddress: cAddrs }, tx => this.handlePendingPm(tx)); if (h1) this.subs.push(h1); const h2 = await p.subscribeToMinedTransactions({ to: cAddrs }, (tx, bn) => this.handleMinedPm(tx, bn)); this.subs.push(h2) }
    if (wAddrs.length) { const h1 = await p.subscribeToPendingTransactions({ fromAddress: wAddrs }, tx => this.handleWalletPendingPm(tx)); if (h1) this.subs.push(h1); const h2 = await p.subscribeToMinedTransactions({ from: wAddrs }, (tx, bn) => this.handleWalletMinedPm(tx, bn)); this.subs.push(h2) }
  }

  async setupGenericSubs(p, cAddrs, wAddrs) {
    if (cAddrs.length || wAddrs.length) {
      const h = await p.subscribeToPendingTransactions({ toAddress: cAddrs.length ? cAddrs : undefined, fromAddress: wAddrs.length ? wAddrs : undefined }, tx => { if (tx.to && cAddrs.includes(tx.to.toLowerCase())) this.handlePendingPm(tx); if (tx.from && wAddrs.includes(tx.from.toLowerCase())) this.handleWalletPendingPm(tx) })
      if (h) this.subs.push(h); console.log('[Listener] Client-side filtering')
    }
  }

  async setupLegacySubs(cAddrs, wAddrs, hasTrack) {
    if (cAddrs.length) { this.alchemy.ws.on({ method: AlchemySubscription.PENDING_TRANSACTIONS, toAddress: cAddrs }, tx => this.handlePending(tx)); this.alchemy.ws.on({ method: AlchemySubscription.MINED_TRANSACTIONS, addresses: cAddrs.map(a => ({ to: a })) }, tx => this.handleMined(tx)) }
    if (wAddrs.length) { this.alchemy.ws.on({ method: AlchemySubscription.PENDING_TRANSACTIONS, fromAddress: wAddrs }, tx => this.handleWalletPending(tx)); this.alchemy.ws.on({ method: AlchemySubscription.MINED_TRANSACTIONS, addresses: wAddrs.map(a => ({ from: a })) }, tx => this.handleWalletMined(tx)) }
    if (hasTrack) { this.alchemy.ws.on('block', async n => { try { await this.processBlock(n) } catch (e) { console.error('[Listener] Block error:', e) } }); this.logTracking() }
  }

  logTracking() { const f = [this.tracking.tokenTransfers?.enabled && 'Tokens', this.tracking.nftTransfers?.enabled && 'NFTs', this.tracking.dexSwaps?.enabled && 'DEX', this.tracking.largeTransfers?.enabled && 'Large', this.tracking.contractDeploys?.enabled && 'Deploys', this.tracking.gasAlerts?.enabled && 'Gas'].filter(Boolean); console.log(`[Listener] Tracking: ${f.join(', ')}`) }

  async processBlock(bn) {
    let block; if (this.pm) block = await this.pm.executeWithFailover(p => p.getBlockWithTransactions(bn)); else block = await this.alchemy.core.getBlockWithTransactions(bn)
    if (!block) return; this.persistence?.setLastBlockNumber(bn)
    for (const tx of block.transactions) {
      if (this.tracking.largeTransfers?.enabled) await this.checkLarge(tx, bn)
      if (this.tracking.contractDeploys?.enabled && !tx.to) await this.checkDeploy(tx, bn)
      if (this.tracking.dexSwaps?.enabled && tx.to) await this.checkDex(tx, bn)
    }
    if (this.tracking.tokenTransfers?.enabled || this.tracking.nftTransfers?.enabled) await this.processLogs(bn)
  }

  async processLogs(bn) {
    const topics = []; if (this.tracking.tokenTransfers?.enabled || this.tracking.nftTransfers?.enabled) topics.push(ERC20_TRANSFER_TOPIC)
    if (this.tracking.nftTransfers?.enabled) { topics.push(ERC1155_SINGLE_TRANSFER_TOPIC); topics.push(ERC1155_BATCH_TRANSFER_TOPIC) }
    if (!topics.length) return
    try {
      let logs; if (this.pm) logs = await this.pm.executeWithFailover(p => p.getLogs({ fromBlock: bn, toBlock: bn, topics: [topics] })); else logs = await this.alchemy.core.getLogs({ fromBlock: bn, toBlock: bn, topics: [topics] })
      for (const log of logs) {
        const t0 = log.topics?.[0]
        if (t0 === ERC20_TRANSFER_TOPIC) { if (log.topics.length === 3 && this.tracking.tokenTransfers?.enabled) await this.handleErc20Log(log, bn); else if (log.topics.length === 4 && this.tracking.nftTransfers?.enabled) await this.handleErc721Log(log, bn) }
        else if ((t0 === ERC1155_SINGLE_TRANSFER_TOPIC || t0 === ERC1155_BATCH_TRANSFER_TOPIC) && this.tracking.nftTransfers?.enabled) await this.handleNftLog(log, bn)
      }
    } catch (e) { console.error(`[Listener] Log error ${bn}:`, e) }
  }

  async handleErc20Log(log, bn) {
    try {
      const from = '0x' + log.topics[1].slice(26), to = '0x' + log.topics[2].slice(26)
      const toks = this.tracking.tokenTransfers?.tokens; if (toks?.length && !toks.some(t => t.toLowerCase() === log.address.toLowerCase())) return
      const amt = BigInt(log.data), info = await this.getToken(log.address), amtFmt = formatUnits(amt, info.decimals)
      const ev = { sourceType: 'token_transfer', tokenAddress: log.address, tokenSymbol: info.symbol, tokenName: info.name, tokenDecimals: info.decimals, amount: amt.toString(), amountFormatted: amtFmt, transactionHash: log.transactionHash, from, to, value: '0', blockNumber: bn }
      if (this.shouldNotify(log.transactionHash + log.address)) { console.log(`[Listener] Token: ${amtFmt} ${info.symbol}`); this.onTx(ev) }
    } catch (e) { console.error('[Listener] Token log error:', e) }
  }

  async handleErc721Log(log, bn) {
    try {
      const cols = this.tracking.nftTransfers?.collections; if (cols?.length && !cols.some(c => c.toLowerCase() === log.address.toLowerCase())) return
      const from = '0x' + log.topics[1].slice(26), to = '0x' + log.topics[2].slice(26), tokenId = BigInt(log.topics[3]).toString()
      const ev = { sourceType: 'nft_transfer', contractAddress: log.address, collectionName: await this.getCollection(log.address), tokenId, tokenType: 'ERC721', transactionHash: log.transactionHash, from, to, value: '0', blockNumber: bn }
      if (this.shouldNotify(log.transactionHash + log.address + tokenId)) { console.log(`[Listener] NFT: ${ev.collectionName} #${tokenId}`); this.onTx(ev) }
    } catch (e) { console.error('[Listener] ERC721 error:', e) }
  }

  async handleNftLog(log, bn) {
    try {
      const cols = this.tracking.nftTransfers?.collections; if (cols?.length && !cols.some(c => c.toLowerCase() === log.address.toLowerCase())) return
      const from = '0x' + log.topics[2].slice(26), to = '0x' + log.topics[3].slice(26)
      const ev = { sourceType: 'nft_transfer', contractAddress: log.address, collectionName: await this.getCollection(log.address), tokenId: 'batch', tokenType: 'ERC1155', transactionHash: log.transactionHash, from, to, value: '0', blockNumber: bn }
      if (this.shouldNotify(log.transactionHash + log.address)) { console.log(`[Listener] ERC1155: ${ev.collectionName}`); this.onTx(ev) }
    } catch (e) { console.error('[Listener] NFT error:', e) }
  }

  async checkLarge(tx, bn) {
    try {
      const val = BigInt(tx.value?.toString() || '0'), eth = parseFloat(formatEther(val)), min = this.tracking.largeTransfers?.minEth ?? 100
      if (eth >= min) { const ev = { sourceType: 'large_transfer', valueEth: formatEther(val), transactionHash: tx.hash, from: tx.from, to: tx.to || '', value: formatEther(val), blockNumber: bn }; if (this.shouldNotify(tx.hash)) { console.log(`[Listener] Large: ${ev.valueEth} ETH`); this.onTx(ev) } }
    } catch (e) { console.error('[Listener] Large error:', e) }
  }

  async checkDeploy(tx, bn) {
    try {
      const creators = this.tracking.contractDeploys?.watchCreators; if (creators?.length && !creators.some(c => c.toLowerCase() === tx.from.toLowerCase())) return
      let receipt; if (this.pm) receipt = await this.pm.executeWithFailover(p => p.getTransactionReceipt(tx.hash)); else receipt = await this.alchemy.core.getTransactionReceipt(tx.hash)
      if (!receipt?.contractAddress) return
      const ev = { sourceType: 'contract_deploy', deployer: tx.from, contractAddress: receipt.contractAddress, bytecodeSize: tx.data ? (tx.data.length - 2) / 2 : 0, transactionHash: tx.hash, from: tx.from, to: receipt.contractAddress, value: formatEther(BigInt(tx.value?.toString() || '0')), blockNumber: bn }
      if (this.shouldNotify(tx.hash)) { console.log(`[Listener] Deploy: ${receipt.contractAddress}`); this.onTx(ev) }
    } catch (e) { console.error('[Listener] Deploy error:', e) }
  }

  async checkDex(tx, bn) {
    try {
      const to = tx.to?.toLowerCase(); if (!to) return
      const dex = KNOWN_DEX_ROUTERS[to]; if (!dex) return
      const dexes = this.tracking.dexSwaps?.dexes; if (dexes?.length && !dexes.some(d => dex.toLowerCase().includes(d.toLowerCase()))) return
      const val = formatEther(BigInt(tx.value?.toString() || '0'))
      const ev = { sourceType: 'dex_swap', dexName: dex, dexAddress: to, tokenIn: { address: '', symbol: 'ETH', amount: val }, tokenOut: { address: '', symbol: 'Unknown', amount: '?' }, transactionHash: tx.hash, from: tx.from, to, value: val, blockNumber: bn }
      if (this.shouldNotify(tx.hash + 'swap')) { console.log(`[Listener] DEX: ${dex}`); this.onTx(ev) }
    } catch (e) { console.error('[Listener] DEX error:', e) }
  }

  startGasMonitor() {
    if (!this.tracking.gasAlerts?.enabled) return
    const interval = this.tracking.gasAlerts.checkIntervalSeconds || 60, threshold = this.tracking.gasAlerts.alertThresholdGwei
    console.log(`[Listener] Gas monitor: ${threshold} gwei`)
    this.gasInterval = setInterval(async () => {
      try {
        let gas; if (this.pm) gas = await this.pm.executeWithFailover(p => p.getGasPrice()); else { const p = await this.alchemy.core.getGasPrice(); gas = BigInt(p.toString()) }
        const gwei = parseFloat(formatUnits(gas.toString(), 'gwei'))
        if (gwei >= threshold) { const now = Date.now(); if (now - this.lastGasAlert > 300000) { this.lastGasAlert = now; const ev = { sourceType: 'gas_alert', currentGwei: Math.round(gwei * 100) / 100, thresholdGwei: threshold, timestamp: now, transactionHash: '', from: '', to: '', value: '0' }; console.log(`[Listener] Gas: ${ev.currentGwei} gwei`); this.onTx(ev) } }
      } catch (e) { console.error('[Listener] Gas error:', e) }
    }, interval * 1000)
  }

  async getToken(addr) { try { if (this.pm) { const p = this.pm.getProviderWithCapability('tokenMetadata'); if (p) { const m = await p.getTokenMetadata(addr); return { symbol: m.symbol || 'UNKNOWN', name: m.name || 'Unknown', decimals: m.decimals || 18 } } }; const m = await this.alchemy.core.getTokenMetadata(addr); return { symbol: m.symbol || 'UNKNOWN', name: m.name || 'Unknown', decimals: m.decimals || 18 } } catch { return { symbol: 'UNKNOWN', name: 'Unknown', decimals: 18 } } }
  async getCollection(addr) { try { if (this.pm) { const p = this.pm.getProviderWithCapability('nftMetadata'); if (p) { const m = await p.getNftContractMetadata(addr); return m.name || addr.slice(0, 10) + '...' } }; const m = await this.alchemy.nft.getContractMetadata(addr); return m.name || addr.slice(0, 10) + '...' } catch { return addr.slice(0, 10) + '...' } }

  setupMonitor() { if (this.pm) return; this.alchemy.ws.on('error', e => { console.error('[Listener] WS error:', e); this.handleDisconnect() }) }

  async handleDisconnect() {
    if (this.reconnecting) return; this.reconnecting = true; console.log('[Listener] Reconnecting...')
    let switches = 0; const maxSwitches = this.apiKeys.length * 2
    while (this.running) {
      if (this.apiKeys.length > 1 && switches < maxSwitches) { this.keyIdx = (this.keyIdx + 1) % this.apiKeys.length; this.alchemy.ws.removeAllListeners(); this.alchemy = new Alchemy({ apiKey: this.apiKeys[this.keyIdx], network: this.network }); switches++; try { await this.setupSubs(); console.log(`[Listener] Reconnected via ${this.keyIdx + 1}`); this.backoff.reset(); this.reconnecting = false; return } catch { continue } }
      const delay = this.backoff.getNextDelay(); console.log(`[Listener] Retry in ${delay}ms`); await sleep(delay); switches = 0
      try { this.alchemy.ws.removeAllListeners(); await this.setupSubs(); console.log('[Listener] Reconnected'); this.reconnecting = false; return } catch (e) { console.error('[Listener] Reconnect failed:', e) }
    }
    this.reconnecting = false
  }

  handlePendingPm(tx) { const to = tx.to?.toLowerCase(); if (!to) return; const w = this.watchers.get(to); if (!w) return; const d = decodeTransaction({ hash: tx.hash, from: tx.from, to: tx.to || '', value: tx.value, data: tx.data || '0x' }, w); if (d && this.shouldNotify(d.transactionHash + ':pending')) { console.log(`[Listener] Pending: ${d.functionName}() on ${d.contractName}`); this.onTx(d) } }
  handleMinedPm(tx, bn) { const to = tx.to?.toLowerCase(); if (!to) return; const w = this.watchers.get(to); if (!w) return; const d = decodeTransaction({ hash: tx.hash, from: tx.from, to: tx.to || '', value: tx.value, data: tx.data || '0x', blockNumber: bn }, w); if (d && this.shouldNotify(d.transactionHash + ':mined')) { console.log(`[Listener] Mined: ${d.functionName}() on ${d.contractName} (${bn})`); this.persistence?.setLastBlockNumber(bn); this.onTx(d) } }
  handleWalletPendingPm(tx) { const from = tx.from?.toLowerCase(); if (!from) return; const w = this.walletWatchers.get(from); if (!w) return; const d = this.makeWalletTxPm(tx, w); if (this.shouldNotify(d.transactionHash + ':pending')) { console.log(`[Listener] Wallet pending: ${w.name}`); this.onTx(d) } }
  handleWalletMinedPm(tx, bn) { const from = tx.from?.toLowerCase(); if (!from) return; const w = this.walletWatchers.get(from); if (!w) return; const d = this.makeWalletTxPm(tx, w, bn); if (this.shouldNotify(d.transactionHash + ':mined')) { console.log(`[Listener] Wallet mined: ${w.name} (${bn})`); this.persistence?.setLastBlockNumber(bn); this.onTx(d) } }
  makeWalletTxPm(tx, w, bn) { const data = tx.data || '0x', sig = data.length >= 10 ? data.slice(0, 10) : data, val = formatEther(tx.value); return { sourceType: 'wallet', walletName: w.name, contractName: w.name, contractAddress: w.address, functionName: sig === '0x' ? 'transfer' : sig, functionArgs: { to: tx.to || '(create)', data: data.length > 20 ? data.slice(0, 20) + '...' : data }, transactionHash: tx.hash, from: tx.from, to: tx.to || '', value: val, blockNumber: bn } }

  handlePending(tx) { const to = tx.to?.toLowerCase(); if (!to) return; const w = this.watchers.get(to); if (!w) return; const d = decodeTransaction({ hash: tx.hash, from: tx.from, to: tx.to, value: this.parseBigInt(tx.value), data: tx.input || tx.data || '0x' }, w); if (d && this.shouldNotify(d.transactionHash + ':pending')) { console.log(`[Listener] Pending: ${d.functionName}() on ${d.contractName}`); this.onTx(d) } }
  handleMined(tx) { const t = tx.transaction; if (!t) return; const to = t.to?.toLowerCase(); if (!to) return; const w = this.watchers.get(to); if (!w) return; const d = decodeTransaction({ hash: t.hash, from: t.from, to: t.to, value: this.parseBigInt(t.value), data: t.input || t.data || '0x', blockNumber: tx.blockNumber }, w); if (d && this.shouldNotify(d.transactionHash + ':mined')) { console.log(`[Listener] Mined: ${d.functionName}() on ${d.contractName} (${tx.blockNumber})`); this.persistence?.setLastBlockNumber(tx.blockNumber); this.onTx(d) } }
  handleWalletPending(tx) { const from = tx.from?.toLowerCase(); if (!from) return; const w = this.walletWatchers.get(from); if (!w) return; const d = this.makeWalletTx(tx, w); if (this.shouldNotify(d.transactionHash + ':pending')) { console.log(`[Listener] Wallet pending: ${w.name}`); this.onTx(d) } }
  handleWalletMined(tx) { const t = tx.transaction; if (!t) return; const from = t.from?.toLowerCase(); if (!from) return; const w = this.walletWatchers.get(from); if (!w) return; const d = this.makeWalletTx(t, w, tx.blockNumber); if (this.shouldNotify(d.transactionHash + ':mined')) { console.log(`[Listener] Wallet mined: ${w.name} (${tx.blockNumber})`); this.persistence?.setLastBlockNumber(tx.blockNumber); this.onTx(d) } }
  makeWalletTx(tx, w, bn) { const data = tx.input || tx.data || '0x', sig = data.length >= 10 ? data.slice(0, 10) : data, val = formatEther(this.parseBigInt(tx.value)); return { sourceType: 'wallet', walletName: w.name, contractName: w.name, contractAddress: w.address, functionName: sig === '0x' ? 'transfer' : sig, functionArgs: { to: tx.to || '(create)', data: data.length > 20 ? data.slice(0, 20) + '...' : data }, transactionHash: tx.hash, from: tx.from, to: tx.to || '', value: val, blockNumber: bn } }
  parseBigInt(v) { try { if (v == null) return 0n; if (typeof v === 'bigint') return v; if (typeof v === 'string') return BigInt(v); if (typeof v === 'number') return BigInt(Math.floor(v)); return 0n } catch { return 0n } }

  async stop() {
    if (this.gasInterval) { clearInterval(this.gasInterval); this.gasInterval = null }
    if (!this.running) return; console.log('[Listener] Stopping...'); this.running = false
    for (const h of this.subs) try { await h.unsubscribe() } catch {}; this.subs = []
    if (this.pm) await this.pm.shutdown(); else if (this.alchemy) this.alchemy.ws.removeAllListeners()
    if (this.persistence) { this.persistence.setSeenTransactions(this.seen); this.persistence.forceSave() }
    console.log('[Listener] Stopped')
  }

  shouldNotify(hash) {
    if (this.dedupeMs === 0) return true
    const now = Date.now(), last = this.seen.get(hash); if (last && now - last < this.dedupeMs) return false
    this.seen.set(hash, now); if (this.seen.size > PRUNE_AT) this.prune(now); if (this.seen.size > MAX_SEEN) this.forceReduce()
    return true
  }
  prune(now) { const thresh = this.dedupeMs * 2; for (const [h, t] of this.seen) if (now - t > thresh) this.seen.delete(h) }
  forceReduce() { const entries = Array.from(this.seen.entries()).sort((a, b) => b[1] - a[1]); this.seen = new Map(entries.slice(0, Math.floor(MAX_SEEN / 2))) }
}

module.exports = { EthereumListener }
