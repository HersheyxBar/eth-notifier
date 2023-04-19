import axios from 'axios';
import { NotificationChannel, NotificationMessage } from '../types';

export class DiscordNotifier implements NotificationChannel {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    if (!webhookUrl) {
      throw new Error('Discord webhook URL is required');
    }
    this.webhookUrl = webhookUrl;
  }

  async send(message: NotificationMessage): Promise<void> {
    const embed = this.createEmbed(message);

    try {
      await axios.post(this.webhookUrl, {
        embeds: [embed]
      });
      console.log(`[Discord] Notification sent for tx: ${message.txHash || 'N/A'}`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`[Discord] Failed to send notification: ${error.message}`);
        if (error.response) {
          console.error(`[Discord] Response: ${JSON.stringify(error.response.data)}`);
        }
      }
      throw error;
    }
  }

  private createEmbed(message: NotificationMessage): object {
    switch (message.sourceType) {
      case 'contract':
        return this.createContractEmbed(message);
      case 'wallet':
        return this.createWalletEmbed(message);
      case 'token_transfer':
        return this.createTokenTransferEmbed(message);
      case 'nft_transfer':
        return this.createNftTransferEmbed(message);
      case 'dex_swap':
        return this.createDexSwapEmbed(message);
      case 'large_transfer':
        return this.createLargeTransferEmbed(message);
      case 'contract_deploy':
        return this.createContractDeployEmbed(message);
      case 'gas_alert':
        return this.createGasAlertEmbed(message);
      default:
        return this.createContractEmbed(message);
    }
  }

  private createContractEmbed(message: NotificationMessage): object {
    return {
      title: `[Alert] ${message.title}`,
      color: 0x627eea,
      fields: [
        {
          name: 'Contract',
          value: `[${message.contractName}](${this.getExplorerAddress(message.explorerBase, message.contractAddress || '')})`,
          inline: true
        },
        {
          name: 'Function',
          value: `\`${message.functionName}\``,
          inline: true
        },
        {
          name: 'From',
          value: `[\`${this.truncateAddress(message.from)}\`](${this.getExplorerAddress(message.explorerBase, message.from)})`,
          inline: true
        },
        {
          name: 'Value',
          value: `${message.value} ETH`,
          inline: true
        },
        {
          name: 'Arguments',
          value: this.formatArgs(message.args || {}),
          inline: false
        },
        {
          name: 'Transaction',
          value: `[View on Explorer](${message.explorerTxUrl})`,
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'ETH Notifier' }
    };
  }

  private createWalletEmbed(message: NotificationMessage): object {
    return {
      title: `[Wallet] ${message.title}`,
      color: 0xf5a623,
      fields: [
        {
          name: 'Wallet',
          value: `[${message.contractName}](${this.getExplorerAddress(message.explorerBase, message.from)})`,
          inline: true
        },
        {
          name: 'Address',
          value: `\`${this.truncateAddress(message.from)}\``,
          inline: true
        },
        {
          name: 'Target',
          value: message.targetAddress
            ? `[\`${this.truncateAddress(message.targetAddress)}\`](${this.getExplorerAddress(message.explorerBase, message.targetAddress)})`
            : '_(contract creation)_',
          inline: true
        },
        {
          name: 'Value',
          value: `${message.value} ETH`,
          inline: true
        },
        {
          name: 'Method',
          value: `\`${message.functionName}\``,
          inline: true
        },
        {
          name: 'Transaction',
          value: `[View on Explorer](${message.explorerTxUrl})`,
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'ETH Notifier - Wallet Watch' }
    };
  }

  private createTokenTransferEmbed(message: NotificationMessage): object {
    return {
      title: `[Token] ${message.title}`,
      color: 0x00d395,
      fields: [
        {
          name: 'Token',
          value: `${message.tokenSymbol}`,
          inline: true
        },
        {
          name: 'Amount',
          value: `${message.tokenAmount}`,
          inline: true
        },
        {
          name: 'From',
          value: `[\`${this.truncateAddress(message.from)}\`](${this.getExplorerAddress(message.explorerBase, message.from)})`,
          inline: true
        },
        {
          name: 'To',
          value: message.to
            ? `[\`${this.truncateAddress(message.to)}\`](${this.getExplorerAddress(message.explorerBase, message.to)})`
            : 'N/A',
          inline: true
        },
        {
          name: 'Transaction',
          value: `[View on Explorer](${message.explorerTxUrl})`,
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'ETH Notifier - Token Transfer' }
    };
  }

  private createNftTransferEmbed(message: NotificationMessage): object {
    return {
      title: `[NFT] ${message.title}`,
      color: 0xff6b6b,
      fields: [
        {
          name: 'Collection',
          value: `[${message.collectionName}](${this.getExplorerAddress(message.explorerBase, message.contractAddress || '')})`,
          inline: true
        },
        {
          name: 'Token ID',
          value: `#${message.tokenId}`,
          inline: true
        },
        {
          name: 'From',
          value: `[\`${this.truncateAddress(message.from)}\`](${this.getExplorerAddress(message.explorerBase, message.from)})`,
          inline: true
        },
        {
          name: 'To',
          value: message.to
            ? `[\`${this.truncateAddress(message.to)}\`](${this.getExplorerAddress(message.explorerBase, message.to)})`
            : 'N/A',
          inline: true
        },
        {
          name: 'Transaction',
          value: `[View on Explorer](${message.explorerTxUrl})`,
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'ETH Notifier - NFT Transfer' }
    };
  }

  private createDexSwapEmbed(message: NotificationMessage): object {
    return {
      title: `[DEX] ${message.title}`,
      color: 0xff007a,
      fields: [
        {
          name: 'DEX',
          value: message.dexName || 'Unknown',
          inline: true
        },
        {
          name: 'Trader',
          value: `[\`${this.truncateAddress(message.from)}\`](${this.getExplorerAddress(message.explorerBase, message.from)})`,
          inline: true
        },
        {
          name: 'Swap',
          value: message.tokenIn && message.tokenOut
            ? `${message.tokenIn.amount} ${message.tokenIn.symbol} -> ${message.tokenOut.amount} ${message.tokenOut.symbol}`
            : 'Unknown',
          inline: false
        },
        {
          name: 'Transaction',
          value: `[View on Explorer](${message.explorerTxUrl})`,
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'ETH Notifier - DEX Swap' }
    };
  }

  private createLargeTransferEmbed(message: NotificationMessage): object {
    return {
      title: `[Large Transfer] ${message.title}`,
      color: 0xffd700,
      fields: [
        {
          name: 'Amount',
          value: `${message.valueEth} ETH`,
          inline: true
        },
        {
          name: 'From',
          value: `[\`${this.truncateAddress(message.from)}\`](${this.getExplorerAddress(message.explorerBase, message.from)})`,
          inline: true
        },
        {
          name: 'To',
          value: message.to
            ? `[\`${this.truncateAddress(message.to)}\`](${this.getExplorerAddress(message.explorerBase, message.to)})`
            : 'N/A',
          inline: true
        },
        {
          name: 'Transaction',
          value: `[View on Explorer](${message.explorerTxUrl})`,
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'ETH Notifier - Large Transfer' }
    };
  }

  private createContractDeployEmbed(message: NotificationMessage): object {
    return {
      title: `[Deploy] ${message.title}`,
      color: 0x9b59b6,
      fields: [
        {
          name: 'Deployer',
          value: `[\`${this.truncateAddress(message.from)}\`](${this.getExplorerAddress(message.explorerBase, message.from)})`,
          inline: true
        },
        {
          name: 'Contract',
          value: message.deployedAddress
            ? `[\`${this.truncateAddress(message.deployedAddress)}\`](${this.getExplorerAddress(message.explorerBase, message.deployedAddress)})`
            : 'Pending',
          inline: true
        },
        {
          name: 'Transaction',
          value: `[View on Explorer](${message.explorerTxUrl})`,
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'ETH Notifier - Contract Deploy' }
    };
  }

  private createGasAlertEmbed(message: NotificationMessage): object {
    return {
      title: `[Gas] ${message.title}`,
      color: 0xe74c3c,
      fields: [
        {
          name: 'Current Gas',
          value: `${message.gasGwei} gwei`,
          inline: true
        },
        {
          name: 'Threshold',
          value: `${message.gasThreshold} gwei`,
          inline: true
        }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'ETH Notifier - Gas Alert' }
    };
  }

  private truncateAddress(address: string): string {
    if (!address || address.length < 10) return address || 'N/A';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  private getExplorerAddress(explorerBase: string, address: string): string {
    return `${explorerBase}/address/${address}`;
  }

  private formatArgs(args: Record<string, any>): string {
    const entries = Object.entries(args);
    if (entries.length === 0) {
      return '_No arguments_';
    }

    const lines = entries.map(([key, value]) => {
      const formattedValue = typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
      const truncatedValue = formattedValue.length > 100
        ? formattedValue.slice(0, 97) + '...'
        : formattedValue;
      return `**${key}**: \`${truncatedValue}\``;
    });

    return lines.join('\n');
  }
}
