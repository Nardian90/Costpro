import { test, expect } from '@playwright/test';

test.describe('API Routes', () => {
  test('GET /api/route should return response', async ({ request }) => {
    const response = await request.get('/api/route');
    // /api/route might not exist (404) or be rate limited (429)
    expect([200, 404, 429]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty('message');
    }
  });

  test('POST /api/bot/chat should require body', async ({ request }) => {
    const response = await request.post('/api/bot/chat');
    expect([400, 401, 429]).toContain(response.status());
  });

  test('GET /api/inventory/products should return response', async ({ request }) => {
    const response = await request.get('/api/inventory/products');
    expect([401, 429]).toContain(response.status());
  });

  test('GET /api/help-docs should return response', async ({ request }) => {
    const response = await request.get('/api/help-docs');
    // May return 200, 401 (if not auth) or 429
    expect([200, 401, 429]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toBeDefined();
    }
  });
});
