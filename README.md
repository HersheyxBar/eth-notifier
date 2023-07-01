# ETH Notifier

Real-time Ethereum blockchain monitoring with Discord and Telegram notifications.

## Features

- **Contract Monitoring** - Watch specific function calls on smart contracts
- **Wallet Tracking** - Monitor outgoing transactions from wallets
- **Token Transfers** - Track ERC20 token movements
- **NFT Transfers** - Monitor ERC721/ERC1155 transfers
- **DEX Swaps** - Detect swaps on Uniswap, SushiSwap, 1inch, etc.
- **Large Transfers** - Alert on ETH transfers above threshold
- **Contract Deployments** - Watch for new contract deployments
- **Gas Alerts** - Notifications when gas exceeds threshold
- **Multi-Provider Failover** - Automatic failover between 9 RPC providers

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
| GetBlock | - | - | - | - |
| Blast | ✓ | Limited | - | - |
| Pocket | - | - | - | - |

## Quick Start

```bash
npm install
cp config.example.json config.json
cp .env.example .env
# Edit config.json and .env
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
      "watchFunctions": ["mint", "transfer(address,uint256)"]
    }
  ],
  "wallets": [
    { "name": "Treasury", "address": "0x..." }
  ],
  "tracking": {
    "tokenTransfers": { "enabled": true },
    "nftTransfers": { "enabled": true },
    "dexSwaps": { "enabled": true },
    "largeTransfers": { "enabled": true, "minEth": 100 },
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
    ]
  }
}
```

### Environment Variables

```bash
ALCHEMY_API_KEY=your_key
INFURA_API_KEY=your_key
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
TELEGRAM_BOT_TOKEN=123456:ABC...
NETWORK=mainnet
NOTIFY_DEDUPE_SECONDS=60
```

## Commands

```bash
npm start        # Run
npm run healthcheck  # Validate config
```

## License

MIT
