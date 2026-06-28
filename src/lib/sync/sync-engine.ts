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
    this.onlineHandler = () => this.processQueue();
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
        await this.processOperation(operation as any);
      }
    } catch (error) {
      logger.error('SYNC', 'QUEUE_PROCESSING_FAILED', { error: String(error) });
    } finally {
      this.isSyncing = false;
      logger.info('SYNC', 'QUEUE_PROCESSING_COMPLETED', {});
    }
  }

  private async processOperation(operation: { id?: string | null; idempotencyKey: string; entity: string; attempts: number; payload: unknown }): Promise<void> {
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

  private async executeOperation(operation: { entity: string; payload: unknown }): Promise<void> {
    const endpoint = this.getEndpointForType(operation.entity);
    if (!endpoint) {
      throw new Error(`Unknown operation type: ${operation.entity}`);
    }

    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(operation.payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
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

  private getEndpointForType(type: string): string | null {
    const endpoints: Record<string, string> = {
      'sale':              '/api/pos/checkout',
      'payment':           '/api/pos/payment',
      'checkout':          '/api/pos/checkout',
      'reception':         '/api/inventory/receptions',
      'reception_create':  '/api/inventory/receptions',
      'transfer_confirm':  '/api/transfers/confirm',
      'transfer_create':   '/api/transfers',
      'inventory_adjust':  '/api/inventory/adjust',
      'inventory_count':   '/api/inventory/count',
    };
    return endpoints[type] ?? null;
  }
}

export const syncEngine = new SyncEngine();
