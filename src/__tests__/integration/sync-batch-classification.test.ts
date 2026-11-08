/**
 * CP-POS-002 (D3/D8) — Clasificación server-side en /api/sync/batch:
 * campos canónicos por operación, éxito idempotente SOLO con evidencia, y
 * protección del comportamiento de entidades NO-venta (recepciones,
 * transferencias, ajustes) con la clasificación nueva.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const USER = '99999999-8888-4777-8666-555555555555';
const UUID_STORE = '11111111-2222-4333-8444-555555555555';
const OP = '00000000-0000-4000-8000-000000000001';
const OP2 = '00000000-0000-4000-8000-000000000002';

const rpcCalls: Array<{ name: string; args: any }> = [];
let rpcResult: { data: unknown; error: { message: string; code?: string } | null } = {
  data: 'tx-1',
  error: null,
};
const logSelect = vi.fn();

function buildClient() {
  const builder: any = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.single = async () => ({ data: logSelect() });
  return {
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return rpcResult;
    },
    from: (table: string) => {
      if (table === 'sync_log') {
        const b: any = {};
        b.select = () => b;
        b.eq = () => b;
        b.single = async () => ({ data: logSelect() });
        b.upsert = async () => ({ error: null });
        return b;
      }
      if (table === 'receipts') {
        const b: any = {};
        b.select = () => b;
        b.eq = () => b;
        b.maybeSingle = async () => ({ data: null });
        return b;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => (req: any) => fn(req, req.__session),
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: () => true }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-errors', () => ({
  createApiError: (code: string, msg?: string) => ({ error: code, message: msg ?? code }),
}));
vi.mock('@/lib/receipt-items-validation', () => ({
  validateReceiptItemsTasa: vi.fn(() => ({ valid: true, error: null, details: null })),
}));
vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseAuthClient: vi.fn(),
  supabase: {},
}));

import { POST as syncBatchPOST } from '@/app/api/sync/batch/route';
import { getSupabaseAuthClient } from '@/lib/supabaseClient';
// Delegar al builder EN RUNTIME (patrón sync-batch-w4-roundtrips: sin
// referencias top-level en los factories de vi.mock).
(getSupabaseAuthClient as any).mockImplementation(() => buildClient());

function makeReq(operations: unknown[]) {
  return {
    method: 'POST',
    headers: {
      get: (n: string) => (n.toLowerCase() === 'x-forwarded-for' ? 't' : null),
    },
    json: async () => ({
      clientInfo: { userId: USER, deviceId: 'test' },
      operations,
    }),
    __session: {
      user: { id: USER, role: 'admin', memberships: [{ store_id: UUID_STORE, status: 'active' }] },
      token: 't',
    },
  } as never;
}

function op(key: string, entity: string, payload: unknown) {
  return {
    idempotencyKey: key,
    operationType: 'CREATE',
    entity,
    payload,
    createdAt: '2026-11-08T00:00:00.000Z',
    clientClock: 0,
    status: 'pending',
    attempts: 0,
  };
}

const saleOp = (key: string) =>
  op(key, 'sale', {
    p_store_id: UUID_STORE,
    p_items: [{ product_id: 'p1', quantity: 1 }],
  });

beforeEach(() => {
  rpcCalls.length = 0;
  logSelect.mockReset().mockReturnValue(null);
  rpcResult = { data: 'tx-1', error: null };
  // El test de aislamiento reinstala el mock con su propio builder: se
  // restaura el estándar antes de cada test (orden-independiente).
  (getSupabaseAuthClient as any).mockImplementation(() => buildClient());
});

describe('CP-POS-002 · D3 clasificación server-side en /api/sync/batch', () => {
  it('error de NEGOCIO (ERR_*) → status conflict + categoría + código + mensaje ES', async () => {
    rpcResult = { data: null, error: { message: 'ERR_INSUFFICIENT_STOCK: product p1, stock 2, requested 5' } };
    const res = await syncBatchPOST(makeReq([saleOp(OP)]));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.results[0].status).toBe('conflict');
    expect(body.results[0].category).toBe('conflict_business');
    expect(body.results[0].conflictType).toBe('business');
    expect(body.results[0].errorCode).toBe('ERR_INSUFFICIENT_STOCK');
    expect(body.results[0].retryable).toBe(false);
    expect(body.results[0].message).toContain('Stock insuficiente');
  });

  it('llave reutilizada con contenido distinto → conflicto de INTEGRIDAD', async () => {
    rpcResult = { data: null, error: { message: 'ERR_IDEMPOTENCY_KEY_REUSE' } };
    const res = await syncBatchPOST(makeReq([saleOp(OP)]));
    const body = await res.json();
    expect(body.results[0].status).toBe('conflict');
    expect(body.results[0].category).toBe('conflict_integrity');
    expect(body.results[0].conflictType).toBe('integrity');
  });

  it('23505 del índice de idempotencia → integridad (NO éxito idempotente asumido)', async () => {
    rpcResult = {
      data: null,
      error: {
        message: 'duplicate key value violates unique constraint "transactions_idempotency_key_store_idx"',
        code: '23505',
      },
    };
    const res = await syncBatchPOST(makeReq([saleOp(OP)]));
    const body = await res.json();
    expect(body.results[0].status).toBe('conflict');
    expect(body.results[0].category).toBe('conflict_integrity');
  });

  it('ERR_INVOICE_DUPLICATE de recepción → conflict de negocio (antes: error reintentable)', async () => {
    rpcResult = { data: null, error: { message: 'ERR_INVOICE_DUPLICATE: el número de factura "F" ya existe' } };
    const res = await syncBatchPOST(makeReq([
      op(OP, 'reception', { p_store_id: UUID_STORE, p_supplier: 'S', p_invoice_number: 'F', p_items: [] }),
    ]));
    const body = await res.json();
    expect(body.results[0].status).toBe('conflict');
    expect(body.results[0].errorCode).toBe('ERR_INVOICE_DUPLICATE');
  });

  it('aislamiento: el conflicto de una venta NO convierte a la otra en conflicto', async () => {
    // 1ª llamada falla (negocio), 2ª ok.
    let call = 0;
    (getSupabaseAuthClient as any).mockImplementation(() => ({
      rpc: async () => {
        call += 1;
        return call === 1
          ? { data: null, error: { message: 'ERR_INSUFFICIENT_STOCK: x' } }
          : { data: 'tx-2', error: null };
      },
      from: () => {
        const b: any = {};
        b.select = () => b; b.eq = () => b;
        b.single = async () => ({ data: null });
        b.maybeSingle = async () => ({ data: null });
        b.upsert = async () => ({ error: null });
        return b;
      },
    }));
    const res = await syncBatchPOST(makeReq([saleOp(OP), saleOp(OP2)]));
    const body = await res.json();
    expect(body.results[0].status).toBe('conflict');
    expect(body.results[1].status).toBe('ok');
  });

  it('éxito idempotente certificado por la RPC → ok + idempotencyOutcome=idempotent', async () => {
    rpcResult = { data: { status: 'idempotent', transaction_id: 'tx-previa' }, error: null };
    const res = await syncBatchPOST(makeReq([saleOp(OP)]));
    const body = await res.json();
    expect(body.results[0].status).toBe('ok');
    expect(body.results[0].idempotencyOutcome).toBe('idempotent');
  });

  it('éxito de ejecución nueva → ok + idempotencyOutcome=executed', async () => {
    rpcResult = { data: 'tx-nueva', error: null };
    const res = await syncBatchPOST(makeReq([saleOp(OP)]));
    const body = await res.json();
    expect(body.results[0].status).toBe('ok');
    expect(body.results[0].idempotencyOutcome).toBe('executed');
  });

  it('replay por sync_log ok previo → ok idempotente SIN re-ejecutar la RPC', async () => {
    logSelect.mockReturnValue({
      status: 'ok',
      response_data: { id: 'tx-log' },
    });
    const res = await syncBatchPOST(makeReq([saleOp(OP)]));
    const body = await res.json();
    expect(body.results[0].status).toBe('ok');
    expect(body.results[0].idempotencyOutcome).toBe('idempotent');
    expect(body.results[0].serverId).toBe('tx-log');
    expect(rpcCalls).toHaveLength(0); // no re-ejecutó
  });
});

describe('CP-POS-002 · D8 protección de entidades NO-venta (cola compartida)', () => {
  it('recepción: register_reception sigue siendo el RPC y su error de negocio se clasifica', async () => {
    rpcResult = { data: null, error: { message: 'ERR_SUPPLIER_REQUIRED: supplier is mandatory' } };
    const res = await syncBatchPOST(makeReq([
      op(OP, 'reception', { p_store_id: UUID_STORE, p_supplier: null, p_items: [] }),
    ]));
    const body = await res.json();
    expect(rpcCalls[0]!.name).toBe('register_reception');
    expect(body.results[0].status).toBe('conflict');
    expect(body.results[0].errorCode).toBe('ERR_SUPPLIER_REQUIRED');
  });

  it('ajuste: perform_inventory_adjustment se invoca igual (contrato intacto)', async () => {
    rpcResult = { data: 'adj-1', error: null };
    const res = await syncBatchPOST(makeReq([
      op(OP, 'adjustment', { p_store_id: UUID_STORE, adjustments: [] }),
    ]));
    expect(rpcCalls[0]!.name).toBe('perform_inventory_adjustment');
    const body = await res.json();
    expect(body.results[0].status).toBe('ok');
  });

  it('transferencia: create_transfer se invoca igual; error de tienda inactiva → negocio', async () => {
    rpcResult = { data: null, error: { message: 'ERR_ORIGIN_STORE_INACTIVE' } };
    const res = await syncBatchPOST(makeReq([
      op(OP, 'transfer', { p_origin_store_id: UUID_STORE, p_destination_store_id: UUID_STORE }),
    ]));
    expect(rpcCalls[0]!.name).toBe('create_transfer');
    const body = await res.json();
    expect(body.results[0].category).toBe('conflict_business');
  });

  it('entidad desconocida → error por operación (sin abortar el lote entero)', async () => {
    const res = await syncBatchPOST(makeReq([
      op(OP, 'desconocida', {}),
      saleOp(OP2),
    ]));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.results).toHaveLength(2);
    expect(body.results[0].status).toBe('error');
    expect(body.results[1].status).toBe('ok');
  });
});
