/**
 * payrolls-workers-integration-route.test.ts — MISION TRABAJADORES↔NÓMINAS
 * (2026-11-13). Contrato de las rutas implicadas en el caso Dup Test.
 *
 * Drive los handlers REALES:
 *   - POST /api/payrolls: store_id EXPLÍCITO del body (tienda operada por la
 *     UI) respetado y enviado al RPC create_payroll como p_store_id; si el
 *     body NO lo trae, fallback a profiles.active_store_id (legacy); actor
 *     SIEMPRE p_user_id del JWT; zod rechaza store_id no-uuid.
 *   - GET /api/workers: q (búsqueda NFD insensible a acentos/mayúsculas
 *     sobre nombre+CI+expediente), period_start/period_end (tarifa vigente
 *     evaluada al PERÍODO — misma regla que fn_payroll_validate_items) y
 *     alias worker_id≡id en la respuesta.
 * No se toca la BD (mocks capturadores, mismo patrón que cash-flow-route).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as CREATE_PAYROLL } from '@/app/api/payrolls/route';
import { GET as LIST_WORKERS } from '@/app/api/workers/route';

const sessionState = {
  value: { user: { id: 'user-1', role: 'admin', memberships: [{ store_id: 'store-1', role: 'admin', status: 'active' }] } } as any,
};
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, sessionState.value),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/with-security', () => ({
  withSecurity: (fn: any) => async (req: any, session: any) => fn(req, session),
}));

// ─── Cliente admin (POST /api/payrolls): captura el RPC ───
const rpcCalls: Array<{ name: string; args: any }> = [];
const rpcResult = { value: { data: null as any, error: null as any } };
const profileLookup = { value: { active_store_id: 'store-perfil' as string | null } };
const mockAdminClient = {
  rpc: (name: string, args: any) => {
    rpcCalls.push({ name, args });
    return Promise.resolve(rpcResult.value);
  },
  from: (table: string) => {
    if (table !== 'profiles') throw new Error(`tabla inesperada en admin mock: ${table}`);
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: profileLookup.value.active_store_id ? { active_store_id: profileLookup.value.active_store_id } : null,
        error: null,
      }),
    };
  },
};
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdminSafe: () => mockAdminClient }));

// ─── Cliente de sesión (GET /api/workers): workers + rates en memoria ───
// Builder encadenable (select→eq→order→eq…→await) como supabase-js real.
type Row = Record<string, any>;
const dbState = {
  workers: [] as Row[],
  rates: [] as Row[],
};
function chainable(rows: () => Row[]) {
  const filters: Record<string, any> = {};
  const chain: any = {};
  for (const m of ['select', 'eq', 'order', 'in', 'or', 'lte', 'gte', 'limit']) {
    chain[m] = (col?: string, val?: any) => {
      if (m === 'eq' && col) filters[col] = val;
      return chain;
    };
  }
  chain.then = (onOk: any, onErr: any) => {
    let out = rows();
    for (const [col, val] of Object.entries(filters)) {
      out = out.filter((r) => r[col] === val);
    }
    return Promise.resolve({ data: out, error: null }).then(onOk, onErr);
  };
  return chain;
}
vi.mock('@/lib/supabase-session', () => ({
  getSupabaseForSession: () => ({
    from: (table: string) => {
      if (table === 'workers') return chainable(() => dbState.workers);
      if (table === 'worker_salary_rates') return chainable(() => dbState.rates);
      throw new Error(`tabla inesperada en session mock: ${table}`);
    },
  }),
}));

function makeReq(body: any, url = 'http://localhost:3000/api/payrolls'): Request {
  return {
    method: 'POST',
    headers: new Map(),
    json: async () => body,
    url,
  } as any;
}
function makeGet(url: string): Request {
  return { method: 'GET', headers: new Map(), url } as any;
}

const baseItem = { worker_id: '92cb3140-0c47-4c8a-9c93-c9bec0b6f909', accrued_days: 5 };
const basePayload = {
  tipo_nomina: 'sueldos',
  period_start: '2026-11-01',
  period_end: '2026-11-13',
  items: [baseItem],
  idempotency_key: 'test-key-123',
};

beforeEach(() => {
  vi.clearAllMocks();
  rpcCalls.length = 0;
  rpcResult.value = { data: { status: 'success' }, error: null };
  profileLookup.value = { active_store_id: 'store-perfil' };
  sessionState.value = { user: { id: 'user-1', role: 'admin', memberships: [] } };
  dbState.workers = [];
  dbState.rates = [];
});

// ═════════════════════════════════════════════════════════════════════════
// POST /api/payrolls — tienda explícita vs derivada del perfil
// ═════════════════════════════════════════════════════════════════════════
describe('POST /api/payrolls — store_id del body (fix causa raíz nº1)', () => {
  it('con store_id en el body: lo usa como p_store_id (la tienda que opera la UI)', async () => {
    const res = await CREATE_PAYROLL(makeReq({ ...basePayload, store_id: '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1' }) as any);
    expect(res.status).toBe(201);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe('create_payroll');
    // La tienda EXPLÍCITA llega al RPC — no la del perfil (divergente)
    expect(rpcCalls[0].args.p_store_id).toBe('43a4dabc-b8b4-4b66-82b3-0c75335ca5d1');
    expect(rpcCalls[0].args.p_store_id).not.toBe('store-perfil');
    // Actor: SIEMPRE del JWT
    expect(rpcCalls[0].args.p_user_id).toBe('user-1');
  });

  it('SIN store_id en el body: fallback a profiles.active_store_id (compatibilidad legacy)', async () => {
    const res = await CREATE_PAYROLL(makeReq(basePayload) as any);
    expect(res.status).toBe(201);
    expect(rpcCalls[0].args.p_store_id).toBe('store-perfil');
  });

  it('sin body-store ni perfil → 400 «Usuario sin tienda activa configurada»', async () => {
    profileLookup.value = { active_store_id: null };
    const res = await CREATE_PAYROLL(makeReq(basePayload) as any);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/sin tienda activa/i) });
    expect(rpcCalls).toHaveLength(0);
  });

  it('store_id no-uuid → rechazado por zod (400) sin tocar el RPC', async () => {
    const res = await CREATE_PAYROLL(makeReq({ ...basePayload, store_id: 'no-es-un-uuid' }) as any);
    expect(res.status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it('error del RPC ERR_WORKER_NOT_ELIGIBLE → 422 con mensaje de usuario y rpc_error', async () => {
    rpcResult.value = { data: null, error: { message: 'ERR_WORKER_NOT_ELIGIBLE: 92cb3140 (debe pertenecer a la tienda y estar activo)' } };
    const res = await CREATE_PAYROLL(makeReq({ ...basePayload, store_id: '55555555-5555-4555-8555-555555555555' }) as any);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/no pertenece a la tienda o no está activo/i);
    expect(body.rpc_error).toMatch(/ERR_WORKER_NOT_ELIGIBLE/);
  });

  it('error del RPC ERR_UNAUTHORIZED (store ajeno) → 403 «Sin acceso a la tienda»', async () => {
    rpcResult.value = { data: null, error: { message: 'ERR_UNAUTHORIZED' } };
    const res = await CREATE_PAYROLL(makeReq({ ...basePayload, store_id: '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1' }) as any);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/sin acceso a la tienda/i);
  });

  it('items solo llevan identificadores y cantidades (nunca importes calculados)', async () => {
    const res = await CREATE_PAYROLL(makeReq({
      ...basePayload, store_id: '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1',
      items: [{ ...baseItem, worker_names: 'hack', total_net: 999 }],
    }) as any);
    expect(res.status).toBe(201);
    const item = rpcCalls[0].args.p_items[0];
    expect(item).toMatchObject({ worker_id: baseItem.worker_id, accrued_days: 5 });
    expect(item).not.toHaveProperty('worker_names');
    expect(item).not.toHaveProperty('total_net');
  });
});

// ═════════════════════════════════════════════════════════════════════════
// GET /api/workers — q + período + alias worker_id (fix causa raíz nº2)
// ═════════════════════════════════════════════════════════════════════════
describe('GET /api/workers — búsqueda y tarifa evaluada al período', () => {
  beforeEach(() => {
    dbState.workers = [
      { id: 'w-1', store_id: 's-1', first_name: 'Dup', last_name: 'Test', ci: '99010192524', status: 'active' },
      { id: 'w-2', store_id: 's-1', first_name: 'Dup', last_name: 'Test', ci: '99010188342', status: 'active' },
      { id: 'w-3', store_id: 's-1', first_name: 'José', last_name: 'Pérez', ci: '99100112345', status: 'active', expediente_laboral: 'EXP-0007' },
      { id: 'w-4', store_id: 's-2', first_name: 'Otra', last_name: 'Tienda', ci: '99000000000', status: 'active' },
    ];
    dbState.rates = [
      { worker_id: 'w-1', store_id: 's-1', rate_type: 'daily', rate_amount: '1000', currency: 'CUP', valid_from: '2026-11-01', valid_to: null },
      { worker_id: 'w-3', store_id: 's-1', rate_type: 'hourly', rate_amount: '120', currency: 'CUP', valid_from: '2026-10-01', valid_to: '2026-10-31' },
    ];
  });

  it('store_id es obligatorio', async () => {
    const res = await LIST_WORKERS(makeGet('http://localhost:3000/api/workers') as any);
    expect(res.status).toBe(400);
  });

  it('alias worker_id ≡ id en la respuesta (el <select> original recibía undefined)', async () => {
    const res = await LIST_WORKERS(makeGet('http://localhost:3000/api/workers?store_id=s-1') as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workers.every((w: any) => w.worker_id === w.id)).toBe(true);
  });

  it('q=dup → solo los Dup Test de la tienda (RLS/eq ya acota por store)', async () => {
    const res = await LIST_WORKERS(makeGet('http://localhost:3000/api/workers?store_id=s-1&q=dup') as any);
    const body = await res.json();
    expect(body.workers).toHaveLength(2);
    expect(body.workers.every((w: any) => w.first_name === 'Dup')).toBe(true);
  });

  it('q insensible a mayúsculas y acentos (DÚP ≡ dup; JOSÉ ≡ jose)', async () => {
    const a = await LIST_WORKERS(makeGet('http://localhost:3000/api/workers?store_id=s-1&q=DÚP') as any);
    expect((await a.json()).workers).toHaveLength(2);
    const b = await LIST_WORKERS(makeGet('http://localhost:3000/api/workers?store_id=s-1&q=JOSÉ') as any);
    expect((await b.json()).workers).toHaveLength(1);
  });

  it('q por CI y por expediente', async () => {
    const byCi = await LIST_WORKERS(makeGet('http://localhost:3000/api/workers?store_id=s-1&q=99010192524') as any);
    expect((await byCi.json()).workers).toHaveLength(1);
    const byExp = await LIST_WORKERS(makeGet('http://localhost:3000/api/workers?store_id=s-1&q=EXP-0007') as any);
    expect((await byExp.json()).workers).toHaveLength(1);
  });

  it('include_rate SIN período → tarifa vigente a HOY (compatibilidad)', async () => {
    // hoy simulado: la tarifa de w-3 venció el 10-31 → sin período no aplica
    const res = await LIST_WORKERS(makeGet('http://localhost:3000/api/workers?store_id=s-1&include_rate=1') as any);
    const body = await res.json();
    const w1 = body.workers.find((w: any) => w.id === 'w-1');
    const w2 = body.workers.find((w: any) => w.id === 'w-2');
    const w3 = body.workers.find((w: any) => w.id === 'w-3');
    expect(w1.rate_amount).toBe(1000);
    expect(w1.has_any_rate).toBe(true);
    expect(w2.rate_amount).toBeNull();
    expect(w2.has_any_rate).toBe(false);
    expect(w3.rate_amount).toBeNull(); // vencida a hoy
    expect(w3.has_any_rate).toBe(true); // pero HAY tarifa histórica → distinción
  });

  it('include_rate CON período octubre → la tarifa de w-3 (válida 10-01→10-31) SÍ aplica', async () => {
    const res = await LIST_WORKERS(makeGet('http://localhost:3000/api/workers?store_id=s-1&include_rate=1&period_start=2026-10-16&period_end=2026-10-31') as any);
    const body = await res.json();
    const w3 = body.workers.find((w: any) => w.id === 'w-3');
    expect(w3.rate_amount).toBe(120);
    expect(w3.rate_valid_from).toBe('2026-10-01');
    // w-1: tarifa desde 11-01 NO cubre octubre → no vigente para el período
    const w1 = body.workers.find((w: any) => w.id === 'w-1');
    expect(w1.rate_amount).toBeNull();
    expect(w1.has_any_rate).toBe(true);
  });

  it('status=active filtra (los inactivos no desaparecen si no se pide el filtro)', async () => {
    dbState.workers[1].status = 'inactive';
    const all = await LIST_WORKERS(makeGet('http://localhost:3000/api/workers?store_id=s-1') as any);
    expect((await all.json()).workers).toHaveLength(3);
    const act = await LIST_WORKERS(makeGet('http://localhost:3000/api/workers?store_id=s-1&status=active') as any);
    expect((await act.json()).workers).toHaveLength(2);
  });
});
