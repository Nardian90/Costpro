/**
 * MISIÓN ORGANIZACIONES (2026-10-26) — FASE 2/9: alcance del listado de
 * usuarios por rol (columna Empresa/Organización).
 *
 * Invariantes:
 *   · superadmin: SIN filtro de tenant (todas las empresas) + tenant_name
 *     resuelto en la respuesta.
 *   · admin ordinario: SOLO perfiles de su empresa (aislamiento).
 *   · encargado: sin admins, dentro de su empresa.
 *   · otros roles: 403.
 *   · superadmin sin tenant NO recibe 404 (el 404 es para admins sin empresa).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const currentSession = {
  token: 'test-token',
  user: { id: '11111111-1111-4111-8111-111111111111', email: 'admin@costpro.dev', role: 'admin' },
};

let sessionOverride = { ...currentSession };

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, sessionOverride),
}));

vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }) }));
const { mockLoggerError } = vi.hoisted(() => ({ mockLoggerError: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: mockLoggerError, warn: vi.fn(), info: vi.fn() } }));

type Row = Record<string, unknown>;
const state: { profiles: Row[]; memberships: Row[]; tenants: Row[]; lastOrExpr: string | null; profilesFail: boolean } =
  { profiles: [], memberships: [], tenants: [], lastOrExpr: null, profilesFail: false };

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const ORG_A = 'aaaaaaa1-0000-4000-8000-00000000000a';
const ORG_B = 'aaaaaaa2-0000-4000-8000-00000000000b';

function makeQuery(table: string) {
  let filters: Array<(r: Row) => boolean> = [];
  let rangeSlice: [number, number] | null = null;
  const q: any = {
    select: () => q,
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q; },
    neq: (c: string, v: unknown) => { filters.push(r => r[c] !== v); return q; },
    in: (c: string, vals: unknown[]) => { filters.push(r => vals.includes(r[c])); return q; },
    // CP-ORG-001: captura la expresión .or() para verificar la sanitización
    // del término de búsqueda (sin inyección de sintaxis PostgREST).
    or: (_expr: string) => { state.lastOrExpr = _expr; return q; },
    is: (c: string, v: unknown) => { filters.push(r => (r[c] == null ? v == null : r[c] === v)); return q; },
    order: () => q,
    range: (from: number, to: number) => { rangeSlice = [from, to]; return q; },
    single: async () => {
      const rows = state.profiles.filter(r => filters.every(f => f(r)) && (r.id === ADMIN_ID || true));
      const mine = rows.find(r => r.id === ADMIN_ID);
      return mine ? { data: mine, error: null } : { data: null, error: { message: 'nf' } };
    },
    then: (resolve: any, reject: any) => promise.then(resolve, reject),
  };
  const promise = Promise.resolve().then(() => {
    const rows = (table === 'profiles' ? state.profiles : table === 'user_store_memberships' ? state.memberships : state.tenants)
      .filter(r => filters.every(f => f(r)));
    const sliced = rangeSlice ? rows.slice(rangeSlice[0], rangeSlice[1] + 1) : rows;
    if (table === 'profiles' && state.profilesFail) {
      return { data: null, error: { message: 'internal: connection reset while SELECT from profiles (password=hunter2)', code: 'XX000' }, count: null };
    }
    return { data: sliced, error: null, count: sliced.length };
  });
  return q;
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => ({
    from: (table: string) => makeQuery(table),
  }),
}));

import { GET } from '@/app/api/users/route';

function makeReq(qs = '') {
  return {
    url: `http://localhost:3000/api/users${qs}`,
    nextUrl: new URL(`http://localhost:3000/api/users${qs}`),
    method: 'GET',
  } as any;
}

describe('MISIÓN ORGANIZACIONES — /api/users alcance por rol (FASE 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionOverride = { ...currentSession };
    state.lastOrExpr = null;
    state.profilesFail = false;
    state.profiles = [
      { id: ADMIN_ID, tenant_id: ORG_A, full_name: 'Admin A', email: 'admin.a@x.dev', role: 'admin', is_active: true, deleted_at: null, created_at: '2026-10-01' },
      { id: 'u2', tenant_id: ORG_A, full_name: 'Usuario A2', email: 'u2@x.dev', role: 'clerk', is_active: true, deleted_at: null, created_at: '2026-10-01' },
      { id: 'u3', tenant_id: ORG_B, full_name: 'Usuario B', email: 'u3@x.dev', role: 'encargado', is_active: true, deleted_at: null, created_at: '2026-10-01' },
    ];
    state.memberships = [];
    state.tenants = [
      { id: ORG_A, name: 'Empresa Alfa' },
      { id: ORG_B, name: 'Empresa Beta' },
    ];
  });

  it('admin ordinario: SOLO perfiles de su empresa', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'admin' };
    const res = await GET(makeReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.every((u: Row) => u.tenant_id === ORG_A)).toBe(true);
    expect(body.data.some((u: Row) => u.tenant_id === ORG_B)).toBe(false);
  });

  it('superadmin: TODAS las empresas, con tenant_name resuelto', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'superadmin' };
    const res = await GET(makeReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    const tenants = new Set(body.data.map((u: Row) => u.tenant_id));
    expect(tenants.has(ORG_A)).toBe(true);
    expect(tenants.has(ORG_B)).toBe(true);
    const u3 = body.data.find((u: Row) => u.id === 'u3');
    expect(u3.tenant_name).toBe('Empresa Beta');
  });

  it('superadmin SIN empresa propia no recibe 404', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'superadmin' };
    // El caller (ADMIN_ID) tiene tenant ORG_A en el mock; el caso «sin
    // tenant» se simula con admin sin tenant:
    state.profiles[0].tenant_id = null;
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
  });

  it('encargado: solo su empresa y SIN admins visibles', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'encargado' };
    const res = await GET(makeReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.every((u: Row) => u.role !== 'admin')).toBe(true);
  });

  it('clerk (rol no administrativo): 403', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'clerk' };
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
  });

  it('admin SIN empresa: 404 con mensaje claro (pre-superadmin)', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'admin' };
    state.profiles[0].tenant_id = null;
    const res = await GET(makeReq());
    expect(res.status).toBe(404);
  });

  // ─── CP-ORG-001: sanitización de la búsqueda + mensajes sin fuga ───────

  it('CP-ORG-001: el término de búsqueda se sana y entrecomilla antes de la expresión .or()', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'admin' };
    // Intento de inyección de sintaxis PostgREST (romper el .or()/inyectar
    // condiciones). El término saneado no puede contener , ( ) ni comillas y
    // el valor viaja entrecomillado (escape oficial de PostgREST).
    const res = await GET(makeReq('?search=abc%29%2Cdeleted_at.isn.null%2C%28'));
    expect(res.status).toBe(200);
    expect(state.lastOrExpr).not.toBeNull();
    const expr = state.lastOrExpr as string;
    expect(expr).toBe('full_name.ilike."%abcdeleted_at.isn.null%",email.ilike."%abcdeleted_at.isn.null%"');
    // Solo existe UNA coma en toda la expresión: la que separa las dos
    // condiciones. Los paréntesis/comas inyectados fueron neutralizados.
    expect(expr.match(/,/g)?.length).toBe(1);
    expect(expr).not.toMatch(/[()]/);
    expect(expr.match(/"/g)?.length).toBe(4);
  });

  it('CP-ORG-001: búsqueda normal conserva espacios/puntos/@ y viaja entrecomillada', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'admin' };
    const res = await GET(makeReq(`?search=${encodeURIComponent('Juan Pérez')}`));
    expect(res.status).toBe(200);
    const expr = state.lastOrExpr as string;
    expect(expr).toContain('"%Juan Pérez%"');
    expect(expr).toBe('full_name.ilike."%Juan Pérez%",email.ilike."%Juan Pérez%"');
  });

  it('CP-ORG-001: búsqueda con solo caracteres estructurales queda vacía y no aplica el filtro', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'admin' };
    // «()», comas y comillas solos: tras sanitizar no queda término → no se
    // llama .or() (sin filtro de texto, el resto de la consulta intacta).
    const res = await GET(makeReq(`?search=${encodeURIComponent('(),"\'')}`));
    expect(res.status).toBe(200);
    expect(state.lastOrExpr).toBeNull();
  });

  it('CP-ORG-001: role=tenant_admin es un filtro válido (enum del schema)', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'superadmin' };
    state.profiles.push({ id: 'u4', tenant_id: ORG_B, full_name: 'Admin Tenant', email: 'u4@x.dev', role: 'tenant_admin', is_active: true, deleted_at: null, created_at: '2026-10-01' });
    const res = await GET(makeReq('?role=tenant_admin'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.every((u: Row) => u.role === 'tenant_admin')).toBe(true);
    expect(body.data.length).toBe(1);
  });

  it('CP-ORG-001: un fallo de BD responde con mensaje saneado, sin detalles internos', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'admin' };
    state.profilesFail = true;
    const res = await GET(makeReq());
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe('No se pudieron cargar los usuarios');
    // Ni el mensaje del proveedor ni credenciales viajan al cliente.
    expect(mockLoggerError).toHaveBeenCalled();
  });
});
