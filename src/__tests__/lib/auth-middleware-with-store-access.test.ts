/**
 * MISIÓN INVENTARIO FÍSICO / SUPERADMIN (2026-10-26) — Regresión de
 * withStoreAccess (src/lib/auth-middleware.ts).
 *
 * Defecto demostrado en vivo (2026-10-26, admin@demo.com contra
 * wthkddeleylijmonclxg): el bypass de membresía solo reconocía
 * `userRole === 'admin'`. El SuperAdmin de plataforma (profiles.role =
 * 'superadmin', SIN membresías por diseño — §6 migración 20260826120000)
 * caía al chequeo de membresías y recibía 403 «No tienes acceso a esta
 * tienda» en TODAS las rutas con withStoreAccess (p. ej. GET/POST
 * /api/physical-inventory), aunque la RLS de physical_inventories
 * (is_admin() OR has_store_access) SÍ lo autoriza.
 *
 * Regla corregida (doctrina CP-ORG-001 §16/§17 + migración 20261026160000):
 *   - superadmin: rol de PLATAFORMA, transversal a tiendas y tenants (la RLS
 *     stores_tenant_select lleva bypass is_superadmin() incluso con
 *     USE_TENANT_RLS=true).
 *   - admin ordinario: bypass legacy (flag off); con USE_TENANT_RLS=true
 *     SOLO tiendas de su propio tenant (límite conservado ÍNTEGRO).
 *   - roles operativos: membresía activa obligatoria (fail-closed).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ── Mocks ───────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  sessionHolder: { current: null as any },
  handler: vi.fn(async () => new Response('ok', { status: 200 })),
  adminClient: null as any,
}));

vi.mock('@/lib/auth', () => ({
  getServerSession: async () => h.sessionHolder.current,
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => h.adminClient,
  getSupabaseAdminClient: async () => h.adminClient,
}));

vi.mock('@/lib/usage-tracker', () => ({
  usage: { apiRequest: vi.fn() },
  maybeFlush: vi.fn(),
}));

vi.mock('@vercel/functions', () => ({
  waitUntil: vi.fn(),
}));

// Cliente admin mockeado — responde por tabla (patrón stores-route-superadmin)

function makeAdminClient(opts: {
  role?: string | null;
  memberships?: Array<{ store_id: string; role: string; status: string }>;
  storeTenantId?: string | null;
  profileTenantId?: string | null;
}) {
  const calls: Record<string, any[]> = {};
  const client: any = {
    __calls: calls,
    from(table: string) {
      const record: any = { table };
      ;(calls[table] = calls[table] || []).push(record);
      const resolveWith = (data: unknown) =>
        Promise.resolve({ data, error: null }) as any;
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn(() => {
          if (table === 'profiles') {
            return resolveWith(
              opts.role !== undefined ? { role: opts.role, tenant_id: opts.profileTenantId ?? null } : null
            );
          }
          if (table === 'user_store_memberships') return resolveWith(opts.memberships || []);
          if (table === 'stores') return resolveWith({ tenant_id: opts.storeTenantId ?? null });
          return resolveWith(null);
        }),
        maybeSingle: vi.fn(() => resolveWith(null)),
        then: (onFulfill: any, onReject: any) =>
          resolveWith(table === 'user_store_memberships' ? opts.memberships || [] : null).then(onFulfill, onReject),
      };
      return chain;
    },
  };
  return client;
}

import { withStoreAccess } from '@/lib/auth-middleware';

const STORE_A = '11111111-1111-4111-8111-111111111111';
const STORE_B = '22222222-2222-4222-8222-222222222222';

function makeReq(method: 'GET' | 'POST' = 'GET', storeId: string = STORE_A): NextRequest {
  const url = `http://localhost:3000/api/physical-inventory${method === 'GET' ? `?storeId=${storeId}` : ''}`;
  return {
    method,
    url,
    nextUrl: new URL(url),
    headers: new Headers(),
    clone: () => ({
      json: async () => ({ storeId, store_id: storeId }),
    }),
  } as unknown as NextRequest;
}

async function run(storeId = STORE_A, method: 'GET' | 'POST' = 'GET') {
  const wrapped = withStoreAccess(h.handler);
  const res = await wrapped(makeReq(method, storeId));
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('withStoreAccess — nivel administrativo y aislamiento (MISIÓN PI-SUPERADMIN)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.USE_TENANT_RLS;
  });

  it('SUPERADMIN sin membresías accede (regresión del 403 en /api/physical-inventory)', async () => {
    h.sessionHolder.current = {
      user: { id: 'a1111111-1111-1111-1111-111111111111', role: 'superadmin', memberships: [] },
      token: 'tok',
    };
    h.adminClient = makeAdminClient({ role: 'superadmin', memberships: [] });
    const { status } = await run();
    expect(status).toBe(200);
    expect(h.handler).toHaveBeenCalledTimes(1);
    // La sesión enriquecida conserva el rol real del servidor
    const session = (h.handler.mock.calls[0] as any[])[1];
    expect(session.user.role).toBe('superadmin');
  });

  it('ADMIN sin membresías accede en modo legacy (regresión — bypass existente)', async () => {
    h.sessionHolder.current = {
      user: { id: 'admin-2', role: 'admin', memberships: [] },
      token: 'tok',
    };
    h.adminClient = makeAdminClient({ role: 'admin', memberships: [] });
    const { status } = await run();
    expect(status).toBe(200);
    expect(h.handler).toHaveBeenCalledTimes(1);
  });

  it('ADMIN con USE_TENANT_RLS=true y tienda de OTRO tenant → 403 (límite conservado)', async () => {
    process.env.USE_TENANT_RLS = 'true';
    h.sessionHolder.current = {
      user: { id: 'admin-2', role: 'admin', memberships: [] },
      token: 'tok',
    };
    h.adminClient = makeAdminClient({
      role: 'admin',
      memberships: [],
      storeTenantId: 'tenant-ajeno',
      profileTenantId: 'tenant-propio',
    });
    const { status, body } = await run();
    expect(status).toBe(403);
    expect(body.error).toBe('Prohibido');
    expect(h.handler).not.toHaveBeenCalled();
  });

  it('ADMIN con USE_TENANT_RLS=true y tienda de SU tenant → acceso', async () => {
    process.env.USE_TENANT_RLS = 'true';
    h.sessionHolder.current = {
      user: { id: 'admin-2', role: 'admin', memberships: [] },
      token: 'tok',
    };
    h.adminClient = makeAdminClient({
      role: 'admin',
      memberships: [],
      storeTenantId: 'tenant-propio',
      profileTenantId: 'tenant-propio',
    });
    const { status } = await run();
    expect(status).toBe(200);
  });

  it('SUPERADMIN con USE_TENANT_RLS=true y tienda de otro tenant → acceso (plataforma transversal, espejo de la RLS 20261026160000)', async () => {
    process.env.USE_TENANT_RLS = 'true';
    h.sessionHolder.current = {
      user: { id: 'a1111111-1111-1111-1111-111111111111', role: 'superadmin', memberships: [] },
      token: 'tok',
    };
    h.adminClient = makeAdminClient({
      role: 'superadmin',
      memberships: [],
      storeTenantId: 'tenant-ajeno',
      profileTenantId: 'tenant-propio',
    });
    const { status } = await run();
    expect(status).toBe(200);
    expect(h.handler).toHaveBeenCalledTimes(1);
  });

  it('CLERK con membresía activa en la tienda → acceso (membresía sigue siendo la vía operativa)', async () => {
    h.sessionHolder.current = {
      user: { id: 'clerk-1', role: 'clerk', memberships: [] },
      token: 'tok',
    };
    h.adminClient = makeAdminClient({
      role: 'clerk',
      memberships: [{ store_id: STORE_A, role: 'clerk', status: 'active' }],
    });
    const { status } = await run();
    expect(status).toBe(200);
    expect(h.handler).toHaveBeenCalledTimes(1);
  });

  it('CLERK sin membresía en la tienda → 403 (aislamiento multitienda intacto)', async () => {
    h.sessionHolder.current = {
      user: { id: 'clerk-1', role: 'clerk', memberships: [] },
      token: 'tok',
    };
    h.adminClient = makeAdminClient({
      role: 'clerk',
      memberships: [{ store_id: STORE_B, role: 'clerk', status: 'active' }],
    });
    const { status } = await run(STORE_A);
    expect(status).toBe(403);
    expect(h.handler).not.toHaveBeenCalled();
  });

  it('Rol desconocido/ilegible sin membresías → 403 (fail-closed)', async () => {
    h.sessionHolder.current = {
      user: { id: 'user-x', role: 'usuario', memberships: [] },
      token: 'tok',
    };
    h.adminClient = makeAdminClient({ role: undefined, memberships: [] });
    const { status } = await run();
    expect(status).toBe(403);
    expect(h.handler).not.toHaveBeenCalled();
  });

  it('POST también respeta el nivel administrativo (mismo wrapper para mutaciones)', async () => {
    h.sessionHolder.current = {
      user: { id: 'a1111111-1111-1111-1111-111111111111', role: 'superadmin', memberships: [] },
      token: 'tok',
    };
    h.adminClient = makeAdminClient({ role: 'superadmin', memberships: [] });
    const { status } = await run(STORE_A, 'POST');
    expect(status).toBe(200);
    expect(h.handler).toHaveBeenCalledTimes(1);
  });
});
