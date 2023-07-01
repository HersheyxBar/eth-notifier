const { loadConfig, ENV } = require('./config')
const { DiscordNotifier } = require('./notifications/discord')
const { TelegramNotifier } = require('./notifications/telegram')

async function main() {
  console.log('========================================')
  console.log('    ETH Notifier - Test Notification')
  console.log('========================================\n')

  try {
    const config = loadConfig()
    const testMsg = {
      sourceType: 'contract',
      title: 'Test Notification',
      explorerBase: 'https://etherscan.io',
      explorerTxUrl: 'https://etherscan.io',
      txHash: '0x' + '0'.repeat(64),
      from: '0x' + '0'.repeat(40),
      to: '0x' + '0'.repeat(40),
      value: '0',
      contractName: 'ETH Notifier',
      contractAddress: '0x' + '0'.repeat(40),
      functionName: 'test',
      args: { message: 'If you see this, notifications are working!' }
    }

    let sent = 0, failed = 0

    if (config.notifications.telegram?.enabled) {
      const token = ENV.TELEGRAM_BOT_TOKEN
      const chatId = config.notifications.telegram.chatId
      if (token && chatId) {
        try {
          const tg = new TelegramNotifier(token, chatId)
          await tg.send(testMsg)
          console.log('[OK] Telegram notification sent!')
          sent++
        } catch (e) {
          console.error('[FAIL] Telegram:', e.message)
          if (e.message.includes('403')) {
            console.error('  -> Make sure you started your bot in Telegram.')
            console.error('  -> Open your bot and press "Start".')
          }
          if (e.message.includes('chat not found')) {
            console.error('  -> Check your chat ID in config.yaml.')
            console.error('  -> Get it from @userinfobot on Telegram.')
          }
          failed++
        }
      } else {
        console.warn('[SKIP] Telegram: missing token or chatId')
        if (!token) console.warn('  -> Set TELEGRAM_BOT_TOKEN in .env')
        if (!chatId) console.warn('  -> Set chatId in config.yaml notifications.telegram')
      }
    }

    if (config.notifications.discord?.enabled) {
      const url = config.notifications.discord.webhookUrl || ENV.DISCORD_WEBHOOK_URL
      if (url) {
        try {
          const dc = new DiscordNotifier(url)
          await dc.send(testMsg)
          console.log('[OK] Discord notification sent!')
          sent++
        } catch (e) {
          console.error('[FAIL] Discord:', e.message)
          if (e.message.includes('404') || e.message.includes('Unknown Webhook')) {
            console.error('  -> Your webhook URL may be invalid or deleted.')
            console.error('  -> Create a new one in Discord: Server Settings > Integrations > Webhooks')
          }
          failed++
        }
      } else {
        console.warn('[SKIP] Discord: missing webhook URL')
        console.warn('  -> Set DISCORD_WEBHOOK_URL in .env')
      }
    }

    console.log('\n========================================')
    if (sent > 0 && failed === 0) {
      console.log(`SUCCESS: ${sent} notification(s) sent!`)
      console.log('Check your Telegram/Discord for the test message.')
    } else if (sent > 0 && failed > 0) {
      console.log(`PARTIAL: ${sent} sent, ${failed} failed.`)
      console.log('Fix the errors above and try again.')
    } else if (failed > 0) {
      console.log(`FAILED: ${failed} notification(s) failed.`)
      console.log('Fix the errors above and try again.')
    } else {
      console.log('NO CHANNELS: Enable Telegram or Discord in config.yaml.')
    }
    console.log('========================================')
  } catch (e) {
    console.error('[FATAL]', e.message)
    process.exit(1)
  }
}

main()
