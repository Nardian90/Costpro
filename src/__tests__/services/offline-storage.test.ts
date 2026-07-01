import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock localforage with an in-memory store
const mockStore: Record<string, any> = {};
vi.mock('localforage', () => ({
  default: {
    config: vi.fn(),
    getItem: vi.fn(async (key: string) => mockStore[key] ?? null),
    setItem: vi.fn(async (key: string, value: any) => { mockStore[key] = value; return value; }),
    removeItem: vi.fn(async (key: string) => { delete mockStore[key]; }),
  },
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-' + Math.random().toString(36).slice(2, 8)),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { offlineStorage } from '@/lib/sync/offline-storage';

describe('offlineStorage', () => {
  beforeEach(() => {
    // Clear in-memory store between tests
    Object.keys(mockStore).forEach(k => delete mockStore[k]);
    vi.clearAllMocks();
  });

  // ─── addToQueue ────────────────────────────────────────────────────
  describe('addToQueue', () => {
    it('adds operation to queue with generated id, status pending, attempts 0', async () => {
      const op = await offlineStorage.addToQueue({
        idempotencyKey: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        operationType: 'CREATE',
        entity: 'sale',
        payload: { total: 100 },
      });

      expect(op.id).toBeDefined();
      expect(op.status).toBe('pending');
      expect(op.attempts).toBe(0);
      expect(op.createdAt).toBeDefined();
      expect(op.clientClock).toBeDefined();
    });

    it('stores the operation in localforage', async () => {
      await offlineStorage.addToQueue({
        idempotencyKey: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        operationType: 'CREATE',
        entity: 'sale',
        payload: { total: 50 },
      });

      const queue = await offlineStorage.getQueue();
      expect(queue.length).toBe(1);
      expect(queue[0].entity).toBe('sale');
    });
  });

  // ─── getQueue ──────────────────────────────────────────────────────
  describe('getQueue', () => {
    it('returns empty array when no queue exists', async () => {
      const queue = await offlineStorage.getQueue();
      expect(queue).toEqual([]);
    });

    it('returns all operations in queue', async () => {
      await offlineStorage.addToQueue({
        idempotencyKey: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        operationType: 'CREATE', entity: 'sale', payload: {},
      });
      await offlineStorage.addToQueue({
        idempotencyKey: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        operationType: 'CREATE', entity: 'reception', payload: {},
      });

      const queue = await offlineStorage.getQueue();
      expect(queue.length).toBe(2);
    });
  });

  // ─── getPendingOperations ──────────────────────────────────────────
  describe('getPendingOperations', () => {
    it('returns only pending and failed operations', async () => {
      await offlineStorage.addToQueue({
        idempotencyKey: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        operationType: 'CREATE', entity: 'sale', payload: {},
      });
      await offlineStorage.addToQueue({
        idempotencyKey: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        operationType: 'CREATE', entity: 'sale', payload: {},
      });

      // Mark second as synced
      await offlineStorage.updateOperationStatus('ffffffff-ffff-ffff-ffff-ffffffffffff', 'synced');

      const pending = await offlineStorage.getPendingOperations();
      expect(pending.length).toBe(1);
      expect(pending[0].status).toBe('pending');
    });

    it('sorts by priority (sale before reception before inventory)', async () => {
      await offlineStorage.addToQueue({
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
        operationType: 'CREATE', entity: 'inventory_adjust', payload: {},
      });
      await offlineStorage.addToQueue({
        idempotencyKey: '22222222-2222-2222-2222-222222222222',
        operationType: 'CREATE', entity: 'sale', payload: {},
      });
      await offlineStorage.addToQueue({
        idempotencyKey: '33333333-3333-3333-3333-333333333333',
        operationType: 'CREATE', entity: 'reception', payload: {},
      });

      const pending = await offlineStorage.getPendingOperations();
      // sale (priority 1) first, reception (priority 2) second, inventory_adjust (priority 4) third
      expect(pending[0].entity).toBe('sale');
      expect(pending[1].entity).toBe('reception');
      expect(pending[2].entity).toBe('inventory_adjust');
    });
  });

  // ─── updateOperationStatus ─────────────────────────────────────────
  describe('updateOperationStatus', () => {
    it('updates status to synced', async () => {
      const key = '44444444-4444-4444-4444-444444444444';
      await offlineStorage.addToQueue({
        idempotencyKey: key, operationType: 'CREATE', entity: 'sale', payload: {},
      });

      await offlineStorage.updateOperationStatus(key, 'synced');
      const queue = await offlineStorage.getQueue();
      expect(queue[0].status).toBe('synced');
    });

    it('increments attempts when status is failed', async () => {
      const key = '55555555-5555-5555-5555-555555555555';
      await offlineStorage.addToQueue({
        idempotencyKey: key, operationType: 'CREATE', entity: 'sale', payload: {},
      });

      await offlineStorage.updateOperationStatus(key, 'failed', 'Network error');
      await offlineStorage.updateOperationStatus(key, 'failed', 'Timeout');

      const queue = await offlineStorage.getQueue();
      expect(queue[0].status).toBe('failed');
      expect(queue[0].attempts).toBe(2);
      expect(queue[0].lastError).toBe('Timeout');
    });

    it('does nothing when idempotencyKey not found', async () => {
      await offlineStorage.updateOperationStatus('nonexistent-key', 'synced');
      // Should not throw
      const queue = await offlineStorage.getQueue();
      expect(queue.length).toBe(0);
    });
  });

  // ─── getFailedOperations ───────────────────────────────────────────
  describe('getFailedOperations', () => {
    it('returns operations with failed status and attempts >= 3', async () => {
      const key1 = '66666666-6666-6666-6666-666666666666';
      const key2 = '77777777-7777-7777-7777-777777777777';
      await offlineStorage.addToQueue({
        idempotencyKey: key1, operationType: 'CREATE', entity: 'sale', payload: {},
      });
      await offlineStorage.addToQueue({
        idempotencyKey: key2, operationType: 'CREATE', entity: 'sale', payload: {},
      });

      // Fail key1 three times
      await offlineStorage.updateOperationStatus(key1, 'failed');
      await offlineStorage.updateOperationStatus(key1, 'failed');
      await offlineStorage.updateOperationStatus(key1, 'failed');

      // Fail key2 only once
      await offlineStorage.updateOperationStatus(key2, 'failed');

      const failed = await offlineStorage.getFailedOperations();
      expect(failed.length).toBe(1);
      expect(failed[0].idempotencyKey).toBe(key1);
    });
  });

  // ─── getFailedCount ────────────────────────────────────────────────
  describe('getFailedCount', () => {
    it('returns 0 when no failed operations', async () => {
      expect(await offlineStorage.getFailedCount()).toBe(0);
    });

    it('returns count of permanently failed operations', async () => {
      const key = '88888888-8888-8888-8888-888888888888';
      await offlineStorage.addToQueue({
        idempotencyKey: key, operationType: 'CREATE', entity: 'sale', payload: {},
      });
      for (let i = 0; i < 3; i++) {
        await offlineStorage.updateOperationStatus(key, 'failed');
      }
      expect(await offlineStorage.getFailedCount()).toBe(1);
    });
  });

  // ─── removeSyncedOperations ────────────────────────────────────────
  describe('removeSyncedOperations', () => {
    it('removes only synced operations, keeps pending', async () => {
      const key1 = '99999999-9999-9999-9999-999999999999';
      const key2 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      await offlineStorage.addToQueue({
        idempotencyKey: key1, operationType: 'CREATE', entity: 'sale', payload: {},
      });
      await offlineStorage.addToQueue({
        idempotencyKey: key2, operationType: 'CREATE', entity: 'sale', payload: {},
      });

      await offlineStorage.updateOperationStatus(key1, 'synced');
      await offlineStorage.removeSyncedOperations();

      const queue = await offlineStorage.getQueue();
      expect(queue.length).toBe(1);
      expect(queue[0].idempotencyKey).toBe(key2);
    });
  });

  // ─── Snapshots ─────────────────────────────────────────────────────
  describe('saveSnapshot / getSnapshot', () => {
    it('saves and retrieves snapshot data', async () => {
      await offlineStorage.saveSnapshot('products', [{ id: 'p1', name: 'Test' }]);

      const data = await offlineStorage.getSnapshot('products');
      expect(data).toEqual([{ id: 'p1', name: 'Test' }]);
    });

    it('returns null when snapshot does not exist', async () => {
      const data = await offlineStorage.getSnapshot('nonexistent');
      expect(data).toBeNull();
    });

    it('overwrites existing snapshot on re-save', async () => {
      await offlineStorage.saveSnapshot('products', [{ id: 'p1' }]);
      await offlineStorage.saveSnapshot('products', [{ id: 'p2' }]);

      const data = await offlineStorage.getSnapshot<{ id: string }[]>('products');
      expect(data).toEqual([{ id: 'p2' }]);
    });
  });

  // ─── clearAll ──────────────────────────────────────────────────────
  describe('clearAll', () => {
    it('removes all queue and snapshot data', async () => {
      await offlineStorage.addToQueue({
        idempotencyKey: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        operationType: 'CREATE', entity: 'sale', payload: {},
      });
      await offlineStorage.saveSnapshot('products', [{ id: 'p1' }]);

      await offlineStorage.clearAll();

      expect(await offlineStorage.getQueue()).toEqual([]);
      expect(await offlineStorage.getSnapshot('products')).toBeNull();
    });
  });

  // ─── updateOperation ───────────────────────────────────────────────
  describe('updateOperation', () => {
    it('merges updates into existing operation', async () => {
      const key = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      await offlineStorage.addToQueue({
        idempotencyKey: key, operationType: 'CREATE', entity: 'sale', payload: {},
      });

      await offlineStorage.updateOperation(key, { serverData: { serverId: 'srv-1' } });

      const queue = await offlineStorage.getQueue();
      expect(queue[0].serverData).toEqual({ serverId: 'srv-1' });
    });

    it('does nothing when idempotencyKey not found', async () => {
      await offlineStorage.updateOperation('nonexistent', { status: 'synced' });
      // Should not throw
      expect(true).toBe(true);
    });
  });
});
