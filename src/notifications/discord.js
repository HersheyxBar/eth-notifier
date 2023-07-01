const axios = require('axios')

class DiscordNotifier {
  constructor(webhookUrl) { if (!webhookUrl) throw new Error('Discord webhook URL required'); this.webhookUrl = webhookUrl }

  async send(msg) {
    try { await axios.post(this.webhookUrl, { embeds: [this.createEmbed(msg)] }); console.log(`[Discord] Sent: ${msg.txHash || 'N/A'}`) }
    catch (e) { console.error(`[Discord] Failed:`, e.message); throw e }
  }

  createEmbed(m) {
    const base = { timestamp: new Date().toISOString(), footer: { text: 'ETH Notifier' } }
    const trunc = a => a?.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || 'N/A'
    const addr = (base, a) => `${base}/address/${a}`
    const link = (base, a, label) => `[${label || trunc(a)}](${addr(base, a)})`

    switch (m.sourceType) {
      case 'contract': return { ...base, title: `[Alert] ${m.title}`, color: 0x627eea, fields: [{ name: 'Contract', value: link(m.explorerBase, m.contractAddress, m.contractName), inline: true }, { name: 'Function', value: `\`${m.functionName}\``, inline: true }, { name: 'From', value: link(m.explorerBase, m.from), inline: true }, { name: 'Value', value: `${m.value} ETH`, inline: true }, { name: 'Args', value: this.fmtArgs(m.args || {}), inline: false }, { name: 'Tx', value: `[View](${m.explorerTxUrl})`, inline: false }] }
      case 'wallet': return { ...base, title: `[Wallet] ${m.title}`, color: 0xf5a623, fields: [{ name: 'Wallet', value: link(m.explorerBase, m.from, m.contractName), inline: true }, { name: 'Target', value: m.targetAddress ? link(m.explorerBase, m.targetAddress) : '_(create)_', inline: true }, { name: 'Value', value: `${m.value} ETH`, inline: true }, { name: 'Tx', value: `[View](${m.explorerTxUrl})`, inline: false }] }
      case 'token_transfer': return { ...base, title: `[Token] ${m.title}`, color: 0x00d395, fields: [{ name: 'Token', value: m.tokenSymbol, inline: true }, { name: 'Amount', value: m.tokenAmount, inline: true }, { name: 'From', value: link(m.explorerBase, m.from), inline: true }, { name: 'To', value: m.to ? link(m.explorerBase, m.to) : 'N/A', inline: true }, { name: 'Tx', value: `[View](${m.explorerTxUrl})`, inline: false }] }
      case 'nft_transfer': return { ...base, title: `[NFT] ${m.title}`, color: 0xff6b6b, fields: [{ name: 'Collection', value: link(m.explorerBase, m.contractAddress, m.collectionName), inline: true }, { name: 'Token', value: `#${m.tokenId}`, inline: true }, { name: 'From', value: link(m.explorerBase, m.from), inline: true }, { name: 'To', value: m.to ? link(m.explorerBase, m.to) : 'N/A', inline: true }, { name: 'Tx', value: `[View](${m.explorerTxUrl})`, inline: false }] }
      case 'dex_swap': return { ...base, title: `[DEX] ${m.title}`, color: 0xff007a, fields: [{ name: 'DEX', value: m.dexName || 'Unknown', inline: true }, { name: 'Trader', value: link(m.explorerBase, m.from), inline: true }, { name: 'Swap', value: m.tokenIn && m.tokenOut ? `${m.tokenIn.amount} ${m.tokenIn.symbol} -> ${m.tokenOut.amount} ${m.tokenOut.symbol}` : 'Unknown', inline: false }, { name: 'Tx', value: `[View](${m.explorerTxUrl})`, inline: false }] }
      case 'large_transfer': return { ...base, title: `[Large] ${m.title}`, color: 0xffd700, fields: [{ name: 'Amount', value: `${m.valueEth} ETH`, inline: true }, { name: 'From', value: link(m.explorerBase, m.from), inline: true }, { name: 'To', value: m.to ? link(m.explorerBase, m.to) : 'N/A', inline: true }, { name: 'Tx', value: `[View](${m.explorerTxUrl})`, inline: false }] }
      case 'contract_deploy': return { ...base, title: `[Deploy] ${m.title}`, color: 0x9b59b6, fields: [{ name: 'Deployer', value: link(m.explorerBase, m.from), inline: true }, { name: 'Contract', value: m.deployedAddress ? link(m.explorerBase, m.deployedAddress) : 'Pending', inline: true }, { name: 'Tx', value: `[View](${m.explorerTxUrl})`, inline: false }] }
      case 'gas_alert': return { ...base, title: `[Gas] ${m.title}`, color: 0xe74c3c, fields: [{ name: 'Current', value: `${m.gasGwei} gwei`, inline: true }, { name: 'Threshold', value: `${m.gasThreshold} gwei`, inline: true }] }
      default: return { ...base, title: m.title, color: 0x627eea }
    }
  }
  fmtArgs(args) { const e = Object.entries(args); if (!e.length) return '_None_'; return e.map(([k, v]) => { const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return `**${k}**: \`${s.length > 100 ? s.slice(0, 97) + '...' : s}\`` }).join('\n') }
}

module.exports = { DiscordNotifier }
