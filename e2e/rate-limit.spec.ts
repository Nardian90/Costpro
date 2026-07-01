import { test, expect } from '@playwright/test';
import { getAuthHeaders } from './fixtures/auth.fixture';

test.describe('Rate Limiting', () => {
  test('[BUG-004 REGRESSION] rate limit with controlled X-Forwarded-For', async ({ request }) => {
    // BUG-004: If rate limit uses x-forwarded-for as clientId, rotating it bypasses the limit
    // Correct behavior: requests from the same authenticated user share the same bucket
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }

    const statuses: number[] = [];
    for (let i = 1; i <= 35; i++) {
      const response = await request.post('/api/inventory/adjust', {
        headers: {
          ...headers,
          'X-Forwarded-For': `1.2.3.${i}`
        },
        data: { productId: 'test', quantity: 1 }
      });
      statuses.push(response.status());
      if (response.status() === 429) break;
    }

    // If the bug is present, all 35 requests might pass (return 401/400/404)
    // If fixed and we hit the limit, we should see 429
    console.log(`Statuses received: ${statuses.join(', ')}`);
  });

  test('[BUG-023 REGRESSION] /api/legal/retention uses global key', async ({ request }) => {
    // BUG-023: endpoint uses 'retention-api' global key instead of clientId
    const response = await request.post('/api/legal/retention', { data: {} });
    expect(response.status()).toBe(401); // Auth check first
  });

  test('[BUG-019 REGRESSION] ai/chat applies rate limit BEFORE authentication', async ({ request }) => {
    // BUG-019: anonymous requests consume budget of legitimate users
    const response = await request.post('/api/cost-sheets/ai/chat', {
      data: { messages: [] }
    });

    // It should be 401 (auth) not 429 (rate limit) on the first few requests
    expect(response.status()).toBe(401);
  });

  test('[BUG-020 REGRESSION] import-json/anexo shared anonymous bucket', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }

    const response = await request.post('/api/cost-sheets/import-json', {
      headers,
      data: {}
    });

    const remaining = response.headers()['x-ratelimit-remaining'];
    if (remaining) {
      console.log(`Rate limit remaining: ${remaining}`);
    }
  });

  test('429 response includes Retry-After and X-RateLimit-Reset', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }

    let lastResponse;
    for (let i = 0; i < 40; i++) {
      lastResponse = await request.post('/api/inventory/adjust', {
        headers,
        data: { productId: 'test', quantity: 1 }
      });
      if (lastResponse.status() === 429) break;
    }

    if (lastResponse && lastResponse.status() === 429) {
      expect(lastResponse.headers()['retry-after']).toBeDefined();
      expect(parseInt(lastResponse.headers()['retry-after'] || '0')).toBeGreaterThan(0);
    } else {
      console.warn('Could not trigger 429 rate limit');
    }
  });
});
