import { offlineStorage } from './offline-storage';
import { logger } from '@/lib/logger';

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 5000, 15000]; // exponential backoff

export class SyncEngine {
  private isSyncing = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private onlineHandler: () => void;

  constructor() {
    this.onlineHandler = () => this.processQueue();
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

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(operation.payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
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
