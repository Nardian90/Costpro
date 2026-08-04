import { offlineStorage } from './offline-storage';
import { logger } from '@/lib/logger';

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 5000, 15000]; // exponential backoff

export class SyncEngine {
  private isSyncing = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private onlineHandler: () => void;
  private sessionToken: string | null = null;

  constructor() {
    this.onlineHandler = () => { void this.processQueue(); };
  }

  /**
   * Stores the auth token for authenticated sync requests.
   * Must be called after login or session restore.
   */
  setToken(token: string | null): void {
    this.sessionToken = token;
  }

  /**
   * Starts the sync engine.
   * Listens for connectivity changes and processes the queue when online.
   */
  start(intervalMs = 30_000): void {
    if (this.syncInterval) return;

    window.addEventListener('online', this.onlineHandler);

    this.syncInterval = setInterval(() => {
      if (navigator.onLine) this.processQueue();
    }, intervalMs);

    if (navigator.onLine) this.processQueue();

    logger.info('SYNC', 'ENGINE_STARTED', { intervalMs });
  }

  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    window.removeEventListener('online', this.onlineHandler);
    logger.info('SYNC', 'ENGINE_STOPPED', {});
  }

  /**
   * Processes all pending operations in the queue.
   * Respects priority ordering from offline-storage.
   */
  async processQueue(): Promise<void> {
    if (this.isSyncing || !navigator.onLine) return;

    this.isSyncing = true;
    logger.info('SYNC', 'QUEUE_PROCESSING_STARTED', {});

    try {
      const pending = await offlineStorage.getPendingOperations();
      logger.info('SYNC', 'PENDING_OPERATIONS', { count: pending.length });

      for (const operation of pending) {
        await this.processOperation(operation);
      }
    } catch (error) {
      logger.error('SYNC', 'QUEUE_PROCESSING_FAILED', { error: String(error) });
    } finally {
      this.isSyncing = false;
      logger.info('SYNC', 'QUEUE_PROCESSING_COMPLETED', {});
    }
  }

  private async processOperation(operation: { id?: string | null; idempotencyKey: string; entity: string; operationType?: string; attempts: number; payload: unknown }): Promise<void> {
    const attempts = operation.attempts ?? 0;

    if (attempts >= MAX_RETRIES) {
      logger.error('SYNC', 'OPERATION_MAX_RETRIES_EXCEEDED', {
        operationId: operation.id,
        entity: operation.entity,
        attempts,
      });
      await offlineStorage.updateOperationStatus(
        operation.idempotencyKey,
        'failed',
        'Max retries exceeded'
      );
      return;
    }

    // Backoff delay for previously failed operations
    if (attempts > 0) {
      const delay = RETRY_DELAYS_MS[attempts - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    try {
      await this.executeOperation(operation);
      await offlineStorage.updateOperationStatus(operation.idempotencyKey, 'synced');
      logger.info('SYNC', 'OPERATION_COMPLETED', { operationId: operation.id, entity: operation.entity });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await offlineStorage.updateOperationStatus(
        operation.idempotencyKey,
        'failed',
        message
      );
      logger.error('SYNC', 'OPERATION_FAILED', {
        operationId: operation.id,
        entity: operation.entity,
        attempts: attempts + 1,
        error: message,
      });
    }
  }

  private async executeOperation(operation: { entity: string; payload: unknown; idempotencyKey: string; operationType?: string }): Promise<void> {
    // FIX C-4 (Iteración 11.1): Route ALL operations through /api/sync/batch.
    // The previous per-entity endpoints (/api/pos/checkout, /api/pos/payment, etc.)
    // did not exist, causing silent failures for offline sales.
    // /api/sync/batch accepts an operations[] array and dispatches each to the
    // correct RPC (create_sale, register_reception, etc.) with idempotency.
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }

    const batchPayload = {
      clientInfo: {
        userId: 'sync-engine',
        deviceId: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
      },
      operations: [{
        idempotencyKey: operation.idempotencyKey,
        entity: operation.entity,
        operationType: operation.operationType || 'CREATE',
        payload: operation.payload,
      }],
    };

    const response = await fetch('/api/sync/batch', {
      method: 'POST',
      headers,
      body: JSON.stringify(batchPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const results = data?.results ?? [];
    const result = results[0];

    if (!result) {
      throw new Error('No result returned from sync batch');
    }

    if (result.status === 'conflict') {
      throw new Error('Conflict: ' + (result.error || 'unknown conflict'));
    }

    if (result.status !== 'ok') {
      throw new Error(result.error || `Sync failed with status: ${result.status}`);
    }
  }

  /**
   * FIX: Reintenta operaciones que fallaron tras MAX_RETRIES.
   * Resetea el contador de attempts a 0 y las marca como 'pending'.
   */
  async retryFailed(): Promise<number> {
    const failed = await offlineStorage.getFailedOperations();
    let retried = 0;
    for (const op of failed) {
      await offlineStorage.updateOperation(op.idempotencyKey, {
        status: 'pending',
        attempts: 0,
        lastError: null,
      });
      retried++;
    }
    if (retried > 0) {
      logger.info('SYNC', 'RETRY_FAILED_TRIGGERED', { count: retried });
      this.processQueue();
    }
    return retried;
  }

  /**
   * Descarta operaciones fallidas (el usuario decide no reintentar).
   */
  async discardFailed(): Promise<number> {
    const failed = await offlineStorage.getFailedOperations();
    for (const op of failed) {
      await offlineStorage.updateOperationStatus(op.idempotencyKey, 'discarded');
    }
    logger.info('SYNC', 'DISCARD_FAILED', { count: failed.length });
    return failed.length;
  }

}

export const syncEngine = new SyncEngine();
