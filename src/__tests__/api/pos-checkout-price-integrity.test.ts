/**
 * FASE E-SEC — R-SEC-1: integridad del precio de venta en el checkout V2.
 *
 * Cubre la capa servida por el ROUTE (/api/pos/checkout):
 *   - Zod: price no finito (Infinity), string no numérico y negativo → 400.
 *   - El precio enviado por el cliente viaja al RPC como price_at_sale
 *     (flexibilidad comercial legítima: 500→490 NO se bloquea en el route).
 *   - Mapeo del nuevo error del RPC ERR_INVALID_PRICE → 400 "Precio inválido".
 *   - Supervisor sin token firmado → 403 (RC-1 se mantiene).
 *
 * La política de desvío (>=15% exige supervisor) vive en create_sale_v2
 * (migración 20260926000001_esec_price_integrity.sql) y se valida LIVE en
 * audit-evidence/FASE-E-SEC (matriz pre/post).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/pos/checkout/route';

const mockSession = {
  value: {
    user: { id: '8f1d2a34-0000-4000-8000-00000000 operator'.slice(0, 36), email: 'op@demo.com', role: 'admin', memberships: [] },
    token: 'user-jwt-token',
  } as any,
};

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, mockSession.value),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: () => true }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
}));

const rpcMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => ({ rpc: rpcMock }),
}));
vi.mock('@/lib/supervisor-token', () => ({
  verifySupervisorToken: vi.fn(() => ({ valid: true })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const STORE = 'd1d1d1d1-1111-4111-8111-111111111111';
const SELLER = '8f1d2a34-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function payload(overrides: Record<string, unknown> = {}) {
  return {
    store_id: STORE,
    seller_id: SELLER,
    payment_method: 'cash',
    discount_type: 'fixed',
    discount_value: 0,
    applied_taxes: [],
    tax_amount: 0,
    total_amount: 490,
    subtotal: 490,
    cash_amount: 490,
    transfer_amount: 0,
    zelle_amount: 0,
    sale_currency: 'CUP',
    sale_exchange_rate: 1,
    customer_id: null,
    customer_name: null,
    supervisor_user_id: null,
    supervisor_token: null,
    idempotency_key: `test-${Math.random().toString(36).slice(2)}`,
    items: [
      {
        product_id: 'aaaa1111-0000-4000-8000-000000000001',
        variant_id: null,
        quantity: 1,
        price: 490,
        cost: 200,
        cash_paid: 490,
        currency: 'CUP',
        exchange_rate: 1,
        cash_currency: 'CUP',
        transfer_currency: 'CUP',
        zelle_currency: 'USD',
        cash_discount_type: null,
        cash_discount_value: 0,
        cash_discount_currency: 'CUP',
        transfer_discount_type: null,
        transfer_discount_value: 0,
        transfer_discount_currency: 'CUP',
        zelle_discount_type: null,
        zelle_discount_value: 0,
        zelle_discount_currency: 'USD',
      },
    ],
    ...overrides,
  };
}

function makeReq(body: any) {
  return {
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    headers: new Headers({ 'content-type': 'application/json' }),
    method: 'POST',
  } as any;
}

function rpcOk() {
  rpcMock.mockResolvedValueOnce({
    data: { status: 'success', transaction_id: 'tx-1', calculated_total: 490 },
    error: null,
  });
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe('E-SEC — /api/pos/checkout: precio legítimamente editable sigue funcionando', () => {
  it('500→490 por ítem (2% < umbral) llega al RPC como price_at_sale=490 y responde 200', async () => {
    rpcOk();
    const res = await POST(makeReq(payload()), mockSession.value as any);
    expect(res.status).toBe(200);
    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe('create_sale_v2');
    expect(args.p_items[0].price_at_sale).toBe(490);
    expect(args.p_supervisor_user_id).toBeNull();
  });

  it('descuento global legítimo (fixed 10 sobre 500) reenvía discount_value al RPC', async () => {
    rpcOk();
    const body = payload({ total_amount: 490, discount_value: 10 });
    const res = await POST(makeReq(body), mockSession.value as any);
    expect(res.status).toBe(200);
    expect(rpcMock.mock.calls[0][1].p_discount_value).toBe(10);
  });
});

describe('E-SEC — valores de precio imposibles rechazados en la puerta (Zod)', () => {
  it('price = Infinity (JSON 1e999) → 400 y el RPC nunca se llama', async () => {
    const body = payload();
    (body.items[0] as any).price = Infinity;
    const res = await POST(makeReq(body), mockSession.value as any);
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('price = "NaN" (string no numérico) → 400', async () => {
    const body = payload();
    (body.items[0] as any).price = 'NaN';
    const res = await POST(makeReq(body), mockSession.value as any);
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('price = -1 → 400', async () => {
    const body = payload({ total_amount: -1, subtotal: -1, cash_amount: -1 });
    (body.items[0] as any).price = -1;
    const res = await POST(makeReq(body), mockSession.value as any);
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('price = "abc" → 400', async () => {
    const body = payload();
    (body.items[0] as any).price = 'abc';
    const res = await POST(makeReq(body), mockSession.value as any);
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('E-SEC — errores del RPC mapeados a HTTP', () => {
  it('ERR_INVALID_PRICE (defensa server-side contra bypass del route) → 400', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'ERR_INVALID_PRICE: price_at_sale=NaN product=abc' },
    });
    const res = await POST(makeReq(payload()), mockSession.value as any);
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toContain('Precio inválido');
  });

  it('ERR_SUPERVISOR_REQUIRED (desvío >=15% sin autorización) → 403', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'ERR_SUPERVISOR_REQUIRED: discount_pct=40' },
    });
    const res = await POST(makeReq(payload()), mockSession.value as any);
    expect(res.status).toBe(403);
  });

  it('ERR_TOTAL_MISMATCH (payload incoherente estilo UI antigua) → 422', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'ERR_TOTAL_MISMATCH: calculated=500, client=490' },
    });
    const res = await POST(makeReq(payload()), mockSession.value as any);
    expect(res.status).toBe(422);
  });
});

describe('E-SEC — autorización de supervisor (RC-1 se mantiene)', () => {
  it('supervisor_user_id SIN supervisor_token → 403 y el RPC nunca se llama', async () => {
    const body = payload({ supervisor_user_id: 'bbbb2222-0000-4000-8000-000000000002' });
    const res = await POST(makeReq(body), mockSession.value as any);
    expect(res.status).toBe(403);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
