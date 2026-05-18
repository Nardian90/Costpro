import { describe, it, expect, beforeEach, vi } from 'vitest';
import { offlineStorage } from '../offline-storage';
import localforage from 'localforage';

vi.mock('localforage', () => {
  const store = new Map();
  return {
    default: {
      config: vi.fn(),
      setItem: vi.fn((key, val) => {
        store.set(key, val);
        return Promise.resolve(val);
      }),
      getItem: vi.fn((key) => Promise.resolve(store.get(key))),
      removeItem: vi.fn((key) => {
        store.delete(key);
        return Promise.resolve();
      }),
    }
  };
});

describe('Enhanced Offline Storage', () => {
  beforeEach(async () => {
    await offlineStorage.clearAll();
    vi.clearAllMocks();
  });

  it('should save and retrieve snapshots', async () => {
    const data = [{ id: 1, name: 'Product 1' }];
    await offlineStorage.saveSnapshot('test_key', data);

    const retrieved = await offlineStorage.getSnapshot('test_key');
    expect(retrieved).toEqual(data);
  });

  it('should add operations to queue with correct priority', async () => {
    await offlineStorage.addToQueue({
      entity: 'inventory_adjust',
      operationType: 'CREATE',
      payload: { amount: 10 },
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440001'
    });

    await offlineStorage.addToQueue({
      entity: 'sale',
      operationType: 'CREATE',
      payload: { total: 100 },
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440002'
    });

    const pending = await offlineStorage.getPendingOperations();
    expect(pending[0].entity).toBe('sale'); // Sale has priority 1
    expect(pending[1].entity).toBe('inventory_adjust'); // Adjust has priority 4
  });

  it('should handle failed status and increment attempts', async () => {
    const op = await offlineStorage.addToQueue({
      entity: 'sale',
      operationType: 'CREATE',
      payload: {},
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440003'
    });

    await offlineStorage.updateOperationStatus(op.idempotencyKey, 'failed', 'Network error');

    const queue = await offlineStorage.getQueue();
    expect(queue[0].status).toBe('failed');
    expect(queue[0].attempts).toBe(1);
    expect(queue[0].lastError).toBe('Network error');
  });
});
