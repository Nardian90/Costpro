import { test, expect } from '@playwright/test';
import { getAuthHeaders } from './fixtures/auth.fixture';
import { makeAdjustPayload } from './fixtures/inventory.fixture';

test.describe('Inventory', () => {
  test('rejects adjustment without session → 401', async ({ request }) => {
    const response = await request.post('/api/inventory/adjust', {
      data: makeAdjustPayload()
    });
    expect(response.status()).toBe(401);
  });

  test('rejects invalid payload → 400', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }

    const response = await request.post('/api/inventory/adjust', {
      headers,
      data: { productId: 'not-a-uuid', quantity: 'text', movementType: 'invalid' }
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('rejects quantity out of range → 400', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }

    const response = await request.post('/api/inventory/adjust', {
      headers,
      data: makeAdjustPayload({ quantity: 999999 })
    });
    expect(response.status()).toBe(400);
  });

  test('rejects version <= 0 → 400', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }

    const response = await request.post('/api/inventory/adjust', {
      headers,
      data: makeAdjustPayload({ version: -1 })
    });
    expect(response.status()).toBe(400);
  });

  test('accepts valid adjustment with auth → 200, 404 or 409', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }

    const response = await request.post('/api/inventory/adjust', {
      headers,
      data: makeAdjustPayload()
    });

    expect([200, 404, 409]).toContain(response.status());
    expect(response.status()).not.toBe(401);
    expect(response.status()).not.toBe(500);
  });

  test('rate limit: multiple requests with same token → 429 eventually', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }

    const statuses: number[] = [];
    for (let i = 0; i < 35; i++) {
      const response = await request.post('/api/inventory/adjust', {
        headers,
        data: makeAdjustPayload()
      });
      statuses.push(response.status());
      if (response.status() === 429) break;
    }

    expect(statuses.some(s => s === 429), 'Should eventually trigger rate limit').toBe(true);
  });
});
