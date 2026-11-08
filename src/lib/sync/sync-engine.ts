import { offlineStorage } from './offline-storage';
import { syncLease, SYNC_LEASE_RENEW_MS } from './sync-lease';
import {
  classifySyncError,
  type SyncErrorClassification,
} from './error-classification';
import { logger } from '@/lib/logger';
import type { z } from 'zod';
import type { syncOperationSchema } from '@/validation/schemas';

type SyncOperationType = z.infer<typeof syncOperationSchema>;

// ── CP-POS-002 (D6): política de reintentos transitorios ────────────────────
// Backoff exponencial con jitter COMPLETO (uniforme [0, delay]) y límite:
//   base 1 s · tope 60 s · máx 8 intentos automáticos.
// Al agotar: la operación se CONSERVA (retry_exhausted) para reintento
// manual — nunca se elimina el payload ni se convierte en conflicto.
export const RETRY_BASE_MS = 1_000;
export const RETRY_MAX_MS = 60_000;
export const MAX_AUTO_ATTEMPTS = 8;

/**
 * Delay de backoff exponencial con jitter completo.
 * Determinista bajo reloj/rng inyectados (tests T5.1).
 */
export function computeBackoffDelay(
  attempts: number,
  rand: () => number = Math.random,
  baseMs = RETRY_BASE_MS,
  maxMs = RETRY_MAX_MS,
): number {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attempts - 1)));
  // Jitter completo: uniforme [0, exp).
  return Math.floor(rand() * exp);
}

/** ID del propietario del lease: único por contexto JS (pestaña). */
function makeOwnerId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : String(Math.random()).slice(2);
  return `tab-${rand}`;
}

export interface EngineOutcome {
  synced: number;
  conflicts: number;
  retryWait: number;
  authPaused: boolean;
  exhausted: number;
  errors: number;
}

export class SyncEngine {
  private isSyncing = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private onlineHandler: () => void;
  private sessionToken: string | null = null;
  /** Propietario del lease entre pestañas (D6). */
  private readonly ownerId = makeOwnerId();
  /** Pausa por 401: no se reintenta hasta sesión nueva (E). */
  private authPaused = false;

  constructor() {
    this.onlineHandler = () => { void this.processQueue(); };
  }

  /**
   * Stores the auth token for authenticated sync requests.
   * Must be called after login or session restore. Una sesión nueva
   * reanuda el procesamiento pausado por 401 (D3-E).
   */
  setToken(token: string | null): void {
    this.sessionToken = token;
    if (token) {
      this.authPaused = false;
      void this.processQueue();
    }
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
    syncLease.release(this.ownerId);
    logger.info('SYNC', 'ENGINE_STOPPED', {});
  }

  /**
   * Processes all pending operations in the queue.
   * CP-POS-002 (D6): cerrojo en memoria + LEASE compartido entre pestañas
   * (localStorage). Solo el propietario del lease vigente procesa; una
   * pestaña muerta libera el lease al expirar (TTL) y otra recupera sus
   * operaciones in-flight con la MISMA llave (idempotencia del servidor).
   */
  async processQueue(): Promise<EngineOutcome> {
    const outcome: EngineOutcome = { synced: 0, conflicts: 0, retryWait: 0, authPaused: false, exhausted: 0, errors: 0 };
    if (this.isSyncing || !navigator.onLine) return outcome;
    if (this.authPaused) return outcome;

    // Lease entre pestañas: SIN await entre check y claim (adquisición
    // síncrona — ver sync-lease.ts).
    if (!syncLease.acquire(this.ownerId)) {
      logger.info('SYNC', 'LEASE_HELD_BY_OTHER_TAB', {});
      return outcome;
    }

    this.isSyncing = true;
    // Heartbeat: renovar a mitad de TTL mientras el lote corra.
    const renewTimer = setInterval(() => {
      if (!syncLease.renew(this.ownerId)) {
        // Perdimos el lease (expiró y otra pestaña lo tomó): el lote en
        // curso termina, pero las ops quedan en in-flight con la misma
        // llave y el nuevo propietario las recupera.
        logger.warn('SYNC', 'LEASE_LOST_MID_BATCH', {});
      }
    }, SYNC_LEASE_RENEW_MS);

    logger.info('SYNC', 'QUEUE_PROCESSING_STARTED', {});

    try {
      // FIFO por clientClock dentro de prioridad (offline-storage). Solo
      // pending/failed legado/retry_wait vencidas — un conflicto NO
      // bloquea a las demás (D6-orden).
      const pending = await offlineStorage.getPendingOperations();
      logger.info('SYNC', 'PENDING_OPERATIONS', { count: pending.length });

      for (const operation of pending) {
        const r = await this.processOperation(operation);
        switch (r) {
          case 'synced': outcome.synced++; break;
          case 'conflict': outcome.conflicts++; break;
          case 'retry_wait': outcome.retryWait++; break;
          case 'auth_required': outcome.authPaused = true; break;
          case 'exhausted': outcome.exhausted++; break;
          default: outcome.errors++; break;
        }
        // E: 401 pausa TODO el envío autenticado (la sesión sirve para
        // ninguna operación) — se conserva la cola y se reanuda al
        // setToken con sesión válida.
        if (r === 'auth_required') {
          this.authPaused = true;
          logger.warn('SYNC', 'AUTH_PAUSED_QUEUE_PRESERVED', {});
          break;
        }
      }
      await offlineStorage.removeSyncedOperations();
    } catch (error) {
      logger.error('SYNC', 'QUEUE_PROCESSING_FAILED', { error: String(error) });
    } finally {
      clearInterval(renewTimer);
      this.isSyncing = false;
      syncLease.release(this.ownerId);
      logger.info('SYNC', 'QUEUE_PROCESSING_COMPLETED', {});
    }
    return outcome;
  }

  private async processOperation(
    operation: Pick<SyncOperationType, 'id' | 'idempotencyKey' | 'entity' | 'operationType' | 'attempts' | 'payload' | 'status'> & { nextRetryAt?: number },
  ): Promise<'synced' | 'conflict' | 'retry_wait' | 'auth_required' | 'exhausted' | 'error'> {
    const attempts = operation.attempts ?? 0;

    // Marcar in-flight ANTES del primer await del envío: una recarga
    // durante el envío deja la op in-flight con lease/llave — recuperable
    // por TTL u otra pestaña con la MISMA llave (idempotencia server).
    await offlineStorage.updateOperation(operation.idempotencyKey, {
      status: 'in-flight',
    });

    try {
      await this.executeOperation(operation);
      await offlineStorage.updateOperation(operation.idempotencyKey, {
        status: 'synced',
        lastError: null,
      });
      logger.info('SYNC', 'OPERATION_COMPLETED', { operationId: operation.id, entity: operation.entity });
      return 'synced';
    } catch (error: unknown) {
      return this.handleOperationError(operation, error);
    }
  }

  /**
   * CP-POS-002 (D3): clasificación canónica del error de UNA operación y
   * transición de estado según categoría. La llave y el payload JAMÁS se
   * tocan — el reintento reutiliza exactamente lo encolado (D1).
   */
  private async handleOperationError(
    operation: Pick<SyncOperationType, 'idempotencyKey' | 'entity' | 'attempts'> & { payload?: unknown },
    error: unknown,
  ): Promise<'conflict' | 'retry_wait' | 'auth_required' | 'exhausted' | 'error'> {
    const rawMessage = error instanceof Error ? error.message : String(error);
    // El fetch del batch encapsula HTTP en "HTTP <status>: <body>".
    const httpMatch = rawMessage.match(/^HTTP (\d+):/);
    const httpStatus = httpMatch ? Number(httpMatch[1]) : null;

    const classification: SyncErrorClassification = classifySyncError({
      message: rawMessage,
      httpStatus,
    });
    const attempts = (operation.attempts ?? 0) + 1;

    // E — 401: pausa global; la op vuelve a pending (conserva TODO) y no
    // consume presupuesto de reintentos.
    if (classification.category === 'auth_required') {
      await offlineStorage.updateOperation(operation.idempotencyKey, {
        status: 'auth_required',
        lastError: classification.message,
        errorCode: classification.errorCode,
      });
      logger.warn('SYNC', 'OPERATION_AUTH_REQUIRED', {
        operationId: operation.idempotencyKey,
      });
      return 'auth_required';
    }

    // B/C — conflicto determinista: conservar TODO para resolución humana
    // (D4). Sin reintento automático.
    if (
      classification.category === 'conflict_integrity' ||
      classification.category === 'conflict_business'
    ) {
      await offlineStorage.updateOperation(operation.idempotencyKey, {
        status: 'conflict',
        lastError: classification.message,
        conflictType: classification.conflictType,
        errorCode: classification.errorCode ?? classification.message.slice(0, 80),
        attempts,
      });
      logger.error('SYNC', 'OPERATION_CONFLICT', {
        operationId: operation.idempotencyKey,
        entity: operation.entity,
        errorCode: classification.errorCode,
        attempts,
      });
      return 'conflict';
    }

    // F — desconocido 4xx: conservar SIN reintento automático → conflicto
    // de revisión (no descarta, no reintenta).
    if (classification.category === 'unknown') {
      await offlineStorage.updateOperation(operation.idempotencyKey, {
        status: 'conflict',
        lastError: classification.message,
        conflictType: 'unknown_error',
        errorCode: classification.errorCode,
        attempts,
      });
      return 'conflict';
    }

    // D — transitorio: backoff exponencial con jitter, máx 8 automáticos.
    if (attempts >= MAX_AUTO_ATTEMPTS) {
      // Agotado: CONSERVAR (nunca eliminar payload, nunca convertir a
      // conflicto de negocio) → revisión y reintento manual (D4).
      await offlineStorage.updateOperation(operation.idempotencyKey, {
        status: 'retry_exhausted',
        lastError: classification.message,
        errorCode: classification.errorCode,
        attempts,
      });
      logger.error('SYNC', 'OPERATION_RETRY_EXHAUSTED', {
        operationId: operation.idempotencyKey,
        entity: operation.entity,
        attempts,
      });
      return 'exhausted';
    }

    const delay = computeBackoffDelay(attempts);
    await offlineStorage.updateOperation(operation.idempotencyKey, {
      status: 'retry_wait',
      lastError: classification.message,
      errorCode: classification.errorCode,
      attempts,
      nextRetryAt: Date.now() + delay,
    });
    logger.warn('SYNC', 'OPERATION_RETRY_SCHEDULED', {
      operationId: operation.idempotencyKey,
      entity: operation.entity,
      attempts,
      delayMs: delay,
    });
    return 'retry_wait';
  }

  private async executeOperation(operation: { entity: string; payload: unknown; idempotencyKey: string; operationType?: string }): Promise<void> {
    // FIX C-4 (Iteración 11.1): Route ALL operations through /api/sync/batch.
    // The previous per-entity endpoints (/api/pos/checkout, /api/pos/payment, etc.)
    // did not exist, causing silent failures for offline sales.
    // /api/sync/batch accepts an operations[] array and dispatches each to the
    // correct RPC (create_sale_v2, register_reception, etc.) with idempotency.
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
      // CP-POS-002 (D3): el 401 de withAuth es 'No autorizado' — el
      // clasificador lo captura por HTTP status y pausa sin consumir
      // reintentos (categoría E). El resto de !response.ok conserva su
      // semántica (texto crudo solo para clasificación; nunca se muestra).
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const results = data?.results ?? [];
    const result = results[0];

    if (!result) {
      throw new Error('No result returned from sync batch');
    }

    if (result.status === 'ok') {
      // Éxito (ejecutada o replay idempotente certificado). Sin throw.
      return;
    }

    if (result.status === 'conflict') {
      // CP-POS-002 (D3): el servidor ya clasificó (category/conflictType/
      // errorCode/message en el result). El mensaje del throw SOLO alimenta
      // al clasificador del handleOperationError — lleva el código REAL.
      const code = result.errorCode
        ? `${result.errorCode}${result.error ? `: ${String(result.error).slice(0, 120)}` : ''}`
        : (result.error || 'unknown conflict');
      throw new Error(`Conflict: ${code}`);
    }

    // status 'error': transitorio (retryable) o determinista sin status
    // conflict (F-21/fecha futura ya viajan con errorCode — el mensaje
    // lleva el código para que el clasificador lo capture).
    const errText = result.errorCode
      ? `${result.errorCode}${result.error ? `: ${String(result.error).slice(0, 120)}` : ''}`
      : (result.error || `Sync failed with status: ${result.status}`);
    throw new Error(errText);
  }

  /**
   * FIX: Reintenta operaciones que fallaron tras MAX_RETRIES.
   * CP-POS-002 (D4): también las retry_exhausted (reintento MANUAL desde
   * "Ventas por resolver"). Mantiene llave y payload; resetea attempts.
   */
  async retryFailed(): Promise<number> {
    const failed = await offlineStorage.getFailedOperations();
    const exhausted = (await offlineStorage.getQueue()).filter(
      (op) => op.status === 'retry_exhausted',
    );
    const targets = [...failed, ...exhausted];
    let retried = 0;
    for (const op of targets) {
      await offlineStorage.updateOperation(op.idempotencyKey, {
        status: 'pending',
        attempts: 0,
        lastError: null,
        nextRetryAt: undefined,
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
   * CP-POS-002 (D4): para VENTAS este camino queda reservado al descarte
   * auditado (endpoint server-side que verifica rol y registra la
   * auditoría ANTES de confirmar). Este método persistente local solo lo
   * invoca ese flujo tras confirmación del servidor.
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
