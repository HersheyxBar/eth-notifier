const { DiscordNotifier } = require('./discord')
const { TelegramNotifier } = require('./telegram')
const { ENV, getExplorerBase } = require('../config')
const { NotificationRateLimiter } = require('../utils/rate-limiter')

class NotificationDispatcher {
  constructor(config, persistence) {
    this.channels = []; this.rateLimiter = new NotificationRateLimiter(); this.persistence = persistence; this.retryQueue = new Map(); this.retryInterval = null
    if (config.discord?.enabled) { const url = config.discord.webhookUrl || ENV.DISCORD_WEBHOOK_URL; if (url) { this.channels.push({ name: 'discord', channel: new DiscordNotifier(url) }); console.log('[Dispatcher] Discord enabled') } }
    if (config.telegram?.enabled) { const token = ENV.TELEGRAM_BOT_TOKEN, chatId = config.telegram.chatId; if (token && chatId) { this.channels.push({ name: 'telegram', channel: new TelegramNotifier(token, chatId) }); console.log('[Dispatcher] Telegram enabled') } }
    if (!this.channels.length) console.warn('[Dispatcher] No channels configured!')
    if (persistence) { for (const n of persistence.getPendingNotifications()) this.retryQueue.set(n.id, n); if (this.retryQueue.size) console.log(`[Dispatcher] ${this.retryQueue.size} pending retries`) }
    this.retryInterval = setInterval(() => this.processRetries(), 30000)
  }

  async processRetries() {
    for (const [id, n] of this.retryQueue) {
      if (n.attempts >= 5) { console.warn(`[Dispatcher] Giving up: ${id}`); this.retryQueue.delete(id); this.persistence?.removePendingNotification(id); continue }
      try { await this.sendToAll(n.payload); this.retryQueue.delete(id); this.persistence?.removePendingNotification(id); console.log(`[Dispatcher] Retry success: ${id}`) }
      catch { n.attempts++; this.persistence?.updatePendingNotification(id, { attempts: n.attempts }) }
    }
  }

  async dispatch(decoded) {
    const msg = this.createMessage(decoded), id = `${msg.txHash}-${Date.now()}`
    try { await this.sendToAll(msg) }
    catch (e) { console.error('[Dispatcher] Failed, queueing:', e.message); const pending = { id, payload: msg, attempts: 1, createdAt: Date.now() }; this.retryQueue.set(id, pending); this.persistence?.addPendingNotification(pending) }
  }

  async sendToAll(msg) {
    const results = await Promise.allSettled(this.channels.map(async ({ name, channel }) => { await this.rateLimiter.acquire(name); return channel.send(msg) }))
    let allFailed = true; for (const r of results) { if (r.status === 'fulfilled') allFailed = false; else console.error('[Dispatcher] Channel failed:', r.reason?.message) }
    if (allFailed && this.channels.length) throw new Error('All channels failed')
  }

  createMessage(d) {
    const base = getExplorerBase(ENV.NETWORK), msg = { explorerBase: base, explorerTxUrl: d.transactionHash ? `${base}/tx/${d.transactionHash}` : base, txHash: d.transactionHash, from: d.from, to: d.to, value: d.value, sourceType: d.sourceType }
    switch (d.sourceType) {
      case 'contract': return { ...msg, title: `${d.functionName}() on ${d.contractName}`, contractName: d.contractName, contractAddress: d.contractAddress, functionName: d.functionName, args: d.functionArgs }
      case 'wallet': return { ...msg, title: `${d.walletName} tx`, contractName: d.walletName, contractAddress: d.from, functionName: d.functionName, args: d.functionArgs, targetAddress: d.to, walletName: d.walletName }
      case 'token_transfer': return { ...msg, title: `${d.amountFormatted} ${d.tokenSymbol}`, tokenSymbol: d.tokenSymbol, tokenAmount: d.amountFormatted, contractAddress: d.tokenAddress }
      case 'nft_transfer': return { ...msg, title: `${d.collectionName} #${d.tokenId}`, collectionName: d.collectionName, tokenId: d.tokenId, contractAddress: d.contractAddress }
      case 'dex_swap': return { ...msg, title: `Swap on ${d.dexName}`, dexName: d.dexName, tokenIn: d.tokenIn, tokenOut: d.tokenOut, contractAddress: d.dexAddress }
      case 'large_transfer': return { ...msg, title: `${d.valueEth} ETH`, valueEth: d.valueEth }
      case 'contract_deploy': return { ...msg, title: 'Contract Deployed', deployedAddress: d.contractAddress, contractAddress: d.contractAddress }
      case 'gas_alert': return { ...msg, title: `Gas: ${d.currentGwei} gwei`, gasGwei: d.currentGwei, gasThreshold: d.thresholdGwei }
      default: return { ...msg, title: 'Event' }
    }
  }
  getChannelCount() { return this.channels.length }
  async stop() { if (this.retryInterval) clearInterval(this.retryInterval) }
}

module.exports = { NotificationDispatcher, DiscordNotifier, TelegramNotifier }
