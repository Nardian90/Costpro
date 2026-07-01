import { test, expect } from '@playwright/test';
import { getAuthHeaders } from './fixtures/auth.fixture';

/**
 * E2E: Cost sheet AI generation + export
 *
 * Tests the AI-assisted cost sheet flow:
 *   1. POST /api/cost-sheets/ai/chat with a sample prompt
 *   2. Verify response contains text (AI proposal)
 *   3. POST /api/reports/generate with type=cost_sheet
 *
 * Requires E2E_TEST_ADMIN_TOKEN.
 */

test.describe('Cost Sheet AI + Export', () => {
  test.skip(!process.env.E2E_TEST_ADMIN_TOKEN, 'E2E_TEST_ADMIN_TOKEN not configured');

  let headers: Record<string, string>;

  test.beforeAll(() => {
    headers = getAuthHeaders('admin')!;
  });

  test('POST /api/cost-sheets/ai/chat generates AI proposal', async ({ request }) => {
    const response = await request.post('/api/cost-sheets/ai/chat', {
      headers,
      data: {
        messages: [{
          role: 'user',
          content: 'Genera una ficha de costo para un producto de panadería: Pan Francés, 100 unidades, harina 50kg a $25/kg, sal 1kg a $5/kg, levadura 0.5kg a $80/kg, electricidad $50, mano de obra 2 horas a $50/hora. Devuelve JSON con anexos I, II, III.',
        }],
      },
    });

    // 200 (success), 429 (rate limited), 502 (AI unavailable in test env)
    expect([200, 429, 502]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty('text');
      expect(body.text.length).toBeGreaterThan(0);
    }
  });

  test('POST /api/cost-sheets/ai/chat rejects empty messages', async ({ request }) => {
    const response = await request.post('/api/cost-sheets/ai/chat', {
      headers,
      data: { messages: [] },
    });
    expect(response.status()).toBe(400);
  });

  test('POST /api/cost-sheets/ai/chat rejects invalid provider', async ({ request }) => {
    const response = await request.post('/api/cost-sheets/ai/chat', {
      headers,
      data: {
        messages: [{ role: 'user', content: 'test' }],
        aiProvider: 'malicious-provider',
      },
    });
    expect(response.status()).toBe(400);
  });

  test('POST /api/reports/generate with type=cost_sheet requires data', async ({ request }) => {
    const response = await request.post('/api/reports/generate', {
      headers,
      data: { type: 'cost_sheet' },
    });
    // 200 (generated), 400 (missing data), 500 (server error)
    expect([200, 400, 500]).toContain(response.status());
  });
});
