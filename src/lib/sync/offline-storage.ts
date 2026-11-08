/**
 * CP-POS-002 (D1/D2) — Outbox local de intenciones de venta + reserva de
 * inventario derivada de la cola.
 * ============================================================================
 * D1 (outbox): Toda intención de venta se persiste ANTES de cualquier envío
 * (online u offline), con llave de idempotencia estable generada UNA sola
 * vez por confirmación de carrito. Los reintentos (automáticos o tras
 * recarga) reutilizan la MISMA llave y el MISMO payload — nunca lo
 * regeneran. El servidor garantiza idempotencia real por llave
 * (idempotency_registry UNIQUE(key,operation) + param_hash + índice único
 * transactions_idempotency_key_store_idx — verificado en el gate de
 * idempotencia de esta misión), por lo que conservar la llave convierte el
 * reenvío ambiguo en replay idempotente certificado.
 *
 * D2 (reserva derivada): NO existe contador de stock reservado. La
 * disponibilidad local se DERIVA de las operaciones no resueltas de la cola:
 *
 *   stock_disponible_local = MAX(0, stock_snapshot − Σ cantidades de
 *                               operaciones que aún reservan)
 *
 * Reservan: pending, in-flight, retry_wait, conflict, auth_required (una
 * venta en conflicto sigue siendo operación comercial pendiente — no libera
 * inventario silenciosamente). No reservan: synced, discarded, retry_exhausted.
 *
 * Granularidad de la reserva = granularidad del inventario real: tienda ×
 * producto × variante (unit_of_measure no aplica: los ítems ya viajan en
 * unidades base vía conversion_factor).
 *
 * ATOMICIDAD ENTRE PESTAÑAS: localforage/IndexedDB no expone transacciones
 * multi-key al consumidor. La serialización de escrituras que exigen las
 * validaciones read-check-write de D2 se garantiza con una COLA DE
 * MUTACIÓN SERIALIZADA por módulo (mutex de promesas): TODA escritura de la
 * cola sync pasa por enqueueMutation, por lo que la comprobación de
 * disponibilidad y el push de la operación ocurren sin interleave de otra
 * pestaña… del MISMO contexto JS. Entre contextos distintos (pestañas) la
 * exclusión mutua real la aporta el lease de procesamiento (D6, sync-lease)
 * + la idempotencia del servidor: dos pestañas pueden ENCOLAR ventas
 * distintas (intenciones comerciales independientes), pero una misma
 * operación con lease vigente jamás se envía dos veces, y el servidor
 * rechaza el overselling (ERR_INSUFFICIENT_STOCK) si la suma excede el
 * stock real — detectable y resoluble por conciliación (D4), como exige el
 * §1 de la misión (no se pretende eliminar el overselling físico entre
 * dispositivos desconectados).
 */
import localforage from 'localforage';
import { v4 as uuidv4 } from 'uuid';
import { syncOperationSchema } from '@/validation/schemas';
import { z } from 'zod';
import { logger } from '@/lib/logger';

type SyncOperationType = z.infer<typeof syncOperationSchema>;

const SYNC_QUEUE_KEY = 'sync_queue';
const OFFLINE_SNAPSHOT_KEY = 'offline_snapshot';
/** Outbox de intenciones de venta (D1) — separado de la cola general. */
const SALE_INTENTS_KEY = 'cp_pos_002_sale_intents';

// Prioridad de operaciones: menor número = mayor prioridad
const OPERATION_PRIORITY: Record<string, number> = {
  'sale':               1,
  'payment':            1,
  'checkout':           1,
  'reception':          2,
  'reception_create':   2,
  'transfer_confirm':   3,
  'transfer_create':    3,
  'inventory_adjust':   4,
  'inventory_count':    4,
};

const getOperationPriority = (entity: string): number =>
  OPERATION_PRIORITY[entity] ?? 5;

// Configure localforage
localforage.config({
  name: 'CostPro',
  storeName: 'offline_data',
});

// ── Mutex de escrituras (D2: validación+escritura atómicas) ─────────────────
// Serializa TODA mutación de la cola dentro de este contexto JS. La
// comprobación de reserva y el encolo ocurren dentro de la misma sección
// crítica, sin interleave con otra llamada concurrente del motor o la UI.
let mutationChain: Promise<unknown> = Promise.resolve();

function enqueueMutation<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutationChain.then(fn, fn);
  // El chain sigue aunque fn falle (la cola nunca queda bloqueada).
  mutationChain = run.then(() => undefined, () => undefined);
  return run;
}

// ── Estados que reservan inventario (D2) ────────────────────────────────────
const RESERVING_STATUSES = new Set([
  'pending',
  'in-flight',
  'retry_wait',
  'conflict',
  'auth_required',
]);

/** Estados terminales o de pausa-humana que NO reservan. */
export const NON_RESERVING_STATUSES = ['synced', 'discarded', 'retry_exhausted'] as const;

/**
 * Ítem de venta extraído de un payload encolado. Normalizado a unidades base
 * (quantity × conversion_factor) — la misma aritmética que usa el guard de
 * stock del checkout (FIX-G10).
 */
export interface ReservedLine {
  storeId: string;
  productId: string;
  variantId: string | null;
  /** Cantidad en unidades base (normalizada). */
  baseQty: number;
}

/**
 * Extrae las líneas reservables de un payload de venta. Solo entidad 'sale'
 * reserva (recepciones/ajustes/transferencias tienen semántica propia y NO
 * deben restarse de la disponibilidad de venta).
 */
function extractSaleLines(op: SyncOperationType): ReservedLine[] {
  if (op.entity !== 'sale' || !Array.isArray(op.payload?.p_items)) return [];
  const storeId = String(op.payload.p_store_id ?? '');
  return (op.payload.p_items as Array<Record<string, unknown>>)
    .filter((it) => it && typeof it === 'object')
    .map((it) => {
      const qty = Number(it.quantity ?? 0);
      // conversion_factor vive en la variante del catálogo; el payload del
      // POS ya viaja en unidades de la variante. FIX-G10: normalizar.
      const cf = Number((it as { conversion_factor?: unknown }).conversion_factor ?? 1);
      const factor = Number.isFinite(cf) && cf > 0 ? cf : 1;
      return {
        storeId,
        productId: String(it.product_id ?? ''),
        variantId: it.variant_id ? String(it.variant_id) : null,
        baseQty: Number.isFinite(qty) ? qty * factor : 0,
      };
    })
    .filter((l) => l.productId && l.storeId && l.baseQty > 0);
}

/** Clave de granularidad de inventario: tienda × producto × variante. */
function reservationKey(l: { storeId: string; productId: string; variantId: string | null }): string {
  return `${l.storeId}::${l.productId}::${l.variantId ?? '-'}`;
}

// ── Intención de venta persistente (D1) ─────────────────────────────────────

export interface SaleIntent {
  /** Llave de idempotencia estable — NO se regenera jamás. */
  idempotencyKey: string;
  /** UUID estricto (la cola exige uuidRegex). Derivado de la llave. */
  queueIdempotencyKey: string;
  storeId: string;
  /** Payload congelado en la confirmación del carrito (inmutable). */
  payload: unknown;
  createdAt: string;
  /** Momento de la última respuesta definitiva ('' = sin resolver). */
  resolvedAt: string | null;
  /**
   * 'queue' — la operación vive en la cola de sync (camino normal).
   * 'sent-online' — se envió a /api/pos/checkout con la MISMA llave.
   */
  transport: 'queue' | 'sent-online';
}

async function getIntents(): Promise<SaleIntent[]> {
  return (await localforage.getItem<SaleIntent[]>(SALE_INTENTS_KEY)) || [];
}

async function setIntents(intents: SaleIntent[]): Promise<void> {
  await localforage.setItem(SALE_INTENTS_KEY, intents);
}

export const saleOutbox = {
  /**
   * Persiste la intención de venta ANTES de cualquier envío (D1). Genera la
   * llave UNA sola vez: si ya existe una intención abierta para este
   * checkout (p. ej. doble clic que llegó aquí), devuelve la EXISTENTE —
   * nunca crea dos operaciones para la misma confirmación.
   */
  async create(params: {
    storeId: string;
    payload: unknown;
    /** Llave ya generada por el checkout (una por confirmación). */
    idempotencyKey: string;
  }): Promise<SaleIntent> {
    return enqueueMutation(async () => {
      const intents = await getIntents();
      const existing = intents.find(
        (i) => i.idempotencyKey === params.idempotencyKey && !i.resolvedAt,
      );
      if (existing) return existing;

      const intent: SaleIntent = {
        idempotencyKey: params.idempotencyKey,
        // La cola exige uuidRegex: la llave POSIX del checkout no sirve tal
        // cual. UUID derivado determinista NO: debe ser único por intento de
        // ENCOLO (los reintentos del engine ya reutilizan la llave de la
        // operación encolada, no esta).
        queueIdempotencyKey: uuidv4(),
        storeId: params.storeId,
        payload: params.payload,
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        transport: 'queue',
      };
      intents.push(intent);
      await setIntents(intents);
      logger.info('SYNC', 'SALE_INTENT_PERSISTED', {
        idempotencyKey: intent.idempotencyKey.slice(0, 8),
        storeId: intent.storeId,
      });
      return intent;
    });
  },

  /** Marca la intención como resuelta (respuesta definitiva o descarte auditado). */
  async resolve(idempotencyKey: string): Promise<void> {
    await enqueueMutation(async () => {
      const intents = await getIntents();
      const i = intents.findIndex(
        (x) => x.idempotencyKey === idempotencyKey && !x.resolvedAt,
      );
      if (i !== -1) {
        intents[i] = { ...intents[i], resolvedAt: new Date().toISOString() };
        await setIntents(intents);
      }
    });
  },

  /** Intención abierta (sin resolver) por llave, si existe. */
  async getOpen(idempotencyKey: string): Promise<SaleIntent | null> {
    const intents = await getIntents();
    return intents.find((i) => i.idempotencyKey === idempotencyKey && !i.resolvedAt) ?? null;
  },

  async getAll(): Promise<SaleIntent[]> {
    return getIntents();
  },

  /** Limpieza: conserva solo intenciones abiertas y las resueltas < 30 días. */
  async prune(): Promise<void> {
    await enqueueMutation(async () => {
      const intents = await getIntents();
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const kept = intents.filter(
        (i) => !i.resolvedAt || new Date(i.resolvedAt).getTime() > cutoff,
      );
      if (kept.length !== intents.length) await setIntents(kept);
    });
  },
};

export const offlineStorage = {
  /**
   * Add an operation to the sync queue
   */
  async addToQueue(operation: Omit<SyncOperationType, 'id' | 'status' | 'attempts' | 'createdAt' | 'clientClock'>): Promise<SyncOperationType> {
    return enqueueMutation(async () => {
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

      logger.info('SYNC', 'OPERATION_ADDED_TO_QUEUE', { entity: operation.entity, idempotencyKey: operation.idempotencyKey });
      return newOp;
    });
  },

  /**
   * CP-POS-002 (D2): encola una VENTA tras revalidar la disponibilidad local
   * DENTRO de la misma sección crítica que escribe la cola (atomicidad
   * read-check-write dentro del contexto JS; entre pestañas: lease D6 +
   * idempotencia/rechazo del servidor). Si la venta excede la disponibilidad
   * local, NO se encola y se devuelve el rechazo con detalle por producto.
   */
  async enqueueSaleWithReservation(
    operation: Omit<SyncOperationType, 'id' | 'status' | 'attempts' | 'createdAt' | 'clientClock'>,
    snapshotStock: (storeId: string, productId: string) => number | null,
  ): Promise<{ ok: true; op: SyncOperationType } | { ok: false; rejects: Array<{ productId: string; requested: number; available: number }> }> {
    return enqueueMutation(async () => {
      const queue = await this.getQueue();

      const newOp: SyncOperationType = {
        ...operation,
        id: uuidv4(),
        status: 'pending',
        attempts: 0,
        createdAt: new Date().toISOString(),
        clientClock: Date.now(),
      };
      syncOperationSchema.parse(newOp);

      // Reserva acumulada de TODAS las operaciones que aún reservan,
      // agrupada por granularidad tienda×producto×variante.
      const reservedBy = new Map<string, number>();
      for (const op of queue) {
        if (!RESERVING_STATUSES.has(op.status)) continue;
        for (const line of extractSaleLines(op)) {
          const k = reservationKey(line);
          reservedBy.set(k, (reservedBy.get(k) ?? 0) + line.baseQty);
        }
      }

      // Líneas de la venta nueva + las ya reservadas por ESTA misma llave
      // (reemplazo defensivo: no debe existir, la llave es única por intento).
      const newLines = extractSaleLines(newOp);
      const rejects: Array<{ productId: string; requested: number; available: number }> = [];
      for (const line of newLines) {
        const k = reservationKey(line);
        const snapshot = snapshotStock(line.storeId, line.productId);
        // Sin snapshot para producto de inventario controlado: bloquear la
        // venta offline (D2: sin referencia local válida no hay reserva
        // verificable). El caller decide si el producto controla stock.
        if (snapshot === null) {
          rejects.push({ productId: line.productId, requested: line.baseQty, available: -1 });
          continue;
        }
        const reserved = reservedBy.get(k) ?? 0;
        const available = Math.max(0, snapshot - reserved);
        if (line.baseQty > available + 1e-9) {
          rejects.push({
            productId: line.productId,
            requested: line.baseQty,
            available: Math.round(available * 10000) / 10000,
          });
        }
      }

      if (rejects.length > 0) {
        return { ok: false, rejects };
      }

      queue.push(newOp);
      await localforage.setItem(SYNC_QUEUE_KEY, queue);
      logger.info('SYNC', 'OPERATION_ADDED_TO_QUEUE', { entity: operation.entity, idempotencyKey: operation.idempotencyKey });
      return { ok: true, op: newOp };
    });
  },

  /**
   * CP-POS-002 (D2): disponibilidad local DERIVADA — snapshot − reservas de
   * operaciones no resueltas. No existe contador de reserva independiente.
   */
  async getReservedByProduct(storeId: string): Promise<Map<string, number>> {
    const queue = await this.getQueue();
    const byProduct = new Map<string, number>();
    for (const op of queue) {
      if (!RESERVING_STATUSES.has(op.status)) continue;
      for (const line of extractSaleLines(op)) {
        if (line.storeId !== storeId) continue;
        byProduct.set(
          line.productId,
          (byProduct.get(line.productId) ?? 0) + line.baseQty,
        );
      }
    }
    return byProduct;
  },

  /**
   * Get all operations in the queue
   */
  async getQueue(): Promise<SyncOperationType[]> {
    const queue = await localforage.getItem<SyncOperationType[]>(SYNC_QUEUE_KEY);
    return queue || [];
  },

  /**
   * Get pending operations.
   * CP-POS-002 (D6): orden FIFO estricto por clientClock (fecha de creación)
   * dentro de cada prioridad; las que esperan reintento (retry_wait) solo
   * entran si su nextRetryAt ya venció. Las operaciones en conflicto NO
   * bloquean a las demás: simplemente no se seleccionan.
   */
  async getPendingOperations(now = Date.now()): Promise<SyncOperationType[]> {
    const queue = await this.getQueue();
    return queue
      .filter((op) => {
        if (op.status === 'pending' || op.status === 'failed') return true;
        if (op.status === 'retry_wait') {
          const due = (op as { nextRetryAt?: number }).nextRetryAt ?? 0;
          return due <= now;
        }
        return false;
      })
      .sort((a, b) => {
        const priorityDiff = getOperationPriority(a.entity) - getOperationPriority(b.entity);
        if (priorityDiff !== 0) return priorityDiff;
        return a.clientClock - b.clientClock;
      });
  },

  /**
   * Operaciones que reservan inventario y no están resueltas — para la
   * vista "Ventas por resolver" (D4) y la reserva (D2).
   */
  async getReservingOperations(): Promise<SyncOperationType[]> {
    const queue = await this.getQueue();
    return queue.filter((op) => RESERVING_STATUSES.has(op.status));
  },

  /**
   * FIX: Obtiene operaciones que fallaron tras MAX_RETRIES.
   */
  async getFailedOperations(): Promise<SyncOperationType[]> {
    const queue = await this.getQueue();
    return queue.filter(op => op.status === 'failed' && op.attempts >= 3);
  },

  /**
   * CP-POS-002 (D4): ventas por resolver — conflicto de negocio/integridad
   * o reintentos agotados. Conservan payload y llave íntegros.
   */
  async getUnresolvedSales(): Promise<SyncOperationType[]> {
    const queue = await this.getQueue();
    return queue
      .filter(
        (op) =>
          op.entity === 'sale' &&
          (op.status === 'conflict' || op.status === 'retry_exhausted'),
      )
      .sort((a, b) => a.clientClock - b.clientClock);
  },

  /**
   * FIX: Cuenta operaciones fallidas para mostrar en UI.
   */
  async getFailedCount(): Promise<number> {
    const failed = await this.getFailedOperations();
    return failed.length;
  },

  /**
   * Update an operation status
   */
  async updateOperationStatus(idempotencyKey: string, status: SyncOperationType['status'], lastError?: string): Promise<void> {
    await enqueueMutation(async () => {
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
    });
  },

  /**
   * Update an operation
   */
  async updateOperation(idempotencyKey: string, updates: Partial<SyncOperationType>): Promise<void> {
    await enqueueMutation(async () => {
      const queue = await this.getQueue();
      const index = queue.findIndex(op => op.idempotencyKey === idempotencyKey);

      if (index !== -1) {
        queue[index] = { ...queue[index], ...updates };
        await localforage.setItem(SYNC_QUEUE_KEY, queue);
      }
    });
  },

  /**
   * Remove synced operations from the queue
   */
  async removeSyncedOperations(): Promise<void> {
    await enqueueMutation(async () => {
      const queue = await this.getQueue();
      const filteredQueue = queue.filter(op => op.status !== 'synced');
      await localforage.setItem(SYNC_QUEUE_KEY, filteredQueue);
    });
  },

  /**
   * Save an offline snapshot of data (e.g., product list)
   */
  async saveSnapshot(key: string, data: unknown): Promise<void> {
    try {
        const snapshots = await localforage.getItem<Record<string, { data: unknown; timestamp: number }>>(OFFLINE_SNAPSHOT_KEY) || {};
        snapshots[key] = {
          data,
          timestamp: Date.now(),
        };
        await localforage.setItem(OFFLINE_SNAPSHOT_KEY, snapshots);
        logger.info('SYNC', 'SNAPSHOT_SAVED', { key });
    } catch (err) {
        logger.error('SYNC', 'SNAPSHOT_SAVE_FAILED', { key, error: String(err) });
    }
  },

  /**
   * Get an offline snapshot
   */
  async getSnapshot<T>(key: string): Promise<T | null> {
    const snapshots = await localforage.getItem<Record<string, { data: T; timestamp: number }>>(OFFLINE_SNAPSHOT_KEY);
    const snapshot = snapshots?.[key];
    if (snapshot) {
        logger.info('SYNC', 'SNAPSHOT_RETRIEVED', { key, age: Date.now() - snapshot.timestamp });
        return snapshot.data;
    }
    return null;
  },

  /**
   * CP-POS-002 (D5): timestamp del snapshot — base REAL de la antigüedad
   * (la que guarda saveSnapshot al escribir; timestamps inválidos se tratan
   * como "desconocido" → null, nunca como fresco).
   */
  async getSnapshotTimestamp(key: string, now = Date.now()): Promise<number | null> {
    const snapshots = await localforage.getItem<Record<string, { data: unknown; timestamp: number }>>(OFFLINE_SNAPSHOT_KEY);
    const ts = snapshots?.[key]?.timestamp;
    if (typeof ts !== 'number' || !Number.isFinite(ts) || ts > now) return null;
    return ts;
  },

  /**
   * Clear all sync data
   */
  async clearAll(): Promise<void> {
    await enqueueMutation(async () => {
      await localforage.removeItem(SYNC_QUEUE_KEY);
      await localforage.removeItem(OFFLINE_SNAPSHOT_KEY);
      await localforage.removeItem(SALE_INTENTS_KEY);
    });
  },
};

/** Estados que reservan inventario (exportado para pruebas y motor). */
export const RESERVING_OPERATION_STATUSES = RESERVING_STATUSES;
