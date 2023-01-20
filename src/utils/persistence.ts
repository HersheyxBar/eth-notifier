import * as fs from 'fs';
import * as path from 'path';

export interface PersistedState {
  lastBlockNumber: number;
  lastTimestamp: number;
  pendingNotifications: PendingNotification[];
  seenTransactions: Array<[string, number]>;
}

export interface PendingNotification {
  id: string;
  payload: any;
  attempts: number;
  createdAt: number;
}

const DEFAULT_STATE: PersistedState = {
  lastBlockNumber: 0,
  lastTimestamp: 0,
  pendingNotifications: [],
  seenTransactions: []
};

export class StatePersistence {
  private filePath: string;
  private state: PersistedState;
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private readonly saveDebounceMs: number = 5000;

  constructor(dataDir: string = '.data') {
    const dir = path.resolve(process.cwd(), dataDir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.filePath = path.join(dir, 'state.json');
    this.state = this.load();
  }

  private load(): PersistedState {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(content);
        return { ...DEFAULT_STATE, ...parsed };
      }
    } catch (error) {
      console.warn('[Persistence] Failed to load state, using defaults:', error);
    }
    return { ...DEFAULT_STATE };
  }

  private saveImmediate(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
    } catch (error) {
      console.error('[Persistence] Failed to save state:', error);
    }
  }

  save(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => {
      this.saveImmediate();
      this.saveDebounceTimer = null;
    }, this.saveDebounceMs);
  }

  forceSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    this.saveImmediate();
  }

  getLastBlockNumber(): number {
    return this.state.lastBlockNumber;
  }

  setLastBlockNumber(blockNumber: number): void {
    if (blockNumber > this.state.lastBlockNumber) {
      this.state.lastBlockNumber = blockNumber;
      this.state.lastTimestamp = Date.now();
      this.save();
    }
  }

  addPendingNotification(notification: PendingNotification): void {
    this.state.pendingNotifications.push(notification);
    this.save();
  }

  removePendingNotification(id: string): void {
    this.state.pendingNotifications = this.state.pendingNotifications.filter(
      n => n.id !== id
    );
    this.save();
  }

  getPendingNotifications(): PendingNotification[] {
    return [...this.state.pendingNotifications];
  }

  updatePendingNotification(id: string, updates: Partial<PendingNotification>): void {
    const notification = this.state.pendingNotifications.find(n => n.id === id);
    if (notification) {
      Object.assign(notification, updates);
      this.save();
    }
  }

  setSeenTransactions(seen: Map<string, number>): void {
    this.state.seenTransactions = Array.from(seen.entries());
    this.save();
  }

  getSeenTransactions(): Map<string, number> {
    return new Map(this.state.seenTransactions);
  }

  getState(): PersistedState {
    return { ...this.state };
  }

  cleanup(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
  }
}
