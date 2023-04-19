import {
  DecodedTransaction,
  NotificationChannel,
  NotificationConfig,
  NotificationMessage,
  EventSourceType
} from '../types';
import { DiscordNotifier } from './discord';
import { TelegramNotifier } from './telegram';
import { ENV, getExplorerBase } from '../config';
import { NotificationRateLimiter } from '../utils/rate-limiter';
import { StatePersistence, PendingNotification } from '../utils/persistence';

interface ChannelWithName {
  name: string;
  channel: NotificationChannel;
}

export class NotificationDispatcher {
  private channels: ChannelWithName[] = [];
  private rateLimiter: NotificationRateLimiter;
  private persistence?: StatePersistence;
  private retryQueue: Map<string, PendingNotification> = new Map();
  private retryInterval?: NodeJS.Timeout;

  constructor(config: NotificationConfig, persistence?: StatePersistence) {
    this.rateLimiter = new NotificationRateLimiter();
    this.persistence = persistence;

    if (config.discord?.enabled) {
      const webhookUrl = config.discord.webhookUrl || ENV.DISCORD_WEBHOOK_URL;
      if (webhookUrl) {
        this.channels.push({
          name: 'discord',
          channel: new DiscordNotifier(webhookUrl)
        });
        console.log('[Dispatcher] Discord notifications enabled');
      } else {
        console.warn('[Dispatcher] Discord enabled but DISCORD_WEBHOOK_URL not set');
      }
    }

    if (config.telegram?.enabled) {
      const botToken = ENV.TELEGRAM_BOT_TOKEN;
      const chatId = config.telegram.chatId;
      if (botToken && chatId) {
        this.channels.push({
          name: 'telegram',
          channel: new TelegramNotifier(botToken, chatId)
        });
        console.log('[Dispatcher] Telegram notifications enabled');
      } else {
        console.warn('[Dispatcher] Telegram enabled but TELEGRAM_BOT_TOKEN or chatId not set');
      }
    }

    if (this.channels.length === 0) {
      console.warn('[Dispatcher] No notification channels configured!');
    }

    // Load pending notifications from persistence
    if (persistence) {
      const pending = persistence.getPendingNotifications();
      for (const notification of pending) {
        this.retryQueue.set(notification.id, notification);
      }
      if (pending.length > 0) {
        console.log(`[Dispatcher] Loaded ${pending.length} pending notifications for retry`);
      }
    }

    // Start retry processor
    this.startRetryProcessor();
  }

  private startRetryProcessor(): void {
    this.retryInterval = setInterval(() => {
      this.processRetryQueue();
    }, 30000); // Process every 30 seconds
  }

  private async processRetryQueue(): Promise<void> {
    for (const [id, notification] of this.retryQueue) {
      if (notification.attempts >= 5) {
        console.warn(`[Dispatcher] Giving up on notification ${id} after 5 attempts`);
        this.retryQueue.delete(id);
        this.persistence?.removePendingNotification(id);
        continue;
      }

      try {
        const message = notification.payload as NotificationMessage;
        await this.sendToAllChannels(message);
        this.retryQueue.delete(id);
        this.persistence?.removePendingNotification(id);
        console.log(`[Dispatcher] Successfully sent retry notification ${id}`);
      } catch (error) {
        notification.attempts++;
        this.persistence?.updatePendingNotification(id, { attempts: notification.attempts });
      }
    }
  }

  async dispatch(decoded: DecodedTransaction): Promise<void> {
    const message = this.createMessage(decoded);
    const notificationId = `${message.txHash}-${Date.now()}`;

    try {
      await this.sendToAllChannels(message);
    } catch (error) {
      console.error('[Dispatcher] Failed to send notification, queuing for retry:', error);

      const pending: PendingNotification = {
        id: notificationId,
        payload: message,
        attempts: 1,
        createdAt: Date.now()
      };

      this.retryQueue.set(notificationId, pending);
      this.persistence?.addPendingNotification(pending);
    }
  }

  private async sendToAllChannels(message: NotificationMessage): Promise<void> {
    const results = await Promise.allSettled(
      this.channels.map(async ({ name, channel }) => {
        await this.rateLimiter.acquire(name);
        return channel.send(message);
      })
    );

    let allFailed = true;
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allFailed = false;
      } else {
        console.error('[Dispatcher] Channel failed:', result.reason);
      }
    }

    if (allFailed && this.channels.length > 0) {
      throw new Error('All notification channels failed');
    }
  }

  private createMessage(decoded: DecodedTransaction): NotificationMessage {
    const explorerBase = getExplorerBase(ENV.NETWORK);
    const baseMessage = {
      explorerBase,
      explorerTxUrl: decoded.transactionHash
        ? `${explorerBase}/tx/${decoded.transactionHash}`
        : explorerBase,
      txHash: decoded.transactionHash,
      from: decoded.from,
      to: decoded.to,
      value: decoded.value,
      sourceType: decoded.sourceType
    };

    switch (decoded.sourceType) {
      case 'contract':
        return {
          ...baseMessage,
          title: `${decoded.functionName}() called on ${decoded.contractName}`,
          contractName: decoded.contractName,
          contractAddress: decoded.contractAddress,
          functionName: decoded.functionName,
          args: decoded.functionArgs
        };

      case 'wallet':
        return {
          ...baseMessage,
          title: `${decoded.walletName} initiated transaction`,
          contractName: decoded.walletName,
          contractAddress: decoded.from,
          functionName: decoded.functionName,
          args: decoded.functionArgs,
          targetAddress: decoded.to,
          walletName: decoded.walletName
        };

      case 'token_transfer':
        return {
          ...baseMessage,
          title: `Token Transfer: ${decoded.amountFormatted} ${decoded.tokenSymbol}`,
          tokenSymbol: decoded.tokenSymbol,
          tokenAmount: decoded.amountFormatted,
          contractAddress: decoded.tokenAddress
        };

      case 'nft_transfer':
        return {
          ...baseMessage,
          title: `NFT Transfer: ${decoded.collectionName} #${decoded.tokenId}`,
          collectionName: decoded.collectionName,
          tokenId: decoded.tokenId,
          contractAddress: decoded.contractAddress
        };

      case 'dex_swap':
        return {
          ...baseMessage,
          title: `DEX Swap on ${decoded.dexName}`,
          dexName: decoded.dexName,
          tokenIn: decoded.tokenIn,
          tokenOut: decoded.tokenOut,
          contractAddress: decoded.dexAddress
        };

      case 'large_transfer':
        return {
          ...baseMessage,
          title: `Large Transfer: ${decoded.valueEth} ETH`,
          valueEth: decoded.valueEth
        };

      case 'contract_deploy':
        return {
          ...baseMessage,
          title: `New Contract Deployed`,
          deployedAddress: decoded.contractAddress,
          contractAddress: decoded.contractAddress
        };

      case 'gas_alert':
        return {
          ...baseMessage,
          title: `Gas Price Alert: ${decoded.currentGwei} gwei`,
          gasGwei: decoded.currentGwei,
          gasThreshold: decoded.thresholdGwei
        };

      default:
        return {
          ...baseMessage,
          title: 'Unknown Event',
          sourceType: 'contract' as EventSourceType
        };
    }
  }

  getChannelCount(): number {
    return this.channels.length;
  }

  async stop(): Promise<void> {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
    }
  }
}
