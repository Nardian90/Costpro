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
    await localforage.setItem(SYNC_QUEUE_KEY, queue);
    return newOp;
  },

  /**
   * Get all operations in the queue
   */
  async getQueue(): Promise<SyncOperationType[]> {
    const queue = await localforage.getItem<SyncOperationType[]>(SYNC_QUEUE_KEY);
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
      await localforage.setItem(SYNC_QUEUE_KEY, queue);
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
      await localforage.setItem(SYNC_QUEUE_KEY, queue);
    }
  },

  /**
   * Remove synced operations from the queue
   */
  async removeSyncedOperations(): Promise<void> {
    const queue = await this.getQueue();
    const filteredQueue = queue.filter(op => op.status !== 'synced');
    await localforage.setItem(SYNC_QUEUE_KEY, filteredQueue);
  },

  /**
   * Save an offline snapshot of data (e.g., product list)
   */
  async saveSnapshot(key: string, data: any): Promise<void> {
    const snapshots = await localforage.getItem<Record<string, any>>(OFFLINE_SNAPSHOT_KEY) || {};
    snapshots[key] = {
      data,
      timestamp: Date.now(),
    };
    await localforage.setItem(OFFLINE_SNAPSHOT_KEY, snapshots);
  },

  /**
   * Get an offline snapshot
   */
  async getSnapshot(key: string): Promise<any | null> {
    const snapshots = await localforage.getItem<Record<string, any>>(OFFLINE_SNAPSHOT_KEY);
    return snapshots?.[key]?.data || null;
  },

  /**
   * Clear all sync data
   */
  async clearAll(): Promise<void> {
    await localforage.removeItem(SYNC_QUEUE_KEY);
    await localforage.removeItem(OFFLINE_SNAPSHOT_KEY);
  }
};
