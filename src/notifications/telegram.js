const TelegramBot = require('node-telegram-bot-api')

class TelegramNotifier {
  constructor(token, chatId) { if (!token) throw new Error('Telegram token required'); if (!chatId) throw new Error('Telegram chatId required'); this.bot = new TelegramBot(token); this.chatId = chatId }

  async send(msg) {
    try { await this.bot.sendMessage(this.chatId, this.format(msg), { parse_mode: 'HTML', disable_web_page_preview: true }); console.log(`[Telegram] Sent: ${msg.txHash || 'N/A'}`) }
    catch (e) { console.error(`[Telegram] Failed:`, e.message); throw e }
  }

  format(m) {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const trunc = a => a?.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || 'N/A'
    const link = (base, a, label) => `<a href="${base}/address/${a}">${esc(label || trunc(a))}</a>`
    const txLink = url => `<a href="${url}">View on Explorer</a>`

    switch (m.sourceType) {
      case 'contract': return `<b>[Alert] ${esc(m.title)}</b>\n\n<b>Contract:</b> ${link(m.explorerBase, m.contractAddress, m.contractName)}\n<b>Function:</b> <code>${esc(m.functionName || '')}</code>\n<b>From:</b> ${link(m.explorerBase, m.from)}\n<b>Value:</b> ${m.value} ETH\n\n${txLink(m.explorerTxUrl)}`
      case 'wallet': return `<b>[Wallet] ${esc(m.title)}</b>\n\n<b>Wallet:</b> ${link(m.explorerBase, m.from, m.contractName)}\n<b>Target:</b> ${m.targetAddress ? link(m.explorerBase, m.targetAddress) : '<i>(create)</i>'}\n<b>Value:</b> ${m.value} ETH\n\n${txLink(m.explorerTxUrl)}`
      case 'token_transfer': return `<b>[Token] ${esc(m.title)}</b>\n\n<b>Token:</b> ${esc(m.tokenSymbol || '')}\n<b>Amount:</b> ${m.tokenAmount}\n<b>From:</b> ${link(m.explorerBase, m.from)}\n<b>To:</b> ${m.to ? link(m.explorerBase, m.to) : 'N/A'}\n\n${txLink(m.explorerTxUrl)}`
      case 'nft_transfer': return `<b>[NFT] ${esc(m.title)}</b>\n\n<b>Collection:</b> ${link(m.explorerBase, m.contractAddress, m.collectionName)}\n<b>Token:</b> #${m.tokenId}\n<b>From:</b> ${link(m.explorerBase, m.from)}\n<b>To:</b> ${m.to ? link(m.explorerBase, m.to) : 'N/A'}\n\n${txLink(m.explorerTxUrl)}`
      case 'dex_swap': return `<b>[DEX] ${esc(m.title)}</b>\n\n<b>DEX:</b> ${esc(m.dexName || 'Unknown')}\n<b>Trader:</b> ${link(m.explorerBase, m.from)}\n<b>Swap:</b> ${m.tokenIn && m.tokenOut ? `${m.tokenIn.amount} ${m.tokenIn.symbol} -> ${m.tokenOut.amount} ${m.tokenOut.symbol}` : 'Unknown'}\n\n${txLink(m.explorerTxUrl)}`
      case 'large_transfer': return `<b>[Large] ${esc(m.title)}</b>\n\n<b>Amount:</b> ${m.valueEth} ETH\n<b>From:</b> ${link(m.explorerBase, m.from)}\n<b>To:</b> ${m.to ? link(m.explorerBase, m.to) : 'N/A'}\n\n${txLink(m.explorerTxUrl)}`
      case 'contract_deploy': return `<b>[Deploy] ${esc(m.title)}</b>\n\n<b>Deployer:</b> ${link(m.explorerBase, m.from)}\n<b>Contract:</b> ${m.deployedAddress ? link(m.explorerBase, m.deployedAddress) : 'Pending'}\n\n${txLink(m.explorerTxUrl)}`
      case 'gas_alert': return `<b>[Gas] ${esc(m.title)}</b>\n\n<b>Current:</b> ${m.gasGwei} gwei\n<b>Threshold:</b> ${m.gasThreshold} gwei`
      default: return `<b>${esc(m.title)}</b>`
    }
  }
}

module.exports = { TelegramNotifier }
