import { test, expect } from '@playwright/test';

test.describe('Health API', () => {
  test('should return 200 from health endpoint', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
  });

  test('should include status in response', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('service', 'costpro-enterprise');
    expect(body).toHaveProperty('timestamp');
    // FIX-SEC-003: uptime queda OCULTO cuando el servidor corre en
    // NODE_ENV=production. El workflow E2E aislado arranca el servidor con
    // `bunx next start` (build de producción) → uptime no se expone.
    // La aserción solo aplica cuando el servidor lo expone (dev/VITEST).
    if (body.uptime !== undefined) {
      expect(typeof body.uptime).toBe('number');
    }
  });
});
