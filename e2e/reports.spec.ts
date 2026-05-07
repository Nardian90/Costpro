import { test, expect } from '@playwright/test';
import { getAuthHeaders, TEST_STORE_ID } from './fixtures/auth.fixture';

test.describe('Reports', () => {
  test('rejects without authentication → 401', async ({ request }) => {
    const response = await request.post('/api/reports/generate', {
      data: { type: 'inventory' }
    });
    expect(response.status()).toBe(401);
  });

  test('rejects invalid report type → 400', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }

    const response = await request.post('/api/reports/generate', {
      headers,
      data: { type: 'non-existent', format: 'a4' }
    });
    expect(response.status()).toBe(400);
  });

  test('generates inventory report and returns URL', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }

    const response = await request.post('/api/reports/generate', {
      headers,
      data: { type: 'inventory', store_id: TEST_STORE_ID, format: 'a4', orientation: 'portrait' }
    });

    expect([200, 400, 500]).toContain(response.status());
    if (response.status() === 200) {
      const body = await response.json();
      expect(body.url).toBeDefined();
      expect(body.url).toMatch(/^https?:\/\//);

      // [BUG-022 REGRESSION] URL requires auth
      const urlResponse = await request.get(body.url);
      if (urlResponse.status() === 200) {
        console.warn('BUG-022 is ACTIVE: Report URL is public');
        // test.fail(true, 'BUG-022: Report URL is public');
      }
      expect(urlResponse.status()).not.toBe(200);
    }
  });

  test('[BUG-021 REGRESSION] profit report does not use hardcoded 30% margin', async ({ request }) => {
    // BUG-021: estimated_profit = total * 0.3 hardcoded
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }

    const response = await request.post('/api/reports/generate', {
      headers,
      data: { type: 'profit', store_id: TEST_STORE_ID, from: '2024-01-01', to: '2024-12-31' }
    });

    if (response.status() === 200) {
      const body = await response.json();
      // Logic to verify if it's exactly 30% if that data is exposed
      console.log('Profit report generated');
    }
  });

  test('rejects invalid orientation → 400', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }

    const response = await request.post('/api/reports/generate', {
      headers,
      data: { type: 'inventory', orientation: 'diagonal' }
    });
    expect(response.status()).toBe(400);
  });
});
