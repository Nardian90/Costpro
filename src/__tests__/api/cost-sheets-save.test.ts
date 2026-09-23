/**
 * FASE C — C2-A: tests del writer reparado (POST /api/cost-sheets/save).
 *
 * Verifica el contrato del writer contra el esquema REAL de cost_sheets
 * (decisión D1 de C1R: tabla GLOBAL, SIN store_id — columnas reales:
 * id, name, description, category, data, created_by, created_at, updated_at):
 *
 *   - NO exige store_id (el supuesto FIX-AUDIT-2 lo rompía con 400/500);
 *   - CREATE: inserta con created_by del JWT de usuario (nunca del cliente);
 *   - UPDATE: solo con id + ownership (created_by = session.user.id);
 *   - UPDATE de ficha ajena/inexistente → 404;
 *   - el insert/update NUNCA incluye store_id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/cost-sheets/save/route';

const mockSession = {
  value: {
    user: { id: 'user-aaaa', email: 'op@demo.com', role: 'usuario', memberships: [] },
    token: 'user-jwt-token',
  } as any,
};

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, mockSession.value),
  withStoreAccess: (fn: any) => async (req: any) => fn(req, mockSession.value),
  withRole: (_role: any, fn: any) => async (req: any) => fn(req, mockSession.value),
  AuthenticatedSession: {},
  getServerSession: async () => mockSession.value,
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: () => true }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
}));
// NOTA: '@/lib/api-errors' NO se mockea — se usa el módulo REAL (catálogo tipado).

// Captura de las llamadas al cliente Supabase autenticado (JWT de usuario).
// Cada from('cost_sheets') del route es una cadena con UN propósito; el mock
// distingue por el método de entrada (insert/update/select) y resuelve single()
// con el resultado configurado para ese modo.
const insertMock = vi.fn();
const updateMock = vi.fn();
const eqCalls: string[] = [];
let insertSingleResult: any = { data: null, error: null };
let fetchSingleResult: any = { data: null, error: null };
let updateSingleResult: any = { data: null, error: null };

const makeBuilder = () => {
  const b: any = { _mode: 'fetch' };
  b.insert = vi.fn((...args: any[]) => { insertMock(...args); b._mode = 'insert'; return b; });
  b.update = vi.fn((...args: any[]) => { updateMock(...args); b._mode = 'update'; return b; });
  b.select = vi.fn(() => b);
  b.eq = vi.fn((col: string, _val: any) => { eqCalls.push(col); return b; });
  b.single = vi.fn(() => {
    if (b._mode === 'insert') return Promise.resolve(insertSingleResult);
    if (b._mode === 'update') return Promise.resolve(updateSingleResult);
    return Promise.resolve(fetchSingleResult);
  });
  return b;
};

const userClientChain = {
  from: vi.fn(() => makeBuilder()),
};

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {},
  getSupabaseAuthClient: vi.fn(() => userClientChain),
}));

// Motor de cálculo — stub (no es objeto de test aquí)
vi.mock('@/lib/cost-engine', () => ({ calculateFicha: vi.fn(() => ({ rows: [] })) }));
vi.mock('@/lib/cost-engine/build-ficha', () => ({ buildEngineFicha: vi.fn(() => ({ meta: {} })) }));

function makeRequest(body: any): Request {
  return {
    method: 'POST',
    headers: new Map([['x-forwarded-for', '127.0.0.1']]),
    json: async () => body,
    url: 'http://localhost:3000/api/cost-sheets/save',
  } as any;
}

const validCurrentData = {
  header: { code: 'FC-T1', name: 'Ficha test C2', date: '2026-09-23', quantity: 1, currency: 'CUP', category: 'Servicios', type: 't', unit: 'u' },
  sections: [{ id: '1', label: '1.0', rows: [] }],
  annexes: [{ id: 'I', title: 'Materia Prima', columns: [], data: [] }],
  signature: { prepared_by: 'A', approved_by: 'B' },
};

const insertedRow = { id: '11111111-1111-4111-8111-111111111111' };

describe('POST /api/cost-sheets/save (C2-A — writer alineado al esquema real)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eqCalls.length = 0;
    insertSingleResult = { data: { id: '11111111-1111-4111-8111-111111111111' }, error: null };
    fetchSingleResult = { data: { data: validCurrentData }, error: null };
    updateSingleResult = { data: { id: '11111111-1111-4111-8111-111111111111' }, error: null };
  });

  it('CREATE sin store_id: inserta con created_by del session y responde created=true', async () => {
    const res = await POST(makeRequest({ updateData: {}, currentData: validCurrentData }) as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.created).toBe(true);
    expect(body.id).toBe(insertedRow.id);

    const [payload] = insertMock.mock.calls[0];
    expect(payload.created_by).toBe('user-aaaa'); // §6: del contexto autenticado
    expect(payload).not.toHaveProperty('store_id'); // D1: NUNCA store_id
    expect(payload.name).toBe('Ficha test C2');
    expect(payload.category).toBe('Servicios');
  });

  it('acepta payloads del flujo IA legado SIN store_id (400 de Zod desaparece)', async () => {
    // El flujo DarianEditor envía exactamente {updateData, currentData}
    const res = await POST(makeRequest({ updateData: {}, currentData: validCurrentData }) as any);
    expect(res.status).not.toBe(400);
  });

  it('UPDATE con id: nunca inserta, verifica compatibilidad del destino y filtra por owner', async () => {
    const res = await POST(makeRequest({
      source: 'manual',
      id: '22222222-2222-4222-8222-222222222222',
      updateData: {},
      currentData: validCurrentData,
    }) as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.created).toBe(false);
    expect(insertMock).not.toHaveBeenCalled(); // §8: no duplicar
    // Ownership estricto (§23): TANTO el fetch del destino como el UPDATE filtran
    // por id + created_by (doble verificación de ownership en el mismo request)
    expect(eqCalls).toEqual(['id', 'created_by', 'id', 'created_by']);
    expect(updateMock).toHaveBeenCalled();
    const [patch] = updateMock.mock.calls[0];
    expect(patch).not.toHaveProperty('store_id');
    expect(patch).not.toHaveProperty('created_by'); // ownership no se reescribe
  });

  it('UPDATE de ficha ajena o inexistente → 404 (fetch owner-scoped sin filas)', async () => {
    fetchSingleResult = { data: null, error: { code: 'PGRST116' } }; // 0 filas por owner/RLS
    const res = await POST(makeRequest({
      source: 'manual',
      id: '33333333-3333-4333-8333-333333333333',
      updateData: {},
      currentData: validCurrentData,
    }) as any);
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('D3: UPDATE cuyo destino es un documento FC (incluso propio) → 409, sin tocarlo', async () => {
    fetchSingleResult = { data: { data: {
      model: 'FC_RES148_2023_V1',
      ficha: { id: 'x', meta: {}, rows: {} },
      header: { name: 'FC' },
      meta2: { app: 'FC' },
    } }, error: null };
    const res = await POST(makeRequest({
      source: 'manual',
      id: '44444444-4444-4444-8444-444444444444',
      updateData: {},
      currentData: validCurrentData,
    }) as any);
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toBe('El documento destino no es un documento CostSheet compatible');
    expect(updateMock).not.toHaveBeenCalled(); // el FC no se sobrescribe
  });

  it('D3: UPDATE cuyo destino tiene data vacía (semilla) → 409', async () => {
    fetchSingleResult = { data: { data: {} }, error: null };
    const res = await POST(makeRequest({
      source: 'manual',
      id: '55555555-5555-4555-8555-555555555555',
      updateData: {},
      currentData: validCurrentData,
    }) as any);
    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rechaza id con formato inválido (400 Zod)', async () => {
    const res = await POST(makeRequest({
      source: 'manual',
      id: 'no-es-un-uuid',
      updateData: {},
      currentData: validCurrentData,
    }) as any);

    expect(res.status).toBe(400);
  });
});
