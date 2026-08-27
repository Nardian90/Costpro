import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH, DELETE } from '@/app/api/users/[id]/memberships/[membershipId]/route';

/**
 * F3-P1-04 — Suite gemela del patrón F3-P1-02 para memberships individuales.
 *
 * Regla verificada (cadena completa antes de operación privilegiada):
 *   identidad server-side
 *     ↓ resolución server-side de la membership por PK
 *     ↓ membership.user_id === [id] de la URL (si no → 404)
 *     ↓ store tomado SOLO de la fila resuelta en BD
 *     ↓ canManageStore(session.user, store_resuelto)
 *     ↓ RPC managed_update_membership / managed_revoke_membership
 *
 * Contratos de invocación probados (el crash era solo bajo firma REAL):
 *   - FIRMA REAL Next 16: PATCH(req, { params }) ← contexto como 2º argumento
 *   - MOCK legacy       : conAuth mock entrega ctx como 3er argumento
 */

const STORE_A = 'a1111111-1111-4111-8111-111111111111';
const STORE_B = 'b2222222-2222-4222-8222-222222222222';
const USER_X = '9a111111-1111-4111-8111-999999999999';
const USER_Y = '9b222222-2222-4222-8222-999999999999';
const MEM_ID_A = '7c111111-1111-4111-8111-777777777777';

const mockSession = {
  value: {
    user: { id: 'actor-1', role: 'manager', memberships: [] as any[] },
  } as any,
};

// Contexto que entrega un CON conAuth legacy (3er argumento)
const legacyCtx = { params: Promise.resolve({ id: USER_X, membershipId: MEM_ID_A }) };

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, mockSession.value, legacyCtx),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: () => true }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const probes = {
  tablesTouched: [] as string[],
  rpcCalls: [] as Array<{ name: string; args: any }>,
};

// Fila que "devuelve" la resolución server-side de user_store_memberships
let resolvedMembershipRow: any;
let rpcResult: { data: any; error: any } = { data: {}, error: null };

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => ({
    from: (table: string) => {
      if (!probes.tablesTouched.includes(table)) probes.tablesTouched.push(table);
      const chain: any = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.single = async () => ({ data: resolvedMembershipRow, error: resolvedMembershipRow ? null : { message: 'not found' } });
      return chain;
    },
    rpc: (name: string, args: any) => {
      probes.rpcCalls.push({ name, args });
      return Promise.resolve(rpcResult);
    },
  }),
}));

function makeRequest(body?: unknown): any {
  return {
    method: 'PATCH',
    headers: new Map(),
    json: async () => body,
    url: `http://localhost:3000/api/users/${USER_X}/memberships/${MEM_ID_A}`,
  };
}

function nextCtx(): any {
  // Firma REAL de Next 16: contexto como segundo argumento de la export
  return { params: Promise.resolve({ id: USER_X, membershipId: MEM_ID_A }) };
}

function memberOf(row: Partial<{ user_id: string; store_id: string; status: string }> | null): void {
  resolvedMembershipRow = row ? { id: MEM_ID_A, user_id: USER_X, store_id: STORE_B, status: 'active', ...row } : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  probes.tablesTouched = [];
  probes.rpcCalls = [];
  rpcResult = { data: {}, error: null };
  memberOf(null);
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
});

describe('PATCH /users/[id]/memberships/[membershipId] · FIX F3-P1-04', () => {
  it('FIRMA REAL Next16 (2º arg contexto): gestor de la tienda resuelve y ejecuta sin crash', async () => {
    mockSession.value.user = {
      id: 'mgr-a',
      role: 'manager',
      memberships: [{ store_id: STORE_B, role: 'manager', status: 'active' }],
    };
    memberOf({ store_id: STORE_B });
    const res = await PATCH(makeRequest({ status: 'revoked' }), nextCtx());
    expect(res.status).toBe(200);
    expect(probes.rpcCalls[0].name).toBe('managed_update_membership');
    expect(probes.rpcCalls[0].args.p_membership_id).toBe(MEM_ID_A);
    // la resolución server-side ocurrió ANTES de la RPC
    expect(probes.tablesTouched).toContain('user_store_memberships');
  });

  it('contrato legacy: contexto entregado como 3er argumento también funciona', async () => {
    mockSession.value.user = {
      id: 'mgr-a',
      role: 'manager',
      memberships: [{ store_id: STORE_B, role: 'encargado', status: 'active' }],
    };
    memberOf({ store_id: STORE_B });
    const res = await PATCH(makeRequest({ role: 'clerk' })); // conAuth mock inyecta legacyCtx
    expect(res.status).toBe(200);
    expect(probes.rpcCalls).toHaveLength(1);
  });

  it('cross-store: membership objetivo pertenece a otra tienda → 403 y SIN RPC privilegiada', async () => {
    mockSession.value.user = {
      id: 'mgr-a',
      role: 'manager',
      memberships: [{ store_id: STORE_A, role: 'manager', status: 'active' }],
    };
    memberOf({ store_id: STORE_B }); // fila está en B, actor gestiona A
    const res = await PATCH(makeRequest({ status: 'revoked' }), nextCtx());
    expect(res.status).toBe(403);
    expect(probes.rpcCalls).toHaveLength(0);
  });

  it('membership.user_id ≠ [id] de la URL → 404, sin RPC (no se permite manipular membresías de otro usuario vía esta ruta)', async () => {
    mockSession.value.user = {
      id: 'mgr-a',
      role: 'manager',
      memberships: [{ store_id: STORE_B, role: 'manager', status: 'active' }],
    };
    memberOf({ user_id: USER_Y, store_id: STORE_B });
    const res = await PATCH(makeRequest({ status: 'active' }), nextCtx());
    expect(res.status).toBe(404);
    expect(probes.rpcCalls).toHaveLength(0);
  });

  it('membership inexistente → 404 y sin RPC', async () => {
    mockSession.value.user = { id: 'admin-g', role: 'admin', memberships: [] };
    memberOf(null);
    const res = await PATCH(makeRequest({ status: 'active' }), nextCtx());
    expect(res.status).toBe(404);
    expect(probes.rpcCalls).toHaveLength(0);
  });

  it('membership revoked NO autoriza al actor de esa misma tienda → 403 sin RPC', async () => {
    mockSession.value.user = {
      id: 'ex-mgr',
      role: 'manager',
      memberships: [{ store_id: STORE_B, role: 'manager', status: 'revoked' }],
    };
    memberOf({ store_id: STORE_B });
    const res = await PATCH(makeRequest({ role: 'clerk' }), nextCtx());
    expect(res.status).toBe(403);
    expect(probes.rpcCalls).toHaveLength(0);
  });

  it('rol global sin membership alguna → 403 sin RPC (rol ≠ autorización)', async () => {
    mockSession.value.user = { id: 'global-manager', role: 'manager', memberships: [] };
    memberOf({ store_id: STORE_B });
    const res = await PATCH(makeRequest({ role: 'clerk' }), nextCtx());
    expect(res.status).toBe(403);
    expect(probes.rpcCalls).toHaveLength(0);
  });

  it('admin global pasa por diseño (roles.ts) hacia la RPC', async () => {
    mockSession.value.user = { id: 'tenant-admin', role: 'admin', memberships: [] };
    memberOf({ store_id: STORE_B });
    const res = await PATCH(makeRequest({ role: 'clerk' }), nextCtx());
    expect(res.status).toBe(200);
    expect(probes.rpcCalls).toHaveLength(1);
  });

  it('formato inválido de membershipId → 400 y cero consultas/rpc', async () => {
    mockSession.value.user = { id: 'tenant-admin', role: 'admin', memberships: [] };
    const badCtx = { params: Promise.resolve({ id: USER_X, membershipId: 'not-a-uuid' }) };
    const res = await PATCH(makeRequest({ status: 'active' }), badCtx);
    expect(res.status).toBe(400);
    expect(probes.tablesTouched).not.toContain('user_store_memberships');
    expect(probes.rpcCalls).toHaveLength(0);
  });

  it('ERR_UNAUTHORIZED de la capa SQL (p.ej. revoke exige admin de tienda) mapea a 403', async () => {
    mockSession.value.user = {
      id: 'mgr-b',
      role: 'manager',
      memberships: [{ store_id: STORE_B, role: 'manager', status: 'active' }],
    };
    memberOf({ store_id: STORE_B });
    rpcResult = { data: null, error: { message: 'ERR_UNAUTHORIZED: Only store admins can revoke memberships.' } };
    const res = await DELETE(makeRequest(), nextCtx());
    expect(res.status).toBe(403);
  });
});

describe('DELETE /users/[id]/memberships/[membershipId] · FIX F3-P1-04', () => {
  beforeEach(() => {
    probes.rpcCalls = [];
  });

  it('FIRMA REAL Next16: admin de tienda revoca membership de su tienda → 200 + RPC correcta', async () => {
    mockSession.value.user = {
      id: 'adm-b',
      role: 'clerk',
      memberships: [{ store_id: STORE_B, role: 'admin', status: 'active' }],
    };
    memberOf({ store_id: STORE_B });
    const res = await DELETE(makeRequest(), nextCtx());
    expect(res.status).toBe(200);
    expect(probes.rpcCalls[0].name).toBe('managed_revoke_membership');
    expect(probes.rpcCalls[0].args).toMatchObject({
      p_membership_id: MEM_ID_A,
      p_caller_id: 'adm-b',
    });
  });

  it('cross-store DELETE → 403 y sin RPC', async () => {
    mockSession.value.user = {
      id: 'adm-a',
      role: 'clerk',
      memberships: [{ store_id: STORE_A, role: 'admin', status: 'active' }],
    };
    memberOf({ store_id: STORE_B });
    const res = await DELETE(makeRequest(), nextCtx());
    expect(res.status).toBe(403);
    expect(probes.rpcCalls).toHaveLength(0);
  });

  it('manager de tienda NO es suficiente para DELETE según regla estricta de BD → error mapeado 403', async () => {
    mockSession.value.user = {
      id: 'mgr-b',
      role: 'manager',
      memberships: [{ store_id: STORE_B, role: 'manager', status: 'active' }],
    };
    memberOf({ store_id: STORE_B });
    rpcResult = { data: null, error: { message: 'ERR_UNAUTHORIZED: Only store admins can revoke memberships.' } };
    const res = await DELETE(makeRequest(), nextCtx());
    expect(res.status).toBe(403);
  });
});
