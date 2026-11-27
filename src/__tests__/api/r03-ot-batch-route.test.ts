/**
 * r03-ot-batch-route.test.ts — contrato estático de POST /api/payments/ot-batch
 * (R-03, CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 §0.1/§3.3/§3.4).
 *
 * Decisión del propietario: OPERACIÓN PARCIAL multi-OT (independencia entre
 * órdenes) con ATOMICIDAD dentro de cada orden (register_ot_payment_batch,
 * migration 20261127140000). Autorización canónica: gate canManageStore antes
 * de cualquier privilegio; cliente administrativo solo server-side; actor real
 * de la sesión; pre-check RLS por OT; resultados por ítem (convención bulk-pay).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as OT_BATCH_POST } from '@/app/api/payments/ot-batch/route';

const mockSession = { value: null as any };

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, { token: 't', user: mockSession.value }),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/with-security', () => ({
  withSecurity: (fn: any) => fn,
}));

const rpcMock = vi.fn();
const sessionRpcMock = vi.fn();
const adminClientMock = { rpc: rpcMock };

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: vi.fn(() => adminClientMock),
}));

const STORE_A = 'a1111111-1111-4111-8111-111111111111';
const OT_1 = '11111111-1111-4111-8111-111111111101';
const OT_2 = '11111111-1111-4111-8111-111111111102';

const sessionClientMock = {
  from: (table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { active_store_id: STORE_A }, error: null }),
          }),
        }),
      };
    }
    // Pre-check RLS por ítem: cada OT pertenece a la tienda A
    if (table === 'production_orders') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: 'x', store_id: STORE_A, order_number: 'R03-TEST', order_type: 'work', status: 'draft' }, error: null }),
          }),
        }),
      };
    }
    throw new Error(`tabla inesperada en el test: ${table}`);
  },
  rpc: sessionRpcMock,
};

vi.mock('@/lib/supabase-session', () => ({
  getSupabaseForSession: vi.fn(() => sessionClientMock),
}));

function makeRequest(body: unknown): any {
  return {
    method: 'POST',
    headers: new Map(),
    json: async () => body,
  };
}

beforeEach(() => {
  mockSession.value = {
    id: '11111111-2222-4111-8111-111111111111',
    email: 'manager@test',
    role: 'clerk', // la capacidad REAL viene de la membresía (roles.ts)
    memberships: [
      { store_id: STORE_A, role: 'manager', status: 'active' },
    ],
  };
  rpcMock.mockReset();
  sessionRpcMock.mockReset();
});

describe('POST /api/payments/ot-batch · R-03 operación parcial multi-OT', () => {
  it('todas correctas → 201 all_success, UNA llamada register_ot_payment_batch POR orden con bloque por OT y actor real', async () => {
    rpcMock.mockImplementation(async (_fn: string, args: any) => ({
      data: { payments: [{ id: 'p-1', index: 0, amount: args.p_payments[0].amount }], count: 1, replayed: false },
      error: null,
    }));
    const res = await OT_BATCH_POST(makeRequest({
      items: [
        { ref_id: OT_1, payments: [{ payment_method: 'cash', amount: 100, currency: 'CUP', exchange_rate: 1 }] },
        { ref_id: OT_2, payments: [{ payment_method: 'transfer', amount: 50, currency: 'CUP', exchange_rate: 1 }] },
      ],
      idempotency_key: 'lote-r03',
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.status).toBe('all_success');
    expect(json.success_count).toBe(2);
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(sessionRpcMock).not.toHaveBeenCalled();
    const [fn1, a1] = rpcMock.mock.calls[0];
    const [fn2, a2] = rpcMock.mock.calls[1];
    expect(fn1).toBe('register_ot_payment_batch');
    expect(fn2).toBe('register_ot_payment_batch');
    // Bloque de idempotencia POR ORDEN (reintento del lote = replay)
    expect(a1.p_idempotency_key).toBe(`otb:lote-r03:${OT_1}`);
    expect(a2.p_idempotency_key).toBe(`otb:lote-r03:${OT_2}`);
    expect(a1.p_store_id).toBe(STORE_A);
    expect(a1.p_paid_by).toBe('11111111-2222-4111-8111-111111111111');
    expect(a1.p_ref_type).toBe('work');
  });

  it('éxito parcial: una OT fallida (anulada) NO revierte la correcta → 201 partial con error_code y retryable:false', async () => {
    rpcMock.mockImplementation(async (_fn: string, args: any) => {
      if (args.p_ref_id === OT_2) {
        return { data: null, error: { message: 'ERR_ORDER_NOT_PAYABLE: la orden de trabajo está voided y no admite pagos nuevos (estado actual: voided)' } };
      }
      return { data: { payments: [{ id: 'p-1', index: 0, amount: 100 }], count: 1, replayed: false }, error: null };
    });
    const res = await OT_BATCH_POST(makeRequest({
      items: [
        { ref_id: OT_1, payments: [{ payment_method: 'cash', amount: 100, currency: 'CUP', exchange_rate: 1 }] },
        { ref_id: OT_2, payments: [{ payment_method: 'cash', amount: 100, currency: 'CUP', exchange_rate: 1 }] },
      ],
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.status).toBe('partial');
    expect(json.success_count).toBe(1);
    expect(json.error_count).toBe(1);
    const failed = json.results.find((r: any) => r.ref_id === OT_2);
    expect(failed.success).toBe(false);
    expect(failed.error_code).toBe('ERR_ORDER_NOT_PAYABLE');
    expect(failed.retryable).toBe(false);
    const okItem = json.results.find((r: any) => r.ref_id === OT_1);
    expect(okItem.success).toBe(true);
    expect(okItem.payment_ids).toEqual(['p-1']);
  });

  it('overpay → error_code ERR_BATCH_OVERPAY por ítem (la otra OT queda pagada)', async () => {
    rpcMock.mockImplementation(async (_fn: string, args: any) => {
      if (args.p_ref_id === OT_1) {
        return { data: null, error: { message: 'ERR_BATCH_OVERPAY: el lote (999) excede el saldo pendiente (300). Overpay no permitido.' } };
      }
      return { data: { payments: [{ id: 'p-2', index: 0, amount: 50 }], count: 1, replayed: false }, error: null };
    });
    const res = await OT_BATCH_POST(makeRequest({
      items: [
        { ref_id: OT_1, payments: [{ payment_method: 'cash', amount: 999, currency: 'CUP', exchange_rate: 1 }] },
        { ref_id: OT_2, payments: [{ payment_method: 'cash', amount: 50, currency: 'CUP', exchange_rate: 1 }] },
      ],
    }));
    const json = await res.json();
    expect(json.status).toBe('partial');
    expect(json.results.find((r: any) => r.ref_id === OT_1).error_code).toBe('ERR_BATCH_OVERPAY');
    expect(json.results.find((r: any) => r.ref_id === OT_2).success).toBe(true);
  });

  it('OT de OTRA tienda → rechazo por ítem sin invocar la RPC privilegiada (pre-check RLS)', async () => {
    const { getSupabaseForSession } = await import('@/lib/supabase-session');
    (getSupabaseForSession as any).mockImplementationOnce(() => ({
      from: (table: string) => {
        if (table === 'profiles') {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { active_store_id: STORE_A }, error: null }) }) }) };
        }
        if (table === 'production_orders') {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'x', store_id: 'b2222222-2222-4222-8222-222222222222', order_number: 'B', order_type: 'work', status: 'draft' }, error: null }) }) }) };
        }
        throw new Error(`tabla inesperada: ${table}`);
      },
      rpc: sessionRpcMock,
    }));
    const res = await OT_BATCH_POST(makeRequest({
      items: [{ ref_id: OT_1, payments: [{ payment_method: 'cash', amount: 10, currency: 'CUP', exchange_rate: 1 }] }],
    }));
    const json = await res.json();
    expect(json.status).toBe('all_failed');
    expect(json.results[0].error_code).toBe('ERR_ORDER_STORE_MISMATCH');
    expect(rpcMock).not.toHaveBeenCalled();
    expect(sessionRpcMock).not.toHaveBeenCalled();
  });

  it('OT inexistente (RLS oculta) → ERR_ORDER_NOT_FOUND por ítem, sin fuga de información', async () => {
    const { getSupabaseForSession } = await import('@/lib/supabase-session');
    (getSupabaseForSession as any).mockImplementationOnce(() => ({
      from: (table: string) => {
        if (table === 'profiles') {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { active_store_id: STORE_A }, error: null }) }) }) };
        }
        if (table === 'production_orders') {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { code: 'PGRST116' } }) }) }) };
        }
        throw new Error(`tabla inesperada: ${table}`);
      },
      rpc: sessionRpcMock,
    }));
    const res = await OT_BATCH_POST(makeRequest({
      items: [{ ref_id: OT_1, payments: [{ payment_method: 'cash', amount: 10, currency: 'CUP', exchange_rate: 1 }] }],
    }));
    const json = await res.json();
    expect(json.results[0].error_code).toBe('ERR_ORDER_NOT_FOUND');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('clerk (sin rol de gestión) → 403 sin tocar la RPC (deny por defecto)', async () => {
    mockSession.value = {
      id: '11111111-2222-4111-8111-111111111111',
      email: 'clerk@test',
      role: 'clerk',
      memberships: [{ store_id: STORE_A, role: 'clerk', status: 'active' }],
    };
    const res = await OT_BATCH_POST(makeRequest({
      items: [{ ref_id: OT_1, payments: [{ payment_method: 'cash', amount: 10, currency: 'CUP', exchange_rate: 1 }] }],
    }));
    expect(res.status).toBe(403);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(sessionRpcMock).not.toHaveBeenCalled();
  });

  it('ref_id duplicado en el payload → 400 ERR_BATCH_DUPLICATE (determinista)', async () => {
    const res = await OT_BATCH_POST(makeRequest({
      items: [
        { ref_id: OT_1, payments: [{ payment_method: 'cash', amount: 10, currency: 'CUP', exchange_rate: 1 }] },
        { ref_id: OT_1, payments: [{ payment_method: 'cash', amount: 20, currency: 'CUP', exchange_rate: 1 }] },
      ],
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('ERR_BATCH_DUPLICATE');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('todas fallidas → 201 all_failed con la clasificación por ítem (convención bulk-pay)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'ERR_BATCH_OVERPAY: el lote (999) excede el saldo pendiente (10). Overpay no permitido.' } });
    const res = await OT_BATCH_POST(makeRequest({
      items: [
        { ref_id: OT_1, payments: [{ payment_method: 'cash', amount: 999, currency: 'CUP', exchange_rate: 1 }] },
        { ref_id: OT_2, payments: [{ payment_method: 'cash', amount: 999, currency: 'CUP', exchange_rate: 1 }] },
      ],
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.status).toBe('all_failed');
    expect(json.success_count).toBe(0);
    expect(json.error_count).toBe(2);
  });
});
