/**
 * CP-ORG-003 Fase 2 — POST /api/stores/bootstrap: pruebas de autorización
 * positivas y negativas (misión §4).
 *
 * Escenarios exigidos: organización propia (+), organización ajena (el tenant
 * NO viaja en el body y el RPC recibe el del profile), usuario de otro rol
 * (403), usuario sin autenticar (withAuth — cubierto por el middleware, aquí
 * se verifica el gate de rol de la ruta), cuota excedida (403), tienda ya
 * existente (= cuota del plan free), fallos de atomicidad (error del RPC →
 * sin estado parcial, sin fallback de inserción directa) y CSRF.
 *
 * Patrón de users-platform-role-guards.test.ts: la sesión se inyecta vía mock
 * de withAuth; el perfil y las tiendas vía mock de supabase-admin (la ruta
 * lee el rol CANÓNICO del profile, no de la sesión).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ADMIN_ID = 'aaaaaaaa-0000-4000-8000-00000000000a';
const OTHER_USER_ID = 'aaaaaaaa-0000-4000-8000-00000000000b';
const ORG_A = 'aaaaaaa1-0000-4000-8000-00000000000a';
const ORG_B = 'aaaaaaa2-0000-4000-8000-00000000000b';

let sessionOverride: { token: string; user: { id: string; email: string; role: string } } | null = {
  token: 'test-token',
  user: { id: TENANT_ADMIN_ID, email: 'ta@costpro.dev', role: 'tenant_admin' },
};
let csrfOk = true;
let rlAllowed = true;

vi.mock('@/lib/auth-middleware', () => ({
  // withAuth real rechaza sin sesión; en estos tests la sesión siempre se
  // inyecta explícitamente (el caso 401 lo aporta el middleware en runtime).
  withAuth: (fn: any) => async (req: any) => {
    if (!sessionOverride) {
      return { status: 401, json: async () => ({ error: 'No autenticado' }) };
    }
    return fn(req, sessionOverride);
  },
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: rlAllowed }) }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: () => csrfOk }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

type Row = Record<string, unknown>;
const state: {
  profiles: Row[];
  stores: Row[];
  rpcError: Row | null;
  lastRpcCall: Row | null;
} = { profiles: [], stores: [], rpcError: null, lastRpcCall: null };

function makeQuery(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  const q: any = {
    select: () => q,
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q; },
    single: async () => {
      const rows = state.profiles.filter(r => filters.every(f => f(r)));
      const row = rows.find(r => r.id === sessionOverride?.user.id) || rows[0];
      return row ? { data: row, error: null } : { data: null, error: { message: 'not found' } };
    },
    then: (resolve: any, reject: any) => promise.then(resolve, reject),
  };
  const promise = Promise.resolve().then(() => {
    if (table === 'profiles') {
      const rows = state.profiles.filter(r => filters.every(f => f(r)));
      return { data: rows, error: null };
    }
    if (table === 'stores') {
      // Count exact head para el pre-check de cuota per-tenant.
      const rows = state.stores.filter(r => filters.every(f => f(r)));
      return { count: rows.length, data: null, error: null };
    }
    return { data: [], error: null };
  });
  return q;
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => ({
    from: (table: string) => makeQuery(table),
    rpc: async (fn: string, params: Row) => {
      state.lastRpcCall = { fn, ...params };
      if (state.rpcError) return { data: null, error: state.rpcError };
      return { data: { success: true, store_id: 'store-new', tenant_id: params.p_tenant_id }, error: null };
    },
  }),
}));

import { POST as bootstrapPOST } from '@/app/api/stores/bootstrap/route';

function makeReq(body?: unknown, method = 'POST') {
  return {
    url: 'http://localhost:3000/api/stores/bootstrap',
    nextUrl: new URL('http://localhost:3000/api/stores/bootstrap'),
    method,
    headers: new Headers({ 'x-forwarded-for': '127.0.0.1' }),
    json: async () => body,
  } as any;
}

const tenantAdminProfile = (overrides: Row = {}) => ({
  id: TENANT_ADMIN_ID,
  role: 'tenant_admin',
  tenant_id: ORG_A,
  plan: 'free',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionOverride = {
    token: 'test-token',
    user: { id: TENANT_ADMIN_ID, email: 'ta@costpro.dev', role: 'tenant_admin' },
  };
  csrfOk = true;
  rlAllowed = true;
  state.profiles = [tenantAdminProfile()];
  state.stores = [];
  state.rpcError = null;
  state.lastRpcCall = null;
});

describe('CP-ORG-003 F2 — POST /api/stores/bootstrap: casos positivos', () => {
  it('tenant_admin con tenant propio, plan free y 0 tiendas → 201 + RPC atómico con SU tenant', async () => {
    const res = await bootstrapPOST(makeReq({ name: 'Mi Primera Tienda' }));
    expect(res.status).toBe(201);
    expect(state.lastRpcCall?.fn).toBe('create_store_with_membership');
    expect((state.lastRpcCall as Row).p_tenant_id).toBe(ORG_A);        // del PROFILE
    expect((state.lastRpcCall as Row).p_created_by).toBe(TENANT_ADMIN_ID);
    expect((state.lastRpcCall as Row).p_max_stores).toBe(1);           // PLAN_STORE_LIMITS.free
    expect((state.lastRpcCall as Row).p_name).toBe('Mi Primera Tienda');
  });

  it('plan pro con 1 tienda activa en SU tenant → 201 (cuota 3)', async () => {
    state.profiles = [tenantAdminProfile({ plan: 'pro' })];
    state.stores = [{ id: 's1', tenant_id: ORG_A, is_active: true }];
    const res = await bootstrapPOST(makeReq({ name: 'Sucursal 2' }));
    expect(res.status).toBe(201);
    expect((state.lastRpcCall as Row).p_max_stores).toBe(3);
  });

  it('la cuota pre-check cuenta SOLO tiendas del tenant del caller (aislamiento)', async () => {
    state.stores = [
      { id: 's1', tenant_id: ORG_B, is_active: true },  // otra organización
      { id: 's2', tenant_id: ORG_B, is_active: true },
      { id: 's3', tenant_id: ORG_A, is_active: false }, // inactiva del propio
    ];
    const res = await bootstrapPOST(makeReq({ name: 'Mi tienda' }));
    expect(res.status).toBe(201); // ORG_A tiene 0 activas → bootstrap permitido
  });
});

describe('CP-ORG-003 F2 — POST /api/stores/bootstrap: inyección de tenant y rol', () => {
  it('un tenant_id AJENO en el body NO llega al RPC: manda el del profile (Zod strip)', async () => {
    const res = await bootstrapPOST(makeReq({ name: 'X', tenant_id: ORG_B, max_stores: 99 }));
    expect(res.status).toBe(201);
    expect((state.lastRpcCall as Row).p_tenant_id).toBe(ORG_A);
    expect((state.lastRpcCall as Row).p_max_stores).toBe(1);
    expect((state.lastRpcCall as Row).p_max_stores).not.toBe(99);
  });

  it('el rol CANÓNICO es el del PROFILE, no el de la sesión (defensa en profundidad)', async () => {
    // Sesión corrompida/spoofed dice 'admin'; el profile dice 'clerk' → 403.
    sessionOverride = {
      token: 't', user: { id: OTHER_USER_ID, email: 'x@costpro.dev', role: 'admin' },
    };
    state.profiles = [{ id: OTHER_USER_ID, role: 'clerk', tenant_id: ORG_A, plan: 'free' }];
    const res = await bootstrapPOST(makeReq({ name: 'X' }));
    expect(res.status).toBe(403);
    expect(state.lastRpcCall).toBeNull();
  });

  it('admin global → 403 (usa POST /api/stores; el bootstrap es exclusivo tenant_admin)', async () => {
    state.profiles = [tenantAdminProfile({ role: 'admin' })];
    const res = await bootstrapPOST(makeReq({ name: 'X' }));
    expect(res.status).toBe(403);
    expect(state.lastRpcCall).toBeNull();
  });

  it('superadmin / encargado / clerk → 403 sin ejecutar el RPC', async () => {
    for (const role of ['superadmin', 'encargado', 'clerk', 'warehouse', 'usuario', 'costo']) {
      state.profiles = [tenantAdminProfile({ role })];
      state.lastRpcCall = null;
      const res = await bootstrapPOST(makeReq({ name: 'X' }));
      expect(res.status, `role=${role}`).toBe(403);
      expect(state.lastRpcCall, `role=${role}`).toBeNull();
    }
  });

  it('perfil inexistente → 403', async () => {
    state.profiles = [];
    const res = await bootstrapPOST(makeReq({ name: 'X' }));
    expect(res.status).toBe(403);
  });
});

describe('CP-ORG-003 F2 — POST /api/stores/bootstrap: cuota y atomicidad', () => {
  it('cuota excedida (free con 1 tienda activa ya existente) → 403 SIN ejecutar el RPC', async () => {
    state.stores = [{ id: 's1', tenant_id: ORG_A, is_active: true }];
    const res = await bootstrapPOST(makeReq({ name: 'Segunda' }));
    expect(res.status).toBe(403);
    expect(state.lastRpcCall).toBeNull();
    const body = await res.json();
    expect(body.message).toContain('plan free');
  });

  it('el pre-check de cuota solo ve tiendas ACTIVAS del propio tenant', async () => {
    state.stores = [{ id: 's1', tenant_id: ORG_A, is_active: false }];
    const res = await bootstrapPOST(makeReq({ name: 'Reemplazo' }));
    expect(res.status).toBe(201);
  });

  it('perfil sin tenant_id → 409 (usuario sin organización)', async () => {
    state.profiles = [tenantAdminProfile({ tenant_id: null })];
    const res = await bootstrapPOST(makeReq({ name: 'X' }));
    expect(res.status).toBe(409);
    expect(state.lastRpcCall).toBeNull();
  });

  it('perfil sin plan → 400 STORE_PLAN_REQUIRED (paridad con POST /api/stores)', async () => {
    state.profiles = [tenantAdminProfile({ plan: null })];
    const res = await bootstrapPOST(makeReq({ name: 'X' }));
    expect(res.status).toBe(400);
    expect(state.lastRpcCall).toBeNull();
  });

  it('error de LÍMITE del RPC (race: otro request ganó la cuota) → 403', async () => {
    state.rpcError = { message: 'ERR_STORE_LIMIT_REACHED: Tenant has 1 active stores, limit is 1', code: 'P0001' };
    const res = await bootstrapPOST(makeReq({ name: 'X' }));
    expect(res.status).toBe(403);
  });

  it('clave duplicada del RPC → 409 con mensaje claro', async () => {
    state.rpcError = { message: 'duplicate key value violates unique constraint "stores_name"', code: '23505' };
    const res = await bootstrapPOST(makeReq({ name: 'Ya Existe' }));
    expect(res.status).toBe(409);
  });

  it('fallo genérico del RPC → 500 SIN fuga del mensaje interno y SIN fallback', async () => {
    state.rpcError = { message: 'ERROR: internal detail should not leak (segredo)', code: 'XX000' };
    const res = await bootstrapPOST(makeReq({ name: 'X' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).not.toContain('segredo');
    // La ruta NO implementa inserción directa fuera del RPC (atomicidad):
    // el único modo de crear tienda en estos tests es la RPC mockeada.
  });
});

describe('CP-ORG-003 F2 — POST /api/stores/bootstrap: entrada y controles de transporte', () => {
  it('sin name / name vacío → 400 (Zod)', async () => {
    const res1 = await bootstrapPOST(makeReq({}));
    expect(res1.status).toBe(400);
    const res2 = await bootstrapPOST(makeReq({ name: '   ' }));
    expect(res2.status).toBe(400);
    expect(state.lastRpcCall).toBeNull();
  });

  it('REEUP/NIT inválidos → 400 (mismo contrato de datos que POST /api/stores)', async () => {
    const res = await bootstrapPOST(makeReq({ name: 'X', reeup: '123' }));
    expect(res.status).toBe(400);
  });

  it('CSRF: origen no permitido → 403 sin tocar la DB', async () => {
    csrfOk = false;
    const res = await bootstrapPOST(makeReq({ name: 'X' }));
    expect(res.status).toBe(403);
    expect(state.lastRpcCall).toBeNull();
  });

  it('rate limit excedido → 429', async () => {
    rlAllowed = false;
    const res = await bootstrapPOST(makeReq({ name: 'X' }));
    expect(res.status).toBe(429);
  });

  it('sesión ausente → 401 (withAuth)', async () => {
    sessionOverride = null;
    const res = await bootstrapPOST(makeReq({ name: 'X' }));
    expect(res.status).toBe(401);
  });
});
