import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/store-rates/route';

/**
 * SEC-TS-02 · H2 — /api/store-rates
 *
 * Antes: session OK (401 anónimo) PERO el storeId del body se escribía vía
 * service-role SIN comprobar membresía → cualquier usuario autenticado
 * sobrescribía las tasas de cambio de CUALQUIER tienda (cross-store write;
 * RLS no aplica al cliente service-role).
 *
 * Después (boundary verificado con el withAuth REAL y canManageStore REAL
 * — solo se mockea el cliente de DB):
 *   request → sesión (401) → Zod storeRatesSchema (400) →
 *   canManageStore(user, storeId del body) (403 cross-store) →
 *   SOLO ENTONCES upsert service-role en store_exchange_rates.
 *
 * Boundary multi-tienda exigido:
 *   A → A (manager de A)  = permitido
 *   A → B (manager de A)  = 403 y CERO acceso service-role a la tabla
 *   admin global → B      = permitido (rol transversal por diseño, ver roles.ts)
 */

const STORE_A = 'a1111111-1111-4111-8111-111111111111';
const STORE_B = 'b2222222-2222-4222-8222-222222222222';
const USER_X = '9a111111-1111-4111-8111-999999999999';

const sessionState = { value: null as any };

vi.mock('@/lib/auth', () => ({
  getServerSession: async () => sessionState.value,
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/usage-tracker', () => ({
  usage: { apiRequest: vi.fn() },
  maybeFlush: vi.fn(),
}));
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }));
vi.mock('@/lib/rls-middleware', () => ({ activateTenantRLS: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Estado del "DB" — lo que devolvería Supabase para cada tabla.
const db = {
  profile: { role: 'clerk', roles: ['clerk'] } as any,
  memberships: [] as any[],
  existingRates: [] as Array<{ currency: string; rate: string; updated_at: string }>,
};

// Probes: evidencia del boundary — qué tablas toca el service-role y con qué args.
const probes = {
  upserts: [] as Array<{ table: string; rows: any[] }>,
  selects: [] as string[],
};

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => ({
    from: (table: string) => {
      const chain: any = {
        select: (cols?: string) => {
          if (table === 'store_exchange_rates') probes.selects.push(table);
          return chain;
        },
        eq: () => chain,
        single: async () => {
          if (table === 'profiles') return { data: db.profile, error: null };
          return { data: null, error: { message: 'unexpected single on ' + table } };
        },
        upsert: (rows: any[], opts: any) => {
          probes.upserts.push({ table, rows });
          return Promise.resolve({ error: null });
        },
      };
      chain.then = (res?: any, rej?: any) =>
        Promise.resolve(
          table === 'user_store_memberships'
            ? { data: db.memberships, error: null }
            : table === 'store_exchange_rates'
              ? { data: db.existingRates, error: null }
              : { data: [], error: null }
        ).then(res, rej);
      return chain;
    },
  }),
}));

function managerOf(storeId: string, role = 'manager') {
  db.profile = { role: 'clerk', roles: ['clerk'] };
  db.memberships = [{ user_id: USER_X, store_id: storeId, role, status: 'active' }];
}

function makePost(body: unknown): any {
  return {
    method: 'POST',
    url: 'http://localhost:3000/api/store-rates',
    headers: new Map(),
    json: async () => body,
  };
}

function makeGet(storeId: string | null): any {
  const url = storeId
    ? `http://localhost:3000/api/store-rates?storeId=${storeId}`
    : 'http://localhost:3000/api/store-rates';
  return {
    method: 'GET',
    url,
    headers: new Map(),
    nextUrl: { searchParams: new URLSearchParams(storeId ? { storeId } : {}) },
    json: async () => ({}),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionState.value = null;
  probes.upserts = [];
  probes.selects = [];
  db.profile = { role: 'clerk', roles: ['clerk'] };
  db.memberships = [];
  db.existingRates = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
});

describe('SEC-TS-02 H2 · POST /api/store-rates (cross-store write)', () => {
  it('anonymous → 401 y CERO acceso service-role a store_exchange_rates', async () => {
    sessionState.value = null;
    const res = await POST(makePost({ storeId: STORE_A, rates: { USD: 680 } }));
    expect(res.status).toBe(401);
    expect(probes.upserts).toHaveLength(0);
  });

  it('A → A: manager de la tienda A escribe tasas de A (contrato preservado)', async () => {
    sessionState.value = { user: { id: USER_X, email: 'x@t.co' }, token: 'tok' };
    managerOf(STORE_A);
    const res = await POST(makePost({ storeId: STORE_A, rates: { USD: 680, EUR: 720, MLC: 600 } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    // un solo upsert con las 3 monedas de la tienda A
    expect(probes.upserts).toHaveLength(1);
    expect(probes.upserts[0].table).toBe('store_exchange_rates');
    expect(probes.upserts[0].rows).toHaveLength(3);
    expect(probes.upserts[0].rows[0]).toMatchObject({ store_id: STORE_A, currency: 'USD', rate: 680 });
  });

  it('A → B (BOUNDARY OBLIGATORIO): manager de A NO puede escribir tasas de B — 403 y CERO upsert service-role', async () => {
    sessionState.value = { user: { id: USER_X, email: 'x@t.co' }, token: 'tok' };
    managerOf(STORE_A);
    const res = await POST(makePost({ storeId: STORE_B, rates: { USD: 999 } }));
    expect(res.status).toBe(403);
    // Evidencia del boundary: la operación privilegiada NUNCA se ejecutó
    expect(probes.upserts).toHaveLength(0);
    expect(probes.selects).not.toContain('store_exchange_rates');
  });

  it('usuario autenticado SIN membresía de gestión (clerk de A) → 403 en A', async () => {
    sessionState.value = { user: { id: USER_X, email: 'x@t.co' }, token: 'tok' };
    managerOf(STORE_A, 'clerk');
    const res = await POST(makePost({ storeId: STORE_A, rates: { USD: 680 } }));
    expect(res.status).toBe(403);
    expect(probes.upserts).toHaveLength(0);
  });

  it('admin global → puede gestionar cualquier tienda (rol transversal por diseño, roles.ts)', async () => {
    sessionState.value = { user: { id: USER_X, email: 'x@t.co' }, token: 'tok' };
    db.profile = { role: 'admin', roles: ['admin'] };
    db.memberships = [];
    const res = await POST(makePost({ storeId: STORE_B, rates: { USD: 680 } }));
    expect(res.status).toBe(200);
    expect(probes.upserts).toHaveLength(1);
    expect(probes.upserts[0].rows[0]).toMatchObject({ store_id: STORE_B });
  });

  it('storeId con formato no-UUID → 400 (Zod) sin upsert', async () => {
    sessionState.value = { user: { id: USER_X, email: 'x@t.co' }, token: 'tok' };
    managerOf(STORE_A);
    const res = await POST(makePost({ storeId: 'not-a-uuid', rates: { USD: 680 } }));
    expect(res.status).toBe(400);
    expect(probes.upserts).toHaveLength(0);
  });

  it('tasa inválida (negativa) → 400 sin upsert', async () => {
    sessionState.value = { user: { id: USER_X, email: 'x@t.co' }, token: 'tok' };
    managerOf(STORE_A);
    const res = await POST(makePost({ storeId: STORE_A, rates: { USD: -5 } }));
    expect(res.status).toBe(400);
    expect(probes.upserts).toHaveLength(0);
  });

  it('tasa inválida (string en lugar de number) → 400 sin upsert', async () => {
    sessionState.value = { user: { id: USER_X, email: 'x@t.co' }, token: 'tok' };
    managerOf(STORE_A);
    const res = await POST(makePost({ storeId: STORE_A, rates: { USD: '680' } }));
    expect(res.status).toBe(400);
    expect(probes.upserts).toHaveLength(0);
  });

  it('moneda inválida (minúsculas / no alfabética) → 400 sin upsert', async () => {
    sessionState.value = { user: { id: USER_X, email: 'x@t.co' }, token: 'tok' };
    managerOf(STORE_A);
    const res1 = await POST(makePost({ storeId: STORE_A, rates: { usd: 680 } }));
    expect(res1.status).toBe(400);
    const res2 = await POST(makePost({ storeId: STORE_A, rates: { 'USD;DROP': 680 } }));
    expect(res2.status).toBe(400);
    expect(probes.upserts).toHaveLength(0);
  });

  it('rates vacío → 400 (refine: al menos una tasa)', async () => {
    sessionState.value = { user: { id: USER_X, email: 'x@t.co' }, token: 'tok' };
    managerOf(STORE_A);
    const res = await POST(makePost({ storeId: STORE_A, rates: {} }));
    expect(res.status).toBe(400);
  });

  it('actor de auditoría: updated_by SIEMPRE es session.user.id (no viene del body)', async () => {
    sessionState.value = { user: { id: USER_X, email: 'x@t.co' }, token: 'tok' };
    managerOf(STORE_A);
    const res = await POST(
      makePost({ storeId: STORE_A, rates: { USD: 680 }, updated_by: 'forged-actor', user_id: 'forged-actor' })
    );
    expect(res.status).toBe(200);
    expect(probes.upserts[0].rows.every(r => r.updated_by === USER_X)).toBe(true);
  });

  it('JSON inválido → 400', async () => {
    sessionState.value = { user: { id: USER_X, email: 'x@t.co' }, token: 'tok' };
    const req = {
      method: 'POST',
      url: 'http://localhost:3000/api/store-rates',
      headers: new Map(),
      json: async () => {
        throw new Error('bad json');
      },
    };
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });
});

describe('SEC-TS-02 H2 · GET /api/store-rates (cross-store read)', () => {
  it('anonymous → 401', async () => {
    sessionState.value = null;
    const res = await GET(makeGet(STORE_A));
    expect(res.status).toBe(401);
  });

  it('miembro de A lee tasas de A (contrato del POS/modal preservado)', async () => {
    sessionState.value = { user: { id: USER_X, email: 'x@t.co' }, token: 'tok' };
    managerOf(STORE_A, 'clerk');
    db.existingRates = [
      { currency: 'USD', rate: '680.0000', updated_at: '2026-01-01T00:00:00Z' },
      { currency: 'EUR', rate: '720.0000', updated_at: '2026-01-01T00:00:00Z' },
    ];
    const res = await GET(makeGet(STORE_A));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rates).toEqual({ USD: 680, EUR: 720 });
  });

  it('A → B en lectura: usuario de A NO lee tasas de B — 403 y CERO select service-role', async () => {
    sessionState.value = { user: { id: USER_X, email: 'x@t.co' }, token: 'tok' };
    managerOf(STORE_A, 'clerk');
    const res = await GET(makeGet(STORE_B));
    expect(res.status).toBe(403);
    expect(probes.selects).not.toContain('store_exchange_rates');
  });

  it('storeId ausente → 400', async () => {
    sessionState.value = { user: { id: USER_X, email: 'x@t.co' }, token: 'tok' };
    managerOf(STORE_A, 'clerk');
    const res = await GET(makeGet(null));
    expect(res.status).toBe(400);
  });
});
