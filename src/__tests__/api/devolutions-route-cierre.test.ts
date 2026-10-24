/**
 * MISIÓN DE CIERRE (2026-10-24) — contrato de la ruta /api/devolutions:
 * AS_PAID y los nuevos códigos de la regla contable (tasa histórica,
 * asignación mixta, tope de crédito, guards de riel).
 * Drive del REAL POST handler con mock capturador del cliente admin — la
 * validación DEFINITIVA es del RPC (PG); la ruta solo transporta y traduce.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as CREATE } from '@/app/api/devolutions/route';

const sessionState = {
  value: { user: { id: 'user-1', role: 'manager', memberships: [{ store_id: 'store-1', role: 'manager', status: 'active' }] } } as any,
};
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, sessionState.value),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: () => true }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }) }));
vi.mock('@/lib/roles', () => ({ canManageStore: () => true }));

const rpcCalls: Array<{ name: string; args: any }> = [];
const rpcResult = { value: { data: null as any, error: null as any } };
const mockAdminClient = {
  rpc: (name: string, args: any) => {
    rpcCalls.push({ name, args });
    return Promise.resolve(rpcResult.value);
  },
};
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdminSafe: () => mockAdminClient }));

function makeReq(body: any): Request {
  return {
    method: 'POST',
    headers: new Map([['x-forwarded-for', '127.0.0.1']]),
    json: async () => body,
    url: 'http://localhost:3000/api/devolutions',
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcCalls.length = 0;
  rpcResult.value = { data: null, error: null };
});

const OK_DEV = {
  store_id: 'store-1',
  reason: 'Producto defectuoso',
  items: [{ product_id: '11111111-1111-4111-8111-111111111111', quantity: 1, unit_price: 500 }],
  original_transaction_id: '22222222-2222-4222-8222-222222222222',
  payment_method: 'cash',
  refund_currency: 'CUP',
};

describe('POST /api/devolutions — AS_PAID y regla contable del cierre', () => {
  it('AS_PAID viaja al RPC como p_refund_currency (multi-moneda según lo pagado)', async () => {
    rpcResult.value = { data: { status: 'success', refund_currency: 'AS_PAID', refund_components: { CUP: 2000, USD: 5, rate_sale: 400 } }, error: null };
    const res = await CREATE(makeReq({ ...OK_DEV, refund_currency: 'AS_PAID' }));
    expect(res.status).toBe(200);
    expect(rpcCalls[0].name).toBe('create_devolution_v2');
    expect(rpcCalls[0].args.p_refund_currency).toBe('AS_PAID');
  });

  it('ERR_DEVOLUTION_RATE_UNDETERMINED → 422 accionable (tasa histórica no reconstruible)', async () => {
    rpcResult.value = { data: null, error: { message: 'ERR_DEVOLUTION_RATE_UNDETERMINED: la venta pagó USD pero su tasa histórica no es reconstruible — el reembolso USD queda bloqueado (regla §7: devolver la moneda y el importe neto realmente cobrados)' } };
    const res = await CREATE(makeReq({ ...OK_DEV, refund_currency: 'USD' }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('ERR_DEVOLUTION_RATE_UNDETERMINED');
    expect(body.error).toContain('tasa histórica');
  });

  it('ERR_DEVOLUTION_MIXED_ALLOCATION → 422 accionable (caso ambiguo bloqueado)', async () => {
    rpcResult.value = { data: null, error: { message: 'ERR_DEVOLUTION_MIXED_ALLOCATION: la devolución mixta exige consumir íntegramente lo reembolsable por moneda (valor devuelto=3000, componentes=1000 CUP + 2.5 USD a tasa 400) — no existe regla de asignación por artículo: el caso ambiguo se bloquea' } };
    const res = await CREATE(makeReq({ ...OK_DEV, refund_currency: 'AS_PAID' }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('ERR_DEVOLUTION_MIXED_ALLOCATION');
    expect(body.error).toContain('íntegramente lo reembolsable');
  });

  it('ERR_DEVOLUTION_CREDIT_CAP → 422 accionable (tope canónico del crédito)', async () => {
    rpcResult.value = { data: null, error: { message: 'ERR_DEVOLUTION_CREDIT_CAP: el crédito de tienda excede lo emitible canónico de la venta (pagado=100, crédito vigente=0, solicitado=150)' } };
    const res = await CREATE(makeReq({ ...OK_DEV, payment_method: 'store_credit', customer_id: '33333333-3333-4333-8333-333333333333' }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('ERR_DEVOLUTION_CREDIT_CAP');
  });

  it('guards de riel: AS_PAID no-efectivo y zelle-CUP → 422 accionable', async () => {
    rpcResult.value = { data: null, error: { message: 'ERR_DEVOLUTION_AS_PAID_CASH_ONLY: el reembolso según lo pagado (multi-moneda) exige entrega en efectivo (ambas monedas simultáneamente)' } };
    const res = await CREATE(makeReq({ ...OK_DEV, refund_currency: 'AS_PAID', payment_method: 'transfer' }));
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('ERR_DEVOLUTION_AS_PAID_CASH_ONLY');

    rpcResult.value = { data: null, error: { message: 'ERR_DEVOLUTION_ZELLE_CURRENCY: zelle opera en USD (riel del exterior) — un reembolso por zelle no puede emitirse en CUP' } };
    const res2 = await CREATE(makeReq({ ...OK_DEV, refund_currency: 'CUP', payment_method: 'zelle' }));
    expect(res2.status).toBe(422);
    expect((await res2.json()).code).toBe('ERR_DEVOLUTION_ZELLE_CURRENCY');
  });

  it('monedas inválidas siguen en 400 (zod) — EUR, minúsculas, vacío', async () => {
    for (const bad of ['EUR', 'as_paid', '']) {
      const res = await CREATE(makeReq({ ...OK_DEV, refund_currency: bad }));
      expect(res.status).toBe(400);
      expect(rpcCalls.length).toBe(0);
    }
  });

  it('el contrato previo se conserva: CUP/USD + tope por moneda → 422', async () => {
    rpcResult.value = { data: null, error: { message: 'ERR_DEVOLUTION_REFUND_CAP: reembolso en CUP excede lo reembolsable de esa moneda para esta venta (pagado neto=0, ya reembolsado=0, solicitado=4000) — no se convierte implícitamente el pago de otra moneda' } };
    const res = await CREATE(makeReq(OK_DEV));
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('ERR_DEVOLUTION_REFUND_CAP');
  });
});
