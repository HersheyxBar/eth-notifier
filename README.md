# ETH Notifier

Monitor Ethereum smart contract function calls and send notifications to Discord and Telegram.

## Quick start
1) Copy `config.example.json` to `config.json` and edit your contracts.
2) Copy `.env.example` to `.env` and fill in your keys.
3) Build and run:

```bash
npm run build
npm run start
```

## Configuration
`config.json`

- `contracts[]`
  - `name`: Human label for logs.
  - `address`: 0x contract address.
  - `abi`: Contract ABI (only functions you want to decode are required).
  - `watchFunctions`: functions to watch. Supports:
    - function name, e.g. `"mint"`
    - full signature, e.g. `"mint(address,uint256)"`
    - selector, e.g. `"0xa0712d68"`
- `notifications`
  - `discord.enabled`: enable Discord.
  - `discord.webhookUrl`: optional; overrides `DISCORD_WEBHOOK_URL` env.
  - `telegram.enabled`: enable Telegram.
  - `telegram.chatId`: required if Telegram enabled.

`.env`
- `ALCHEMY_API_KEY`: required.
- `DISCORD_WEBHOOK_URL`: required if Discord enabled and not provided in config.
- `TELEGRAM_BOT_TOKEN`: required if Telegram enabled.
- `NETWORK`: optional, defaults to `mainnet`. Options: `mainnet`, `goerli`, `sepolia`, `polygon`, `arbitrum`, `optimism`, `base`.
- `NOTIFY_DEDUPE_SECONDS`: de-dupe window for tx notifications (0 disables de-dupe).

## Health check
Validate config and env without connecting to the network:

```bash
npm run healthcheck
```

## Production notes
- This listens to both pending and mined transactions; duplicates are de-duped by `NOTIFY_DEDUPE_SECONDS`.
- Use a process manager (systemd, pm2, etc.) to keep it running.
- Keep your `.env` and `config.json` private.
