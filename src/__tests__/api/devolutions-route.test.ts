/**
 * MISIÓN POST-MERGE FINAL (2026-10-24) — contrato de la ruta /api/devolutions.
 *
 * Drive el REAL POST /api/devolutions handler con un mock capturador del
 * cliente admin: registra el RPC exacto (create_devolution_v2) y sus args
 * (actor SIEMPRE p_user_id de la sesión; p_refund_currency viaja del body).
 * Escenarios: validación zod, tienda, mapeo de errores ERR_* de la regla
 * contable del reembolso (422 accionable) e idempotencia cooperativa.
 * No se toca la BD (mocks) — la validación DEFINITIVA es del RPC (PG).
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

const rolesState = { canManage: true };
vi.mock('@/lib/roles', () => ({
  canManageStore: vi.fn(() => rolesState.canManage),
}));

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
  rolesState.canManage = true;
});

const OK_DEV = {
  store_id: 'store-1',
  reason: 'Producto defectuoso',
  items: [{ product_id: '11111111-1111-4111-8111-111111111111', quantity: 1, unit_price: 500 }],
  original_transaction_id: '22222222-2222-4222-8222-222222222222',
  payment_method: 'cash',
  refund_currency: 'CUP',
};

describe('POST /api/devolutions — contrato de la regla contable del reembolso', () => {
  it('llama create_devolution_v2 con actor de sesión + p_refund_currency del body', async () => {
    rpcResult.value = { data: { status: 'success', devolution_id: 'd1' }, error: null };
    const res = await CREATE(makeReq({ ...OK_DEV, refund_currency: 'USD' }));
    expect(res.status).toBe(200);
    expect(rpcCalls[0].name).toBe('create_devolution_v2');
    expect(rpcCalls[0].args.p_user_id).toBe('user-1'); // actor = sesión, nunca del body
    expect(rpcCalls[0].args.p_refund_currency).toBe('USD');
    expect(rpcCalls[0].args.p_original_transaction_id).toBe(OK_DEV.original_transaction_id);
  });

  it('refund_currency inválida → 400 (zod) — nunca llega al RPC', async () => {
    const res = await CREATE(makeReq({ ...OK_DEV, refund_currency: 'EUR' }));
    expect(res.status).toBe(400);
    expect(rpcCalls.length).toBe(0);
  });

  it('tienda sin permiso (canManageStore=false) → 403 sin llamar al RPC', async () => {
    rolesState.canManage = false;
    const res = await CREATE(makeReq(OK_DEV));
    expect(res.status).toBe(403);
    expect(rpcCalls.length).toBe(0);
  });

  it('idempotencia cooperativa: la clave del body viaja; sin clave se mintea (dev-)', async () => {
    rpcResult.value = { data: { status: 'success' }, error: null };
    const key = 'dev-fixed-key-12345678';
    await CREATE(makeReq({ ...OK_DEV, idempotency_key: key }));
    expect(rpcCalls[0].args.p_idempotency_key).toBe(key);
    await CREATE(makeReq(OK_DEV));
    expect(String(rpcCalls[1].args.p_idempotency_key)).toMatch(/^dev-/);
  });

  it('ERR_DEVOLUTION_REFUND_CAP → 422 con mensaje accionable (tope por moneda)', async () => {
    rpcResult.value = { data: null, error: { message: 'ERR_DEVOLUTION_REFUND_CAP: reembolso en CUP excede lo reembolsable de esa moneda para esta venta (pagado neto=0, ya reembolsado=0, solicitado=4000) — no se convierte implícitamente el pago de otra moneda' } };
    const res = await CREATE(makeReq(OK_DEV));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('ERR_DEVOLUTION_REFUND_CAP');
    expect(body.error).toContain('lo reembolsable de esa moneda');
  });

  it('ERR_INSUFFICIENT_CURRENCY → 422 (físico por moneda — paridad correctiva 2222)', async () => {
    rpcResult.value = { data: null, error: { message: 'ERR_INSUFFICIENT_CURRENCY: saldo físico CUP disponible=100, reembolso=3000' } };
    const res = await CREATE(makeReq(OK_DEV));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('ERR_INSUFFICIENT_CURRENCY');
  });

  it('ERR_DEVOLUTION_PAYMENTS_UNDETERMINED → 422 (pagos indeterminables)', async () => {
    rpcResult.value = { data: null, error: { message: 'ERR_DEVOLUTION_PAYMENTS_UNDETERMINED: la venta original no tiene pagos determinables' } };
    const res = await CREATE(makeReq(OK_DEV));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('ERR_DEVOLUTION_PAYMENTS_UNDETERMINED');
  });

  it('errores conocidos adicionales: CAP_EXCEEDED 422 · CROSS_STORE 403 · KEY_REUSE 409', async () => {
    const cases: Array<[string, number]> = [
      ['ERR_DEVOLUTION_CAP_EXCEEDED: producto X vendido=10 devuelto=6 solicitado=8', 422],
      ['ERR_CROSS_STORE: original_transaction_id does not belong to store_id', 403],
      ['ERR_IDEMPOTENCY_KEY_REUSE: la clave k ya está ligada a otra identidad', 409],
      ['ERR_UNAUTHORIZED', 403],
    ];
    for (const [msg, expectedStatus] of cases) {
      rpcResult.value = { data: null, error: { message: msg } };
      const res = await CREATE(makeReq(OK_DEV));
      expect(res.status).toBe(expectedStatus);
    }
  });

  it('error desconocido sigue siendo 500 (sin enmascarar fallos reales)', async () => {
    rpcResult.value = { data: null, error: { message: 'something exploded' } };
    const res = await CREATE(makeReq(OK_DEV));
    expect(res.status).toBe(500);
  });
});
