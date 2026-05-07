import { test, expect } from '@playwright/test';
import { getAuthHeaders } from './fixtures/auth.fixture';

test.describe('AI Chat', () => {
  test('[BUG-019 REGRESSION] rate limit applies AFTER authentication', async ({ request }) => {
    // BUG-019: rateLimit() called before getServerSession()
    // First request without auth should be 401
    const response = await request.post('/api/cost-sheets/ai/chat', {
      data: { messages: [{ role: 'user', content: 'hi' }] }
    });

    if (response.status() === 429) {
      console.warn('BUG-019 is ACTIVE: rate limit hit before auth check');
    }
    expect(response.status()).toBe(401);
  });

  test('ai/chat: rejects invalid provider → 400', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }
    const response = await request.post('/api/cost-sheets/ai/chat', {
      headers,
      data: { messages: [{role:'user', content:'hola'}], aiProvider: 'malicious' }
    });
    expect(response.status()).toBe(400);
  });

  test('ai/chat: rejects invalid API key format → 400', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }
    const response = await request.post('/api/cost-sheets/ai/chat', {
      headers,
      data: { messages: [{role:'user', content:'hola'}], aiApiKey: 'short' }
    });
    expect(response.status()).toBe(400);
  });

  test('ai/chat: rejects empty messages → 400', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }
    const response = await request.post('/api/cost-sheets/ai/chat', {
      headers,
      data: { messages: [] }
    });
    expect(response.status()).toBe(400);
  });

  test('ai/chat: rejects message content > 8000 chars → 400', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }
    const response = await request.post('/api/cost-sheets/ai/chat', {
      headers,
      data: { messages: [{ role: 'user', content: 'x'.repeat(8001) }] }
    });
    expect(response.status()).toBe(400);
  });

  test('bot/chat: rejects without authentication → 401', async ({ request }) => {
    const response = await request.post('/api/bot/chat', { data: { messages: [] } });
    expect(response.status()).toBe(401);
  });

  test('bot/chat: rejects without body → 400', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }
    const response = await request.post('/api/bot/chat', {
      headers,
      data: ''
    });
    expect(response.status()).toBe(400);
  });

  test('bot/chat: rejects empty messages → 400', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }
    const response = await request.post('/api/bot/chat', {
      headers,
      data: { messages: [] }
    });
    expect(response.status()).toBe(400);
  });
});
