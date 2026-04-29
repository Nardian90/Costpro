import { describe, it, expect, vi, beforeEach } from 'vitest';
import { offlineStorage } from '../offline-storage';
import localforage from 'localforage';

const VALID_IDEMPOTENCY_KEY = '11111111-1111-1111-1111-111111111111';
const VALID_IDEMPOTENCY_KEY_2 = '22222222-2222-2222-2222-222222222222';

// Mock localforage
vi.mock('localforage', () => {
  let store: Record<string, any> = {};
  return {
    default: {
      config: vi.fn(),
      getItem: vi.fn((key) => Promise.resolve(store[key])),
      setItem: vi.fn((key, val) => {
        store[key] = val;
        return Promise.resolve(val);
      }),
      removeItem: vi.fn((key) => {
        delete store[key];
        return Promise.resolve();
      }),
    },
    config: vi.fn(),
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
});

describe('offlineStorage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await offlineStorage.clearAll();
  });

  describe('addToQueue(operation)', () => {
    it('añade operación con status pending y clientClock con Date.now()', async () => {
      const op = {
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
        operationType: 'CREATE' as const,
        entity: 'sale',
        payload: { total: 100 },
      };

      const result = await offlineStorage.addToQueue(op);

      expect(result.status).toBe('pending');
      expect(result.clientClock).toBeGreaterThan(0);
      expect(result.id).toBeDefined();

      const queue = await offlineStorage.getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].idempotencyKey).toBe(VALID_IDEMPOTENCY_KEY);
    });
  });

  describe('getPendingOperations()', () => {
    it('devuelve solo operaciones con status pending o failed', async () => {
      await offlineStorage.addToQueue({ idempotencyKey: VALID_IDEMPOTENCY_KEY, operationType: 'CREATE', entity: 'sale', payload: {} });
      await offlineStorage.updateOperationStatus(VALID_IDEMPOTENCY_KEY, 'synced');
      await offlineStorage.addToQueue({ idempotencyKey: VALID_IDEMPOTENCY_KEY_2, operationType: 'CREATE', entity: 'sale', payload: {} });

      const pending = await offlineStorage.getPendingOperations();
      expect(pending).toHaveLength(1);
      expect(pending[0].idempotencyKey).toBe(VALID_IDEMPOTENCY_KEY_2);
    });

    it('ordena ventas antes que ajustes', async () => {
      const ops = [
        { idempotencyKey: '11111111-1111-1111-1111-111111111111', operationType: 'UPDATE' as const, entity: 'inventory_adjust', payload: {}, clientClock: 100 },
        { idempotencyKey: '22222222-2222-2222-2222-222222222222', operationType: 'CREATE' as const, entity: 'sale', payload: {}, clientClock: 200 },
        { idempotencyKey: '33333333-3333-3333-3333-333333333333', operationType: 'CREATE' as const, entity: 'transfer_create', payload: {}, clientClock: 300 },
      ];

      await localforage.setItem('sync_queue', ops.map(o => ({
        ...o,
        id: o.idempotencyKey,
        status: 'pending',
        attempts: 0,
        createdAt: new Date().toISOString(),
      })));

      const result = await offlineStorage.getPendingOperations();

      expect(result[0].entity).toBe('sale');             // Priority 1
      expect(result[1].entity).toBe('transfer_create');  // Priority 3
      expect(result[2].entity).toBe('inventory_adjust'); // Priority 4
    });
  });

  describe('updateOperationStatus(idempotencyKey, status)', () => {
    it('actualiza status a synced', async () => {
      await offlineStorage.addToQueue({ idempotencyKey: VALID_IDEMPOTENCY_KEY, operationType: 'CREATE', entity: 'sale', payload: {} });
      await offlineStorage.updateOperationStatus(VALID_IDEMPOTENCY_KEY, 'synced');

      const queue = await offlineStorage.getQueue();
      expect(queue[0].status).toBe('synced');
    });

    it('incrementa intentos en caso de fallo', async () => {
      await offlineStorage.addToQueue({ idempotencyKey: VALID_IDEMPOTENCY_KEY, operationType: 'CREATE', entity: 'sale', payload: {} });
      await offlineStorage.updateOperationStatus(VALID_IDEMPOTENCY_KEY, 'failed', 'Network Error');

      const queue = await offlineStorage.getQueue();
      expect(queue[0].status).toBe('failed');
      expect(queue[0].attempts).toBe(1);
      expect(queue[0].lastError).toBe('Network Error');
    });
  });

  describe('updateOperation', () => {
    it('actualiza campos arbitrarios de una operación', async () => {
      await offlineStorage.addToQueue({ idempotencyKey: VALID_IDEMPOTENCY_KEY, operationType: 'CREATE', entity: 'sale', payload: {} });
      await offlineStorage.updateOperation(VALID_IDEMPOTENCY_KEY, { payload: { updated: true } });

      const queue = await offlineStorage.getQueue();
      expect(queue[0].payload).toEqual({ updated: true });
    });

    it('no hace nada si la operación no existe', async () => {
        await offlineStorage.updateOperation('non-existent', { payload: { updated: true } });
        const queue = await offlineStorage.getQueue();
        expect(queue).toHaveLength(0);
    });
  });

  describe('removeSyncedOperations', () => {
    it('elimina solo las operaciones con status synced', async () => {
      await offlineStorage.addToQueue({ idempotencyKey: '11111111-1111-1111-1111-111111111111', operationType: 'CREATE', entity: 'sale', payload: {} });
      await offlineStorage.addToQueue({ idempotencyKey: '22222222-2222-2222-2222-222222222222', operationType: 'CREATE', entity: 'sale', payload: {} });

      await offlineStorage.updateOperationStatus('11111111-1111-1111-1111-111111111111', 'synced');

      await offlineStorage.removeSyncedOperations();

      const queue = await offlineStorage.getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].idempotencyKey).toBe('22222222-2222-2222-2222-222222222222');
    });
  });

  describe('snapshots', () => {
    it('guarda y recupera un snapshot', async () => {
      const data = { products: [{ id: 1 }] };
      await offlineStorage.saveSnapshot('catalog', data);

      const result = await offlineStorage.getSnapshot('catalog');
      expect(result).toEqual(data);
    });

    it('devuelve null si el snapshot no existe', async () => {
      const result = await offlineStorage.getSnapshot('non-existent');
      expect(result).toBeNull();
    });
  });
});
