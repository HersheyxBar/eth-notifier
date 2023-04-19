import TelegramBot from 'node-telegram-bot-api';
import { NotificationChannel, NotificationMessage } from '../types';

export class TelegramNotifier implements NotificationChannel {
  private bot: TelegramBot;
  private chatId: string;

  constructor(botToken: string, chatId: string) {
    if (!botToken) {
      throw new Error('Telegram bot token is required');
    }
    if (!chatId) {
      throw new Error('Telegram chat ID is required');
    }
    this.bot = new TelegramBot(botToken);
    this.chatId = chatId;
  }

  async send(message: NotificationMessage): Promise<void> {
    const text = this.formatMessage(message);

    try {
      await this.bot.sendMessage(this.chatId, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });
      console.log(`[Telegram] Notification sent for tx: ${message.txHash || 'N/A'}`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`[Telegram] Failed to send notification: ${error.message}`);
      }
      throw error;
    }
  }

  private formatMessage(message: NotificationMessage): string {
    switch (message.sourceType) {
      case 'contract':
        return this.formatContractMessage(message);
      case 'wallet':
        return this.formatWalletMessage(message);
      case 'token_transfer':
        return this.formatTokenTransferMessage(message);
      case 'nft_transfer':
        return this.formatNftTransferMessage(message);
      case 'dex_swap':
        return this.formatDexSwapMessage(message);
      case 'large_transfer':
        return this.formatLargeTransferMessage(message);
      case 'contract_deploy':
        return this.formatContractDeployMessage(message);
      case 'gas_alert':
        return this.formatGasAlertMessage(message);
      default:
        return this.formatContractMessage(message);
    }
  }

  private formatContractMessage(message: NotificationMessage): string {
    const argsText = this.formatArgs(message.args || {});

    return `
<b>[Alert] ${this.escapeHtml(message.title)}</b>

<b>Contract:</b> <a href="${this.getExplorerAddress(message.explorerBase, message.contractAddress || '')}">${this.escapeHtml(message.contractName || '')}</a>
<b>Function:</b> <code>${this.escapeHtml(message.functionName || '')}</code>
<b>From:</b> <a href="${this.getExplorerAddress(message.explorerBase, message.from)}">${this.truncateAddress(message.from)}</a>
<b>Value:</b> ${message.value} ETH

<b>Arguments:</b>
${argsText}

<a href="${message.explorerTxUrl}">View on Explorer</a>
    `.trim();
  }

  private formatWalletMessage(message: NotificationMessage): string {
    const targetDisplay = message.targetAddress
      ? `<a href="${this.getExplorerAddress(message.explorerBase, message.targetAddress)}">${this.truncateAddress(message.targetAddress)}</a>`
      : '<i>(contract creation)</i>';

    return `
<b>[Wallet] ${this.escapeHtml(message.title)}</b>

<b>Wallet:</b> <a href="${this.getExplorerAddress(message.explorerBase, message.from)}">${this.escapeHtml(message.contractName || '')}</a>
<b>Address:</b> <code>${this.truncateAddress(message.from)}</code>
<b>Target:</b> ${targetDisplay}
<b>Value:</b> ${message.value} ETH
<b>Method:</b> <code>${this.escapeHtml(message.functionName || '')}</code>

<a href="${message.explorerTxUrl}">View on Explorer</a>
    `.trim();
  }

  private formatTokenTransferMessage(message: NotificationMessage): string {
    return `
<b>[Token] ${this.escapeHtml(message.title)}</b>

<b>Token:</b> ${this.escapeHtml(message.tokenSymbol || '')}
<b>Amount:</b> ${message.tokenAmount}
<b>From:</b> <a href="${this.getExplorerAddress(message.explorerBase, message.from)}">${this.truncateAddress(message.from)}</a>
<b>To:</b> ${message.to ? `<a href="${this.getExplorerAddress(message.explorerBase, message.to)}">${this.truncateAddress(message.to)}</a>` : 'N/A'}

<a href="${message.explorerTxUrl}">View on Explorer</a>
    `.trim();
  }

  private formatNftTransferMessage(message: NotificationMessage): string {
    return `
<b>[NFT] ${this.escapeHtml(message.title)}</b>

<b>Collection:</b> <a href="${this.getExplorerAddress(message.explorerBase, message.contractAddress || '')}">${this.escapeHtml(message.collectionName || '')}</a>
<b>Token ID:</b> #${message.tokenId}
<b>From:</b> <a href="${this.getExplorerAddress(message.explorerBase, message.from)}">${this.truncateAddress(message.from)}</a>
<b>To:</b> ${message.to ? `<a href="${this.getExplorerAddress(message.explorerBase, message.to)}">${this.truncateAddress(message.to)}</a>` : 'N/A'}

<a href="${message.explorerTxUrl}">View on Explorer</a>
    `.trim();
  }

  private formatDexSwapMessage(message: NotificationMessage): string {
    const swapText = message.tokenIn && message.tokenOut
      ? `${message.tokenIn.amount} ${message.tokenIn.symbol} -> ${message.tokenOut.amount} ${message.tokenOut.symbol}`
      : 'Unknown';

    return `
<b>[DEX] ${this.escapeHtml(message.title)}</b>

<b>DEX:</b> ${this.escapeHtml(message.dexName || 'Unknown')}
<b>Trader:</b> <a href="${this.getExplorerAddress(message.explorerBase, message.from)}">${this.truncateAddress(message.from)}</a>
<b>Swap:</b> ${this.escapeHtml(swapText)}

<a href="${message.explorerTxUrl}">View on Explorer</a>
    `.trim();
  }

  private formatLargeTransferMessage(message: NotificationMessage): string {
    return `
<b>[Large Transfer] ${this.escapeHtml(message.title)}</b>

<b>Amount:</b> ${message.valueEth} ETH
<b>From:</b> <a href="${this.getExplorerAddress(message.explorerBase, message.from)}">${this.truncateAddress(message.from)}</a>
<b>To:</b> ${message.to ? `<a href="${this.getExplorerAddress(message.explorerBase, message.to)}">${this.truncateAddress(message.to)}</a>` : 'N/A'}

<a href="${message.explorerTxUrl}">View on Explorer</a>
    `.trim();
  }

  private formatContractDeployMessage(message: NotificationMessage): string {
    return `
<b>[Deploy] ${this.escapeHtml(message.title)}</b>

<b>Deployer:</b> <a href="${this.getExplorerAddress(message.explorerBase, message.from)}">${this.truncateAddress(message.from)}</a>
<b>Contract:</b> ${message.deployedAddress ? `<a href="${this.getExplorerAddress(message.explorerBase, message.deployedAddress)}">${this.truncateAddress(message.deployedAddress)}</a>` : 'Pending'}

<a href="${message.explorerTxUrl}">View on Explorer</a>
    `.trim();
  }

  private formatGasAlertMessage(message: NotificationMessage): string {
    return `
<b>[Gas Alert] ${this.escapeHtml(message.title)}</b>

<b>Current Gas:</b> ${message.gasGwei} gwei
<b>Threshold:</b> ${message.gasThreshold} gwei

Gas prices are elevated. Consider waiting for lower fees.
    `.trim();
  }

  private formatArgs(args: Record<string, any>): string {
    const entries = Object.entries(args);
    if (entries.length === 0) {
      return '<i>No arguments</i>';
    }

    return entries.map(([key, value]) => {
      const formattedValue = typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
      const truncatedValue = formattedValue.length > 80
        ? formattedValue.slice(0, 77) + '...'
        : formattedValue;
      return `  - <b>${this.escapeHtml(key)}:</b> <code>${this.escapeHtml(truncatedValue)}</code>`;
    }).join('\n');
  }

  private truncateAddress(address: string): string {
    if (!address || address.length < 10) return address || 'N/A';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  private getExplorerAddress(explorerBase: string, address: string): string {
    return `${explorerBase}/address/${address}`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
