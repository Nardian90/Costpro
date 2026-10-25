/**
 * MISIÓN CUERPO INVÁLIDO (2026-10-24) — contrato UI↔API de Ingresos/Egresos.
 *
 * Regresión del defecto «Cuerpo inválido» al confirmar cualquier documento
 * desde la pantalla Inicio → OPERACIÓN → Caja → Ingresos/Egresos.
 *
 * CAUSA RAÍZ (3 capas):
 *   1. CashFlowCreateModal envía `idempotency_key: 'cf-<uuid>'` (estándar del
 *      sistema: default de la ruta, del hook y del flujo de anulación
 *      'cf-anul-<doc>' — la columna DB es `text` y la RPC solo exige
 *      no-vacío), pero CREATE_SCHEMA exigía UUID puro (uuidLoose) → rechazo.
 *   2. El modal envía `notes: null` y `related_document_id: null`
 *      (y `counterparty: null` cuando va vacío); Zod 4 `.optional()` NO
 *      acepta `null` explícito → rechazo incluso con clave válida.
 *   3. apiFetch descartaba el array `details` de la respuesta → la UI mostraba
 *      solo «Cuerpo inválido» ocultando los errores específicos.
 *
 * El payload de estos tests es EXACTAMENTE el que produce la UI real
 * (entrega de efectivo sin turno, caso ENERVIDA 2026-10-23), incluyendo el
 * importe extraordinario 8435679.98 (2 decimales exactos sin error de
 * coma flotante). La BD no se toca (mocks) — drive del handler REAL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as CREATE } from '@/app/api/cash-flow/route';

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

/**
 * Payload EXACTO del modal real (CashFlowCreateModal.registrar →
 * useCreateCashFlow) para el caso reportado: EGRESO · entrega_efectivo ·
 * CUP · 8435679.98 · 2026-10-23 (otro día ⇒ mediodía ISO) · Belkis ·
 * «Entregar» · sin notas · sin documento vinculado · clave 'cf-<uuid>'.
 */
const UI_PAYLOAD = {
  doc_type: 'egreso',
  concept: 'entrega_efectivo',
  amount: Math.round(8435679.98 * 100) / 100, // 8435679.98 (idéntico al modal)
  currency: 'CUP',
  idempotency_key: `cf-${'0d7d3f2e-5f6b-4c8a-9a1e-2b3c4d5e6f70'}`,
  operation_date: new Date('2026-10-23T12:00:00').toISOString(), // resolvePosOperationDate
  counterparty: 'Belkis',
  justification: 'Entregar',
  notes: null, // el modal SIEMPRE envía la propiedad (null si vacía)
  related_document_id: null, // idem (mostrarVinculo false ⇒ null)
};

describe('MISIÓN CUERPO INVÁLIDO — payload EXACTO de la UI contra la ruta REAL', () => {
  it('REGRESIÓN: el payload completo del modal (cf-…, notes:null, related:null) ⇒ 201', async () => {
    rpcResult.value = {
      data: { status: 'success', document_id: 'd1', document_number: 'IE-000007-2026', amount: 8435679.98, currency: 'CUP' },
      error: null,
    };
    const res = await CREATE(makeReq({ ...UI_PAYLOAD }));
    expect(res.status).toBe(201);
    const { name, args } = rpcCalls[0];
    expect(name).toBe('create_cash_flow_document');
    expect(args.p_amount).toBe(8435679.98);
    expect(args.p_currency).toBe('CUP');
    expect(args.p_concept).toBe('entrega_efectivo');
    expect(args.p_counterparty).toBe('Belkis');
    // La clave 'cf-<uuid>' llega INTACTA a la RPC (idempotencia cooperativa).
    expect(args.p_idempotency_key).toBe(UI_PAYLOAD.idempotency_key);
    // Los null legítimos llegan como NULL a la RPC (no se pierde el campo).
    expect(args.p_notes).toBeNull();
    expect(args.p_related_document_id).toBeNull();
  });

  it('REGRESIÓN: idempotency_key "cf-<uuid>" (estándar del sistema) es aceptada', async () => {
    rpcResult.value = { data: { status: 'success' }, error: null };
    const res = await CREATE(makeReq({ ...UI_PAYLOAD, notes: undefined, related_document_id: undefined }));
    expect(res.status).toBe(201);
    expect(rpcCalls[0].args.p_idempotency_key).toMatch(/^cf-[0-9a-f-]{36}$/);
  });

  it('REGRESIÓN: notes: null y related_document_id: null explícitos ⇒ 201 (no 400)', async () => {
    rpcResult.value = { data: { status: 'success' }, error: null };
    const minimal = {
      doc_type: 'ingreso',
      concept: 'otro_ingreso',
      amount: 1500,
      currency: 'CUP',
      justification: 'Ingreso autorizado por dirección',
      idempotency_key: 'cf-11111111-1111-4111-8111-111111111111',
      notes: null,
      related_document_id: null,
      counterparty: null, // vacío en la UI ⇒ null explícito
      operation_date: null, // hoy implícito ⇒ la UI puede estampar null
    };
    const res = await CREATE(makeReq(minimal));
    expect(res.status).toBe(201);
    expect(rpcCalls[0].args.p_notes).toBeNull();
    expect(rpcCalls[0].args.p_counterparty).toBeNull();
    expect(rpcCalls[0].args.p_operation_date).toBeNull();
  });

  it('clave de idempotencia VACÍA ⇒ se normaliza al default cf- de la ruta (no 400)', async () => {
    rpcResult.value = { data: { status: 'success' }, error: null };
    const res = await CREATE(makeReq({ ...UI_PAYLOAD, idempotency_key: '' }));
    expect(res.status).toBe(201);
    expect(rpcCalls[0].args.p_idempotency_key).toMatch(/^cf-/);
  });

  it('clave de idempotencia excesiva (>128) ⇒ 400 con detalle específico', async () => {
    const res = await CREATE(makeReq({ ...UI_PAYLOAD, idempotency_key: 'cf-' + 'a'.repeat(200) }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Cuerpo inválido'); // genérico; el detalle vive en details
    expect(body.details.join(' ')).toContain('idempotencia');
  });

  it('el importe extraordinario 8435679.98 CUP pasa la precisión (sin coma flotante)', async () => {
    const { hasValidMonetaryPrecision } = await import('@/lib/cash-flow/constants');
    expect(hasValidMonetaryPrecision(8435679.98)).toBe(true);
    expect(Math.round(8435679.98 * 100) / 100).toBe(8435679.98);
  });

  it('validaciones financieras INTACTAS: importe no numérico, moneda y concepto siguen rechazados', async () => {
    const r1 = await CREATE(makeReq({ ...UI_PAYLOAD, amount: '8435679.98' }));
    expect(r1.status).toBe(400);
    const b1 = await r1.json();
    expect(b1.error).toBe('Cuerpo inválido');
    expect(b1.details.join(' ')).toContain('amount');

    const r2 = await CREATE(makeReq({ ...UI_PAYLOAD, currency: 'EUR' }));
    expect(r2.status).toBe(400);
    const b2 = await r2.json();
    expect(b2.details.join(' ')).toContain('currency');

    const r3 = await CREATE(makeReq({ ...UI_PAYLOAD, concept: 'gasto_proveedor' }));
    expect(r3.status).toBe(400);

    const r4 = await CREATE(makeReq({ ...UI_PAYLOAD, amount: 8435679.981 }));
    expect(r4.status).toBe(400);
    const b4 = await r4.json();
    expect(b4.details.join(' ')).toContain('decimales');
  });

  it('mapeo de reglas de negocio INTACTO: ERR_INSUFFICIENT_CURRENCY ⇒ 422 con mensaje claro', async () => {
    rpcResult.value = { data: null, error: { message: 'ERR_INSUFFICIENT_CURRENCY: el egreso supera el saldo físico CUP' } };
    const res = await CREATE(makeReq({ ...UI_PAYLOAD }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain('saldo físico');
    expect(body.code).toBe('ERR_INSUFFICIENT_CURRENCY');
  });
});
