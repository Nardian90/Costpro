/**
 * CP-RECEIPT-INTEGRITY-001 (2026-11-14) — contrato de la ruta
 * POST /api/inventory/receptions/backfill-tasas.
 *
 * Antes: actualizaba receipt_items con service_role filtrando SOLO por tienda
 * y rango de fechas (sin guard de estado: mutaba líneas de recepciones
 * CONFIRMADAS/ANULADAS/REVERTIDAS) y sin recalcular receipts.total_cost.
 *
 * Ahora: pre-check has_store_access_as (fail-fast), filtro
 * receipts.status='pending' obligatorio y delegación por item en la RPC
 * update_receipt_item_tasa (auditoría dual + recalculo de cabecera).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sessionState = { value: { user: { id: 'a1111111-1111-1111-1111-111111111111', role: 'admin' } } as any };
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, sessionState.value),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/app/api/inventory/costeo-dinamico/route', () => ({
  invalidateCacheForStore: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Admin client con builder capturador de filtros ───
// `data` admite boolean | null: la RPC devolvería null cuando falla con error.
const accessState = { value: { data: true as boolean | null, error: null as any } };
const queryState = { value: { data: [] as any[], error: null as any } };
const rpcItemResults = { queue: [] as Array<{ data: any; error: any }> };
const rpcCalls: Array<{ name: string; args: any }> = [];
const eqCalls: Array<[string, any]> = [];

const chain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn((col: string, val: any) => { eqCalls.push([col, val]); return chain; }),
  gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  then: (onOk: any, onErr: any) =>
    Promise.resolve({ data: queryState.value.data, error: queryState.value.error }).then(onOk, onErr),
};

const mockAdminClient = {
  rpc: (name: string, args: any) => {
    rpcCalls.push({ name, args });
    if (name === 'has_store_access_as') return Promise.resolve(accessState.value);
    if (name === 'update_receipt_item_tasa') {
      const next = rpcItemResults.queue.shift() ?? { data: { status: 'success', new_total_cost: 700 }, error: null };
      return Promise.resolve(next);
    }
    return Promise.resolve({ data: null, error: { message: `RPC inesperado: ${name}` } });
  },
  from: (table: string) => {
    if (table !== 'receipt_items') throw new Error(`tabla inesperada en admin mock: ${table}`);
    return chain;
  },
};
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdminSafe: () => mockAdminClient }));

import { POST } from '@/app/api/inventory/receptions/backfill-tasas/route';

const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
function makeReq(body: any): Request {
  return {
    method: 'POST', headers: new Map(), json: async () => body,
    url: 'http://localhost:3000/api/inventory/receptions/backfill-tasas',
  } as any;
}
async function call(body: any) {
  const res = await POST(makeReq(body) as any, sessionState.value);
  const data = await res.json();
  return { status: res.status, data };
}
const VALID = { store_id: STORE, moneda: 'USD' as const, tasa: 840, date_from: '2026-07-01', date_to: '2026-07-31' };

beforeEach(() => {
  vi.clearAllMocks();
  rpcCalls.length = 0;
  eqCalls.length = 0;
  rpcItemResults.queue = [];
  accessState.value = { data: true, error: null };
  queryState.value = { data: [], error: null };
  sessionState.value = { user: { id: 'a1111111-1111-1111-1111-111111111111', role: 'admin' } };
});

describe('POST backfill-tasas — guard de estado + recalculo (CP-RECEIPT-INTEGRITY-001)', () => {
  it('filtra EXCLUSIVAMENTE recepciones pending (guard de estado anti-legacy)', async () => {
    await call(VALID);
    expect(eqCalls).toContainEqual(['receipts.status', 'pending']);
    // Los filtros legacy se conservan (tienda + default CUP/tasa 1)
    expect(eqCalls).toContainEqual(['receipts.store_id', STORE]);
    expect(eqCalls).toContainEqual(['tasa_cambio_recepcion', 1.0]);
    expect(eqCalls).toContainEqual(['moneda_recepcion', 'CUP']);
  });

  it('403 fail-fast si has_store_access_as niega (sin tocar items)', async () => {
    accessState.value = { data: false, error: null };
    const { status, data } = await call(VALID);
    expect(status).toBe(403);
    expect(data.code).toBe('ERR_UNAUTHORIZED');
    expect(rpcCalls.filter((r) => r.name === 'update_receipt_item_tasa')).toHaveLength(0);
  });

  it('403 si has_store_access_as falla con error', async () => {
    accessState.value = { data: null, error: { message: 'boom' } };
    expect((await call(VALID)).status).toBe(403);
  });

  it('delega cada item en update_receipt_item_tasa y recalcula cabeceras', async () => {
    queryState.value.data = [
      { id: 'item-a', product_id: 'p1', receipts: { id: 'rc-a', status: 'pending', store_id: STORE, reception_date: '2026-07-01' } },
      { id: 'item-b', product_id: 'p2', receipts: { id: 'rc-a', status: 'pending', store_id: STORE, reception_date: '2026-07-02' } },
      { id: 'item-c', product_id: 'p3', receipts: { id: 'rc-b', status: 'pending', store_id: STORE, reception_date: '2026-07-03' } },
    ];
    rpcItemResults.queue = [
      { data: { status: 'success', new_total_cost: 5000 }, error: null },
      { data: { status: 'success', new_total_cost: 6000 }, error: null },
      { data: { status: 'success', new_total_cost: 7000 }, error: null },
    ];

    const { status, data } = await call({ ...VALID, motivo: 'regularización julio' });

    expect(status).toBe(200);
    const itemCalls = rpcCalls.filter((r) => r.name === 'update_receipt_item_tasa');
    expect(itemCalls).toHaveLength(3);
    expect(itemCalls[0].args).toMatchObject({
      p_receipt_item_id: 'item-a',
      p_new_tasa_cambio_recepcion: 840,
      p_new_moneda_recepcion: 'USD',
      p_user_id: 'a1111111-1111-1111-1111-111111111111',
    });
    // El motivo del usuario viaja íntegro (trazabilidad del lote);
    // sin motivo explícito la RPC recibiría el prefijo «Backfill masivo…».
    expect(itemCalls[0].args.p_motivo).toBe('regularización julio');
    // 3 items → 2 recepciones recalculadas (rc-a, rc-b) con totales frescos
    expect(data.updated).toBe(3);
    expect(data.recalculated_receipts).toBe(2);
    expect(data.totals_por_recepcion).toEqual({ 'rc-a': 6000, 'rc-b': 7000 });
  });

  it('aisla fallos por item: failed_items con causa y el resto procesado', async () => {
    queryState.value.data = [
      { id: 'item-a', product_id: 'p1', receipts: { id: 'rc-a', status: 'pending', store_id: STORE } },
      { id: 'item-b', product_id: 'p2', receipts: { id: 'rc-a', status: 'pending', store_id: STORE } },
    ];
    rpcItemResults.queue = [
      { data: null, error: { message: 'ERR_INVALID_EXCHANGE_RATE: tasa fuera de rango' } },
      { data: { status: 'success', new_total_cost: 123 }, error: null },
    ];

    const { status, data } = await call(VALID);
    expect(status).toBe(200);
    expect(data.updated).toBe(1);
    expect(data.failed).toBe(1);
    expect(data.failed_items[0]).toMatchObject({ itemId: 'item-a', error: expect.stringContaining('ERR_INVALID_EXCHANGE_RATE') });
  });

  it('respuesta honesta cuando no hay candidatos: menciona PENDIENTES', async () => {
    const { status, data } = await call(VALID);
    expect(status).toBe(200);
    expect(data.updated).toBe(0);
    expect(data.message).toContain('PENDIENTES');
  });

  it('400 con tasa ≤ 1.5 (F-21, rechazo antes de cualquier consulta)', async () => {
    const { status } = await call({ ...VALID, tasa: 1 });
    expect(status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it('403 para rol sin privilegio', async () => {
    sessionState.value = { user: { id: 'a1111111-1111-1111-1111-111111111111', role: 'cajero' } };
    expect((await call(VALID)).status).toBe(403);
  });
});
