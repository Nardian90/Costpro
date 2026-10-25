/**
 * MISIÓN INGRESOS/EGRESOS (2026-10-20) — contrato de las rutas API.
 *
 * Drive the REAL POST /api/cash-flow y POST /api/cash-flow/reverse handlers
 * con un mock capturador del cliente admin: registra el nombre exacto del RPC
 * y sus args (actor SIEMPRE p_user_id de la sesión verificada — nunca del
 * body). Escenarios de validación zod, roles, tienda y mapeo de errores ERR_*.
 * No se toca la BD (mocks).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as CREATE } from '@/app/api/cash-flow/route';
import { POST as REVERSE } from '@/app/api/cash-flow/reverse/route';

const sessionState = {
  value: { user: { id: 'user-1', role: 'manager', memberships: [{ store_id: 'store-1', role: 'manager', status: 'active' }] } } as any,
};
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, sessionState.value),
  AuthenticatedSession: {},
  getServerSession: async () => sessionState.value,
  isDevBypassSession: () => false,
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/with-security', () => ({
  withSecurity: (fn: any) => async (req: any, session: any) => fn(req, session),
}));

const rolesState = { canManage: true };
vi.mock('@/lib/roles', () => ({
  canManageStore: vi.fn(() => rolesState.canManage),
  canViewStore: vi.fn(() => true),
  // CP-ORG-001 ciclo 5: la ruta usa isAdminLevel — espejo de la semántica real
  // ('admin' | 'superadmin') para que el mock siga siendo fiel al contrato.
  isAdminLevel: vi.fn((role: unknown) => role === 'admin' || role === 'superadmin'),
}));

const profileState = { storeId: 'store-1' as string | null };
vi.mock('@/lib/supabase-session', () => ({
  getSupabaseForSession: vi.fn(() => ({
    from: (table: string) => {
      if (table !== 'profiles') throw new Error(`tabla inesperada en mock: ${table}`);
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: profileState.storeId ? { active_store_id: profileState.storeId } : null,
          error: null,
        }),
      };
    },
  })),
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

function makeReq(body: any, url = 'http://localhost:3000/api/cash-flow'): Request {
  return {
    method: 'POST',
    headers: new Map([['x-forwarded-for', '127.0.0.1']]),
    json: async () => body,
    url,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcCalls.length = 0;
  rpcResult.value = { data: null, error: null };
  sessionState.value = { user: { id: 'user-1', role: 'manager', memberships: [] } };
  rolesState.canManage = true;
  profileState.storeId = 'store-1';
});

const OK_DOC = {
  doc_type: 'ingreso',
  concept: 'constitucion_fondo',
  amount: 5000,
  currency: 'CUP',
  justification: 'Fondo de cambio entregado por el encargado',
};

describe('POST /api/cash-flow — contrato del RPC create_cash_flow_document', () => {
  it('happy path: 201 + RPC exacto con actor de la sesión y tienda activa', async () => {
    rpcResult.value = { data: { status: 'success', document_id: 'd1', document_number: 'IE-000001-2026' }, error: null };
    const res = await CREATE(makeReq({ ...OK_DOC, idempotency_key: '11111111-1111-4111-8111-111111111111' }));
    expect(res.status).toBe(201);
    expect(rpcCalls).toHaveLength(1);
    const { name, args } = rpcCalls[0];
    expect(name).toBe('create_cash_flow_document');
    expect(args.p_store_id).toBe('store-1');
    expect(args.p_user_id).toBe('user-1'); // actor SIEMPRE de la sesión verificada
    expect(args.p_doc_type).toBe('ingreso');
    expect(args.p_concept).toBe('constitucion_fondo');
    expect(args.p_amount).toBe(5000);
    expect(args.p_currency).toBe('CUP');
    expect(args.p_justification).toContain('Fondo de cambio');
    expect(args.p_exchange_rate).toBe(null); // sin autoridad financiera
  });

  it('roles autorizados a registrar: admin/manager/encargado/clerk', async () => {
    for (const role of ['admin', 'manager', 'encargado', 'clerk']) {
      sessionState.value = { user: { id: 'u-' + role, role, memberships: [] } };
      const res = await CREATE(makeReq(OK_DOC));
      expect(res.status).not.toBe(403);
    }
  });

  it('roles NO autorizados → 403 (escenario 9: operar sin permisos)', async () => {
    for (const role of ['usuario', 'warehouse', 'costo']) {
      sessionState.value = { user: { id: 'u-' + role, role, memberships: [] } };
      const res = await CREATE(makeReq(OK_DOC));
      expect(res.status).toBe(403);
    }
  });

  it('sin membresía de la tienda (canManageStore=false) → 403 (escenario 10: otra tienda)', async () => {
    rolesState.canManage = false;
    const res = await CREATE(makeReq(OK_DOC));
    expect(res.status).toBe(403);
    expect(rpcCalls).toHaveLength(0);
  });

  it('sin tienda activa → 400', async () => {
    profileState.storeId = null;
    const res = await CREATE(makeReq(OK_DOC));
    expect(res.status).toBe(400);
  });

  it('validación zod: importes y campos (cero, negativo, 3 decimales, justificación)', async () => {
    expect((await CREATE(makeReq({ ...OK_DOC, amount: 0 }))).status).toBe(400);
    expect((await CREATE(makeReq({ ...OK_DOC, amount: -5 }))).status).toBe(400);
    expect((await CREATE(makeReq({ ...OK_DOC, amount: 10.123 }))).status).toBe(400);
    expect((await CREATE(makeReq({ ...OK_DOC, justification: '   ' }))).status).toBe(400);
    expect((await CREATE(makeReq({ ...OK_DOC, justification: '' }))).status).toBe(400);
    expect((await CREATE(makeReq({ ...OK_DOC, concept: 'concepto_inventado' }))).status).toBe(400);
    expect((await CREATE(makeReq({ ...OK_DOC, currency: 'EUR' }))).status).toBe(400);
    expect((await CREATE(makeReq({ ...OK_DOC, doc_type: 'transferencia' }))).status).toBe(400);
    expect((await CREATE(makeReq({ ...OK_DOC, amount: '5000' }))).status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it('mapeo de errores ERR_* del RPC → status HTTP correctos', async () => {
    const cases: Array<[string, number]> = [
      ['ERR_NO_OPEN_SHIFT: la caja no tiene un turno abierto', 409],
      ['ERR_DATE_OUTSIDE_SHIFT: la fecha operativa debe caer dentro del turno', 422],
      ['ERR_INSUFFICIENT_CASH: disponible=100, egreso=500', 422],
      ['ERR_INSUFFICIENT_CURRENCY: saldo físico USD disponible=100, egreso=150', 422],
      ['ERR_INSUFFICIENT_CURRENCY: anular este ingreso dejaría el saldo físico USD en negativo (disponible=20, reversión=100)', 422],
      ['ERR_FUND_INSUFFICIENT: fondo vigente=3000, devolución=4000', 422],
      ['ERR_EXCHANGE_RATE_UNAVAILABLE: configure la tasa USD', 409],
      ['ERR_RATE_STALE: effective=2026-01-01', 409],
      ['ERR_UNAUTHORIZED', 403],
      ['ERR_FORBIDDEN_ROLE: requiere admin', 403],
      ['ERR_RELATED_DOC_INVALID: debe ser constitución', 422],
      ['ERR_IDEMPOTENCY_KEY_REUSE', 409],
      ['ERR_AMOUNT_PRECISION: máximo 2 decimales', 400],
    ];
    for (const [msg, expectedStatus] of cases) {
      rpcResult.value = { data: null, error: { message: msg } };
      const res = await CREATE(makeReq(OK_DOC));
      expect(res.status).toBe(expectedStatus);
    }
  });

  it('idempotencia: la clave viaja al RPC (replay idempotente en el backend)', async () => {
    rpcResult.value = { data: { status: 'success', document_id: 'd1' }, error: null };
    const key = '22222222-2222-4222-8222-222222222222';
    await CREATE(makeReq({ ...OK_DOC, idempotency_key: key }));
    expect(rpcCalls[0].args.p_idempotency_key).toBe(key);
    // sin clave → la ruta genera una (prefijo cf-)
    await CREATE(makeReq(OK_DOC));
    expect(String(rpcCalls[1].args.p_idempotency_key)).toMatch(/^cf-/);
  });
});

describe('POST /api/cash-flow/reverse — contrato del RPC reverse_cash_flow_document', () => {
  const OK_REV = { document_id: '33333333-3333-4333-8333-333333333333', reason: 'Registrado con importe erróneo' };

  it('happy path: RPC exacto con actor de la sesión', async () => {
    rpcResult.value = { data: { status: 'success', document_number: 'IE-000001-2026', status_doc: 'anulado' }, error: null };
    const res = await REVERSE(makeReq(OK_REV, 'http://localhost:3000/api/cash-flow/reverse'));
    expect(res.status).toBe(200);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe('reverse_cash_flow_document');
    expect(rpcCalls[0].args.p_document_id).toBe(OK_REV.document_id);
    expect(rpcCalls[0].args.p_reason).toBe(OK_REV.reason);
    expect(rpcCalls[0].args.p_user_id).toBe('user-1');
  });

  it('motivo obligatorio: < 3 caracteres o vacío → 400 (requisito §9.2)', async () => {
    expect((await REVERSE(makeReq({ ...OK_REV, reason: 'no' }, 'x'))).status).toBe(400);
    expect((await REVERSE(makeReq({ ...OK_REV, reason: '' }, 'x'))).status).toBe(400);
    expect((await REVERSE(makeReq({ ...OK_REV, reason: undefined }, 'x'))).status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it('anular exige rol superior: usuario/clerk → 403', async () => {
    for (const role of ['usuario', 'clerk', 'warehouse']) {
      sessionState.value = { user: { id: 'u-' + role, role, memberships: [] } };
      const res = await REVERSE(makeReq(OK_REV, 'x'));
      expect(res.status).toBe(403);
    }
    expect(rpcCalls).toHaveLength(0);
  });

  it('doble anulación → 409 con mensaje claro (escenario 13)', async () => {
    rpcResult.value = { data: null, error: { message: 'ERR_ALREADY_ANNULLED: status=anulado' } };
    const res = await REVERSE(makeReq(OK_REV, 'x'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('ya está anulado');
  });

  it('documento de otra tienda / no encontrado → 404', async () => {
    rpcResult.value = { data: null, error: { message: 'ERR_DOCUMENT_NOT_FOUND' } };
    const res = await REVERSE(makeReq(OK_REV, 'x'));
    expect(res.status).toBe(404);
  });

  it('anulación con caja sin efectivo suficiente → 422 (reversión de ingreso)', async () => {
    rpcResult.value = { data: null, error: { message: 'ERR_INSUFFICIENT_CASH: anular este ingreso dejaría el efectivo esperado en negativo' } };
    const res = await REVERSE(makeReq(OK_REV, 'x'));
    expect(res.status).toBe(422);
  });

  it('ERR_INSUFFICIENT_CURRENCY → 422 con mensaje GENERALIZADO por moneda (egreso ordinario y reversión, no solo entrega)', async () => {
    // MISIÓN POST-MERGE 20261024220000: el código ahora dispara también para
    // egresos ordinarios y reversiones de ingreso — el mensaje humano ya no
    // menciona «la entrega» únicamente.
    rpcResult.value = { data: null, error: { message: 'ERR_INSUFFICIENT_CURRENCY: saldo físico CUP disponible=100, egreso=150' } };
    const res = await CREATE(makeReq(OK_DOC));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain('saldo físico disponible de esa moneda');
    expect(body.error).not.toContain('La entrega supera');
  });
});
