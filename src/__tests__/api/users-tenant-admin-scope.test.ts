/**
 * CP-ORG-003 Fase 3 — GET /api/users con alcance organizacional para
 * tenant_admin: pruebas de autorización positivas y negativas + regresión
 * de los roles existentes.
 *
 * La misión §5 exige demostración server-side: cada consulta limitada a la
 * organización autorizada y sin cuentas de nivel de plataforma. Las
 * MUTACIONES (managed-create / PATCH / toggle / delete) quedan SIN CAMBIOS
 * (403 para tenant_admin) — su diseño org-scoped se documenta en el
 * expediente; este PR solo implementa la lectura demostrable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ORG_A = 'aaaaaaa1-0000-4000-8000-00000000000a';
const ORG_B = 'aaaaaaa2-0000-4000-8000-00000000000b';

let sessionOverride: { token: string; user: { id: string; role: string; roles?: string[] } } | null = null;

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => {
    if (!sessionOverride) return { status: 401, json: async () => ({ error: 'No autenticado' }) };
    return fn(req, sessionOverride);
  },
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

type Row = Record<string, unknown>;
const state: { profiles: Row[]; memberships: Row[]; tenants: Row[] } = {
  profiles: [], memberships: [], tenants: [],
};

// Filtros acumulados interpretables por el builder mock.
type Predicate = (r: Row) => boolean;

function makeQuery(table: string) {
  const preds: Predicate[] = [];
  let rangeArgs: [number, number] | null = null;

  const applyNot = (col: string, op: string, rawValues: string) => {
    if (op === 'in') {
      const values = rawValues.replace(/[()"]/g, '').split(',').map(s => s.trim());
      preds.push(r => !values.includes(String(r[col])));
    }
  };

  const q: any = {
    select: () => q,
    is: (c: string, v: unknown) => { preds.push(r => (v === null ? r[c] == null : r[c] === v)); return q; },
    eq: (c: string, v: unknown) => { preds.push(r => r[c] === v); return q; },
    neq: (c: string, v: unknown) => { preds.push(r => r[c] !== v); return q; },
    not: (c: string, op: string, vals: string) => { applyNot(c, op, vals); return q; },
    in: (c: string, vals: unknown[]) => { preds.push(r => vals.includes(r[c])); return q; },
    or: () => q,
    order: () => q,
    range: (a: number, b: number) => { rangeArgs = [a, b]; return q; },
    single: async () => {
      const rows = state.profiles.filter(r => preds.every(p => p(r)));
      const row = rows.find(r => r.id === sessionOverride?.user.id) || rows[0];
      return row ? { data: row, error: null } : { data: null, error: { message: 'not found' } };
    },
    then: (resolve: any, reject: any) => promise.then(resolve, reject),
  };
  const promise = Promise.resolve().then(() => {
    const source = table === 'profiles' ? state.profiles
      : table === 'user_store_memberships' ? state.memberships
      : table === 'tenants' ? state.tenants : [];
    const rows = source.filter(r => preds.every(p => p(r)));
    // count=exact: total de filas que matchean (range solo pagina).
    const total = rows.length;
    const data = rangeArgs ? rows.slice(rangeArgs[0], rangeArgs[1] + 1) : rows;
    return { data, count: total, error: null };
  });
  return q;
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => ({
    from: (table: string) => makeQuery(table),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

import { GET as usersGET } from '@/app/api/users/route';

function makeReq(query = '') {
  return {
    url: `http://localhost:3000/api/users${query}`,
    nextUrl: new URL(`http://localhost:3000/api/users${query}`),
    method: 'GET',
    headers: new Headers(),
    json: async () => ({}),
  } as any;
}

const TA_ID = 'aaaaaaaa-0000-4000-8000-00000000000a';
const ADMIN_ID = 'aaaaaaaa-0000-4000-8000-00000000000b';
const SUPERADMIN_ID = 'aaaaaaaa-0000-4000-8000-00000000000c';
const ENCARGADO_ID = 'aaaaaaaa-0000-4000-8000-00000000000d';

beforeEach(() => {
  vi.clearAllMocks();
  sessionOverride = null;
  state.profiles = [
    { id: TA_ID, full_name: 'Tenant Admin A', email: 'ta@a.dev', role: 'tenant_admin', tenant_id: ORG_A, deleted_at: null },
    { id: 'u-a1', full_name: 'Clerk A', email: 'c1@a.dev', role: 'clerk', tenant_id: ORG_A, deleted_at: null },
    { id: 'u-a2', full_name: 'Staff Admin A', email: 'sa@a.dev', role: 'admin', tenant_id: ORG_A, deleted_at: null },
    { id: 'u-a3', full_name: 'Super A', email: 'sp@a.dev', role: 'superadmin', tenant_id: ORG_A, deleted_at: null },
    { id: 'u-b1', full_name: 'Clerk B', email: 'c1@b.dev', role: 'clerk', tenant_id: ORG_B, deleted_at: null },
    { id: 'u-b2', full_name: 'Tenant Admin B', email: 'ta@b.dev', role: 'tenant_admin', tenant_id: ORG_B, deleted_at: null },
  ];
  state.memberships = [];
  state.tenants = [
    { id: ORG_A, name: 'Empresa A' },
    { id: ORG_B, name: 'Empresa B' },
  ];
});

describe('CP-ORG-003 F3 — GET /api/users: tenant_admin ve SU organización', () => {
  it('200 con SOLO usuarios de su tenant, SIN cuentas de plataforma (admin/superadmin)', async () => {
    sessionOverride = { token: 't', user: { id: TA_ID, role: 'tenant_admin' } };
    const res = await usersGET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.data.map((u: Row) => u.id);
    expect(ids).toContain('u-a1');                       // clerk de SU org
    expect(ids).toContain(TA_ID);                        // él mismo
    expect(ids).not.toContain('u-a2');                   // admin de plataforma en su org → EXCLUIDO
    expect(ids).not.toContain('u-a3');                   // superadmin → EXCLUIDO
    expect(ids).not.toContain('u-b1');                   // otra organización → EXCLUIDO
    expect(ids).not.toContain('u-b2');
    expect(body.pagination.total).toBe(2);
  });

  it('tenant_admin SIN tenant → 404 (sin organización no hay nada que listar)', async () => {
    state.profiles = state.profiles.map(p =>
      p.id === TA_ID ? { ...p, tenant_id: null } : p,
    );
    sessionOverride = { token: 't', user: { id: TA_ID, role: 'tenant_admin' } };
    const res = await usersGET(makeReq());
    expect(res.status).toBe(404);
  });
});

describe('CP-ORG-003 F3 — GET /api/users: SIN regresiones en roles existentes', () => {
  it('admin: sigue viendo TODO su tenant (incluidas cuentas admin) — sin exclusión nueva', async () => {
    sessionOverride = { token: 't', user: { id: ADMIN_ID, role: 'admin' } };
    state.profiles.push({ id: ADMIN_ID, full_name: 'Admin A', email: 'ad@a.dev', role: 'admin', tenant_id: ORG_A, deleted_at: null });
    const res = await usersGET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.data.map((u: Row) => u.id);
    expect(ids).toContain('u-a2');   // admin de su tenant visible
    expect(ids).toContain('u-a1');
    expect(ids).not.toContain('u-b1');
  });

  it('superadmin: alcance global (todas las organizaciones)', async () => {
    sessionOverride = { token: 't', user: { id: SUPERADMIN_ID, role: 'superadmin' } };
    const res = await usersGET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    const tenants = new Set(body.data.map((u: Row) => u.tenant_id));
    expect(tenants.has(ORG_A)).toBe(true);
    expect(tenants.has(ORG_B)).toBe(true);
  });

  it('encargado: su tenant sin admins (comportamiento previo conservado)', async () => {
    state.profiles.push({ id: ENCARGADO_ID, full_name: 'Encargado A', email: 'en@a.dev', role: 'encargado', tenant_id: ORG_A, deleted_at: null });
    sessionOverride = { token: 't', user: { id: ENCARGADO_ID, role: 'encargado' } };
    const res = await usersGET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.data.map((u: Row) => u.id);
    expect(ids).not.toContain('u-a2'); // neq role admin (pre-existente)
    expect(ids).not.toContain('u-b1');
  });
});

describe('CP-ORG-003 F3 — GET /api/users: gate para el resto de roles', () => {
  it('clerk/warehouse/usuario/costo/manager → 403 (sin cambios)', async () => {
    for (const role of ['clerk', 'warehouse', 'usuario', 'costo', 'manager']) {
      sessionOverride = { token: 't', user: { id: 'u-a1', role } };
      const res = await usersGET(makeReq());
      expect(res.status, `role=${role}`).toBe(403);
    }
  });

  it('sin sesión → 401', async () => {
    sessionOverride = null;
    const res = await usersGET(makeReq());
    expect(res.status).toBe(401);
  });
});

describe('CP-ORG-003 F3 — MUTACIONES sin cambios (diseño pendiente de PR propio)', () => {
  it('documentación viva: el gate de esta ruta NO habilita mutaciones', async () => {
    // managed-create / [id] PATCH / toggle-status / delete siguen con
    // withRole('admin') + guards RPC (20261026130000) — ver expediente
    // CP-ORG-003 §F3-diseño. Este test afirma el contrato de SOLO LECTURA
    // del cambio de este PR: la ruta exportada sigue siendo únicamente GET.
    const route = await import('@/app/api/users/route');
    expect(route.GET).toBeDefined();
    expect((route as unknown as Row).POST).toBeUndefined();
    expect((route as unknown as Row).PATCH).toBeUndefined();
    expect((route as unknown as Row).DELETE).toBeUndefined();
  });
});
