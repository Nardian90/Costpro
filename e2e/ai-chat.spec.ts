import { test, expect } from '@playwright/test';
import { getAuthHeaders, requireAuth, TEST_STORE_ID } from './fixtures/auth.fixture';

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

  test('bot/chat: rejects > 50 messages (defense in depth) → 400', async ({ request }) => {
    // FIX-BOTCHAT-LIMIT: regression test for .max(50) on messages array
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }
    const tooManyMessages = Array.from({ length: 51 }, (_, i) => ({
      role: 'user' as const,
      content: `message ${i}`,
    }));
    const response = await request.post('/api/bot/chat', {
      headers,
      data: { messages: tooManyMessages }
    });
    expect(response.status()).toBe(400);
    const body = await response.json().catch(() => ({}));
    expect(JSON.stringify(body)).toContain('50');
  });

  test('bot/chat: admin with valid storeId → 200 + SSE stream', async ({ request }) => {
    // Regression test for the FK ambiguity bug that caused 403 FORBIDDEN
    // when an admin user sent storeId in the payload.
    // Skips unless E2E_TEST_ADMIN_TOKEN is configured.
    test.skip(!requireAuth('admin'), 'E2E_TEST_ADMIN_TOKEN not configured');

    const headers = getAuthHeaders('admin')!;
    const response = await request.post('/api/bot/chat', {
      headers,
      data: {
        messages: [{ role: 'user', content: 'hola, ¿qué puedes hacer?' }],
        storeId: TEST_STORE_ID,
        stream: true,
      },
      timeout: 30_000,
    });

    // Should NOT be 403 (the bug we fixed with the FK hint)
    expect(response.status()).not.toBe(403);
    expect(response.status()).not.toBe(401);
    expect(response.status()).toBe(200);

    // Verify it's an SSE stream
    const contentType = response.headers()['content-type'] || '';
    expect(contentType).toContain('text/event-stream');

    // Read the stream and confirm we receive at least one data: chunk + done marker
    const body = await response.text();
    expect(body).toContain('data: ');
    const hasDoneMarker = body.includes('[DONE]') || body.includes('"done":true');
    expect(hasDoneMarker).toBeTruthy();
  });
});
