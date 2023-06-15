# ETH Notifier

Real-time Ethereum blockchain monitoring with Discord and Telegram notifications. Track smart contract calls, wallet activity, token transfers, NFT movements, DEX swaps, and more.

## Features

- **Contract Monitoring** - Watch specific function calls on any smart contract
- **Wallet Tracking** - Monitor outgoing transactions from specific wallets
- **Token Transfers** - Track ERC20 token movements
- **NFT Transfers** - Monitor ERC721/ERC1155 transfers
- **DEX Swaps** - Detect swaps on Uniswap, SushiSwap, 1inch, etc.
- **Large Transfers** - Alert on ETH transfers above threshold
- **Contract Deployments** - Watch for new contract deployments
- **Gas Alerts** - Notifications when gas exceeds threshold
- **Multi-Provider Support** - Automatic failover between 9 RPC providers
- **Dual Notifications** - Discord webhooks and Telegram bot support

## Supported Networks

Mainnet, Goerli, Sepolia, Polygon, Arbitrum, Optimism, Base

## Supported Providers

| Provider | WebSocket | Pending Tx | Token API | NFT API |
|----------|-----------|------------|-----------|---------|
| Alchemy | ✓ | ✓ | ✓ | ✓ |
| Infura | ✓ | ✓ | - | - |
| QuickNode | ✓ | ✓ | Add-on | Add-on |
| Ankr | - | - | ✓ | ✓ |
| Moralis | ✓ | Limited | ✓ | ✓ |
| Chainstack | ✓ | Limited | - | - |
| GetBlock | Partial | - | - | - |
| Blast | ✓ | Limited | - | - |
| Pocket | - | - | - | - |

## Quick Start

```bash
# Install dependencies
npm install

# Copy example configs
cp config.example.json config.json
cp .env.example .env

# Edit config.json with your contracts/wallets
# Edit .env with your API keys

# Build and run
npm run build
npm start
```

## Configuration

### config.json

```json
{
  "contracts": [
    {
      "name": "My Contract",
      "address": "0x...",
      "abi": [...],
      "watchFunctions": ["mint", "transfer(address,uint256)", "0xa0712d68"]
    }
  ],
  "wallets": [
    { "name": "Treasury", "address": "0x..." }
  ],
  "tracking": {
    "tokenTransfers": { "enabled": true, "tokens": [] },
    "nftTransfers": { "enabled": true, "collections": [] },
    "dexSwaps": { "enabled": true, "dexes": ["uniswap"] },
    "largeTransfers": { "enabled": true, "minEth": 100 },
    "contractDeploys": { "enabled": false },
    "gasAlerts": { "enabled": true, "alertThresholdGwei": 100, "checkIntervalSeconds": 60 }
  },
  "notifications": {
    "discord": { "enabled": true },
    "telegram": { "enabled": true, "chatId": "123456789" }
  },
  "providers": {
    "primary": { "type": "alchemy", "apiKey": "env:ALCHEMY_API_KEY" },
    "fallbacks": [
      { "type": "infura", "apiKey": "env:INFURA_API_KEY" }
    ],
    "strategy": "priority"
  }
}
```

### Environment Variables

```bash
# Required (at least one provider)
ALCHEMY_API_KEY=your_key

# Optional fallback providers
ALCHEMY_API_KEY_2=backup_key
INFURA_API_KEY=your_key
QUICKNODE_HTTP_URL=https://...
ANKR_API_KEY=your_key
MORALIS_API_KEY=your_key
CHAINSTACK_API_KEY=your_key
GETBLOCK_API_KEY=your_key
BLAST_API_KEY=your_key
POCKET_PORTAL_ID=your_id

# Notifications
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
TELEGRAM_BOT_TOKEN=123456:ABC...

# Network
NETWORK=mainnet

# Dedupe window (seconds)
NOTIFY_DEDUPE_SECONDS=60
```

## Commands

```bash
npm run build        # Compile TypeScript
npm start            # Run production
npm run dev          # Run with ts-node
npm run healthcheck  # Validate configuration
npm test             # Run tests
```

## Health Check

Validate your configuration before running:

```bash
npm run healthcheck
```

This verifies:
- Config file syntax
- Contract addresses
- Provider connectivity
- Notification credentials
- Persistence directory

## Architecture

```
┌─────────────────────────────────────────────┐
│              ProviderManager                │
│  - Automatic failover                       │
│  - Health monitoring                        │
│  - Capability-based routing                 │
└─────────────────┬───────────────────────────┘
                  │
    ┌─────────────┼─────────────┬─────────────┐
    ▼             ▼             ▼             ▼
┌────────┐  ┌────────┐   ┌──────────┐  ┌──────────┐
│Alchemy │  │ Infura │   │QuickNode │  │  Ankr    │
└────────┘  └────────┘   └──────────┘  └──────────┘
                  │
                  ▼
        ┌─────────────────┐
        │EthereumListener │
        │ - Subscriptions │
        │ - Block polling │
        │ - Tx decoding   │
        └────────┬────────┘
                 │
                 ▼
        ┌─────────────────┐
        │  Notifications  │
        │ Discord/Telegram│
        └─────────────────┘
```

## Production Deployment

Use a process manager to keep the service running:

```bash
# PM2
pm2 start dist/index.js --name eth-notifier

# Systemd
# Create /etc/systemd/system/eth-notifier.service
```

Keep `.env` and `config.json` secure - they contain sensitive API keys.

## License

MIT
