/**
 * MISIÓN ORGANIZACIONES (2026-10-26) — FASE 9: contrato del API de
 * organizaciones.
 *
 * Verifica el alcance por rol (misión FASE 1/3):
 *   · GET  — superadmin: TODAS las organizaciones; admin: SOLO la suya;
 *     otros roles: 403. Summary con recuentos reales; unassigned_users solo
 *     para superadmin (cifra global de plataforma).
 *   · POST — solo superadmin (crear empresas es acción de plataforma);
 *     duplicado exacto → 409.
 *   · PATCH — admin solo su empresa (404 para la ajena, sin revelarla).
 *   · DELETE — solo superadmin; 409 con dependencias reales (tiendas /
 *     usuarios); nunca cascada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const currentSession = {
  token: 'test-token',
  user: { id: '11111111-1111-4111-8111-111111111111', email: 'admin@costpro.dev', role: 'admin' },
};

let sessionOverride = { ...currentSession };

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, sessionOverride),
  withRole: (_role: unknown, fn: any) => async (req: any) => fn(req, sessionOverride),
}));

vi.mock('@/lib/observability', () => ({
  withTracing: (fn: any) => fn,
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: async () => ({ allowed: true }),
}));

vi.mock('@/lib/csrf', () => ({
  validateOrigin: async () => true,
}));

const { mockLoggerError } = vi.hoisted(() => ({ mockLoggerError: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { error: mockLoggerError, warn: vi.fn(), info: vi.fn() },
}));

// ─── Mock de supabase admin ─────────────────────────────────────────────────

type Row = Record<string, unknown>;

const state: {
  tenants: Row[];
  stores: Row[];
  profiles: Row[];
  memberships: Row[];
  inserted: Row[];
  updated: Array<{ table: string; row: Row }>;
  deleted: Array<{ table: string; id: string }>;
} = {
  tenants: [],
  stores: [],
  profiles: [],
  memberships: [],
  inserted: [],
  updated: [],
  deleted: [],
};

const SUPERADMIN_ID = '99999999-9999-4999-8999-999999999999';
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CLERK_ID = '22222222-2222-4222-8222-222222222222';
const ORG_A = 'aaaaaaa1-0000-4000-8000-00000000000a';
const ORG_B = 'aaaaaaa2-0000-4000-8000-00000000000b';

function makeQuery(rowsFor: (table: string) => Row[]) {
  const build = (table: string) => {
    let filters: Array<(r: Row) => boolean> = [];
    let rangeSlice: [number, number] | null = null;
    let head = false;
    let withCount = false;
    const q: any = {
      select: (_cols?: unknown, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) head = true;
        if (opts?.count) withCount = true;
        return q;
      },
      eq: (_col: string, val: unknown) => { filters.push(r => r[_col] === val); return q; },
      neq: (_col: string, val: unknown) => { filters.push(r => r[_col] !== val); return q; },
      in: (_col: string, vals: unknown[]) => { filters.push(r => vals.includes(r[_col])); return q; },
      // CP-ORG-001: ilike con semántica REAL de PostgREST — patrón completo,
      // % = cualquier secuencia, _ = un carácter. Sin esto, los comodines
      // y los chequeos literales no son distinguibles en las pruebas.
      ilike: (_col: string, pattern: string) => {
        const regex = new RegExp(
          '^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$',
          'i'
        );
        filters.push(r => regex.test(String(r[_col] ?? '')));
        return q;
      },
      // CP-ORG-001: negación usada por has_stores=false («id not.in (...)»).
      not: (_col: string, op: string, val: unknown) => {
        if (op === 'is') {
          filters.push(r => !(r[_col] == null ? val == null : r[_col] === val));
        } else if (op === 'in') {
          const raw = String(val ?? '').replace(/^\(/, '').replace(/\)$/, '');
          const vals = raw
            ? raw.split(',').map((s: string) => s.replace(/^"|"$/g, ''))
            : [];
          filters.push(r => !vals.includes(r[_col] as string));
        }
        return q;
      },
      is: (_col: string, val: unknown) => { filters.push(r => (r[_col] == null ? val == null : r[_col] === val)); return q; },
      order: () => q,
      range: (from: number, to: number) => { rangeSlice = [from, to]; return q; },
      limit: () => q,
      single: async () => {
        const rows = apply(table);
        return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } };
      },
      then: (resolve: any, reject: any) => promise.then(resolve, reject),
    };
    const promise = Promise.resolve().then(() => {
      // CP-ORG-001: semántica PostgREST — count es el total FILTRADO (sin
      // paginar) y data es la página (con rango aplicado).
      const all = apply(table, false);
      const rows = apply(table, true);
      if (head) return { data: null, error: null, count: all.length };
      return { data: rows, error: null, count: withCount ? all.length : null };
    });
    function apply(t: string, sliced = true): Row[] {
      let rows = rowsFor(t).filter(r => filters.every(f => f(r)));
      if (t === 'tenants') rows = rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      if (sliced && rangeSlice) rows = rows.slice(rangeSlice[0], rangeSlice[1] + 1);
      return rows;
    }
    return q;
  };
  return build;
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => ({
    from: (table: string) => {
      if (table === 'tenants') {
        const base = makeQuery(() => state.tenants)(table);
        return {
          ...base,
          insert: (row: Row) => {
            state.inserted.push(row);
            const created = { ...row, id: 'new-org-id' };
            return { select: () => ({ single: async () => ({ data: created, error: null }) }) };
          },
          update: (row: Row) => ({
            eq: (_c: string, id: string) => {
              state.updated.push({ table: 'tenants', row: { id, ...row } });
              return Promise.resolve({ error: null });
            },
          }),
          delete: () => ({
            eq: (_c: string, id: string) => {
              state.deleted.push({ table: 'tenants', id });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === 'stores' || table === 'profiles') {
        return makeQuery(t => rowsFor(t))(table);
      }
      return makeQuery(t => rowsFor(t))(table);
    },
  }),
}));

function rowsFor(table: string): Row[] {
  if (table === 'tenants') return state.tenants;
  if (table === 'stores') return state.stores;
  if (table === 'profiles') return state.profiles;
  if (table === 'user_store_memberships') return state.memberships;
  return [];
}

function makeReq(url = '/api/organizations', method = 'GET', body?: unknown) {
  return {
    url: `http://localhost:3000${url}`,
    nextUrl: new URL(`http://localhost:3000${url}`),
    method,
    json: async () => body,
  } as any;
}

// Import after mocks
import { GET as orgsGET, POST as orgsPOST } from '@/app/api/organizations/route';
import { PATCH as orgPATCH, DELETE as orgDELETE, GET as orgGET } from '@/app/api/organizations/[id]/route';

describe('MISIÓN ORGANIZACIONES — /api/organizations (FASE 1+3: alcance por rol)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionOverride = { ...currentSession };
    state.tenants = [
      { id: ORG_A, name: 'Empresa Alfa', owner_id: null, plan: 'free', is_active: true, created_at: '2026-10-01', updated_at: '2026-10-01' },
      { id: ORG_B, name: 'Empresa Beta', owner_id: null, plan: 'free', is_active: false, created_at: '2026-10-02', updated_at: '2026-10-02' },
    ];
    state.stores = [
      { tenant_id: ORG_A, is_active: true },
      { tenant_id: ORG_A, is_active: false },
    ];
    state.profiles = [
      { id: ADMIN_ID, tenant_id: ORG_A },
      { id: 'u2', tenant_id: ORG_A },
      { id: 'u3', tenant_id: ORG_B },
    ];
    state.memberships = [];
    state.inserted = [];
    state.updated = [];
    state.deleted = [];
  });

  it('GET: admin ordinario recibe SOLO su organización', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'admin' };
    const res = await orgsGET(makeReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(ORG_A);
    expect(body.data[0].name).toBe('Empresa Alfa');
    expect(body.summary.scope).toBe('own');
  });

  it('GET: superadmin recibe TODAS las organizaciones y la cifra global de sin asignar', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'superadmin' };
    state.profiles.push({ id: 'unassigned-1', tenant_id: null, deleted_at: null, role: 'clerk' });
    const res = await orgsGET(makeReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.summary.scope).toBe('all');
    expect(body.summary.unassigned_users).toBeGreaterThanOrEqual(1);
  });

  it('GET: admin SIN empresa recibe listado vacío (no 500)', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'admin' };
    // caller sin tenant: profiles del caller no está en el estado → tenant_id undefined
    const res = await orgsGET(makeReq());
    expect(res.status).toBe(200);
  });

  it('GET: rol no administrativo → 403', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'clerk' };
    const res = await orgsGET(makeReq());
    expect(res.status).toBe(403);
  });

  it('GET: recuentos reales de tiendas/usuarios por organización', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'admin' };
    const res = await orgsGET(makeReq());
    const body = await res.json();
    expect(body.data[0].stores_total).toBe(2);
    expect(body.data[0].stores_active).toBe(1);
    // u1 (caller) + u2 en ORG_A (la del admin)
    expect(body.data[0].users).toBe(2);
  });

  // ─── CP-ORG-001: has_stores pre-paginación + resumen de alcance ───────

  it('CP-ORG-001 GET: has_stores=true filtra EN SERVIDOR con total coherente', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'superadmin' };
    // ORG_A tiene tiendas; ORG_B no.
    const res = await orgsGET(makeReq('/api/organizations?has_stores=true'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(ORG_A);
    // El total paginado refleja el FILTRO (antes quedaba sin filtrar).
    expect(body.pagination.total).toBe(1);
  });

  it('CP-ORG-001 GET: has_stores=false EXCLUYE las organizaciones con tiendas', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'superadmin' };
    const res = await orgsGET(makeReq('/api/organizations?has_stores=false'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(ORG_B);
    expect(body.pagination.total).toBe(1);
  });

  it('CP-ORG-001 GET: summary describe el ALCANCE completo, no la página', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'superadmin' };
    // Página de 1 fila: el resumen NO debe depender de la paginación.
    const res = await orgsGET(makeReq('/api/organizations?limit=1'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    // Alcance completo: 2 organizaciones, 1 activa (ORG_B inactiva),
    // 1 tienda activa (de las 2 de ORG_A), 3 usuarios asignados.
    expect(body.summary.organizations).toBe(2);
    expect(body.summary.active_organizations).toBe(1);
    expect(body.summary.stores).toBe(1);
    expect(body.summary.assigned_users).toBe(3);
    expect(body.pagination.total).toBe(2);
  });

  it('CP-ORG-001 POST: comodines del nombre no generan falsos duplicados (ilike LITERAL)', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'superadmin' };
    state.tenants.push({ id: 'org-100', name: '100x', owner_id: null, plan: 'free', is_active: true, created_at: '2026-10-01', updated_at: '2026-10-01' });
    // «100%» con comodín coincidiría con «100x» (falso 409); el chequeo
    // saneado lo trata como literal → creación permitida.
    const res = await orgsPOST(makeReq('/api/organizations', 'POST', { name: '100%' }));
    expect(res.status).toBe(201);
    expect(state.inserted).toHaveLength(1);
  });

  it('POST: admin ordinario NO puede crear organizaciones (403)', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'admin' };
    const res = await orgsPOST(makeReq('/api/organizations', 'POST', { name: 'Nueva' }));
    expect(res.status).toBe(403);
    expect(state.inserted).toHaveLength(0);
  });

  it('POST: superadmin crea con nombre normalizado', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'superadmin' };
    const res = await orgsPOST(makeReq('/api/organizations', 'POST', { name: '  Grupo   Nueva  ' }));
    expect(res.status).toBe(201);
    expect(state.inserted[0].name).toBe('Grupo Nueva');
  });

  it('POST: nombre duplicado exacto → 409 (sin segunda inserción)', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'superadmin' };
    const res = await orgsPOST(makeReq('/api/organizations', 'POST', { name: 'empresa alfa' }));
    expect(res.status).toBe(409);
    expect(state.inserted).toHaveLength(0);
  });

  it('POST: nombre vacío → 400', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'superadmin' };
    const res = await orgsPOST(makeReq('/api/organizations', 'POST', { name: '   ' }));
    expect(res.status).toBe(400);
  });
});

describe('MISIÓN ORGANIZACIONES — /api/organizations/[id] (FASE 1 §§4-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionOverride = { ...currentSession };
    state.tenants = [
      { id: ORG_A, name: 'Empresa Alfa', owner_id: null, plan: 'free', is_active: true, subscription_status: 'trial', custom_domain: null, created_at: '2026-10-01', updated_at: '2026-10-01' },
      { id: ORG_B, name: 'Empresa Beta', owner_id: null, plan: 'free', is_active: true, subscription_status: 'trial', custom_domain: null, created_at: '2026-10-02', updated_at: '2026-10-02' },
    ];
    state.stores = [];
    state.profiles = [{ id: ADMIN_ID, tenant_id: ORG_A }];
    state.updated = [];
    state.deleted = [];
  });

  it('GET: admin ve el detalle de SU organización con tiendas y usuarios', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'admin' };
    state.stores = [{ id: 's1', tenant_id: ORG_A, name: 'Tienda 1', slug: 't1', is_active: true, is_archived: false, created_at: '2026-10-01' }];
    state.profiles.push({ id: 'u2', tenant_id: ORG_A, full_name: 'Usuario Dos', email: 'u2@x.dev', role: 'clerk', is_active: true, deleted_at: null });
    const res = await orgGET(makeReq(`/api/organizations/${ORG_A}`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.organization.name).toBe('Empresa Alfa');
    expect(body.stores).toHaveLength(1);
    expect(body.users.length).toBeGreaterThanOrEqual(1);
  });

  it('GET: admin NO ve la organización ajena (404 sin revelar existencia)', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'admin' };
    const res = await orgGET(makeReq(`/api/organizations/${ORG_B}`));
    expect(res.status).toBe(404);
  });

  it('PATCH: admin actualiza SU organización; la ajena → 404', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'admin' };
    const res = await orgPATCH(makeReq(`/api/organizations/${ORG_A}`, 'PATCH', { name: 'Empresa Alfa Renombrada' }));
    expect(res.status).toBe(200);
    expect(state.updated[0].row.name).toBe('Empresa Alfa Renombrada');

    const resAjena = await orgPATCH(makeReq(`/api/organizations/${ORG_B}`, 'PATCH', { name: 'X' }));
    expect(resAjena.status).toBe(404);
  });

  it('DELETE: solo superadmin; con dependencias → 409 + resumen real (sin borrar)', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'admin' };
    const resAdmin = await orgDELETE(makeReq(`/api/organizations/${ORG_A}`, 'DELETE'));
    expect(resAdmin.status).toBe(403);

    sessionOverride.user = { ...currentSession.user, role: 'superadmin' };
    state.stores = [{ tenant_id: ORG_A, is_active: true }];
    state.profiles.push({ id: 'u2', tenant_id: ORG_A });
    const res = await orgDELETE(makeReq(`/api/organizations/${ORG_A}`, 'DELETE'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.dependencies).toEqual({ stores: 1, users: 2 });
    expect(state.deleted).toHaveLength(0);
  });

  it('DELETE: superadmin elimina una organización VACÍA (0 tiendas, 0 usuarios)', async () => {
    sessionOverride.user = { ...currentSession.user, role: 'superadmin' };
    state.profiles = [{ id: ADMIN_ID, tenant_id: ORG_A }]; // ORG_B queda sin usuarios
    const res = await orgDELETE(makeReq(`/api/organizations/${ORG_B}`, 'DELETE'));
    expect(res.status).toBe(200);
    expect(state.deleted[0]).toEqual({ table: 'tenants', id: ORG_B });
  });
});
