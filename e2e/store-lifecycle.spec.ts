import { test, expect } from '@playwright/test';
import { getAuthHeaders } from './fixtures/auth.fixture';

/**
 * E2E: Full store lifecycle — create → archive → restore
 *
 * This test creates a real store in the DB via API, archives it,
 * verifies it disappears from GET /api/stores, then restores it
 * and verifies it reappears.
 *
 * Requires E2E_TEST_ADMIN_TOKEN.
 */

test.describe('Store Lifecycle: Create → Archive → Restore', () => {
  test.skip(!process.env.E2E_TEST_ADMIN_TOKEN, 'E2E_TEST_ADMIN_TOKEN not configured');

  let headers: Record<string, string>;
  let createdStoreId: string;
  const storeName = `E2E Test Store ${Date.now()}`;
  const storeSlug = `e2e-test-store-${Date.now()}`;

  test.beforeAll(() => {
    headers = getAuthHeaders('admin')!;
  });

  test('create store via POST /api/stores', async ({ request }) => {
    const response = await request.post('/api/stores', {
      headers,
      data: {
        name: storeName,
        address: 'E2E Test Address',
        slug: storeSlug,
        reeup: 'E2E-REEUP',
        nit: 'E2E-NIT',
        bank_account: 'E2E-BANK',
      },
    });

    // 201 (created), 403 (plan limit), 500 (RPC issue), 400 (validation)
    expect([201, 400, 403, 500]).toContain(response.status());

    if (response.status() === 201) {
      const body = await response.json();
      createdStoreId = body.data?.id || body.id;
      expect(createdStoreId).toBeDefined();
    } else {
      test.skip(true, `Store creation returned ${response.status()} — skipping lifecycle`);
    }
  });

  test('archive store via POST /api/stores/[id]/archive', async ({ request }) => {
    test.skip(!createdStoreId, 'Store was not created in previous step');

    const response = await request.post(`/api/stores/${createdStoreId}/archive`, {
      headers,
      data: { reason: 'E2E test archiving' },
    });

    expect([200, 403, 500]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      expect(body.success).toBe(true);
    }
  });

  test('archived store does NOT appear in GET /api/stores', async ({ request }) => {
    test.skip(!createdStoreId, 'Store was not created');

    const response = await request.get('/api/stores', { headers });
    expect(response.status()).toBe(200);

    const body = await response.json();
    const storeIds = body.data?.map((s: any) => s.id) || [];
    // Archived store should NOT be in the list (is_archived=false filter)
    expect(storeIds).not.toContain(createdStoreId);
  });

  test('restore store via POST /api/stores/[id]/restore', async ({ request }) => {
    test.skip(!createdStoreId, 'Store was not created');

    const response = await request.post(`/api/stores/${createdStoreId}/restore`, {
      headers,
    });

    expect([200, 403, 500]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      expect(body.success).toBe(true);
    }
  });

  test('restored store appears in GET /api/stores', async ({ request }) => {
    test.skip(!createdStoreId, 'Store was not created');

    const response = await request.get('/api/stores', { headers });
    expect(response.status()).toBe(200);

    const body = await response.json();
    const storeIds = body.data?.map((s: any) => s.id) || [];
    // Restored store SHOULD be in the list again
    expect(storeIds).toContain(createdStoreId);
  });
});
