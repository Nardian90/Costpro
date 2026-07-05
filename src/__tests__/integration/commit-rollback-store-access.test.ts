import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * IC-F04B-ROLLBACK-STORE-ACCESS — Test de autorización para el handler
 * PUT /api/inventory/costeo-dinamico/commit (rollback).
 *
 * El rollback recibe solo `commit_id` en el body (no `store_id`), por lo que
 * no puede usar `withStoreAccess` en el export (devolvería 400 antes de
 * llegar al handler). El handler resuelve `store_id` desde el commit_log y
 * luego verifica membresía con `canManageStore()`.
 *
 * Cobertura:
 * 1. clerk (sin rol admin/manager) → 403 desde el role gate (defense-in-depth).
 * 2. manager SIN membership en el store del commit → 403 desde canManageStore.
 * 3. manager CON membership en el store del commit → pasa canManageStore y
 *    procede al rollback (200).
 * 4. admin global sin membership → bypass canManageStore y procede (200).
 *
 * Patrón consistente con store-archive-restore-auth.test.ts (FIX-AUDIT-R5).
 */

// ── Mocks ──────────────────────────────────────────────────────────────

// Mock supabase-admin: factory configurable per-test via vi.mocked.
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: vi.fn(),
}));

// Mock auth-middleware: withAuth/withStoreAccess passthrough al handler.
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (handler: any) => handler,
  withStoreAccess: (handler: any) => handler,
}));

vi.mock('@/lib/observability', () => ({
  withTracing: (handler: any) => handler,
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Mock cache invalidator from parent route to avoid loading the whole
// costeo-dinamico GET handler (which imports the costeo engine, etc.).
vi.mock('@/app/api/inventory/costeo-dinamico/route', () => ({
  invalidateCacheForStore: vi.fn(),
}));

// Import AFTER mocks
import { PUT } from '@/app/api/inventory/costeo-dinamico/commit/route';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';

// ── Test Data ──────────────────────────────────────────────────────────

const STORE_A = '11111111-1111-1111-1111-111111111111';
const STORE_B = '22222222-2222-2222-2222-222222222222';
const COMMIT_ID = '33333333-3333-3333-3333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-4444-444444444444';

function makeSession(
  role: 'admin' | 'manager' | 'clerk',
  memberships: Array<{ store_id: string; role: string; status: string }> = []
) {
  return {
    user: {
      id: 'test-user-id-0001',
      email: 'test@costpro.test',
      role,
      memberships,
    },
    token: 'fake-jwt',
  } as any;
}

function makeRequest(body: Record<string, unknown> = {}) {
  return new NextRequest(
    'http://localhost:3000/api/inventory/costeo-dinamico/commit',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

/**
 * Build a fake supabase admin client. The rollback handler uses 3 call shapes:
 *   1. .from('price_commit_log').select('*').eq('id', commit_id).single()  → commitLog
 *   2. .from('products').update({...}).eq('id', product_id)               → awaited (no .single)
 *   3. .from('price_commit_log').update({...}).eq('id', commit_id)        → awaited (no .single)
 *
 * The builder's `.eq()` returns a Promise that ALSO exposes `.single()`, so
 * it works for both the SELECT-then-single and UPDATE-then-await patterns.
 */
function makeSupabaseFake(commitLog: any) {
  const singleResult = {
    data: commitLog,
    error: commitLog ? null : { message: 'not found' },
  };
  // eqResult is both a Promise (awaitable for UPDATE) and has .single() (for SELECT).
  const eqResult: any = Promise.resolve({ error: null });
  eqResult.single = vi.fn().mockResolvedValue(singleResult);

  const builder = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnValue(eqResult),
  };

  return {
    from: vi.fn().mockReturnValue(builder),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('IC-F04B-ROLLBACK-STORE-ACCESS: PUT /commit rollback authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clerk sin acceso → 403 (role gate: admin/manager only)', async () => {
    // Clerk is rejected at the role gate before any DB access, so supabase
    // can be null. This verifies the defense-in-depth role check.
    vi.mocked(getSupabaseAdminSafe).mockReturnValue(null as any);
    const session = makeSession('clerk', []);
    const req = makeRequest({ commit_id: COMMIT_ID });
    const res = await (PUT as any)(req, session);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Forbidden/i);
  });

  it('manager SIN membership en el store del commit → 403 (canManageStore)', async () => {
    // Manager has membership in STORE_A, but the commit belongs to STORE_B.
    // canManageStore() returns false → 403.
    const commitLog = {
      id: COMMIT_ID,
      store_id: STORE_B,
      rollback: false,
      changes: [{ product_id: PRODUCT_ID, old_price: 100 }],
    };
    vi.mocked(getSupabaseAdminSafe).mockReturnValue(
      makeSupabaseFake(commitLog) as any
    );
    const session = makeSession('manager', [
      { store_id: STORE_A, role: 'manager', status: 'active' },
    ]);
    const req = makeRequest({ commit_id: COMMIT_ID });
    const res = await (PUT as any)(req, session);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toMatch(/no tienes acceso al store del commit/i);
  });

  it('manager CON membership en el store del commit → pasa canManageStore y procede (200)', async () => {
    const commitLog = {
      id: COMMIT_ID,
      store_id: STORE_B,
      rollback: false,
      changes: [{ product_id: PRODUCT_ID, old_price: 100 }],
    };
    vi.mocked(getSupabaseAdminSafe).mockReturnValue(
      makeSupabaseFake(commitLog) as any
    );
    const session = makeSession('manager', [
      { store_id: STORE_B, role: 'manager', status: 'active' },
    ]);
    const req = makeRequest({ commit_id: COMMIT_ID });
    const res = await (PUT as any)(req, session);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.reverted).toBe(1);
  });

  it('admin global sin membership → bypass canManageStore y procede (200)', async () => {
    const commitLog = {
      id: COMMIT_ID,
      store_id: STORE_B,
      rollback: false,
      changes: [{ product_id: PRODUCT_ID, old_price: 100 }],
    };
    vi.mocked(getSupabaseAdminSafe).mockReturnValue(
      makeSupabaseFake(commitLog) as any
    );
    // Admin has no memberships, but canManageStore returns true for admin role.
    const session = makeSession('admin', []);
    const req = makeRequest({ commit_id: COMMIT_ID });
    const res = await (PUT as any)(req, session);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
