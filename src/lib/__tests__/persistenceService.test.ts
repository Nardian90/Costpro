import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PersistenceService } from '../persistenceService';
import { db } from '../dexie';

// Mock Dexie
vi.mock('../dexie', () => ({
  db: {
    isOpen: vi.fn().mockReturnValue(true),
    open: vi.fn().mockResolvedValue(true),
    audit_logs: {
      add: vi.fn().mockResolvedValue('mock-id'),
    },
    products: {
      name: 'products',
      put: vi.fn(),
      get: vi.fn(),
    },
    reconciliation_lines: {
      name: 'reconciliation_lines',
      get: vi.fn(),
    },
    product_movements: {
      name: 'product_movements',
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      first: vi.fn(),
    },
    transaction: vi.fn((mode, tables, cb) => cb()),
  },
}));

describe('PersistenceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== 'undefined') {
        localStorage.clear();
    }
    // Mock window and localStorage for the environment
    global.window = {} as any;
    const store: Record<string, string> = {};
    global.localStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = value },
      clear: () => { for (const key in store) delete store[key] },
      removeItem: (key: string) => { delete store[key] },
      length: 0,
      key: (index: number) => null,
    } as any;
  });

  it('should retry on DatabaseClosedError and eventually succeed', async () => {
    const error = new Error('Database is closed');
    error.name = 'DatabaseClosedError';

    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');

    const result = await PersistenceService.executeWithRetry(fn, 3);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max retries', async () => {
    const error = new Error('Database is closed');
    error.name = 'DatabaseClosedError';
    const fn = vi.fn().mockRejectedValue(error);

    await expect(PersistenceService.executeWithRetry(fn, 2)).rejects.toThrow('Database is closed');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('writeSafe should validate after writing', async () => {
    const data = { cod: 'P1', name: 'Test' };
    (db.products.put as any).mockResolvedValue('P1');
    (db.products.get as any).mockResolvedValue(data);

    const id = await PersistenceService.writeSafe(db.products as any, data);

    expect(id).toBe('P1');
    expect(db.products.get).toHaveBeenCalledWith('P1');
  });

  it('writeSafe should enqueue to LocalStorage if DB fails', async () => {
    const error = new Error('Fatal DB Error');
    (db.products.put as any).mockRejectedValue(error);

    const data = { cod: 'P1', name: 'Test' };

    await expect(PersistenceService.writeSafe(db.products as any, data)).rejects.toThrow('Fatal DB Error');

    const pending = PersistenceService.getPendingOperations();
    expect(pending.length).toBe(1);
    expect(pending[0].payload).toEqual(data);
    expect(pending[0].tables).toContain('products');
  });

  it('reconcilePendingOperations should process enqueued operations', async () => {
    // Setup pending op in localStorage
    const data = { cod: 'P2', name: 'Recovered' };
    (db.products.put as any).mockResolvedValue('P2');

    // Create a manual pending op
    localStorage.setItem('ipv_pending_ops', JSON.stringify([{
        id: 'op1',
        type: 'write',
        tables: ['products'],
        payload: data,
        timestamp: new Date().toISOString(),
        retryCount: 0
    }]));

    const report = await PersistenceService.reconcilePendingOperations();

    expect(report.processed).toBe(1);
    expect(db.products.put).toHaveBeenCalledWith(data);
    expect(PersistenceService.getPendingOperations().length).toBe(0);
  });

  it('validateCrossIntegrity should detect desync if movement is missing', async () => {
    const reconciliation = { id: 'R1', transaction_ref: 'TX1', origen_dato: 'AUTO_MATCH' };
    (db.reconciliation_lines.get as any).mockResolvedValue(reconciliation);
    (db.product_movements.first as any).mockResolvedValue(null);

    const isValid = await PersistenceService.validateCrossIntegrity('R1');

    expect(isValid).toBe(false);
    expect(db.audit_logs.add).toHaveBeenCalled();
  });
});
