const { loadConfig, createContractWatchers, createWalletWatchers, createProviderManager } = require('./config')
const { EthereumListener } = require('./listener/ethereum')
const { NotificationDispatcher } = require('./notifications')
const { StatePersistence } = require('./utils/persistence')

const HEARTBEAT_INTERVAL = 60 * 60 * 1000 // 1 hour

async function main() {
  console.log('========================================\n       ETH Notifier Starting...\n========================================\n')
  try {
    const config = loadConfig()
    const persistence = new StatePersistence()
    const lastBlock = persistence.getLastBlockNumber(); if (lastBlock > 0) console.log(`[Main] Resuming from block ${lastBlock}`)
    const watchers = createContractWatchers(config), walletWatchers = createWalletWatchers(config)
    console.log(`[Main] ${watchers.size} contract(s), ${walletWatchers.size} wallet(s)`)
    const dispatcher = new NotificationDispatcher(config.notifications, persistence)
    console.log(`[Main] Dispatcher: ${dispatcher.getChannelCount()} channel(s)`)
    const providerManager = createProviderManager(config)
    const listener = new EthereumListener({ watchers, walletWatchers, trackingConfig: config.tracking, onTransaction: async d => { try { await dispatcher.dispatch(d) } catch (e) { console.error('[Main] Dispatch failed:', e) } }, persistence, providerManager })
    await listener.start()

    // Heartbeat: log that the service is alive every hour
    const startTime = Date.now()
    const heartbeat = setInterval(() => {
      const uptimeHrs = ((Date.now() - startTime) / 3600000).toFixed(1)
      const block = persistence.getLastBlockNumber()
      const mem = process.memoryUsage()
      const memMB = (mem.rss / 1048576).toFixed(1)
      console.log(`[Heartbeat] Alive | Uptime: ${uptimeHrs}h | Block: ${block || 'N/A'} | Memory: ${memMB}MB`)
    }, HEARTBEAT_INTERVAL)

    const shutdown = async sig => {
      console.log(`\n[Main] ${sig}, shutting down...`)
      clearInterval(heartbeat)
      await listener.stop()
      await dispatcher.stop()
      persistence.forceSave()
      console.log('[Main] Done')
      process.exit(0)
    }
    process.on('SIGINT', () => shutdown('SIGINT')); process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('uncaughtException', e => { console.error('[Main] Uncaught:', e); persistence.forceSave() })
    process.on('unhandledRejection', r => console.error('[Main] Unhandled:', r))
    console.log('\n[Main] Running. Ctrl+C to stop.\n')
  } catch (e) { console.error('[Main] Fatal:', e); process.exit(1) }
}

main()
