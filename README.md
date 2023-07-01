# ETH Notifier

**Get notified when ETH moves in your watched wallets.**

ETH Notifier watches Ethereum wallet addresses and sends you notifications on Telegram or Discord whenever those wallets make transactions. Set it up once on a Raspberry Pi (or any Linux computer) and forget about it.

## What This Does

You give it wallet addresses. It watches the Ethereum blockchain. When one of your watched wallets sends a transaction, you get a notification on your phone.

**Example:** You add Vitalik's wallet address. He sends ETH somewhere. You get a Telegram message within seconds telling you what happened, with a link to view it on Etherscan.

It can also track:
- Smart contract function calls (e.g., NFT mints)
- ERC20 token transfers
- NFT transfers
- DEX swaps (Uniswap, SushiSwap, etc.)
- Large ETH transfers (e.g., anything over 100 ETH)
- Gas price spikes
- New contract deployments

## Requirements

- **Raspberry Pi** (any model, including Pi Zero) OR any Linux/Mac computer
- **Internet connection**
- **Free Alchemy account** for blockchain data ([sign up here](https://www.alchemy.com/))
- **Telegram** or **Discord** for notifications

## Quick Start

### Option A: Guided Setup (Recommended)

The setup wizard walks you through everything:

```bash
git clone https://github.com/your-username/eth-notifier.git
cd eth-notifier
chmod +x setup.sh
./setup.sh
```

The wizard will:
1. Install Node.js if needed
2. Install dependencies
3. Ask for your Alchemy API key
4. Ask for a wallet address to watch
5. Set up Telegram or Discord notifications
6. Test that notifications work
7. Install as a system service (auto-start on boot)

**That's it. You're done.**

### Option B: Manual Setup

```bash
# 1. Download
git clone https://github.com/your-username/eth-notifier.git
cd eth-notifier

# 2. Install dependencies
npm install

# 3. Create config files
cp config.example.yaml config.yaml
cp .env.example .env

# 4. Edit .env - add your API key
#    Get a free key at https://www.alchemy.com/
nano .env

# 5. Edit config.yaml - add your wallet addresses and notification settings
nano config.yaml

# 6. Test notifications
npm run test-notify

# 7. Start
npm start
```

## Configuration

### `.env` - API Keys and Secrets

```bash
# Required: Get a free key at https://www.alchemy.com/
ALCHEMY_API_KEY=your_key_here

# For Telegram notifications (from @BotFather):
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHI...

# For Discord notifications:
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### `config.yaml` - What to Watch

```yaml
# Wallets to monitor
wallets:
  - name: "My Main Wallet"
    address: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18"

# Notification settings
notifications:
  telegram:
    enabled: true
    chatId: "123456789"
  discord:
    enabled: false
```

See `config.example.yaml` for all options with detailed comments.

## Setting Up Notifications

### Telegram (Recommended)

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the instructions to create a bot
3. Copy the bot token to your `.env` file as `TELEGRAM_BOT_TOKEN`
4. Search for **@userinfobot** on Telegram, send `/start` - it replies with your chat ID
5. Put your chat ID in `config.yaml` under `notifications.telegram.chatId`
6. **Important:** Open your new bot in Telegram and press **Start**

### Discord

1. In Discord, right-click the channel where you want notifications
2. **Edit Channel** > **Integrations** > **Webhooks**
3. Click **New Webhook**, copy the URL
4. Paste the URL in your `.env` file as `DISCORD_WEBHOOK_URL`
5. Set `discord.enabled: true` in `config.yaml`

## Running as a Service (Auto-Start on Boot)

If you used `./setup.sh`, the service is already installed. Otherwise:

```bash
# Install the service
sudo cp eth-notifier.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable eth-notifier
sudo systemctl start eth-notifier
```

The service will:
- Start automatically when your Pi boots
- Restart automatically if it crashes (after 5 seconds)
- Stay within memory limits (256MB max)
- Log to the system journal

## Management Commands

Use the built-in CLI to manage ETH Notifier:

```bash
./eth-notifier status       # Is it running? Last check? Memory usage?
./eth-notifier logs         # Show recent logs (live tail)
./eth-notifier test         # Send a test notification
./eth-notifier add          # Add a new wallet interactively
./eth-notifier start        # Start the service
./eth-notifier stop         # Stop the service
./eth-notifier restart      # Restart (after config changes)
./eth-notifier healthcheck  # Full health check of config and providers
```

## Reliability

ETH Notifier is designed to run unattended:

- **Auto-restart:** systemd restarts the service if it crashes
- **Internet outages:** Automatic retry with exponential backoff
- **Provider failover:** If Alchemy goes down, automatically switches to fallback providers
- **Notification retry:** Failed notifications are queued and retried up to 5 times
- **State persistence:** Saves progress to disk so it resumes where it left off after restart
- **Heartbeat logging:** Logs an "I'm alive" message every hour with uptime and memory stats
- **Rate limiting:** Respects Telegram and Discord API rate limits
- **Memory limits:** Capped at 256MB via systemd, safe for Pi Zero (512MB)
- **Log rotation:** System journal handles log rotation automatically

## Supported Providers

ETH Notifier uses Alchemy by default but supports multiple providers for redundancy:

| Provider | Free Tier | WebSocket | Best For |
|----------|-----------|-----------|----------|
| **Alchemy** | Yes | Yes | Default, most features |
| Infura | Yes | Yes | Reliable fallback |
| QuickNode | Yes | Yes | Low latency |
| Ankr | Yes | No | Token/NFT APIs |
| Moralis | Yes | Yes | Enhanced APIs |
| Chainstack | Yes | Yes | Alternative |
| GetBlock | Yes | No | Budget option |
| Blast | Yes | Yes | Alternative |
| Pocket | Yes | No | Decentralized |

Most users only need Alchemy (free tier handles typical wallet monitoring).

## Supported Networks

Mainnet, Goerli, Sepolia, Polygon, Arbitrum, Optimism, Base

Set the network in `.env`:
```bash
NETWORK=mainnet
```

## Troubleshooting

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for:
- Not getting notifications
- Service won't start
- Raspberry Pi performance
- Internet connection issues
- Configuration help

**Quick fixes:**

```bash
# Check if it's running
./eth-notifier status

# Check for errors
./eth-notifier logs

# Test notifications
./eth-notifier test

# Validate your config
./eth-notifier healthcheck
```

## License

MIT
