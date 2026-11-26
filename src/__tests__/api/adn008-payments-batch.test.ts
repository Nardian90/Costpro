/**
 * adn008-payments-batch.test.ts — ADN-SERVICES-RECEIVED-CREATION-WORKFLOW-008
 * (hardening ADN-009: batch por canal service_role + gate canManageStore)
 *
 * POST /api/payments:
 *  · ref_type='service' → UNA llamada a register_supplier_payment_batch con el
 *    cliente service_role (getSupabaseAdminSafe, REVOKE authenticated — la
 *    autorización ocurre ANTES: gate canManageStore sobre la tienda activa).
 *  · CP-LOG-RECEPTIONS-SERVICES-POS-UNIFICATION-001 (§3): ref_type='receipt'
 *    TAMBIÉN va por el batch atómico (misma paridad que servicios; el loop
 *    histórico solo queda para production_order/work).
 *  · Mapeo de errores: overpay del lote → 400; tasa ausente → 422;
 *    componente inválido → 400; ADN-009: combinación medio×moneda no
 *    soportada → 400 ERR_COMBINACION_NO_SOPORTADA; servicio no activo → 409;
 *    CP-LOG-UNIFICATION: recepción anulada/revertida → 409 ERR_RECEIPT_NOT_PAYABLE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/payments/route';

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

// ADN-009 (§5): la RPC batch es service_role EXCLUSIVA → el lote de 'service'
// viaja por getSupabaseAdminSafe() (mockeado aquí). R-25/F011-001: el loop de
// production_order|work TAMBIÉN usa el cliente ADMIN tras el gate
// canManageStore (antes usaba el cliente de sesión y la ACL service_role de
// la función lo denegaba — pagos OT rotos desde REM-INV-6).
const adminClientMock = { rpc: rpcMock };

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: vi.fn(() => adminClientMock),
}));

const sessionClientMock = {
  from: (table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { active_store_id: 'a1111111-1111-4111-8111-111111111111' }, error: null }),
          }),
        }),
      };
    }
    // R-25: pre-check de pertenencia OT↔tienda vía cliente de sesión (RLS)
    if (table === 'production_orders') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: 'x', store_id: 'a1111111-1111-4111-8111-111111111111' }, error: null }),
          }),
        }),
      };
    }
    throw new Error(`tabla inesperada en el test: ${table}`);
  },
  // Solo lecturas (RLS). NINGÚN rpc privilegiado va por el cliente de sesión:
  // batch (service|receipt) y loop OT (production_order|work) van por el admin.
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
    url: 'http://localhost:3000/api/payments',
  } as any;
}

const STORE_A = 'a1111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  // ADN-009: el gate canManageStore exige rol de gestión en la tienda activa
  // (el store_id activo NO es autorización por sí mismo). OJO: el mock de
  // withAuth ya envuelve este valor como { token, user: mockSession.value } —
  // mockSession.value es el USUARIO plano (id/role/memberships), no la sesión.
  mockSession.value = {
    id: '11111111-2222-4111-8111-111111111111',
    role: 'manager',
    memberships: [{ store_id: STORE_A, role: 'manager', status: 'active' }],
  } as any;
});

describe('POST /api/payments · ADN-008 §5 liquidación atómica', () => {
  it('service con 2 componentes (40 USD + 1.000 CUP) → UNA llamada al batch con el lote completo', async () => {
    rpcMock.mockResolvedValue({
      data: {
        payments: [
          { id: 'p-1', index: 0, payment_method: 'cash', currency: 'USD', amount: 40 },
          { id: 'p-2', index: 1, payment_method: 'cash', currency: 'CUP', amount: 1000 },
        ],
        count: 2,
        replayed: false,
      },
      error: null,
    });

    const res = await POST(makeRequest({
      ref_type: 'service',
      ref_id: '11111111-1111-4111-8111-111111111155',
      payments: [
        { payment_method: 'cash', amount: 40, currency: 'USD', exchange_rate: 400 },
        { payment_method: 'cash', amount: 1000, currency: 'CUP', exchange_rate: 1 },
      ],
      idempotency_key: 'block-key-1',
      payment_date: '2026-11-15T17:00:00Z',
    }));

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.count).toBe(2);
    expect(json.payments.map((p: any) => p.id)).toEqual(['p-1', 'p-2']);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe('register_supplier_payment_batch');
    expect(args.p_ref_type).toBe('service');
    expect(args.p_paid_by).toBe('11111111-2222-4111-8111-111111111111'); // actor de la sesión
    expect(args.p_idempotency_key).toBe('block-key-1');
    expect(args.p_payment_date).toBe('2026-11-15T17:00:00Z');
    expect(args.p_payments).toHaveLength(2);
    expect(args.p_payments[0]).toEqual({ payment_method: 'cash', amount: 40, currency: 'USD', exchange_rate: 400, reference: null, notes: null });
    expect(args.p_payments[1]).toEqual({ payment_method: 'cash', amount: 1000, currency: 'CUP', exchange_rate: 1, reference: null, notes: null });
  });

  it('external_transfer USD en el lote → llega al batch como payment_method external_transfer (schema zod lo admite)', async () => {
    rpcMock.mockResolvedValue({
      data: {
        payments: [{ id: 'p-1', index: 0, payment_method: 'external_transfer', currency: 'USD', amount: 50 }],
        count: 1,
        replayed: false,
      },
      error: null,
    });

    const res = await POST(makeRequest({
      ref_type: 'service',
      ref_id: '11111111-1111-4111-8111-111111111155',
      payments: [
        { payment_method: 'external_transfer', amount: 50, currency: 'USD', exchange_rate: 400, reference: 'SWIFT-1' },
      ],
      idempotency_key: 'block-key-external-1',
    }));

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.count).toBe(1);
    expect(json.payments[0].method).toBe('external_transfer');

    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe('register_supplier_payment_batch');
    expect(args.p_payments).toEqual([
      { payment_method: 'external_transfer', amount: 50, currency: 'USD', exchange_rate: 400, reference: 'SWIFT-1', notes: null },
    ]);
  });

  it('overpay del lote → 400 ERR_BATCH_OVERPAY (fail-closed, sin escrituras)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'ERR_BATCH_OVERPAY: el lote (2000) excede el saldo pendiente (1040). Overpay no permitido.' } });
    const res = await POST(makeRequest({
      ref_type: 'service',
      ref_id: '11111111-1111-4111-8111-111111111155',
      payments: [{ payment_method: 'cash', amount: 2000, currency: 'CUP', exchange_rate: 1 }],
      idempotency_key: 'block-key-2',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('ERR_BATCH_OVERPAY');
  });

  it('tasa ausente para divisa → 422 accionable (no 500 opaco)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'ERR_TASA_NO_DISPONIBLE: el componente 1 en USD requiere tasa de conversión (> 1).' } });
    const res = await POST(makeRequest({
      ref_type: 'service',
      ref_id: '11111111-1111-4111-8111-111111111155',
      payments: [{ payment_method: 'cash', amount: 40, currency: 'USD', exchange_rate: 1 }],
      idempotency_key: 'block-key-3',
    }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.code).toBe('ERR_TASA_NO_DISPONIBLE');
  });

  it('componente inválido del catálogo (detectado por el batch) → 400', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'ERR_COMPONENT_INVALID: medio de pago no soportado (cheque) en componente 1' } });
    const res = await POST(makeRequest({
      ref_type: 'service',
      ref_id: '11111111-1111-4111-8111-111111111155',
      payments: [{ payment_method: 'cash', amount: 10, currency: 'CUP', exchange_rate: 1 }],
      idempotency_key: 'block-key-4',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('ERR_BATCH_INVALID');
  });

  it('ADN-009: combinación medio×moneda no soportada → 400 ERR_COMBINACION_NO_SOPORTADA', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'ERR_COMBINACION_NO_SOPORTADA: external_transfer solo admite USD/EUR (componente 1 en CUP)' } });
    const res = await POST(makeRequest({
      ref_type: 'service',
      ref_id: '11111111-1111-4111-8111-111111111155',
      payments: [{ payment_method: 'external_transfer', amount: 10, currency: 'CUP', exchange_rate: 1 }],
      idempotency_key: 'block-key-combo-1',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('ERR_COMBINACION_NO_SOPORTADA');
    expect(json.error).toContain('ERR_COMBINACION_NO_SOPORTADA');
  });

  it('ADN-009: servicio no activo tras el lock → 409 ERR_SERVICE_NOT_ACTIVE', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'ERR_SERVICE_NOT_ACTIVE: solo un servicio ACTIVO admite pagos (estado actual: draft)' } });
    const res = await POST(makeRequest({
      ref_type: 'service',
      ref_id: '11111111-1111-4111-8111-111111111155',
      payments: [{ payment_method: 'cash', amount: 10, currency: 'CUP', exchange_rate: 1 }],
      idempotency_key: 'block-key-inactive-1',
    }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe('ERR_SERVICE_NOT_ACTIVE');
  });

  it('ADN-009: clerk (sin rol de gestión en la tienda activa) → 403 Forbidden sin tocar la RPC', async () => {
    mockSession.value = {
      id: '11111111-2222-4111-8111-111111111112',
      role: 'clerk',
      memberships: [{ store_id: STORE_A, role: 'clerk', status: 'active' }],
    } as any;

    const res = await POST(makeRequest({
      ref_type: 'service',
      ref_id: '11111111-1111-4111-8111-111111111155',
      amount: 100,
      payment_method: 'cash',
    }));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Forbidden');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('CP-LOG-UNIFICATION-001 §3: receipt va por el BATCH ATÓMICO (UNA llamada, bloque idempotente, cliente service_role)', async () => {
    rpcMock.mockResolvedValue({
      data: { payments: [
        { id: 'pay-1', index: 0, payment_method: 'cash', currency: 'CUP', amount: 100 },
        { id: 'pay-2', index: 1, payment_method: 'transfer', currency: 'CUP', amount: 200 },
      ], count: 2, replayed: false },
      error: null,
    });
    const res = await POST(makeRequest({
      ref_type: 'receipt',
      ref_id: '11111111-1111-4111-8111-111111111166',
      payments: [
        { payment_method: 'cash', amount: 100, currency: 'CUP', exchange_rate: 1 },
        { payment_method: 'transfer', amount: 200, currency: 'CUP', exchange_rate: 1 },
      ],
      idempotency_key: 'rec-batch-1',
    }));
    expect(res.status).toBe(201);

    // UNA sola llamada al batch — no al motor individual (loop eliminado).
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe('register_supplier_payment_batch');
    expect(args.p_ref_type).toBe('receipt');
    expect(args.p_ref_id).toBe('11111111-1111-4111-8111-111111111166');
    expect(args.p_idempotency_key).toBe('rec-batch-1');
    expect(args.p_payments).toHaveLength(2);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.count).toBe(2);
  });

  it('CP-LOG-UNIFICATION-001 §3: recepción anulada/revertida → 409 ERR_RECEIPT_NOT_PAYABLE (gate de estado)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'ERR_RECEIPT_NOT_PAYABLE: la recepción está voided y no admite pagos nuevos' } });
    const res = await POST(makeRequest({
      ref_type: 'receipt',
      ref_id: '11111111-1111-4111-8111-111111111166',
      payments: [{ payment_method: 'cash', amount: 50, currency: 'CUP', exchange_rate: 1 }],
    }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe('ERR_RECEIPT_NOT_PAYABLE');
  });

  it('REGRESIÓN R-25/F011-001: production_order usa el cliente ADMINISTRATIVO tras el gate (el cliente de sesión NO invoca RPCs privilegiados)', async () => {
    rpcMock.mockResolvedValue({ data: 'payment-id-1', error: null });
    const res = await POST(makeRequest({
      ref_type: 'production_order',
      ref_id: '11111111-1111-4111-8111-111111111177',
      payments: [
        { payment_method: 'cash', amount: 100, currency: 'CUP', exchange_rate: 1 },
        { payment_method: 'transfer', amount: 200, currency: 'CUP', exchange_rate: 1 },
      ],
      idempotency_key: 'legacy-block-1',
    }));
    expect(res.status).toBe(201);

    // El loop OT invoca el RPC por el cliente ADMIN (service_role server-side)
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(sessionRpcMock).not.toHaveBeenCalled(); // sin privilegios por el cliente de sesión
    const [fn1, args1] = rpcMock.mock.calls[0];
    const [fn2, args2] = rpcMock.mock.calls[1];
    expect(fn1).toBe('register_supplier_payment');
    expect(fn2).toBe('register_supplier_payment');
    expect(args1.p_idempotency_key).toBe('legacy-block-1:0');
    expect(args2.p_idempotency_key).toBe('legacy-block-1:1');
    // El actor auditado sigue siendo el usuario de la sesión (no el técnico)
    expect(args1.p_paid_by).toBe('11111111-2222-4111-8111-111111111111');
  });

  it('R-25: OT de OTRA tienda → 403 sin invocar el RPC (pre-check de pertenencia vía RLS)', async () => {
    // El mock de sessionClientMock.from('production_orders') devuelve store A;
    // para este caso, un OT en la tienda B debe ser rechazado sin llamar al RPC
    const { getSupabaseForSession } = await import('@/lib/supabase-session');
    (getSupabaseForSession as any).mockImplementationOnce(() => ({
      from: (table: string) => {
        if (table === 'profiles') {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { active_store_id: STORE_A }, error: null }) }) }) };
        }
        if (table === 'production_orders') {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'x', store_id: 'b2222222-2222-4222-8222-222222222222' }, error: null }) }) }) };
        }
        throw new Error(`tabla inesperada: ${table}`);
      },
      rpc: sessionRpcMock,
    }));
    const res = await POST(makeRequest({
      ref_type: 'production_order',
      ref_id: '11111111-1111-4111-8111-111111111177',
      amount: 100,
      payment_method: 'cash',
    }));
    expect(res.status).toBe(403);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(sessionRpcMock).not.toHaveBeenCalled();
  });
});
