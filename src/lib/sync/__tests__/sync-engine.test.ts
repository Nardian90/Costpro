import { SyncEngine } from '../sync-engine';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUpdateOperationStatus = vi.fn().mockResolvedValue(undefined);
const mockGetPendingOperations = vi.fn().mockResolvedValue([]);

vi.mock('../offline-storage', () => ({
  offlineStorage: {
    getPendingOperations: (...args: any[]) => mockGetPendingOperations(...args),
    updateOperationStatus: (...args: any[]) => mockUpdateOperationStatus(...args),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SyncEngine', () => {
  let engine: SyncEngine;
  let originalNavigatorOnLine: boolean;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPendingOperations.mockResolvedValue([]);
    mockUpdateOperationStatus.mockResolvedValue(undefined);

    engine = new SyncEngine();
    originalNavigatorOnLine = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { writable: true, value: true });
  });

  afterEach(() => {
    engine.stop();
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: originalNavigatorOnLine,
    });
    vi.restoreAllMocks();
  });

  describe('processQueue()', () => {
    it('no procesa si navigator.onLine es false', async () => {
      Object.defineProperty(navigator, 'onLine', { writable: true, value: false });

      mockGetPendingOperations.mockResolvedValue([
        { idempotencyKey: 'op-1', entity: 'sale', attempts: 0, payload: {} },
      ]);

      await engine.processQueue();

      // Queue should not have been fetched (early return)
      expect(mockGetPendingOperations).not.toHaveBeenCalled();
    });

    it('procesa todas las operaciones en orden', async () => {
      const operations = [
        { id: 'op-1', idempotencyKey: 'op-1', entity: 'sale', attempts: 0, payload: { saleId: 's1' } },
        { id: 'op-2', idempotencyKey: 'op-2', entity: 'payment', attempts: 0, payload: { paymentId: 'p1' } },
      ];
      mockGetPendingOperations.mockResolvedValue(operations);

      // Mock fetch to succeed
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

      await engine.processQueue();

      // Both operations should be marked as synced
      expect(mockUpdateOperationStatus).toHaveBeenCalledTimes(2);
      expect(mockUpdateOperationStatus).toHaveBeenNthCalledWith(1, 'op-1', 'synced');
      expect(mockUpdateOperationStatus).toHaveBeenNthCalledWith(2, 'op-2', 'synced');
    });

    it('no procesa si ya está procesando (previene ejecución paralela)', async () => {
      mockGetPendingOperations.mockResolvedValue([
        { idempotencyKey: 'op-1', entity: 'sale', attempts: 0, payload: {} },
      ]);

      vi.spyOn(globalThis, 'fetch').mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(new Response(null, { status: 200 })), 100))
      );

      // Start two processQueue calls concurrently
      const p1 = engine.processQueue();
      const p2 = engine.processQueue();

      await Promise.all([p1, p2]);

      // getPendingOperations should only be called once (the second call exits early)
      expect(mockGetPendingOperations).toHaveBeenCalledTimes(1);
    });

    it('llama updateOperationStatus con "synced" después de operación exitosa', async () => {
      mockGetPendingOperations.mockResolvedValue([
        { idempotencyKey: 'op-ok', entity: 'sale', attempts: 0, payload: {} },
      ]);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

      await engine.processQueue();

      expect(mockUpdateOperationStatus).toHaveBeenCalledWith('op-ok', 'synced');
    });

    it('llama updateOperationStatus con "failed" después de fallo y suma attempts', async () => {
      mockGetPendingOperations.mockResolvedValue([
        { idempotencyKey: 'op-fail', entity: 'sale', attempts: 0, payload: {} },
      ]);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Server Error', { status: 500 })
      );

      await engine.processQueue();

      expect(mockUpdateOperationStatus).toHaveBeenCalledWith(
        'op-fail',
        'failed',
        expect.stringContaining('500')
      );
    });
  });

  describe('reintentos con backoff', () => {
    it('espera delay antes del reintento cuando attempts > 0', async () => {
      vi.useFakeTimers();

      mockGetPendingOperations.mockResolvedValue([
        { idempotencyKey: 'op-retry', entity: 'sale', attempts: 1, payload: {} },
      ]);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

      const promise = engine.processQueue();

      // Advance past the backoff delay (1000ms for attempt 1)
      await vi.advanceTimersByTimeAsync(1100);
      await promise;

      vi.useRealTimers();
    });

    it('marca como failed definitivo después de 3 intentos fallidos (MAX_RETRIES)', async () => {
      mockGetPendingOperations.mockResolvedValue([
        { idempotencyKey: 'op-max', entity: 'sale', attempts: 3, payload: {} },
      ]);

      vi.spyOn(globalThis, 'fetch');

      await engine.processQueue();

      // Should NOT attempt fetch (already exceeded max retries)
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(mockUpdateOperationStatus).toHaveBeenCalledWith(
        'op-max',
        'failed',
        'Max retries exceeded'
      );
    });
  });

  describe('tipos de operación', () => {
    it('mapea "sale" a /api/pos/checkout', async () => {
      mockGetPendingOperations.mockResolvedValue([
        { idempotencyKey: 'op-sale', entity: 'sale', attempts: 0, payload: {} },
      ]);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

      await engine.processQueue();

      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/pos/checkout',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('mapea "inventory_adjust" a /api/inventory/adjust', async () => {
      mockGetPendingOperations.mockResolvedValue([
        { idempotencyKey: 'op-adj', entity: 'inventory_adjust', attempts: 0, payload: {} },
      ]);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

      await engine.processQueue();

      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/inventory/adjust',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('mapea tipo desconocido a null y lanza error', async () => {
      mockGetPendingOperations.mockResolvedValue([
        { idempotencyKey: 'op-unknown', entity: 'unknown_type', attempts: 0, payload: {} },
      ]);

      await engine.processQueue();

      expect(mockUpdateOperationStatus).toHaveBeenCalledWith(
        'op-unknown',
        'failed',
        expect.stringContaining('Unknown operation type')
      );
    });
  });

  describe('start() / stop()', () => {
    it('start() agrega listener de "online" event', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');

      engine.start(60000);

      const onlineCalls = addSpy.mock.calls.filter(c => c[0] === 'online');
      expect(onlineCalls.length).toBe(1);
    });

    it('stop() remueve el listener y limpia el intervalo', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

      engine.start(30000);
      engine.stop();

      const onlineRemovals = removeSpy.mock.calls.filter(c => c[0] === 'online');
      expect(onlineRemovals.length).toBe(1);
      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('no llama start() dos veces si ya está corriendo', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');

      engine.start(30000);
      engine.start(30000);

      const onlineCalls = addSpy.mock.calls.filter(c => c[0] === 'online');
      expect(onlineCalls.length).toBe(1);
    });

    it('start() procesa la cola si navigator.onLine es true', async () => {
      mockGetPendingOperations.mockResolvedValue([]);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

      engine.start(60000);

      // start() calls processQueue() immediately if online
      // Wait a tick for the async call
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockGetPendingOperations).toHaveBeenCalled();
    });
  });
});
