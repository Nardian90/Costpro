/**
 * adn008-payments-batch.test.ts — ADN-SERVICES-RECEIVED-CREATION-WORKFLOW-008
 * (hardening ADN-009: batch por canal service_role + gate canManageStore)
 *
 * POST /api/payments:
 *  · ref_type='service' → UNA llamada a register_supplier_payment_batch con el
 *    cliente service_role (getSupabaseAdminSafe, REVOKE authenticated — la
 *    autorización ocurre ANTES: gate canManageStore sobre la tienda activa).
 *  · ref_type='receipt' → loop histórico intacto con el cliente de SESIÓN
 *    (regresión: otros módulos no cambian en esta misión).
 *  · Mapeo de errores: overpay del lote → 400; tasa ausente → 422;
 *    componente inválido → 400; ADN-009: combinación medio×moneda no
 *    soportada → 400 ERR_COMBINACION_NO_SOPORTADA; servicio no activo → 409.
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

// ADN-009 (§5): la RPC batch es service_role EXCLUSIVA → el lote de 'service'
// viaja por getSupabaseAdminSafe() (mockeado aquí); el rpcMock captura TODAS
// las llamadas (batch por el cliente admin y loop receipt por el de sesión).
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
    throw new Error(`tabla inesperada en el test: ${table}`);
  },
  // Loop histórico (receipt/production_order/work): el RPC se llama con el
  // cliente de SESIÓN. Mismo rpcMock para verificar el recuento global.
  rpc: rpcMock,
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

  it('REGRESIÓN: receipt conserva el loop histórico con el cliente de SESIÓN (fuera del alcance de 008)', async () => {
    rpcMock.mockResolvedValue({ data: 'payment-id-1', error: null });
    const res = await POST(makeRequest({
      ref_type: 'receipt',
      ref_id: '11111111-1111-4111-8111-111111111166',
      payments: [
        { payment_method: 'cash', amount: 100, currency: 'CUP', exchange_rate: 1 },
        { payment_method: 'transfer', amount: 200, currency: 'CUP', exchange_rate: 1 },
      ],
      idempotency_key: 'legacy-block-1',
    }));
    expect(res.status).toBe(201);

    expect(rpcMock).toHaveBeenCalledTimes(2);
    const [fn1, args1] = rpcMock.mock.calls[0];
    const [fn2, args2] = rpcMock.mock.calls[1];
    expect(fn1).toBe('register_supplier_payment');
    expect(fn2).toBe('register_supplier_payment');
    expect(args1.p_idempotency_key).toBe('legacy-block-1:0');
    expect(args2.p_idempotency_key).toBe('legacy-block-1:1');
  });
});
