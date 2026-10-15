import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST, PATCH } from '@/app/api/service-types/route';

// La ruta exige config de Supabase antes de construir el cliente admin;
// el entorno de tests no carga .env → se proveen valores de prueba.
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');

/**
 * service-types.test.ts — MISIÓN 2026-10-15 (Servicios Recibidos).
 *
 * Contrato del catálogo de tipos de servicio:
 *  · Lectura para cualquier usuario autenticado (necesita el selector);
 *    usage_count SOLO para admin global (no expone métricas de otras tiendas).
 *  · Escritura (POST/PATCH) SOLO admin global — catálogo GLOBAL compartido
 *    por todas las tiendas (doctrina roles.ts).
 *  · Integridad: trim, dedup case/espacio-insensitive, sin borrado físico
 *    (desactivación is_active), identidad preservada (id inmutable).
 */

const mockSession = { value: null as any };

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, { token: 't', user: mockSession.value }),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/with-security', () => ({
  withSecurity: (fn: any) => fn,
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

// ── Mock del cliente admin (service-role) que construye la ruta ──
const tableMocks: Record<string, ReturnType<typeof makeTable>> = {};

function awaitable(finalValue: unknown) {
  const obj: any = {};
  obj.select = () => obj;
  obj.eq = () => obj;
  obj.is = () => obj;
  obj.neq = () => obj;
  obj.not = () => obj;
  obj.order = () => obj;
  obj.insert = () => obj;
  obj.update = () => obj;
  obj.single = async () => Promise.resolve(finalValue);
  obj.then = (res?: any, rej?: any) => Promise.resolve(finalValue).then(res, rej);
  return obj;
}

function makeTable() {
  const calls: Array<{ op: string; args: any[] }> = [];
  const handlers: Array<{ match: (op: string, args: any[]) => boolean; result: any }> = [];
  const t: any = {
    calls,
    handlers,
    on(match: (op: string, args: any[]) => boolean, result: any) {
      handlers.push({ match, result });
      return t;
    },
    select: (...args: any[]) => {
      calls.push({ op: 'select', args });
      const h = handlers.find(h => h.match('select', args));
      return h ? h.result : awaitable({ data: [], error: null });
    },
    insert: (row: any) => {
      calls.push({ op: 'insert', args: [row] });
      const h = handlers.find(h => h.match('insert', [row]));
      return h ? h.result : awaitable({ data: row, error: null });
    },
    update: (row: any) => {
      calls.push({ op: 'update', args: [row] });
      const h = handlers.find(h => h.match('update', [row]));
      return h ? h.result : awaitable({ data: row, error: null });
    },
  };
  return t;
}

const createClientMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

const EXISTING_TYPES = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Transporte', code: 'TRANSP' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Otros', code: 'OTROS' },
];

function setupAdminMock(opts: { usageRows?: any[]; insertResult?: any; updateResult?: any } = {}) {
  const admin = {
    from: (table: string) => {
      if (!tableMocks[table]) {
        tableMocks[table] = makeTable();
        if (table === 'service_types') {
          tableMocks[table]
            .on(
              (op, args) => op === 'select' && String(args[0]).includes('id, store_id, name'),
              awaitable({ data: EXISTING_TYPES.map(t => ({ ...t, store_id: null, is_active: true, description: null, created_at: '2026-06-25' })), error: null }),
            )
            .on(
              (op, args) => op === 'select' && String(args[0]) === 'id, name, code',
              awaitable({ data: EXISTING_TYPES, error: null }),
            )
            .on(
              (op, args) => op === 'select' && String(args[0]) === 'id, name',
              awaitable({ data: EXISTING_TYPES, error: null }),
            )
            .on(
              (op, args) => op === 'select' && String(args[0]) === 'id, name, is_active',
              awaitable({ data: EXISTING_TYPES[0], error: null }),
            )
            .on(
              (op) => op === 'insert',
              opts.insertResult ?? awaitable({ data: { id: 't-new', store_id: null, name: 'X', code: 'X1', description: null, is_active: true, created_at: 'now' }, error: null }),
            )
            .on(
              (op) => op === 'update',
              opts.updateResult ?? awaitable({ data: { id: '11111111-1111-4111-8111-111111111111', name: 'Transporte', is_active: false }, error: null }),
            );
        }
        if (table === 'received_services') {
          tableMocks[table].on(
            (op, args) => op === 'select' && String(args[0]).includes('service_type_id'),
            awaitable({ data: opts.usageRows ?? [], error: null }),
          );
        }
      }
      return tableMocks[table];
    },
  };
  createClientMock.mockReset().mockReturnValue(admin);
  return admin;
}

beforeEach(() => {
  for (const k of Object.keys(tableMocks)) delete tableMocks[k];
});

function adminSession() {
  mockSession.value = { id: 'u-admin', role: 'admin', memberships: [] };
}
function clerkSession() {
  mockSession.value = {
    id: 'u-clerk', role: 'clerk',
    memberships: [{ store_id: 'store-1', role: 'clerk', status: 'active' }],
  };
}

function jsonReq(body: any, method = 'POST') {
  return new Request('http://localhost/api/service-types', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/service-types', () => {
  it('cualquier usuario autenticado lee el catálogo', async () => {
    setupAdminMock();
    clerkSession();
    const res = await GET(new Request('http://localhost/api/service-types'), mockSession.value);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(2);
  });

  it('usage_count solo se expone a admin (aislamiento de métricas entre tiendas)', async () => {
    setupAdminMock({ usageRows: [{ service_type_id: '11111111-1111-4111-8111-111111111111' }, { service_type_id: '11111111-1111-4111-8111-111111111111' }] });

    clerkSession();
    const resClerk = await GET(new Request('http://localhost/api/service-types'), mockSession.value);
    const jsonClerk = await resClerk.json();
    expect(jsonClerk.data.every((t: any) => t.usage_count === 0)).toBe(true);

    adminSession();
    const resAdmin = await GET(new Request('http://localhost/api/service-types'), mockSession.value);
    const jsonAdmin = await resAdmin.json();
    const transporte = jsonAdmin.data.find((t: any) => t.id === '11111111-1111-4111-8111-111111111111');
    expect(transporte.usage_count).toBe(2);
  });
});

describe('POST /api/service-types', () => {
  it('SR-11: usuario sin rol global admin → 403 (aunque sea manager de tienda)', async () => {
    setupAdminMock();
    mockSession.value = {
      id: 'u-mgr', role: 'usuario', memberships: [{ store_id: 'store-1', role: 'manager', status: 'active' }],
    };
    const res = await POST(jsonReq({ name: 'Montaje' }), mockSession.value);
    expect(res.status).toBe(403);
  });

  it('SR-03: admin crea tipo — persiste con store_id null, code derivado y trim aplicado', async () => {
    const admin = setupAdminMock();
    adminSession();
    const res = await POST(jsonReq({ name: '  Montaje y Embalaje  ' }), mockSession.value);
    expect(res.status).toBe(201);
    const insert = admin.from('service_types').calls.find(c => c.op === 'insert');
    expect(insert.args[0]).toMatchObject({ store_id: null, name: 'Montaje y Embalaje', code: 'MONTA', is_active: true });
    const json = await res.json();
    expect(json.data.id).toBe('t-new');
  });

  it('SR-04: duplicado case/espacio-insensitive → 409 y NO inserta', async () => {
    const admin = setupAdminMock();
    adminSession();
    const res = await POST(jsonReq({ name: '  transporte' }), mockSession.value);
    expect(res.status).toBe(409);
    expect(admin.from('service_types').calls.find(c => c.op === 'insert')).toBeUndefined();
  });

  it('nombre solo espacios → 400', async () => {
    setupAdminMock();
    adminSession();
    const res = await POST(jsonReq({ name: '   ' }), mockSession.value);
    expect(res.status).toBe(400);
  });

  it('nombre con caracteres de control → 400', async () => {
    setupAdminMock();
    adminSession();
    const res = await POST(jsonReq({ name: 'Tipo\u0000Oculto' }), mockSession.value);
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/service-types', () => {
  it('SR-11: no-admin → 403', async () => {
    setupAdminMock();
    clerkSession();
    const res = await PATCH(jsonReq({ id: '11111111-1111-4111-8111-111111111111', is_active: false }, 'PATCH'), mockSession.value);
    expect(res.status).toBe(403);
  });

  it('SR-06: desactivación persiste is_active=false (sin borrado físico)', async () => {
    const admin = setupAdminMock();
    adminSession();
    const res = await PATCH(jsonReq({ id: '11111111-1111-4111-8111-111111111111', is_active: false }, 'PATCH'), mockSession.value);
    expect(res.status).toBe(200);
    const update = admin.from('service_types').calls.find(c => c.op === 'update');
    expect(update.args[0]).toEqual({ is_active: false });
  });

  it('SR-05: editar nombre preserva identidad (id inmutable, update filtrado por id)', async () => {
    const admin = setupAdminMock();
    adminSession();
    const res = await PATCH(jsonReq({ id: '11111111-1111-4111-8111-111111111111', name: 'Transporte Express' }, 'PATCH'), mockSession.value);
    expect(res.status).toBe(200);
    const update = admin.from('service_types').calls.find(c => c.op === 'update');
    expect(update.args[0]).toMatchObject({ name: 'Transporte Express' });
    expect(update.args[0].id).toBeUndefined(); // el id NUNCA viaja en el update
  });

  it('renombrar a duplicado → 409', async () => {
    setupAdminMock();
    adminSession();
    const res = await PATCH(jsonReq({ id: '11111111-1111-4111-8111-111111111111', name: ' OTROS ' }, 'PATCH'), mockSession.value);
    expect(res.status).toBe(409);
  });

  it('id inexistente → 404', async () => {
    const admin = setupAdminMock();
    adminSession();
    // Fuerza que la búsqueda del tipo no encuentre nada (single → { data: null })
    admin.from('service_types').handlers.length = 0;
    admin.from('service_types').on(
      (op, args) => op === 'select' && String(args[0]) === 'id, name, is_active',
      awaitable({ data: null, error: { message: 'PGRST116' } }),
    );
    const res = await PATCH(jsonReq({ id: '11111111-1111-4111-8111-999999999999', name: 'X' }, 'PATCH'), mockSession.value);
    expect(res.status).toBe(404);
  });
});
