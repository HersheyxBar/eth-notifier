import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StatePersistence } from '../src/utils/persistence';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eth-notifier-test-'));
}

function cleanupDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
}

describe('StatePersistence', () => {
  it('should initialize with default state', () => {
    const testDir = createTempDir();
    try {
      const persistence = new StatePersistence(testDir);
      expect(persistence.getLastBlockNumber()).toBe(0);
      expect(persistence.getPendingNotifications()).toEqual([]);
      expect(persistence.getSeenTransactions().size).toBe(0);
      persistence.cleanup();
    } finally {
      cleanupDir(testDir);
    }
  });

  it('should update last block number', () => {
    const testDir = createTempDir();
    try {
      const persistence = new StatePersistence(testDir);

      persistence.setLastBlockNumber(12345);
      expect(persistence.getLastBlockNumber()).toBe(12345);

      // Should not decrease
      persistence.setLastBlockNumber(12000);
      expect(persistence.getLastBlockNumber()).toBe(12345);

      persistence.cleanup();
    } finally {
      cleanupDir(testDir);
    }
  });

  it('should add pending notification', () => {
    const testDir = createTempDir();
    try {
      const persistence = new StatePersistence(testDir);

      const initialCount = persistence.getPendingNotifications().length;
      persistence.addPendingNotification({
        id: 'test-add',
        payload: { message: 'test' },
        attempts: 1,
        createdAt: Date.now()
      });

      expect(persistence.getPendingNotifications().length).toBe(initialCount + 1);
      persistence.cleanup();
    } finally {
      cleanupDir(testDir);
    }
  });

  it('should set and get seen transactions', () => {
    const testDir = createTempDir();
    try {
      const persistence = new StatePersistence(testDir);

      const seen = new Map<string, number>();
      seen.set('tx1', 1000);
      seen.set('tx2', 2000);

      persistence.setSeenTransactions(seen);

      const retrieved = persistence.getSeenTransactions();
      expect(retrieved.get('tx1')).toBe(1000);
      expect(retrieved.get('tx2')).toBe(2000);

      persistence.cleanup();
    } finally {
      cleanupDir(testDir);
    }
  });
});
