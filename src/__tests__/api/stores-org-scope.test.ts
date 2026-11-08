/**
 * CP-UX-ORG-STORES-001 — Scoping de tiendas por organización RESUELTO EN
 * SERVIDOR (GET /api/stores?organization_id) y creación dentro de una
 * organización (POST con organization_id).
 *
 * Por qué este test es crítico: con app.use_tenant_rls OFF el RLS deja al
 * admin ver tiendas de TODAS las empresas — un filtro de organización solo
 * en la UI sería puramente visual. La API autoriza con el mismo criterio de
 * /api/organizations/[id] (authorizeTarget): superadmin → cualquier org;
 * admin → SOLO su empresa (404 sin revelar existencias ajenas); otros → 403.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSession = { value: null as any };

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, mockSession.value),
  withRole: (_role: string, fn: any) => async (req: any) => fn(req, mockSession.value),
  AuthenticatedSession: {},
  getServerSession: async () => mockSession.value,
  isDevBypassSession: () => false,
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 30, resetAt: new Date() }) }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: vi.fn(() => true) }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
// El pre-check legacy de cuota usa el cliente supabase del browser; el límite
// real lo re-aplica el RPC — para este test basta con que la cuota permita.
vi.mock('@/lib/rate-limit/tenant-limiter', () => ({
  checkStoreQuota: vi.fn().mockResolvedValue({ allowed: true, remaining: 5, limit: 5 }),
  rateLimitHeaders: vi.fn(() => ({})),
  checkTenantRateLimit: vi.fn(),
  PLAN_LIMITS: { free: { maxStores: 3 }, pro: { maxStores: 20 }, enterprise: { maxStores: Infinity } },
}));

const ORG_A = 'aaaaaaaa-1111-1111-1111-111111111111';
const ORG_B = 'bbbbbbbb-2222-2222-2222-222222222222';
const ORG_MISSING = 'cccccccc-3333-3333-3333-333333333333';

// Estado configurable por test
const singles: Record<string, { data: any; error: any }> = {};
const storeListResult = { data: [{ id: 's1', name: 'Tienda A' }], error: null, count: 1 };
const storeCountResult = { count: 0, error: null };
const rpcCalls: Array<{ name: string; args: any }> = [];
const eqCalls: Array<[string, unknown]> = [];

function chainFor(table: string) {
  const chain: any = {};
  const api = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((col: string, val: unknown) => { eqCalls.push([col, val]); return chain; }),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve(singles[table] ?? { data: null, error: 'no single configured' })),
    maybeSingle: vi.fn(() => Promise.resolve(singles[table] ?? { data: null, error: null })),
    then: (onFulfill: any, onReject: any) =>
      (table === 'stores'
        ? (storeListResult.count !== undefined ? { ...storeListResult, count: storeCountResult.count ?? storeListResult.count } : storeListResult)
        : storeListResult
      ) && Promise.resolve(table === 'stores' ? { ...storeListResult, count: storeListResult.count } : storeListResult).then(onFulfill, onReject),
  };
  Object.assign(chain, api);
  return chain;
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: vi.fn(() => ({
    from: (table: string) => chainFor(table),
    rpc: vi.fn((name: string, args: any) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: { id: 'new-store' }, error: null });
    }),
  })),
}));

import { GET, POST } from '@/app/api/stores/route';

function makeRequest(url: string, body?: unknown) {
  return {
    method: body ? 'POST' : 'GET',
    headers: new Map(),
    url,
    json: async () => body ?? {},
  } as any;
}

describe('GET /api/stores?organization_id — autorización server-side', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcCalls.length = 0;
    eqCalls.length = 0;
    for (const k of Object.keys(singles)) delete singles[k];
    singles['profiles'] = { data: { tenant_id: ORG_A }, error: null };
    singles['tenants'] = { data: { id: ORG_A, name: 'Org A' }, error: null };
  });

  it('SUPERADMIN ve las tiendas de CUALQUIER organización con filtro tenant aplicado', async () => {
    mockSession.value = { user: { id: 'sa-1', role: 'superadmin', memberships: [] } };
    const res = await GET(makeRequest(`http://localhost:3000/api/stores?organization_id=${ORG_B}`));
    expect(res.status).toBe(200);
    // El filtro server-side se aplicó sobre stores.tenant_id
    expect(eqCalls).toContainEqual(['tenant_id', ORG_B]);
  });

  it('ADMIN consulta SU organización — 200 con filtro tenant', async () => {
    mockSession.value = { user: { id: 'admin-1', role: 'admin', memberships: [] } };
    const res = await GET(makeRequest(`http://localhost:3000/api/stores?organization_id=${ORG_A}`));
    expect(res.status).toBe(200);
    expect(eqCalls).toContainEqual(['tenant_id', ORG_A]);
  });

  it('ADMIN de otra organización → 404 (sin revelar existencias ajenas)', async () => {
    mockSession.value = { user: { id: 'admin-1', role: 'admin', memberships: [] } };
    const res = await GET(makeRequest(`http://localhost:3000/api/stores?organization_id=${ORG_B}`));
    expect(res.status).toBe(404);
    // No se llegó a consultar stores con el tenant ajeno
    expect(eqCalls).not.toContainEqual(['tenant_id', ORG_B]);
  });

  it('ROL operativo (clerk) → 403 — la vista por organización es administrativa', async () => {
    mockSession.value = {
      user: { id: 'clerk-1', role: 'clerk', memberships: [{ store_id: 's1', role: 'clerk', status: 'active' }] },
    };
    const res = await GET(makeRequest(`http://localhost:3000/api/stores?organization_id=${ORG_A}`));
    expect(res.status).toBe(403);
  });

  it('SUPERADMIN + organización inexistente → 404', async () => {
    mockSession.value = { user: { id: 'sa-1', role: 'superadmin', memberships: [] } };
    singles['tenants'] = { data: null, error: 'not found' };
    const res = await GET(makeRequest(`http://localhost:3000/api/stores?organization_id=${ORG_MISSING}`));
    expect(res.status).toBe(404);
  });

  it('SIN organization_id el comportamiento legacy no cambia (todas las tiendas del alcance)', async () => {
    mockSession.value = { user: { id: 'sa-1', role: 'superadmin', memberships: [] } };
    const res = await GET(makeRequest('http://localhost:3000/api/stores'));
    expect(res.status).toBe(200);
    expect(eqCalls).not.toContainEqual(['tenant_id', expect.anything()]);
  });
});

describe('POST /api/stores con organization_id — creación dentro de la organización', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcCalls.length = 0;
    eqCalls.length = 0;
    for (const k of Object.keys(singles)) delete singles[k];
  });

  it('SUPERADMIN crea la tienda DENTRO de la organización indicada (tenant + plan de la org)', async () => {
    mockSession.value = { user: { id: 'sa-1', role: 'superadmin', memberships: [] } };
    singles['profiles'] = { data: { plan: 'enterprise', tenant_id: null }, error: null }; // superadmin sin tenant
    singles['tenants'] = { data: { id: ORG_B, plan: 'pro' }, error: null }; // org destino plan pro → límite 3
    const res = await POST(makeRequest('http://localhost:3000/api/stores', {
      name: 'Tienda Nueva', address: 'Calle 1', organization_id: ORG_B,
    }));
    expect(res.status).toBe(201);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe('create_store_with_membership');
    // p_tenant_id = la organización destino (NO null → tienda no huérfana)
    expect(rpcCalls[0].args.p_tenant_id).toBe(ORG_B);
    // p_max_stores del PLAN DE LA ORGANIZACIÓN (pro → 3), no del caller
    expect(rpcCalls[0].args.p_max_stores).toBe(3);
  });

  it('SUPERADMIN + organización inexistente → 404', async () => {
    mockSession.value = { user: { id: 'sa-1', role: 'superadmin', memberships: [] } };
    singles['profiles'] = { data: { plan: 'enterprise', tenant_id: null }, error: null };
    singles['tenants'] = { data: null, error: 'not found' };
    const res = await POST(makeRequest('http://localhost:3000/api/stores', {
      name: 'Tienda Nueva', address: 'Calle 1', organization_id: ORG_MISSING,
    }));
    expect(res.status).toBe(404);
    expect(rpcCalls).toHaveLength(0);
  });

  it('ADMIN NO puede crear en una organización ajena → 403', async () => {
    mockSession.value = { user: { id: 'admin-1', role: 'admin', memberships: [] } };
    singles['profiles'] = { data: { plan: 'pro', tenant_id: ORG_A }, error: null };
    const res = await POST(makeRequest('http://localhost:3000/api/stores', {
      name: 'Tienda Nueva', address: 'Calle 1', organization_id: ORG_B,
    }));
    expect(res.status).toBe(403);
    expect(rpcCalls).toHaveLength(0);
  });

  it('SIN organization_id el flujo legacy no cambia (tenant del caller)', async () => {
    mockSession.value = { user: { id: 'admin-1', role: 'admin', memberships: [] } };
    singles['profiles'] = { data: { plan: 'pro', tenant_id: ORG_A }, error: null };
    const res = await POST(makeRequest('http://localhost:3000/api/stores', {
      name: 'Tienda Nueva', address: 'Calle 1',
    }));
    expect(res.status).toBe(201);
    expect(rpcCalls[0].args.p_tenant_id).toBe(ORG_A);
  });
});
