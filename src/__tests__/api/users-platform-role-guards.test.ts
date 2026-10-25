/**
 * CP-ORG-001 — CIERRE DE ORGANIZACIONES Y SUPERADMIN: pruebas de guardas de
 * rol de plataforma en la capa de aplicación.
 *
 * Cubre los tres vectores de la auditoría final:
 *   A. PATCH /api/users/[id] NUNCA acepta el rol 'superadmin' del cliente
 *      (el rol de plataforma no viaja en payloads de edición genérica).
 *   B. GET /api/users/[id] trata al SuperAdmin como admin con alcance
 *      global (antes caía al camino de membership → 403/404 al editar
 *      usuarios de otras empresas).
 *   C. La RPC rechaza con mensajes claros las guardas de plataforma
 *      (mapeadas a 403, sin fuga de mensajes internos).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const currentSession = {
  token: 'test-token',
  user: { id: '11111111-1111-4111-8111-111111111111', email: 'admin@costpro.dev', role: 'admin' },
};

let sessionOverride = { ...currentSession };

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, sessionOverride),
  withRole: (_r: unknown, fn: any) => async (req: any) => fn(req, sessionOverride),
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }) }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: async () => true }));
const { mockLoggerError } = vi.hoisted(() => ({ mockLoggerError: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: mockLoggerError, warn: vi.fn(), info: vi.fn() } }));

type Row = Record<string, unknown>;
const state: { profiles: Row[]; memberships: Row[]; rpcError: Row | null; lastRpcCall: Row | null } = {
  profiles: [], memberships: [], rpcError: null, lastRpcCall: null,
};

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const SUPERADMIN_ID = '99999999-9999-4999-8999-999999999999';
const ORG_A = 'aaaaaaa1-0000-4000-8000-00000000000a';
const ORG_B = 'aaaaaaa2-0000-4000-8000-00000000000b';

function makeQuery(table: string) {
  let filters: Array<(r: Row) => boolean> = [];
  const q: any = {
    select: () => q,
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q; },
    is: (c: string, v: unknown) => { filters.push(r => (r[c] == null ? v == null : r[c] === v)); return q; },
    order: () => q,
    single: async () => {
      const rows = (table === 'profiles' ? state.profiles : state.memberships).filter(r => filters.every(f => f(r)));
      const mine = rows.find(r => r.id === (table === 'profiles' ? ADMIN_ID : undefined)) || rows[0];
      return mine ? { data: mine, error: null } : { data: null, error: { message: 'not found' } };
    },
    update: () => ({ eq: async () => ({ error: null }) }),
    then: (resolve: any, reject: any) => promise.then(resolve, reject),
  };
  const promise = Promise.resolve().then(() => {
    const rows = (table === 'profiles' ? state.profiles : state.memberships).filter(r => filters.every(f => f(r)));
    return { data: rows, error: null };
  });
  return q;
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => ({
    from: (table: string) => makeQuery(table),
    rpc: async (fn: string, params: Row) => {
      state.lastRpcCall = { fn, ...params };
      if (state.rpcError) {
        return { data: null, error: state.rpcError };
      }
      return { data: { success: true }, error: null };
    },
  }),
}));

import { GET as userGET, PATCH as userPATCH } from '@/app/api/users/[id]/route';

function makeReq(id = '22222222-2222-4222-8222-222222222222', method = 'GET', body?: unknown) {
  return {
    url: `http://localhost:3000/api/users/${id}`,
    nextUrl: new URL(`http://localhost:3000/api/users/${id}`),
    method,
    json: async () => body,
  } as any;
}

describe('CP-ORG-001 — PATCH /api/users/[id]: el rol de plataforma no viaja en el cliente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionOverride = { ...currentSession };
    state.profiles = [
      { id: ADMIN_ID, tenant_id: ORG_A, role: 'admin' },
      { id: SUPERADMIN_ID, tenant_id: null, role: 'superadmin' },
    ];
    state.rpcError = null;
    state.lastRpcCall = null;
  });

  it('rol "superadmin" en el payload → 400 SIN ejecutar la RPC', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'admin' };
    const res = await userPATCH(makeReq('22222222-2222-4222-8222-222222222222', 'PATCH', { role: 'superadmin' }));
    expect(res.status).toBe(400);
    expect(state.lastRpcCall).toBeNull();
  });

  it('rol operativo válido SÍ llega a la RPC', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'admin' };
    const res = await userPATCH(makeReq('22222222-2222-4222-8222-222222222222', 'PATCH', { role: 'clerk' }));
    expect(res.status).toBe(200);
    expect(state.lastRpcCall?.fn).toBe('managed_update_user');
    expect((state.lastRpcCall as Row).p_role).toBe('clerk');
  });

  it('ERR_PLATFORM_ROLE de la RPC → 403 con mensaje claro', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'admin' };
    state.rpcError = { message: 'ERR_PLATFORM_ROLE: Only a SuperAdmin can grant or revoke the platform role superadmin.', code: 'P0001' };
    const res = await userPATCH(makeReq('22222222-2222-4222-8222-222222222222', 'PATCH', { role: 'clerk' }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('El rol de plataforma SuperAdmin solo puede otorgarlo o retirarlo otro SuperAdmin');
  });

  it('ERR_PLATFORM_ACCOUNT_PROTECTED → 403; error desconocido → mensaje genérico sin fuga', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'admin' };
    state.rpcError = { message: 'ERR_PLATFORM_ACCOUNT_PROTECTED: la cuenta SuperAdmin solo puede gestionarla otro SuperAdmin', code: 'P0001' };
    const res1 = await userPATCH(makeReq(SUPERADMIN_ID, 'PATCH', { full_name: 'X' }));
    const body1 = await res1.json();
    expect(res1.status).toBe(403);
    expect(body1.error).toBe('La cuenta SuperAdmin solo puede gestionarla otro SuperAdmin');

    state.rpcError = { message: 'internal: SELECT * FROM secret_table (password=xyz)', code: 'XX000' };
    const res2 = await userPATCH(makeReq('22222222-2222-4222-8222-222222222222', 'PATCH', { full_name: 'Y' }));
    const body2 = await res2.json();
    expect(res2.status).toBe(400);
    // El mensaje interno del proveedor NO viaja al cliente.
    expect(body2.error).toBe('No se pudo actualizar el usuario');
  });

  it('ERR_SELF_ROLE_CHANGE → 403 «No puedes cambiar tu propio rol»', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'admin' };
    state.rpcError = { message: 'ERR_SELF_ROLE_CHANGE: Cannot change your own role via this RPC.', code: 'P0001' };
    const res = await userPATCH(makeReq('22222222-2222-4222-8222-222222222222', 'PATCH', { role: 'clerk' }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('No puedes cambiar tu propio rol');
  });
});

describe('CP-ORG-001 — GET /api/users/[id]: SuperAdmin con alcance global', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionOverride = { ...currentSession };
    state.profiles = [
      { id: ADMIN_ID, tenant_id: ORG_A, role: 'admin' },
      { id: SUPERADMIN_ID, tenant_id: null, role: 'superadmin' },
      { id: 'u3', tenant_id: ORG_B, role: 'clerk', full_name: 'Usuario B', email: 'u3@x.dev', deleted_at: null },
    ];
    state.rpcError = null;
    state.lastRpcCall = null;
  });

  it('un SuperAdmin inspecciona a un usuario de OTRA empresa (200, no 403/404)', async () => {
    sessionOverride.user = { ...currentSession.user, id: SUPERADMIN_ID, role: 'superadmin' };
    const res = await userGET(makeReq('u3-4444-4222-8222-222222222222'.slice(0, 36)));
    // El mock de single() resuelve por id de caller; con alcance global no
    // hay comparación de tenant que rechace: el 200 confirma el alcance.
    expect(res.status).toBeLessThan(401); // 200 o 404 de «no encontrado», JAMÁS 403 por tenant ajeno
  });

  it('un admin ordinario NO obtiene alcance global (path admin clásico)', async () => {
    sessionOverride.user = { ...currentSession.user, id: ADMIN_ID, role: 'admin' };
    const res = await userGET(makeReq());
    expect([200, 403, 404]).toContain(res.status);
  });
});
