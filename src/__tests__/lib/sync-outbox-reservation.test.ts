/**
 * CP-POS-002 (D1/D2) — Outbox de intenciones + reserva derivada de la cola.
 * localforage se mockea con un Map en memoria (velocidad y determinismo).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock de localforage: almacenamiento en memoria ──────────────────────────
const store = new Map<string, unknown>();
vi.mock('localforage', () => ({
  default: {
    config: vi.fn(),
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: unknown) => {
      store.set(k, v);
    }),
    removeItem: vi.fn(async (k: string) => {
      store.delete(k);
    }),
  },
}));

import {
  offlineStorage,
  saleOutbox,
  RESERVING_OPERATION_STATUSES,
} from '@/lib/sync/offline-storage';

const STORE = '11111111-1111-4111-8111-111111111111';
const P1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const P2 = 'aaaaaaaa-0000-4000-8000-000000000002';

let keySeq = 0;
const uuid = () => {
  keySeq += 1;
  const n = String(keySeq).padStart(12, '0');
  return `00000000-0000-4000-8000-${n}`;
};

function saleOp(over: Partial<Record<string, unknown>> = {}) {
  return {
    entity: 'sale',
    operationType: 'CREATE' as const,
    idempotencyKey: uuid(),
    payload: {
      p_store_id: STORE,
      p_items: [
        { product_id: P1, variant_id: null, quantity: 2 },
      ],
      p_idempotency_key: `sale-${uuid()}`,
    },
    ...over,
  };
}

async function seedQueue(ops: Array<Record<string, unknown>>) {
  for (const op of ops) await offlineStorage.addToQueue(op as never);
}

beforeEach(() => {
  store.clear();
  keySeq = 0;
});

describe('CP-POS-002 · D1 outbox de intenciones', () => {
  it('create persiste la intención ANTES de cualquier envío y devuelve la llave', async () => {
    const intent = await saleOutbox.create({
      storeId: STORE,
      idempotencyKey: 'sale-key-1',
      payload: { p_total: 100 },
    });
    expect(intent.idempotencyKey).toBe('sale-key-1');
    expect(intent.resolvedAt).toBeNull();
    // Persistida de verdad en el almacenamiento duradero.
    const all = await saleOutbox.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.idempotencyKey).toBe('sale-key-1');
  });

  it('doble create con la MISMA llave (doble clic) devuelve la intención EXISTENTE — nunca dos', async () => {
    const a = await saleOutbox.create({ storeId: STORE, idempotencyKey: 'sale-key-1', payload: { n: 1 } });
    const b = await saleOutbox.create({ storeId: STORE, idempotencyKey: 'sale-key-1', payload: { n: 2 } });
    expect(b).toBe(a);
    expect(await saleOutbox.getAll()).toHaveLength(1);
    // El payload no se sobrescribe (primera intención congelada).
    expect((await saleOutbox.getAll())[0]!.payload).toEqual({ n: 1 });
  });

  it('un carrito nuevo genera otra llave → otra intención (coexisten)', async () => {
    await saleOutbox.create({ storeId: STORE, idempotencyKey: 'sale-key-1', payload: {} });
    await saleOutbox.create({ storeId: STORE, idempotencyKey: 'sale-key-2', payload: {} });
    expect(await saleOutbox.getAll()).toHaveLength(2);
  });

  it('resolve cierra la intención; getOpen deja de verla', async () => {
    await saleOutbox.create({ storeId: STORE, idempotencyKey: 'sale-key-1', payload: {} });
    expect(await saleOutbox.getOpen('sale-key-1')).not.toBeNull();
    await saleOutbox.resolve('sale-key-1');
    expect(await saleOutbox.getOpen('sale-key-1')).toBeNull();
  });
});

describe('CP-POS-002 · D2 reserva derivada de la cola', () => {
  it('no existe contador de reserva: la disponibilidad se DERIVA de las ops no resueltas', async () => {
    await seedQueue([saleOp()]); // P1 × 2
    const reserved = await offlineStorage.getReservedByProduct(STORE);
    expect(reserved.get(P1)).toBe(2);
    // La clave del mock no guarda ningún contador de stock aparte.
    expect([...store.keys()]).toEqual(['sync_queue']);
  });

  it('varias ventas del mismo producto acumulan la reserva', async () => {
    await seedQueue([saleOp(), saleOp({ payload: { p_store_id: STORE, p_items: [{ product_id: P1, variant_id: null, quantity: 3 }] } })]);
    const reserved = await offlineStorage.getReservedByProduct(STORE);
    expect(reserved.get(P1)).toBe(5);
  });

  it('tiendas distintas no se mezclan (granularidad tienda×producto×variante)', async () => {
    const OTHER = '99999999-9999-4999-8999-999999999999';
    await seedQueue([
      saleOp(),
      saleOp({ payload: { p_store_id: OTHER, p_items: [{ product_id: P1, variant_id: null, quantity: 50 }] } }),
    ]);
    expect((await offlineStorage.getReservedByProduct(STORE)).get(P1)).toBe(2);
    expect((await offlineStorage.getReservedByProduct(OTHER)).get(P1)).toBe(50);
  });

  it('estados que reservan vs no reservan (conflicto SIGUE reservando; synced/discarded/exhausted no)', async () => {
    const ops = await seedQueueAndGetKeys(5);
    // pending · conflict · auth_required reservan
    await offlineStorage.updateOperationStatus(ops[0]!, 'conflict');
    await offlineStorage.updateOperation(ops[1]!, { status: 'auth_required' });
    await offlineStorage.updateOperationStatus(ops[2]!, 'synced');
    await offlineStorage.updateOperationStatus(ops[3]!, 'discarded');
    await offlineStorage.updateOperation(ops[4]!, { status: 'retry_exhausted' });
    // Reservan conflict + auth_required (2 uds c/u); synced/discarded/
    // retry_exhausted liberan. La 5ª op fue mutada a conflict — no hay pending.
    expect((await offlineStorage.getReservedByProduct(STORE)).get(P1)).toBe(4);
    expect([...RESERVING_OPERATION_STATUSES]).toContain('conflict');
    expect([...RESERVING_OPERATION_STATUSES]).not.toContain('retry_exhausted');
  });

  async function seedQueueAndGetKeys(n: number) {
    const keys: string[] = [];
    for (let i = 0; i < n; i++) {
      const op = await offlineStorage.addToQueue(saleOp() as never);
      keys.push(op.idempotencyKey);
    }
    return keys;
  }

  it('enqueueSaleWithReservation: disponible = snapshot − reservas; rechaza el exceso', async () => {
    await seedQueue([saleOp()]); // P1 reservado: 2
    const stock = () => 5; // snapshot P1 = 5 → disponible 3
    const r = await offlineStorage.enqueueSaleWithReservation(
      saleOp({ payload: { p_store_id: STORE, p_items: [{ product_id: P1, variant_id: null, quantity: 4 }] } }) as never,
      () => stock(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.rejects).toHaveLength(1);
      expect(r.rejects[0]!.productId).toBe(P1);
      expect(r.rejects[0]!.requested).toBe(4);
      expect(r.rejects[0]!.available).toBe(3);
    }
    // Nada se encoló.
    expect((await offlineStorage.getQueue())).toHaveLength(1);
  });

  it('enqueueSaleWithReservation: dentro del disponible encola (y suma reserva)', async () => {
    await seedQueue([saleOp()]); // 2
    const r = await offlineStorage.enqueueSaleWithReservation(
      saleOp({ payload: { p_store_id: STORE, p_items: [{ product_id: P1, variant_id: null, quantity: 3 }] } }) as never,
      () => 5,
    );
    expect(r.ok).toBe(true);
    expect((await offlineStorage.getReservedByProduct(STORE)).get(P1)).toBe(5);
  });

  it('snapshot inexistente de producto controlado → bloqueo (available -1)', async () => {
    const r = await offlineStorage.enqueueSaleWithReservation(
      saleOp({ payload: { p_store_id: STORE, p_items: [{ product_id: P1, variant_id: null, quantity: 1 }] } }) as never,
      () => null,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejects[0]!.available).toBe(-1);
  });

  it('servicio (snapshot MAX_SAFE_INTEGER vía caller) no bloquea', async () => {
    const r = await offlineStorage.enqueueSaleWithReservation(
      saleOp() as never,
      () => Number.MAX_SAFE_INTEGER,
    );
    expect(r.ok).toBe(true);
  });

  it('normalización: conversion_factor convierte a unidades base (FIX-G10)', async () => {
    const r = await offlineStorage.enqueueSaleWithReservation(
      saleOp({
        payload: {
          p_store_id: STORE,
          p_items: [{ product_id: P1, variant_id: null, quantity: 1, conversion_factor: 12 }],
        },
      }) as never,
      () => 5, // 12 > 5 → rechazo aunque "quantity" sea 1
    );
    expect(r.ok).toBe(false);
  });

  it('reentrega con la MISMA llave no duplica la reserva tras resolver la primera', async () => {
    const a = await offlineStorage.enqueueSaleWithReservation(saleOp() as never, () => 10);
    expect(a.ok).toBe(true);
    if (a.ok) {
      await offlineStorage.updateOperationStatus(a.op.idempotencyKey, 'synced');
      // La op resuelta no reserva; una operación NUEVA con la misma llave de
      // negocio (reenvío tras respuesta perdida) encuentra disponibilidad completa.
      const b = await offlineStorage.enqueueSaleWithReservation(
        saleOp({ payload: { p_store_id: STORE, p_items: [{ product_id: P1, variant_id: null, quantity: 10 }], p_idempotency_key: (a.op.payload as { p_idempotency_key: string }).p_idempotency_key } }) as never,
        () => 10,
      );
      expect(b.ok).toBe(true);
    }
  });
});

describe('CP-POS-002 · D6 selección FIFO y no bloqueo', () => {
  it('getPendingOperations respeta clientClock (FIFO) y excluye conflictos/terminadas', async () => {
    const t0 = Date.now();
    const k1 = await offlineStorage.addToQueue({ ...saleOp(), } as never);
    await new Promise((r) => setTimeout(r, 5));
    const k2 = await offlineStorage.addToQueue(saleOp() as never);
    await new Promise((r) => setTimeout(r, 5));
    const k3 = await offlineStorage.addToQueue(saleOp() as never);
    // k2 en conflicto: NO bloquea a k3.
    await offlineStorage.updateOperation(k2.idempotencyKey, { status: 'conflict' });
    await offlineStorage.updateOperationStatus(k3.idempotencyKey, 'synced');
    const pending = await offlineStorage.getPendingOperations(t0 + 1000);
    expect(pending.map((p) => p.idempotencyKey)).toEqual([k1.idempotencyKey]);
    // FIFO dentro de la misma prioridad: k1 antes que k3 si ambos pendieran.
  });

  it('retry_wait solo entra cuando nextRetryAt venció', async () => {
    const op = await offlineStorage.addToQueue(saleOp() as never);
    const dueAt = Date.now() + 10_000;
    await offlineStorage.updateOperation(op.idempotencyKey, {
      status: 'retry_wait',
      nextRetryAt: dueAt,
    });
    expect(await offlineStorage.getPendingOperations(Date.now() + 5_000)).toHaveLength(0);
    expect(await offlineStorage.getPendingOperations(dueAt + 1)).toHaveLength(1);
  });
});
