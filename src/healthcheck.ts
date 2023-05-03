import { loadConfig, createContractWatchers, createWalletWatchers, createProviderManager, ENV, getExplorerBase } from './config'
import { StatePersistence } from './utils/persistence'

const classifyWatch = (v: string): string => { const t = v.trim(); return /^0x[0-9a-fA-F]{8}$/.test(t) ? 'selector' : t.includes('(') && t.includes(')') ? 'signature' : /^[a-zA-Z0-9_]+$/.test(t) ? 'name' : 'unknown' }
const isAddr = (a: string): boolean => /^0x[a-fA-F0-9]{40}$/.test(a)

async function main(): Promise<void> {
  console.log('========================================\n         ETH Notifier Healthcheck\n========================================\n')
  let errors = 0, warnings = 0
  try {
    const config = loadConfig()
    console.log('[OK] Config loaded\n\n--- Environment ---')
    console.log(`Network: ${ENV.NETWORK}\nExplorer: ${getExplorerBase(ENV.NETWORK)}\nDedupe: ${ENV.NOTIFY_DEDUPE_SECONDS}s`)
    try { const keys = ENV.ALCHEMY_API_KEYS; console.log(`[OK] Alchemy: ${keys.length} key(s)`) } catch { console.error('[ERROR] ALCHEMY_API_KEY not set'); errors++ }

    console.log('\n--- Contracts ---')
    const cw = createContractWatchers(config)
    console.log(`Total: ${cw.size}`)
    for (const c of config.contracts) {
      if (!isAddr(c.address)) { console.error(`[ERROR] Invalid address: ${c.name}`); errors++ }
      const unk = c.watchFunctions.filter(f => classifyWatch(f) === 'unknown').length
      if (unk > 0) { console.warn(`[WARN] ${c.name}: ${unk} unknown format(s)`); warnings++ }
      console.log(`  - ${c.name}: ${c.watchFunctions.length} fn(s)`)
    }

    console.log('\n--- Wallets ---')
    const ww = createWalletWatchers(config)
    console.log(`Total: ${ww.size}`)
    for (const w of config.wallets || []) { if (!isAddr(w.address)) { console.error(`[ERROR] Invalid wallet: ${w.name}`); errors++ } else console.log(`  - ${w.name}: ${w.address.slice(0, 10)}...`) }

    console.log('\n--- Providers ---')
    try {
      const pm = createProviderManager(config)
      await pm.initialize()
      const hs = pm.getHealthStatus()
      console.log(`Total: ${hs.length}`)
      for (const s of hs) { const icon = s.healthy ? '[OK]' : '[WARN]', lat = s.latencyMs ? `${s.latencyMs}ms` : 'N/A', blk = s.blockNumber ? `block ${s.blockNumber}` : ''; console.log(`  ${icon} ${s.type}: ${lat} ${blk}`); if (!s.healthy) { console.log(`      Error: ${s.lastError || 'Unknown'}`); warnings++ } }
      const info = pm.getCurrentProviderInfo()
      console.log(`  Active: ${info.type} (${info.index + 1}/${info.total})`)
      await pm.shutdown()
    } catch (e) { console.error('[ERROR] Provider init failed:', e); errors++ }

    console.log('\n--- Tracking ---')
    const t = config.tracking
    if (t) {
      if (t.tokenTransfers?.enabled) console.log(`  Tokens: ${t.tokenTransfers.tokens?.length || 'all'}`)
      if (t.nftTransfers?.enabled) console.log(`  NFTs: ${t.nftTransfers.collections?.length || 'all'}`)
      if (t.dexSwaps?.enabled) console.log(`  DEX: ${t.dexSwaps.dexes?.join(', ') || 'all'}`)
      if (t.largeTransfers?.enabled) console.log(`  Large: min ${t.largeTransfers.minEth} ETH`)
      if (t.contractDeploys?.enabled) console.log(`  Deploys: ${t.contractDeploys.watchCreators?.length || 'all'}`)
      if (t.gasAlerts?.enabled) console.log(`  Gas: ${t.gasAlerts.alertThresholdGwei} gwei`)
    } else console.log('  None configured')

    console.log('\n--- Notifications ---')
    if (config.notifications.discord?.enabled) { if (!config.notifications.discord.webhookUrl && !ENV.DISCORD_WEBHOOK_URL) { console.error('[ERROR] Discord: no webhook'); errors++ } else console.log('[OK] Discord') }
    if (config.notifications.telegram?.enabled) { if (!ENV.TELEGRAM_BOT_TOKEN) { console.error('[ERROR] Telegram: no token'); errors++ } if (!config.notifications.telegram.chatId) { console.error('[ERROR] Telegram: no chatId'); errors++ } if (ENV.TELEGRAM_BOT_TOKEN && config.notifications.telegram.chatId) console.log('[OK] Telegram') }

    console.log('\n--- Persistence ---')
    try { const p = new StatePersistence(), s = p.getState(); console.log(`[OK] Last block: ${s.lastBlockNumber || 'none'}, pending: ${s.pendingNotifications.length}, seen: ${s.seenTransactions.length}`); p.cleanup() } catch { console.warn('[WARN] Persistence inaccessible'); warnings++ }

    console.log('\n========================================')
    if (errors > 0) { console.log(`FAILED: ${errors} error(s), ${warnings} warning(s)`); process.exit(1) }
    else if (warnings > 0) console.log(`PASSED with ${warnings} warning(s)`)
    else console.log('PASSED: All checks OK')
  } catch (e) { console.error('[FATAL]', e); process.exit(1) }
}

main()
