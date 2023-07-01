# Troubleshooting Guide

Common problems and how to fix them.

---

## Not Getting Notifications

### Telegram

**Problem: No messages from the bot**

1. Make sure you opened your bot in Telegram and pressed **Start**
2. Check that `TELEGRAM_BOT_TOKEN` is set in `.env`
3. Check that `chatId` is set in `config.yaml` under `notifications.telegram`
4. Run: `./eth-notifier test` to send a test message
5. If you get a `403` error, you haven't started the bot in Telegram

**Problem: "chat not found" error**

- Your `chatId` is wrong. Get the correct one:
  1. Open Telegram
  2. Message `@userinfobot`
  3. It replies with your user ID - use that as `chatId`

**Problem: Group chat notifications**

- For group chats, add the bot to the group
- The chat ID for groups starts with `-` (negative number)
- Get the group chat ID by adding `@RawDataBot` to the group temporarily

### Discord

**Problem: No messages in Discord channel**

1. Check that `DISCORD_WEBHOOK_URL` is set in `.env`
2. Make sure `discord.enabled` is `true` in `config.yaml`
3. Run: `./eth-notifier test` to send a test message

**Problem: "Unknown Webhook" error**

- The webhook was deleted. Create a new one:
  1. Right-click the Discord channel
  2. Edit Channel > Integrations > Webhooks
  3. Create a new webhook
  4. Copy the URL to `.env`

---

## Service Not Starting

### Check the logs first

```bash
# If running as a service:
sudo journalctl -u eth-notifier -n 50

# Or use the CLI:
./eth-notifier logs
```

### Common startup errors

**"Config not found"**

```
Config not found. Run: cp config.example.yaml config.yaml
```

Fix: Create the config file:
```bash
cp config.example.yaml config.yaml
```
Then edit it with your settings.

**"ALCHEMY_API_KEY required"**

Fix: Set your API key in `.env`:
```bash
nano .env
# Set: ALCHEMY_API_KEY=your_actual_key
```

Get a free key at https://www.alchemy.com/

**"Invalid address"**

Your wallet address is wrong. Ethereum addresses:
- Start with `0x`
- Are followed by exactly 40 characters (0-9, a-f)
- Example: `0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18`

Find correct addresses on https://etherscan.io

**"No healthy providers"**

- Your API key may be invalid or expired
- The provider service may be down
- Check your internet connection
- Try a different provider (Infura, Ankr, etc.)

### Service crashes and restarts

The systemd service automatically restarts after 5 seconds if it crashes.
Check what caused the crash:

```bash
sudo journalctl -u eth-notifier --since "1 hour ago"
```

---

## Raspberry Pi Issues

### Pi running slow

1. **Check memory:**
   ```bash
   free -m
   ```
   ETH Notifier needs about 100-150MB. If you're low on memory:
   - Close other applications
   - Reduce the number of tracked items in `config.yaml`
   - Disable tracking features you don't need

2. **Check CPU:**
   ```bash
   top -bn1 | head -20
   ```
   If CPU is high, reduce `check_interval` (increase the number of seconds).

3. **Check disk space:**
   ```bash
   df -h
   ```
   If disk is full, the state file can't save. Clean up old files or logs:
   ```bash
   sudo journalctl --vacuum-size=50M
   ```

### Pi Zero specific

The Pi Zero has only 512MB RAM and a single-core CPU. ETH Notifier works on it, but:

- Use only 1 provider (Alchemy is recommended)
- Don't enable all tracking features at once
- The `MemoryMax=256M` limit in the service file prevents it from using too much RAM

### After a reboot

If set up as a service, ETH Notifier starts automatically after reboot.
Check with:

```bash
./eth-notifier status
```

If it's not running:
```bash
sudo systemctl enable eth-notifier   # Enable auto-start
sudo systemctl start eth-notifier    # Start now
```

---

## Internet Connection Issues

ETH Notifier handles internet outages automatically:

- It retries failed connections with increasing wait times (1s, 2s, 4s, ... up to 60s)
- When the internet comes back, it reconnects automatically
- Notifications that failed to send are queued and retried (up to 5 attempts)
- The last processed block is saved, so no transactions are missed during short outages

If you see repeated connection errors:

1. Check your internet: `ping -c 3 google.com`
2. Check your provider API: `curl -s https://eth-mainnet.g.alchemy.com/v2/demo`
3. Your API key may have hit rate limits - wait a few minutes

---

## Configuration Issues

### Validating your config

```bash
./eth-notifier healthcheck
```

This checks:
- Config file syntax
- Wallet addresses are valid
- API keys are set
- Notification channels are configured
- Provider connectivity

### Editing config files

**config.yaml** - Main configuration (wallets, notifications, tracking):
```bash
nano config.yaml
```

**.env** - Secret values (API keys, tokens):
```bash
nano .env
```

After editing, restart the service:
```bash
./eth-notifier restart
```

### YAML syntax errors

If you get a YAML parsing error, common mistakes are:
- Missing spaces after colons: `name:value` should be `name: value`
- Wrong indentation: YAML uses spaces, not tabs
- Missing quotes around values with special characters

Use a YAML validator: https://www.yamllint.com/

---

## Getting More Help

1. Check the logs: `./eth-notifier logs`
2. Run the health check: `./eth-notifier healthcheck`
3. Send a test notification: `./eth-notifier test`
4. Check the README for setup instructions
