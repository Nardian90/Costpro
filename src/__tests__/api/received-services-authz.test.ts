import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST, PATCH } from '@/app/api/received-services/route';

/**
 * F3-P0-02 — received-services legacy: gate de autorización por tienda.
 *
 * Regla verificada: el store_id del cliente NO es autorización. La lectura
 * exige canViewStore (membership activa) y la creación/edición exigen
 * canManageStore (membership activa con rol de gestión), tal como definen
 * src/lib/roles.ts. La lógica real de roles.ts NO se mockea a propósito:
 * las aserciones comprueban la semántica completa del modelo.
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
vi.mock('@/lib/api-errors', () => ({
  createApiError: (code: string, msg?: string) => ({ error: code, message: msg }),
}));

const probes = {
  touchedTables: [] as string[],
  countHeadUsed: false,
  insertedAuditRows: [] as Array<{ table: string; row: any }>,
};

let resolvedServiceRow: { data: any; error: any };

const CREATED_SERVICE = { id: 'srv-new-1', store_id: 'A', service_number: 'SRV-0001' };

function awaitable(finalValue: unknown) {
  const obj: any = {};
  obj.select = () => obj;
  obj.eq = () => obj;
  obj.order = () => obj;
  obj.single = async () => ({ data: null, error: null });
  obj.delete = () => obj;
  obj.update = () => obj;
  obj.insert = () => obj;
  obj.then = (res?: any, rej?: any) =>
    Promise.resolve(finalValue).then(res, rej);
  return obj;
}

function makeAdminMock() {
  return {
    from: (table: string) => {
      if (!probes.touchedTables.includes(table)) probes.touchedTables.push(table);

      if (table !== 'received_services') {
        // tablas auxiliares: registro auditorías y respuestas vacías OK
        return {
          insert: async (row: any) => {
            probes.insertedAuditRows.push({ table, row });
            return { error: null };
          },
          delete: () => ({ eq: async () => ({ error: null }) }),
        };
      }

      // tabla received_services — comportamiento según llamada en curso
      const chain: any = {};
      let mode: 'plain' | 'resolve' | 'created' | 'updated' = 'plain';

      chain.select = (...sArgs: any[]) => {
        const first = sArgs[0];
        if (typeof first === 'string' && first.includes('id,store_id')) mode = 'resolve';
        else if (first === '*') {
          const opts = sArgs[1];
          if (opts && opts.count === 'exact' && opts.head === true) {
            probes.countHeadUsed = true;
            mode = 'plain';
            chain['__countResult'] = { data: [], error: null, count: 12 };
          }
        }
        return chain;
      };
      chain.eq = () => chain;
      chain.order = () => chain;

      chain.single = async () => {
        if (mode === 'resolve') return { data: resolvedServiceRow.data, error: resolvedServiceRow.error };
        if (mode === 'created') return { data: CREATED_SERVICE, error: null };
        return { data: null, error: null };
      };

      chain.insert = (_row: any) => { mode = 'created'; return chain; };

      chain.update = () => { mode = 'updated'; return chain; };

      chain.then = (res?: any, rej?: any) => {
        const base =
          mode === 'plain' && chain['__countResult']
            ? chain['__countResult']
            : { data: [], error: null, count: 0 };
        return Promise.resolve(base).then(res, rej);
      };

      return chain;
    },
    rpc: vi.fn(),
  };
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => makeAdminMock()),
}));

function makeRequest(method: string, opts: { url?: string; body?: unknown }): any {
  return {
    method,
    headers: new Map(),
    json: async () => opts.body,
    url: opts.url || `http://localhost:3000/api/received-services`,
  } as any;
}

const STORE_A = 'a1111111-1111-4111-8111-111111111111';
const STORE_B = 'b2222222-2222-4222-8222-222222222222';

function sessionWith(role: string, memberships: Array<{ store_id: string; role: string; status: string }>) {
  return { id: 'actor-1', role, memberships } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.value = sessionWith('clerk', []);
  probes.touchedTables = [];
  probes.countHeadUsed = false;
  probes.insertedAuditRows = [];
  resolvedServiceRow = { data: undefined, error: null };
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  process.env.USE_V2_RECEIVED_SERVICES = 'false';
});

describe('GET /api/received-services · FIX F3-P0-02', () => {
  it('usuario sin membership en la tienda → 403 y sin consulta', async () => {
    mockSession.value = sessionWith('clerk', [{ store_id: STORE_A, role: 'clerk', status: 'active' }]);
    const res = await GET(makeRequest('GET', { url: `http://localhost:3000/api/received-services?store_id=${STORE_B}` }));
    expect(res.status).toBe(403);
    expect(probes.touchedTables).not.toContain('received_services');
  });

  it('membership activa (clerk) en la tienda propia → lectura permitida', async () => {
    mockSession.value = sessionWith('clerk', [{ store_id: STORE_A, role: 'clerk', status: 'active' }]);
    const res = await GET(makeRequest('GET', { url: `http://localhost:3000/api/received-services?store_id=${STORE_A}` }));
    expect(res.status).toBe(200);
  });

  it('membership revoked NO autoriza lectura', async () => {
    mockSession.value = sessionWith('clerk', [{ store_id: STORE_A, role: 'clerk', status: 'revoked' }]);
    const res = await GET(makeRequest('GET', { url: `http://localhost:3000/api/received-services?store_id=${STORE_A}` }));
    expect(res.status).toBe(403);
  });

  it('admin global puede leer cualquier tienda (roles.ts by design)', async () => {
    mockSession.value = sessionWith('admin', []);
    const res = await GET(makeRequest('GET', { url: `http://localhost:3000/api/received-services?store_id=${STORE_B}` }));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/received-services · FIX F3-P0-02', () => {
  it('encargado cross-store (tienda ajena) → 403, sin tocar BD', async () => {
    mockSession.value = sessionWith('clerk', [{ store_id: STORE_A, role: 'encargado', status: 'active' }]);
    const res = await POST(
      makeRequest('POST', { body: { store_id: STORE_B, total_amount: 100 } })
    );
    expect(res.status).toBe(403);
    expect(probes.touchedTables).not.toContain('received_services');
  });

  it('clerk incluso en tienda PROPIA no crea servicios (se requiere rol de gestión)', async () => {
    mockSession.value = sessionWith('clerk', [{ store_id: STORE_A, role: 'clerk', status: 'active' }]);
    const res = await POST(
      makeRequest('POST', { body: { store_id: STORE_A, total_amount: 100 } })
    );
    expect(res.status).toBe(403);
  });

  it('encargado con membership activa crea servicio en su tienda → 201 + auditoría', async () => {
    mockSession.value = sessionWith('encargado', [
      { store_id: STORE_A, role: 'encargado', status: 'active' },
    ]);
    const res = await POST(
      makeRequest('POST', {
        body: { store_id: STORE_A, total_amount: 1500, supplier: 'Prov X' },
      })
    );
    expect(res.status).toBe(201);
    expect(probes.countHeadUsed).toBe(true);
    expect(probes.insertedAuditRows.some(r => r.table === 'service_audit_log')).toBe(true);
  });
});

describe('PATCH /api/received-services · FIX F3-P0-02', () => {
  it('resuelve service→store server-side y deniega edición cross-store', async () => {
    resolvedServiceRow = { data: { id: 'srv-1', store_id: STORE_B }, error: null };
    mockSession.value = sessionWith('encargado', [
      { store_id: STORE_A, role: 'encargado', status: 'active' },
    ]);
    const res = await PATCH(
      makeRequest('PATCH', { body: { service_id: 'srv-1', action: 'void' } })
    );
    expect(res.status).toBe(403);
  });

  it('servicio inexistente → 404', async () => {
    resolvedServiceRow = { data: null, error: { message: 'not found' } };
    mockSession.value = sessionWith('admin', []);
    const res = await PATCH(
      makeRequest('PATCH', { body: { service_id: 'nope', action: 'void' } })
    );
    expect(res.status).toBe(404);
  });

  it('manager autorizado en la tienda del servicio procede (void legacy)', async () => {
    resolvedServiceRow = { data: { id: 'srv-1', store_id: STORE_A }, error: null };
    mockSession.value = sessionWith('manager', [
      { store_id: STORE_A, role: 'manager', status: 'active' },
    ]);
    const res = await PATCH(
      makeRequest('PATCH', { body: { service_id: 'srv-1', action: 'void' } })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(probes.insertedAuditRows.some(r => r.table === 'service_audit_log' && r.row?.action === 'voided')).toBe(true);
  });
});
