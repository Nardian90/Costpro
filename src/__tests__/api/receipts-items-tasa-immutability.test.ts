/**
 * CP-RECEIPT-INTEGRITY-001 (2026-11-14) — contrato de la ruta
 * PATCH /api/inventory/receptions/[id]/items/[itemId].
 *
 * Antes (defecto demostrado en FAC-VITALLCONS-001): la ruta escribía
 * receipt_items con service_role SIN guard de estado y SIN recalcular
 * receipts.total_cost → permitía mutar recepciones confirmadas/anuladas/
 * revertidas y dejaba la cabecera desfasada (divergencia total_cost vs
 * líneas vs CP-FIN).
 *
 * Ahora: guard de estado en ruta (UX temprano) + delegación completa en la
 * RPC canónica update_receipt_item_tasa (guard autoritativo, auditoría dual,
 * recalculo de cabecera). Se drivea el handler REAL con mocks capturadores
 * (mismo patrón que payrolls-workers-integration-route).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sessionState = { value: { user: { id: 'a1111111-1111-1111-1111-111111111111', role: 'admin' } } as any };
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, sessionState.value),
  AuthenticatedSession: {},
}));

vi.mock('@/lib/observability', () => ({
  withTracing: (fn: any) => fn,
}));

// Evitar cargar el handler GET completo de costeo-dinamico (motor pesado)
vi.mock('@/app/api/inventory/costeo-dinamico/route', () => ({
  invalidateCacheForStore: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Estado controlable del admin client ───
type ItemRow = {
  moneda_recepcion: string;
  tasa_cambio_recepcion: number;
  receipts: { status: string; store_id: string };
};
const itemLookup = { value: { data: null as ItemRow | null, error: null as any } };
const rpcState = { value: { data: null as any, error: null as any } };
const rpcCalls: Array<{ name: string; args: any }> = [];

const mockAdminClient = {
  rpc: (name: string, args: any) => {
    rpcCalls.push({ name, args });
    return Promise.resolve(rpcState.value);
  },
  from: (table: string) => {
    if (table !== 'receipt_items') throw new Error(`tabla inesperada en admin mock: ${table}`);
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(itemLookup.value),
    };
  },
};
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdminSafe: () => mockAdminClient }));

import { PATCH } from '@/app/api/inventory/receptions/[id]/items/[itemId]/route';
import { invalidateCacheForStore } from '@/app/api/inventory/costeo-dinamico/route';

const URL_ITEM = 'http://localhost:3000/api/inventory/receptions/rc-1/items/it-1';
function makeReq(body: any, url = URL_ITEM): Request {
  return { method: 'PATCH', headers: new Map(), json: async () => body, url } as any;
}

async function call(body: any) {
  const res = await PATCH(makeReq(body) as any, sessionState.value);
  const data = await res.json();
  return { status: res.status, data };
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcCalls.length = 0;
  itemLookup.value = {
    data: { moneda_recepcion: 'USD', tasa_cambio_recepcion: 680, receipts: { status: 'active', store_id: 'store-1' } },
    error: null,
  };
  rpcState.value = {
    data: {
      status: 'success', receipt_item_id: 'it-1', receipt_id: 'rc-1',
      valor_anterior: 680, valor_nuevo: 700, moneda_anterior: 'USD', moneda_nueva: 'USD',
      new_total_cost: 192039436,
    },
    error: null,
  };
  sessionState.value = { user: { id: 'a1111111-1111-1111-1111-111111111111', role: 'admin' } };
});

describe('PATCH items/[itemId] — inmutabilidad económica (CP-RECEIPT-INTEGRITY-001)', () => {
  it('409 ERR_NOT_EDITABLE para recepción ACTIVE (defecto del caso FAC-VITALLCONS-001)', async () => {
    const { status, data } = await call({ tasa_cambio_recepcion: 700 });
    expect(status).toBe(409);
    expect(data.code).toBe('ERR_NOT_EDITABLE');
    expect(data.error).toContain('active');
    expect(data.remedio).toBeDefined();
    // NADA se escribe: ni item ni RPC
    expect(rpcCalls).toHaveLength(0);
  });

  it('409 para recepción VOIDED y para REVERSED', async () => {
    itemLookup.value.data!.receipts.status = 'voided';
    expect((await call({ tasa_cambio_recepcion: 700 })).status).toBe(409);

    itemLookup.value.data!.receipts.status = 'reversed';
    expect((await call({ tasa_cambio_recepcion: 700 })).status).toBe(409);
    expect(rpcCalls).toHaveLength(0);
  });

  it('delega en update_receipt_item_tasa cuando la recepción es PENDING', async () => {
    itemLookup.value.data!.receipts.status = 'pending';
    const { status, data } = await call({ tasa_cambio_recepcion: 700, motivo: 'corrección borrador' });

    expect(status).toBe(200);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe('update_receipt_item_tasa');
    expect(rpcCalls[0].args).toMatchObject({
      p_receipt_item_id: 'it-1',
      p_new_tasa_cambio_recepcion: 700,
      p_new_moneda_recepcion: null,
      p_user_id: 'a1111111-1111-1111-1111-111111111111',
    });
    // El total recalculado por el servidor viaja en la respuesta
    expect(data.receipt_total_cost_cup).toBe(192039436);
    expect(data.status).toBe('success');
    // Cache del costeo dinámico invalidada para la tienda del documento
    expect(invalidateCacheForStore).toHaveBeenCalledWith('store-1');
  });

  it('resuelve la tasa vigente si solo viene la moneda (CUP→tasa 1 implícita)', async () => {
    itemLookup.value.data = { moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1, receipts: { status: 'pending', store_id: 'store-1' } };
    const { status } = await call({ moneda_recepcion: 'USD', tasa_cambio_recepcion: 700 });
    expect(status).toBe(200);
    expect(rpcCalls[0].args.p_new_moneda_recepcion).toBe('USD');
    expect(rpcCalls[0].args.p_new_tasa_cambio_recepcion).toBe(700);
  });

  it('400 F-21 si FX con tasa ≤ 1.5 (antes de tocar la BD)', async () => {
    itemLookup.value.data!.receipts.status = 'pending';
    const { status, data } = await call({ moneda_recepcion: 'USD', tasa_cambio_recepcion: 1 });
    expect(status).toBe(400);
    expect(data.code).toBe('ERR_F21_TASA_INVALIDA');
    expect(rpcCalls).toHaveLength(0);
  });

  it('404 si el item no existe', async () => {
    itemLookup.value = { data: null, error: { message: 'no rows' } };
    const { status } = await call({ tasa_cambio_recepcion: 700 });
    expect(status).toBe(404);
  });

  it('400 si el body no trae moneda ni tasa', async () => {
    const { status, data } = await call({});
    expect(status).toBe(400);
    expect(data.error).toContain('Debe proporcionar');
  });

  it('403 para rol sin privilegio (cajero)', async () => {
    sessionState.value = { user: { id: 'a1111111-1111-1111-1111-111111111111', role: 'cajero' } };
    const { status } = await call({ tasa_cambio_recepcion: 700 });
    expect(status).toBe(403);
  });

  it('mapea errores de la RPC: ERR_NOT_EDITABLE→409, ERR_UNAUTHORIZED→403, F-21→400', async () => {
    itemLookup.value.data!.receipts.status = 'pending';

    rpcState.value = { data: null, error: { message: 'ERR_NOT_EDITABLE: solo recepciones pendientes' } };
    expect((await call({ tasa_cambio_recepcion: 700 })).status).toBe(409);

    rpcState.value = { data: null, error: { message: 'ERR_UNAUTHORIZED' } };
    expect((await call({ tasa_cambio_recepcion: 700 })).status).toBe(403);

    rpcState.value = { data: null, error: { message: 'ERR_CUP_RATE_MUST_BE_1: moneda CUP requiere tasa=1' } };
    expect((await call({ tasa_cambio_recepcion: 700 })).status).toBe(400);

    rpcState.value = { data: null, error: { message: 'ERR_ALREADY_VOIDED' } };
    expect((await call({ tasa_cambio_recepcion: 700 })).status).toBe(409);
  });

  it('propaga el resultado no_change de la RPC (no-op trazado, sin recalculo numérico)', async () => {
    itemLookup.value.data!.receipts.status = 'pending';
    rpcState.value = { data: { status: 'no_change' }, error: null };
    const { status, data } = await call({ tasa_cambio_recepcion: 680 });
    expect(status).toBe(200);
    expect(data.status).toBe('no_change');
    expect(invalidateCacheForStore).toHaveBeenCalledWith('store-1');
  });
});
