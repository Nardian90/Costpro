import localforage from 'localforage';
import { v4 as uuidv4 } from 'uuid';
import { syncOperationSchema, type syncOperationSchema as SyncOperation } from '@/validation/schemas';
import { z } from 'zod';

type SyncOperationType = z.infer<typeof syncOperationSchema>;

const SYNC_QUEUE_KEY = 'sync_queue';
const OFFLINE_SNAPSHOT_KEY = 'offline_snapshot';

// Configure localforage
localforage.config({
  name: 'CostPro',
  storeName: 'offline_data',
});


// Fallback in-memory storage for offline queue if IndexedDB fails
const memoryQueue: Record<string, any> = {};

const safeLocalForage = {
  getItem: async <T>(key: string): Promise<T | null> => {
    try {
      return await Promise.race([
        safeLocalForage.getItem<T>(key),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('LocalForage Timeout')), 3000))
      ]);
    } catch (e) {
      console.warn('LocalForage getItem failed, using memory:', e);
      return (memoryQueue[key] as T) || null;
    }
  },
  setItem: async <T>(key: string, value: T): Promise<T> => {
    try {
      return await safeLocalForage.setItem(key, value);
    } catch (e) {
      console.warn('LocalForage setItem failed, using memory:', e);
      memoryQueue[key] = value;
      return value;
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await safeLocalForage.removeItem(key);
    } catch (e) {
      console.warn('LocalForage removeItem failed, using memory:', e);
      delete memoryQueue[key];
    }
  }
};

export const offlineStorage = {
  /**
   * Add an operation to the sync queue
   */
  async addToQueue(operation: Omit<SyncOperationType, 'id' | 'status' | 'attempts' | 'createdAt' | 'clientClock'>): Promise<SyncOperationType> {
    const queue = await this.getQueue();

    const newOp: SyncOperationType = {
      ...operation,
      id: uuidv4(),
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
      clientClock: Date.now(),
    };

    // Validate before saving
    syncOperationSchema.parse(newOp);

    queue.push(newOp);
    await safeLocalForage.setItem(SYNC_QUEUE_KEY, queue);
    return newOp;
  },

  /**
   * Get all operations in the queue
   */
  async getQueue(): Promise<SyncOperationType[]> {
    const queue = await safeLocalForage.getItem<SyncOperationType[]>(SYNC_QUEUE_KEY);
    return queue || [];
  },

  /**
   * Get pending operations
   */
  async getPendingOperations(): Promise<SyncOperationType[]> {
    const queue = await this.getQueue();
    return queue.filter(op => op.status === 'pending' || op.status === 'failed');
  },

  /**
   * Update an operation
   */
  async updateOperation(idempotencyKey: string, updates: Partial<SyncOperationType>): Promise<void> {
    const queue = await this.getQueue();
    const index = queue.findIndex(op => op.idempotencyKey === idempotencyKey);

    if (index !== -1) {
      queue[index] = { ...queue[index], ...updates };
      await safeLocalForage.setItem(SYNC_QUEUE_KEY, queue);
    }
  },

  /**
   * Update an operation status
   */
  async updateOperationStatus(idempotencyKey: string, status: SyncOperationType['status'], lastError?: string): Promise<void> {
    const queue = await this.getQueue();
    const index = queue.findIndex(op => op.idempotencyKey === idempotencyKey);

    if (index !== -1) {
      queue[index].status = status;
      if (status === 'failed') {
        queue[index].attempts += 1;
        queue[index].lastError = lastError;
      }
      await safeLocalForage.setItem(SYNC_QUEUE_KEY, queue);
    }
  },

  /**
   * Remove synced operations from the queue
   */
  async removeSyncedOperations(): Promise<void> {
    const queue = await this.getQueue();
    const filteredQueue = queue.filter(op => op.status !== 'synced');
    await safeLocalForage.setItem(SYNC_QUEUE_KEY, filteredQueue);
  },

  /**
   * Save an offline snapshot of data (e.g., product list)
   */
  async saveSnapshot(key: string, data: any): Promise<void> {
    const snapshots = await safeLocalForage.getItem<Record<string, any>>(OFFLINE_SNAPSHOT_KEY) || {};
    snapshots[key] = {
      data,
      timestamp: Date.now(),
    };
    await safeLocalForage.setItem(OFFLINE_SNAPSHOT_KEY, snapshots);
  },

  /**
   * Get an offline snapshot
   */
  async getSnapshot(key: string): Promise<any | null> {
    const snapshots = await safeLocalForage.getItem<Record<string, any>>(OFFLINE_SNAPSHOT_KEY);
    return snapshots?.[key]?.data || null;
  },

  /**
   * Clear all sync data
   */
  async clearAll(): Promise<void> {
    await safeLocalForage.removeItem(SYNC_QUEUE_KEY);
    await safeLocalForage.removeItem(OFFLINE_SNAPSHOT_KEY);
  }
};
