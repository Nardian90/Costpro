/**
 * CP-POS-002 (D3/D6) — Transiciones del motor: clasificación → estado de cola.
 * El fetch del motor se mockea; localforage en memoria. Se verifica que
 * NUNCA se toca llave/payload y que cada categoría lleva al estado correcto.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('localforage', () => ({
  default: {
    config: vi.fn(),
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: unknown) => { store.set(k, v); }),
    removeItem: vi.fn(async (k: string) => { store.delete(k); }),
  },
}));

import { SyncEngine } from '@/lib/sync/sync-engine';
import { offlineStorage } from '@/lib/sync/offline-storage';

const STORE = '11111111-1111-4111-8111-111111111111';
const KEY = '00000000-0000-4000-8000-000000000001';

function batchResult(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({ results: [{ idempotencyKey: KEY, status: 'error', ...over }] }),
  } as unknown as Response;
}

async function seedAndRun(resultOrError: unknown, attempts = 0) {
  await offlineStorage.addToQueue({
    entity: 'sale',
    operationType: 'CREATE',
    idempotencyKey: KEY,
    payload: { p_store_id: STORE, p_items: [], p_idempotency_key: 'sale-stable-1' },
  } as never);
  if (attempts > 0) {
    await offlineStorage.updateOperation(KEY, { attempts });
  }
  const engine = new SyncEngine();
  const fetchMock = vi.fn(async () =>
    resultOrError instanceof Error
      ? Promise.reject(resultOrError)
      : Promise.resolve(resultOrError as Response),
  );
  vi.stubGlobal('fetch', fetchMock);
  const outcome = await engine.processQueue();
  const queue = await offlineStorage.getQueue();
  const op = queue.find((q) => q.idempotencyKey === KEY)!;
  return { op, outcome, fetchMock };
}

beforeEach(() => {
  store.clear();
  localStorage.clear();
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CP-POS-002 · D3/D6 transiciones del motor', () => {
  it('conflicto de NEGOCIO (errorCode del batch) → status conflict, conserva llave y payload', async () => {
    const { op } = await seedAndRun(
      batchResult({ status: 'conflict', errorCode: 'ERR_INSUFFICIENT_STOCK', error: 'stock 2' }),
    );
    expect(op.status).toBe('conflict');
    expect(op.conflictType).toBe('business');
    expect(op.errorCode).toBe('ERR_INSUFFICIENT_STOCK');
    expect(op.payload.p_idempotency_key).toBe('sale-stable-1');
    expect(op.idempotencyKey).toBe(KEY);
    // La venta conflictiva queda en 'Ventas por resolver'.
    expect(await offlineStorage.getUnresolvedSales()).toHaveLength(1);
  });

  it('conflicto de INTEGRIDAD (llave reutilizada) → conflict, sin reintento automático', async () => {
    const { op } = await seedAndRun(
      batchResult({ status: 'conflict', errorCode: 'ERR_IDEMPOTENCY_KEY_REUSE' }),
    );
    expect(op.status).toBe('conflict');
    expect(op.conflictType).toBe('integrity');
  });

  it('TRANSITORIO (5xx) → retry_wait con nextRetryAt; el payload no cambia', async () => {
    const { op } = await seedAndRun(
      batchResult({ status: 'error', error: 'HTTP 503: Service Unavailable' }),
    );
    expect(op.status).toBe('retry_wait');
    expect(op.nextRetryAt).toBeGreaterThan(Date.now() - 1);
    expect(op.attempts).toBe(1);
    expect(op.payload.p_idempotency_key).toBe('sale-stable-1');
  });

  it('401 → auth_required: pausa sin consumir reintentos; no es conflicto', async () => {
    const { op, outcome } = await seedAndRun(
      batchResult({ status: 'error', error: 'HTTP 401: No autorizado' }),
    );
    expect(op.status).toBe('auth_required');
    expect(op.attempts).toBe(0);
    expect(op.conflictType).toBeUndefined();
    expect(outcome.authPaused).toBe(true);
  });

  it('agotamiento: 8 intentos transitorios → retry_exhausted (conserva TODO, no conflicto)', async () => {
    const { op } = await seedAndRun(
      batchResult({ status: 'error', error: 'HTTP 503: down' }),
      7, // séptimo intento previo → este es el 8º y último
    );
    expect(op.status).toBe('retry_exhausted');
    expect(op.attempts).toBe(8);
    expect(op.payload.p_idempotency_key).toBe('sale-stable-1');
    expect(await offlineStorage.getUnresolvedSales()).toHaveLength(1);
  });

  it('éxito → synced (el replay idempotente también es éxito)', async () => {
    const { outcome } = await seedAndRun(
      batchResult({ status: 'ok', idempotencyOutcome: 'idempotent' }),
    );
    expect(outcome.synced).toBe(1);
    // Las ops synced se purgan de la cola al final del ciclo.
    const q = await offlineStorage.getQueue();
    expect(q.find((o) => o.idempotencyKey === KEY)).toBeUndefined();
  });

  it('error de red (fetch rechazado) → retry_wait transitorio', async () => {
    const { op } = await seedAndRun(new TypeError('fetch failed'));
    expect(op.status).toBe('retry_wait');
  });

  it('dos invocaciones del motor: la segunda NO reenvía mientras corre la primera (reentrada)', async () => {
    await offlineStorage.addToQueue({
      entity: 'sale', operationType: 'CREATE', idempotencyKey: KEY,
      payload: { p_store_id: STORE, p_items: [] },
    } as never);
    const engine = new SyncEngine();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const fetchMock = vi.fn(async () => {
      await gate; // mantiene la primera ejecución en vuelo
      return batchResult({ status: 'ok' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const first = engine.processQueue();
    // Microtask: la primera ya tomó el cerrojo.
    await new Promise((r) => setTimeout(r, 20));
    const second = await engine.processQueue();
    expect(second.synced).toBe(0); // cerrojo en memoria: no reenvía
    release();
    const firstOutcome = await first;
    expect(firstOutcome.synced).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('una venta conflictiva NO impide procesar la venta siguiente', async () => {
    const KEY2 = '00000000-0000-4000-8000-000000000002';
    await offlineStorage.addToQueue({
      entity: 'sale', operationType: 'CREATE', idempotencyKey: KEY,
      payload: { p_store_id: STORE, p_items: [] },
    } as never);
    await offlineStorage.addToQueue({
      entity: 'sale', operationType: 'CREATE', idempotencyKey: KEY2,
      payload: { p_store_id: STORE, p_items: [] },
    } as never);
    const engine = new SyncEngine();
    const results: Array<Record<string, unknown>> = [
      { idempotencyKey: KEY, status: 'conflict', errorCode: 'ERR_INSUFFICIENT_STOCK' },
      { idempotencyKey: KEY2, status: 'ok' },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ results: [results.shift()] }),
    } as unknown as Response)));
    const outcome = await engine.processQueue();
    expect(outcome.conflicts).toBe(1);
    expect(outcome.synced).toBe(1);
    const q = await offlineStorage.getQueue();
    expect(q.find((o) => o.idempotencyKey === KEY)!.status).toBe('conflict');
    // La independiente se sincronizó (y se purgó de la cola).
    expect(q.find((o) => o.idempotencyKey === KEY2)).toBeUndefined();
  });

  it('reintento manual (retryFailed) mantiene la MISMA llave y resetea attempts', async () => {
    const { op } = await seedAndRun(
      batchResult({ status: 'error', error: 'HTTP 503: down' }),
      8,
    );
    expect(op.status).toBe('retry_exhausted');
    const engine = new SyncEngine();
    vi.stubGlobal('fetch', vi.fn(async () => batchResult({ status: 'ok' })));
    const count = await engine.retryFailed();
    expect(count).toBeGreaterThanOrEqual(1);
    const q = await offlineStorage.getQueue();
    const o = q.find((x) => x.idempotencyKey === KEY)!;
    expect(o.attempts).toBe(0);
    expect(o.idempotencyKey).toBe(KEY);
  });
});
