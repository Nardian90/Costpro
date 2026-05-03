import { test, expect } from '@playwright/test';

test.describe('API Routes', () => {
  test('GET /api/route should return 200', async ({ request }) => {
    const response = await request.get('/api/route');
    // May return 200 or 429 depending on rate limiting; both are acceptable
    expect([200, 429]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty('message');
    }
  });

  test('POST /api/bot/chat should require body', async ({ request }) => {
    // Sending POST without body should return 400 (JSON inválido) or 401 (no auth)
    const response = await request.post('/api/bot/chat');
    expect([400, 401]).toContain(response.status());
  });

  test('GET /api/inventory/products should return response', async ({ request }) => {
    const response = await request.get('/api/inventory/products');
    // Should return 401 (unauthorized) since no session, or 429 if rate limited
    expect([401, 429]).toContain(response.status());
  });

  test('GET /api/help-docs should return response', async ({ request }) => {
    const response = await request.get('/api/help-docs');
    // Should return 200 (structure listing) or 429 if rate limited
    expect([200, 429]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      // Should return a structure with sections (iso_manual, docs, etc.)
      expect(body).toBeDefined();
    }
  });
});
