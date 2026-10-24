/**
 * CP-MONEY-002 (D1, posmerge #1467) — CONTRATO DE PAYLOAD de /api/pos/checkout.
 *
 * Defecto demostrado contra la BD viva (2026-10-24): la ruta incluía SIEMPRE
 * la clave p_payment_components en el payload del RPC (null cuando no había
 * desglose) y la BD SIN migrar rechazaba la resolución con
 *   PGRST202 «Could not find the function public.create_sale_v2(p_payment_components)»
 * → TODA venta fallaba (incluidas las CUP/zelle puras), porque una clave con
 * valor null TAMBIÉN participa en la resolución de PostgREST (verificado con
 * la sonda {"p_payment_components": null} contra la BD de producción).
 *
 * Contrato corregido (fail-closed + compatible con ambos estados de BD):
 *   1. Venta SIN componentes (CUP pura / zelle puro): la clave NO VIAJA →
 *      resuelve contra la firma legada de 31 params (BD sin migrar) Y contra
 *      la firma de 32 params (p_payment_components jsonb DEFAULT NULL).
 *   2. Venta CON desglose mixto: la clave viaja con el array → exige la BD
 *      migrada; contra la BD sin migrar el error es PGRST202 y debe mapearse
 *      a un 503 accionable (ERR_RPC_SCHEMA_MISMATCH), no a un 500 opaco.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/pos/checkout/route';

const mockSession = {
  value: {
    user: { id: '8f1d2a34-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'op@demo.com', role: 'admin', memberships: [] },
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
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => ({ rpc: rpcMock }),
}));
const verifyMock = vi.fn(() => ({
  valid: true,
  payload: { jti: 'jti-test-1', scp: [] as Array<{ pid: string; vid: string | null; px: number }> },
}));
vi.mock('@/lib/supervisor-token', () => ({
  verifySupervisorToken: (...args: unknown[]) => verifyMock(...(args as [])),
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
    total_amount: 20000,
    subtotal: 20000,
    cash_amount: 20000,
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
        quantity: 2,
        price: 10000,
        cost: 4000,
        cash_paid: 20000,
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

const rpcMock = vi.fn();

function rpcOk() {
  rpcMock.mockResolvedValueOnce({
    data: { status: 'success', transaction_id: 'tx-1', calculated_total: 20000 },
    error: null,
  });
}

beforeEach(() => {
  rpcMock.mockReset();
  verifyMock.mockClear();
  verifyMock.mockImplementation(() => ({
    valid: true,
    payload: { jti: 'jti-test-1', scp: [] as Array<{ pid: string; vid: string | null; px: number }> },
  }));
});

describe('CP-MONEY-002 D1 · payload de checkout sin desglose mixto (venta CUP pura)', () => {
  it('la clave p_payment_components NO viaja — resuelve contra firma legada de 31 params (BD sin migrar)', async () => {
    rpcOk();
    const res = await POST(makeReq(payload()), mockSession.value as any);
    expect(res.status).toBe(200);
    const [, args] = rpcMock.mock.calls[0];
    expect(args).not.toHaveProperty('p_payment_components');
  });

  it('venta zelle pura (USD) tampoco viaja la clave — blast radius del fix acotado al desglose real', async () => {
    rpcOk();
    const res = await POST(
      makeReq(
        payload({
          payment_method: 'zelle',
          total_amount: 20000,
          subtotal: 20000,
          cash_amount: 0,
          transfer_amount: 0,
          zelle_amount: 20000,
          sale_currency: 'USD',
          sale_exchange_rate: 1000,
          items: [
            {
              product_id: 'aaaa1111-0000-4000-8000-000000000001',
              variant_id: null,
              quantity: 2,
              price: 20,
              cost: 4,
              zelle_paid: 20,
              currency: 'USD',
              exchange_rate: 1000,
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
        }),
      ),
      mockSession.value as any,
    );
    expect(res.status).toBe(200);
    const [, args] = rpcMock.mock.calls[0];
    expect(args).not.toHaveProperty('p_payment_components');
  });
});

describe('CP-MONEY-002 D1 · payload de checkout CON desglose mixto (misión §C: 5 USD + 15 000 CUP)', () => {
  it('la clave viaja con el desglose EXACTO por moneda — importes ORIGINALES sin convertir', async () => {
    rpcOk();
    const res = await POST(
      makeReq(
        payload({
          payment_method: 'mixed',
          payment_components: [
            { method: 'cash', currency: 'USD', amount: 5 },
            { method: 'cash', currency: 'CUP', amount: 15000 },
          ],
        }),
      ),
      mockSession.value as any,
    );
    expect(res.status).toBe(200);
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_payment_components).toEqual([
      { method: 'cash', currency: 'USD', amount: 5 },
      { method: 'cash', currency: 'CUP', amount: 15000 },
    ]);
  });
});

describe('CP-MONEY-002 D1 · PGRST202 (BD sin migrar) → 503 accionable, no 500 opaco', () => {
  it('mapea el error de resolución de PostgREST a ERR_RPC_SCHEMA_MISMATCH con mensaje de migración', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PGRST202',
        message:
          'Could not find the function public.create_sale_v2(p_payment_components) in the schema cache',
      },
    });
    const res = await POST(
      makeReq(
        payload({
          payment_method: 'mixed',
          payment_components: [
            { method: 'cash', currency: 'USD', amount: 5 },
            { method: 'cash', currency: 'CUP', amount: 15000 },
          ],
        }),
      ),
      mockSession.value as any,
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('ERR_RPC_SCHEMA_MISMATCH');
    expect(body.error).toContain('migraciones');
  });

  it('PGRST203 (ambigüedad de overloads) recibe el mismo trato — 503 accionable', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PGRST203',
        message:
          'Could not choose the best candidate function between: public.create_sale_v2(...31...), public.create_sale_v2(...32...)',
      },
    });
    const res = await POST(makeReq(payload()), mockSession.value as any);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('ERR_RPC_SCHEMA_MISMATCH');
  });
});
