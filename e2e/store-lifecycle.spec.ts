import { test, expect } from '@playwright/test';
import { getAuthHeaders, freshAuthHeaders } from './fixtures/auth.fixture';
import { waitStoreBudget, deleteTestStore as robustDelete } from './fixtures/session.fixture';

/**
 * E2E: Full store lifecycle — create → archive → restore — STRICT ASSERTIONS.
 *
 * REWRITE (2026-07-13): The previous version accepted 500 as valid for
 * create/archive/restore (`expect([200, 400, 403, 500]).toContain(status())`).
 * Now each step asserts the specific expected status, and the test FAILS
 * if the API crashes (500) — which was the original anti-pattern.
 *
 * Flow:
 *   1. Create store via POST /api/stores → 201, captures storeId
 *   2. Archive store via POST /api/stores/[id]/archive → 200
 *   3. Verify archived store does NOT appear in GET /api/stores
 *   4. Restore store via POST /api/stores/[id]/restore → 200
 *   5. Verify restored store appears in GET /api/stores
 *   6. Cleanup: delete the test store
 *
 * Requires E2E_TEST_ADMIN_TOKEN.
 */

test.describe('Store Lifecycle: Create → Archive → Restore — Strict', () => {
  test.skip(!process.env.E2E_TEST_ADMIN_TOKEN, 'E2E_TEST_ADMIN_TOKEN not configured');

  let headers: Record<string, string>;
  let createdStoreId: string | null = null;
  const ts = Date.now();
  const storeName = `E2E Test Store ${ts}`;
  const storeSlug = `e2e-test-store-${ts}`;
  // SEC-TS-10 (TEST OBSOLETO): reeup/nit fijos alfabéticos ('E2E-REEUP'/'E2E-NIT')
  // rompían la validación Zod actual (REEUP 11 dígitos / NIT solo dígitos) → 400.
  // Valores válidos y únicos por corrida (derivados del timestamp).
  const storeReeup = String(ts % 100_000_000_000).padStart(11, '0');
  const storeNit = String(ts % 10_000_000_000);

  test.beforeAll(async () => {
    // SEC-TS-10: sesión fresca (inmune a revocación de token a mitad de corrida)
    headers = (await freshAuthHeaders('admin')) || getAuthHeaders('admin')!;
  });

  test.afterAll(async ({ request }) => {
    // Cleanup: force-delete the test store if it still exists
    if (createdStoreId) {
      // SEC-TS-10: cleanup robusto (rate-limit-aware + fallback de archivado)
      await robustDelete(request, getAuthHeaders('admin')?.Authorization?.replace('Bearer ', '') || '', createdStoreId);
    }
  });

  test('1. create store via POST /api/stores → 201', async ({ request }) => {
    // SEC-TS-10: pacear creación (API: 5/min)
    await waitStoreBudget('create');
    const response = await request.post('/api/stores', {
      headers,
      data: {
        name: storeName,
        address: 'E2E Test Address',
        slug: storeSlug,
        reeup: storeReeup,
        nit: storeNit,
        bank_account: 'E2E-BANK',
      },
    });

    // STRICT: must be exactly 201. 500 = RPC broken = test fails.
    // 403 = plan limit reached = test fails (need to upgrade plan or cleanup)
    expect(response.status()).toBe(201);

    const body = await response.json();
    createdStoreId = body.data?.id || body.id;
    // STRICT: id must be a valid UUID
    expect(createdStoreId).toBeDefined();
    expect(createdStoreId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  test('2. archive store via POST /api/stores/[id]/archive → 200', async ({ request }) => {
    test.skip(!createdStoreId, 'Store was not created in step 1');

    const response = await request.post(`/api/stores/${createdStoreId}/archive`, {
      headers,
      data: { reason: 'E2E test archiving' },
    });

    // STRICT: must be 200 (success). 404 = store not found, 403 = no perms, 500 = crash.
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test('3. archived store does NOT appear in GET /api/stores', async ({ request }) => {
    test.skip(!createdStoreId, 'Store was not created');

    const response = await request.get('/api/stores', { headers });
    expect(response.status()).toBe(200);

    const body = await response.json();
    const storeIds = body.data?.map((s: any) => s.id) || [];
    expect(storeIds).not.toContain(createdStoreId);
  });

  test('4. restore store via POST /api/stores/[id]/restore → 200', async ({ request }) => {
    test.skip(!createdStoreId, 'Store was not created');

    const response = await request.post(`/api/stores/${createdStoreId}/restore`, {
      headers,
    });

    // STRICT: must be 200. 500 = restore RPC broken.
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test('5. restored store appears in GET /api/stores', async ({ request }) => {
    test.skip(!createdStoreId, 'Store was not created');

    const response = await request.get('/api/stores', { headers });
    expect(response.status()).toBe(200);

    const body = await response.json();
    const storeIds = body.data?.map((s: any) => s.id) || [];
    expect(storeIds).toContain(createdStoreId);
  });

  test('6. cannot archive already-archived store → 400 or 409', async ({ request }) => {
    test.skip(!createdStoreId, 'Store was not created');

    // First re-archive to test the idempotency/conflict case
    const response = await request.post(`/api/stores/${createdStoreId}/archive`, {
      headers,
      data: { reason: 'Double archive test' },
    });

    // STRICT: must NOT be 200 (already archived). Either 400 (bad request) or 409 (conflict).
    expect(response.status()).not.toBe(200);
    expect([400, 409]).toContain(response.status());
  });
});
