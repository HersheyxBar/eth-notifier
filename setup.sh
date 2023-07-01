#!/bin/bash
# ETH Notifier - Interactive Setup Script
# Works on Raspberry Pi (any model), Ubuntu, Debian, and most Linux systems.
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
#
# Or run directly:
#   bash setup.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   ETH Notifier - Setup Wizard${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "This will set up ETH Notifier on your system."
echo "You'll need:"
echo "  - An Ethereum wallet address to watch"
echo "  - A free Alchemy API key (https://www.alchemy.com/)"
echo "  - Telegram or Discord for notifications"
echo ""

# ============================================================
# Step 1: Detect system
# ============================================================
echo -e "${BOLD}Step 1: Checking your system...${NC}"
echo ""

IS_PI=false
PI_MODEL="unknown"

if [ -f /proc/device-tree/model ]; then
    PI_MODEL=$(tr -d '\0' < /proc/device-tree/model)
    if echo "$PI_MODEL" | grep -qi "raspberry"; then
        IS_PI=true
        echo -e "  ${GREEN}Raspberry Pi detected:${NC} $PI_MODEL"
    fi
fi

if [ "$IS_PI" = false ]; then
    echo "  System: $(uname -s) $(uname -m)"
fi

# Check available memory
if [ -f /proc/meminfo ]; then
    TOTAL_MEM=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
    echo "  Memory: ${TOTAL_MEM}MB"
    if [ "$TOTAL_MEM" -lt 256 ]; then
        echo -e "  ${YELLOW}Warning: Low memory. ETH Notifier needs ~100MB.${NC}"
    fi
fi

echo ""

# ============================================================
# Step 2: Install Node.js if needed
# ============================================================
echo -e "${BOLD}Step 2: Checking Node.js...${NC}"
echo ""

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "  ${GREEN}Node.js found:${NC} $NODE_VERSION"

    # Check minimum version (v16+)
    NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_MAJOR" -lt 16 ]; then
        echo -e "  ${YELLOW}Node.js v16+ required. Current: $NODE_VERSION${NC}"
        NEED_NODE=true
    else
        NEED_NODE=false
    fi
else
    echo "  Node.js not found."
    NEED_NODE=true
fi

if [ "$NEED_NODE" = true ]; then
    echo ""
    read -p "  Install Node.js? [Y/n] " install_node
    install_node=${install_node:-Y}

    if [[ "$install_node" =~ ^[Yy]$ ]]; then
        echo "  Installing Node.js..."
        if command -v apt-get &> /dev/null; then
            # Debian/Ubuntu/Raspberry Pi OS
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
        elif command -v dnf &> /dev/null; then
            # Fedora
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
            sudo dnf install -y nodejs
        elif command -v brew &> /dev/null; then
            # macOS
            brew install node
        else
            echo -e "  ${RED}Could not auto-install Node.js.${NC}"
            echo "  Please install Node.js v16+ manually: https://nodejs.org/"
            exit 1
        fi
        echo -e "  ${GREEN}Node.js installed:${NC} $(node -v)"
    else
        echo -e "  ${RED}Node.js is required.${NC} Please install it and run setup again."
        exit 1
    fi
fi

echo ""

# ============================================================
# Step 3: Install npm dependencies
# ============================================================
echo -e "${BOLD}Step 3: Installing dependencies...${NC}"
echo ""

cd "$INSTALL_DIR"

if [ ! -d "node_modules" ]; then
    npm install --production
    echo -e "  ${GREEN}Dependencies installed.${NC}"
else
    echo -e "  ${GREEN}Dependencies already installed.${NC}"
    echo "  (Run 'npm install' to update)"
fi

echo ""

# ============================================================
# Step 4: Configure
# ============================================================
echo -e "${BOLD}Step 4: Configuration${NC}"
echo ""

# Create .env if it doesn't exist
if [ ! -f "$INSTALL_DIR/.env" ]; then
    cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
    echo "  Created .env from template."
fi

# Create config.yaml if it doesn't exist
if [ ! -f "$INSTALL_DIR/config.yaml" ] && [ ! -f "$INSTALL_DIR/config.yml" ] && [ ! -f "$INSTALL_DIR/config.json" ]; then
    cp "$INSTALL_DIR/config.example.yaml" "$INSTALL_DIR/config.yaml"
    echo "  Created config.yaml from template."
fi

CONFIG_FILE="$INSTALL_DIR/config.yaml"
if [ ! -f "$CONFIG_FILE" ]; then
    if [ -f "$INSTALL_DIR/config.yml" ]; then
        CONFIG_FILE="$INSTALL_DIR/config.yml"
    elif [ -f "$INSTALL_DIR/config.json" ]; then
        CONFIG_FILE="$INSTALL_DIR/config.json"
        echo "  Using existing config.json"
    fi
fi

echo ""

# --- Alchemy API Key ---
echo -e "  ${BOLD}Blockchain Provider (Alchemy)${NC}"
echo "  You need a free API key from https://www.alchemy.com/"
echo "  Sign up, create an app, and copy your API key."
echo ""

current_key=$(grep -oP 'ALCHEMY_API_KEY=\K.+' "$INSTALL_DIR/.env" 2>/dev/null || echo "")
if [ -n "$current_key" ] && [ "$current_key" != "your_alchemy_api_key_here" ]; then
    echo -e "  ${GREEN}Alchemy API key already set.${NC}"
    read -p "  Change it? [y/N] " change_key
    change_key=${change_key:-N}
else
    change_key="Y"
fi

if [[ "$change_key" =~ ^[Yy]$ ]]; then
    read -p "  Alchemy API key: " alchemy_key
    if [ -n "$alchemy_key" ]; then
        sed -i.bak "s|^ALCHEMY_API_KEY=.*|ALCHEMY_API_KEY=$alchemy_key|" "$INSTALL_DIR/.env"
        rm -f "$INSTALL_DIR/.env.bak"
        echo -e "  ${GREEN}API key saved.${NC}"
    else
        echo -e "  ${YELLOW}Skipped. Set it later in .env${NC}"
    fi
fi

echo ""

# --- Wallet Address ---
echo -e "  ${BOLD}Wallet to Watch${NC}"
echo "  Enter an Ethereum wallet address to monitor."
echo "  Find addresses on https://etherscan.io"
echo ""

read -p "  Wallet name (e.g., My Wallet): " wallet_name
read -p "  Wallet address (0x...): " wallet_address

if [ -n "$wallet_address" ]; then
    if [[ "$wallet_address" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
        # Update the config.yaml with the real wallet
        if [[ "$CONFIG_FILE" == *.yaml ]] || [[ "$CONFIG_FILE" == *.yml ]]; then
            sed -i.bak "s|0x0000000000000000000000000000000000000001|$wallet_address|" "$CONFIG_FILE"
            if [ -n "$wallet_name" ]; then
                sed -i.bak "s|My Main Wallet|$wallet_name|" "$CONFIG_FILE"
            fi
            rm -f "$CONFIG_FILE.bak"
        fi
        echo -e "  ${GREEN}Wallet added!${NC}"
    else
        echo -e "  ${YELLOW}Invalid address format. You can edit config.yaml later.${NC}"
    fi
else
    echo -e "  ${YELLOW}Skipped. Edit config.yaml to add wallets later.${NC}"
fi

echo ""

# --- Notification Setup ---
echo -e "  ${BOLD}Notifications${NC}"
echo ""
echo "  How do you want to receive notifications?"
echo "  1) Telegram (recommended)"
echo "  2) Discord"
echo "  3) Both"
echo "  4) Skip (configure later)"
echo ""
read -p "  Choice [1-4]: " notif_choice
notif_choice=${notif_choice:-4}

case "$notif_choice" in
    1|3)
        echo ""
        echo "  Telegram Setup:"
        echo "  1. Open Telegram and message @BotFather"
        echo "  2. Send /newbot and follow instructions"
        echo "  3. Copy the bot token below"
        echo ""
        read -p "  Telegram bot token: " tg_token
        if [ -n "$tg_token" ]; then
            sed -i.bak "s|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=$tg_token|" "$INSTALL_DIR/.env"
            rm -f "$INSTALL_DIR/.env.bak"
            echo -e "  ${GREEN}Token saved.${NC}"
        fi

        echo ""
        echo "  Now get your chat ID:"
        echo "  1. Message @userinfobot on Telegram"
        echo "  2. It will reply with your ID"
        echo ""
        read -p "  Telegram chat ID: " tg_chat_id
        if [ -n "$tg_chat_id" ]; then
            if [[ "$CONFIG_FILE" == *.yaml ]] || [[ "$CONFIG_FILE" == *.yml ]]; then
                sed -i.bak "s|YOUR_CHAT_ID_HERE|$tg_chat_id|" "$CONFIG_FILE"
                rm -f "$CONFIG_FILE.bak"
            fi
            echo -e "  ${GREEN}Chat ID saved.${NC}"
        fi

        echo ""
        echo -e "  ${YELLOW}IMPORTANT: Open your bot in Telegram and press Start!${NC}"
        ;;&
    2|3)
        echo ""
        echo "  Discord Setup:"
        echo "  1. In Discord, right-click your channel"
        echo "  2. Edit Channel > Integrations > Webhooks"
        echo "  3. Create a webhook and copy the URL"
        echo ""
        read -p "  Discord webhook URL: " dc_url
        if [ -n "$dc_url" ]; then
            sed -i.bak "s|^DISCORD_WEBHOOK_URL=.*|DISCORD_WEBHOOK_URL=$dc_url|" "$INSTALL_DIR/.env"
            rm -f "$INSTALL_DIR/.env.bak"

            # Enable discord in config
            if [[ "$CONFIG_FILE" == *.yaml ]] || [[ "$CONFIG_FILE" == *.yml ]]; then
                sed -i.bak 's|discord:$|discord:|; /discord:/{n;s|enabled: false|enabled: true|}' "$CONFIG_FILE"
                rm -f "$CONFIG_FILE.bak"
            fi
            echo -e "  ${GREEN}Webhook saved.${NC}"
        fi
        ;;
esac

echo ""

# ============================================================
# Step 5: Test notification
# ============================================================
echo -e "${BOLD}Step 5: Testing notifications...${NC}"
echo ""

read -p "  Send a test notification? [Y/n] " do_test
do_test=${do_test:-Y}

if [[ "$do_test" =~ ^[Yy]$ ]]; then
    cd "$INSTALL_DIR"
    node src/test-notify.js || true
fi

echo ""

# ============================================================
# Step 6: Install as service (Linux/Pi only)
# ============================================================
if command -v systemctl &> /dev/null; then
    echo -e "${BOLD}Step 6: Install as system service${NC}"
    echo ""
    echo "  This makes ETH Notifier:"
    echo "  - Start automatically on boot"
    echo "  - Restart if it crashes"
    echo "  - Run in the background"
    echo ""

    read -p "  Install as system service? [Y/n] " install_service
    install_service=${install_service:-Y}

    if [[ "$install_service" =~ ^[Yy]$ ]]; then
        # Determine the user
        CURRENT_USER=$(whoami)

        # Create service file with actual paths
        SERVICE_FILE="/tmp/eth-notifier.service"
        cat > "$SERVICE_FILE" << SERVICEEOF
[Unit]
Description=ETH Notifier - Ethereum Wallet Monitor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) src/index.js
Restart=always
RestartSec=5

# Graceful shutdown
KillSignal=SIGTERM
TimeoutStopSec=10

# Resource limits (safe for Raspberry Pi)
MemoryMax=256M
MemoryHigh=200M

# Security hardening
NoNewPrivileges=yes
PrivateTmp=yes

# Environment
Environment=NODE_ENV=production
EnvironmentFile=$INSTALL_DIR/.env

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=eth-notifier

[Install]
WantedBy=multi-user.target
SERVICEEOF

        sudo cp "$SERVICE_FILE" /etc/systemd/system/eth-notifier.service
        sudo systemctl daemon-reload
        sudo systemctl enable eth-notifier
        rm -f "$SERVICE_FILE"

        echo -e "  ${GREEN}Service installed and enabled on boot.${NC}"

        echo ""
        read -p "  Start the service now? [Y/n] " start_now
        start_now=${start_now:-Y}

        if [[ "$start_now" =~ ^[Yy]$ ]]; then
            sudo systemctl start eth-notifier
            sleep 2
            if systemctl is-active --quiet eth-notifier; then
                echo -e "  ${GREEN}ETH Notifier is running!${NC}"
            else
                echo -e "  ${RED}Failed to start.${NC} Check: sudo journalctl -u eth-notifier -n 20"
            fi
        fi

        # Install logrotate config if available
        if command -v logrotate &> /dev/null && [ -f "$INSTALL_DIR/eth-notifier.logrotate" ]; then
            sudo cp "$INSTALL_DIR/eth-notifier.logrotate" /etc/logrotate.d/eth-notifier 2>/dev/null || true
        fi

        # Configure journal size limit on Pi
        if [ "$IS_PI" = true ]; then
            if [ -f /etc/systemd/journald.conf ]; then
                if ! grep -q "SystemMaxUse=50M" /etc/systemd/journald.conf; then
                    echo "  Setting journal size limit (50MB) for Pi..."
                    sudo sed -i.bak 's/^#SystemMaxUse=.*/SystemMaxUse=50M/' /etc/systemd/journald.conf
                    sudo systemctl restart systemd-journald 2>/dev/null || true
                fi
            fi
        fi
    fi
else
    echo -e "${BOLD}Step 6: Running${NC}"
    echo ""
    echo "  systemd not found (not Linux or not a system install)."
    echo "  Run manually with: npm start"
fi

echo ""

# ============================================================
# Done!
# ============================================================
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "  What's next:"
echo ""
if command -v systemctl &> /dev/null && systemctl is-active --quiet eth-notifier 2>/dev/null; then
    echo "  ETH Notifier is running as a service."
    echo ""
    echo "  Useful commands:"
    echo "    ./eth-notifier status     - Check if it's running"
    echo "    ./eth-notifier logs       - View live logs"
    echo "    ./eth-notifier test       - Send test notification"
    echo "    ./eth-notifier add        - Add another wallet"
    echo "    ./eth-notifier restart    - Restart after config changes"
else
    echo "  Start monitoring with:"
    echo "    npm start"
    echo ""
    echo "  Or use the management CLI:"
    echo "    ./eth-notifier status"
    echo "    ./eth-notifier test"
fi
echo ""
echo "  Config files:"
echo "    config.yaml  - Wallets, notifications, tracking"
echo "    .env         - API keys and secrets"
echo ""
echo "  Need help? See docs/TROUBLESHOOTING.md"
echo ""
