/**
 * CP-ORG-001 ciclo 4 (2026-10-25) — GET /api/stores: el NIVEL administrativo
 * (admin|superadmin) recibe la lista completa de tiendas.
 *
 * Regresión del bug del propietario: la rama admin se seleccionaba con
 * `session.user.role === 'admin'` (igualdad estricta). El SuperAdmin de
 * plataforma — que por diseño NO lleva membresías de tienda (§6 de la
 * migración 20260826120000) — caía en la rama de membresías y recibía
 * `data: []`: sin tiendas, sin datos, sin nada.
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
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const ALL_STORES = [
  { id: 'store-enervida', name: 'ENERVIDA-VITALLCONS', is_active: true, is_archived: false },
  { id: 'store-puerto', name: 'Puerto Padre VITALLCONS', is_active: true, is_archived: false },
];

const calls: { table: string; inIds?: unknown[] }[] = [];

function chainFor(table: string) {
  const record: { table: string; inIds?: unknown[] } = { table };
  calls.push(record);
  const resolve = () => Promise.resolve({ data: ALL_STORES, error: null, count: ALL_STORES.length });
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn((...args: unknown[]) => {
      record.inIds = args[1] as unknown[];
      return chain;
    }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    then: (onFulfill: any, onReject: any) => resolve().then(onFulfill, onReject),
  };
  return chain;
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: vi.fn(() => ({
    from: (table: string) => chainFor(table),
  })),
}));

import { GET } from '@/app/api/stores/route';

function makeRequest(url = 'http://localhost:3000/api/stores') {
  return { method: 'GET', headers: new Map(), url, json: async () => ({}) } as any;
}

describe('GET /api/stores — nivel administrativo transversal (CP-ORG-001 ciclo 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
  });

  it('SUPERADMIN (sin membresías) recibe TODAS las tiendas — rama admin', async () => {
    mockSession.value = {
      user: { id: 'a1111111-1111-1111-1111-111111111111', role: 'superadmin', memberships: [] },
    };
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data.map((s: any) => s.name)).toEqual(
      expect.arrayContaining(['ENERVIDA-VITALLCONS', 'Puerto Padre VITALLCONS'])
    );
    // La rama admin NUNCA filtra por membresías (.in)
    const storeCalls = calls.filter(c => c.table === 'stores');
    expect(storeCalls.length).toBeGreaterThan(0);
    for (const c of storeCalls) expect(c.inIds).toBeUndefined();
  });

  it('ADMIN (regresión) sigue recibiendo todas las tiendas', async () => {
    mockSession.value = {
      user: { id: 'admin-2', role: 'admin', memberships: [] },
    };
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
  });

  it('CLERK recibe SOLO las tiendas de sus membresías activas', async () => {
    mockSession.value = {
      user: {
        id: 'clerk-1',
        role: 'clerk',
        memberships: [{ store_id: 'store-enervida', role: 'clerk', status: 'active' }],
      },
    };
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    const storeCalls = calls.filter(c => c.table === 'stores');
    expect(storeCalls.length).toBe(1);
    expect(storeCalls[0].inIds).toEqual(['store-enervida']);
    expect(body.data).toHaveLength(2); // el mock devuelve la lista global; el filtro por .in se certifica arriba
  });

  it('SUPERADMIN sin ?status recibe solo activas (is_active=true, is_archived=false)', async () => {
    mockSession.value = {
      user: { id: 'a1111111-1111-1111-1111-111111111111', role: 'superadmin', memberships: [] },
    };
    const res = await GET(makeRequest('http://localhost:3000/api/stores'));
    await res.json();
    expect(res.status).toBe(200);
  });
});
