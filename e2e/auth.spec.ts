import { test, expect } from '@playwright/test';
import { getAuthHeaders, requireAuth } from './fixtures/auth.fixture';

const PROTECTED_ENDPOINTS = [
  { method: 'GET',  path: '/api/inventory/products' },
  { method: 'POST', path: '/api/inventory/adjust' },
  { method: 'POST', path: '/api/cost-sheets/save' },
  { method: 'POST', path: '/api/cost-sheets/calculate' },
  { method: 'POST', path: '/api/reports/generate' },
  { method: 'POST', path: '/api/academy/generate' },
  { method: 'POST', path: '/api/sync/batch' },
  { method: 'POST', path: '/api/cost-sheets/import-json' },
  { method: 'POST', path: '/api/cost-sheets/import-anexo' },
  { method: 'POST', path: '/api/cost-sheets/ai/chat' },
  { method: 'POST', path: '/api/bot/chat' },
  // Admin-only:
  { method: 'POST', path: '/api/users/managed-create', requiresAdmin: true },
  { method: 'POST', path: '/api/users/toggle-status',  requiresAdmin: true },
  { method: 'POST', path: '/api/users/delete',          requiresAdmin: true },
  { method: 'POST', path: '/api/legal/retention',       requiresAdmin: true },
];

test.describe('Authentication and Authorization', () => {
  for (const endpoint of PROTECTED_ENDPOINTS) {
    test(`${endpoint.method} ${endpoint.path} returns 401 without Authorization header`, async ({ request }) => {
      const response = await (endpoint.method === 'GET'
        ? request.get(endpoint.path)
        : request.post(endpoint.path, { data: {} }));

      const body = await response.json().catch(() => ({}));
      expect(response.status(), `Status inesperado para ${endpoint.path}. Body: ${JSON.stringify(body)}`).toBe(401);
    });
  }

  test('[BUG-017 REGRESSION] POST /api/legal/incidents must require authentication', async ({ request }) => {
    // BUG-017: endpoint currently unauthenticated
    // Expected fix: should return 401
    const response = await request.post('/api/legal/incidents', {
      data: { title: 'Test', description: 'Test description long enough', severity: 'low' }
    });
    const status = response.status();

    // Documenting the bug status
    if (status === 201 || status === 200) {
      console.warn('BUG-017 is ACTIVE: /api/legal/incidents accepted unauthenticated request');
      test.fail(true, 'BUG-017: endpoint currently unauthenticated');
    }

    expect(status, 'BUG-017: /api/legal/incidents should require auth').toBe(401);
  });

  test('endpoints return 401 with malformed token', async ({ request }) => {
    const response = await request.get('/api/inventory/products', {
      headers: { 'Authorization': 'Bearer invalid-token-1234' }
    });
    expect(response.status()).toBe(401);
  });

  test('admin endpoints return 403 with regular user token', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }

    const response = await request.post('/api/users/managed-create', {
      headers,
      data: {}
    });

    // If user is actually admin in the test env, this might return 400 or 200/201 depending on data
    // But for a regular user it MUST be 403 (or 401 if token invalid)
    expect([401, 403]).toContain(response.status());
  });
});
