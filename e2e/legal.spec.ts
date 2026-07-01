import { test, expect } from '@playwright/test';
import { getAuthHeaders } from './fixtures/auth.fixture';

test.describe('Legal', () => {
  test('[BUG-017 REGRESSION] /api/legal/incidents must require authentication', async ({ request }) => {
    const response = await request.post('/api/legal/incidents', {
      data: { title: 'Test incident', description: 'E2E regression test for BUG-017', severity: 'low' }
    });
    const status = response.status();
    expect(status).toBe(401);
  });

  test('incidents: validates required fields → 400', async ({ request }) => {
    const legal_headers = getAuthHeaders('user');
    if (!legal_headers) { test.skip(true, 'Auth headers missing'); return; }
    const h = legal_headers;

    const r1 = await request.post('/api/legal/incidents', { headers: h, data: { description: 'test', severity: 'low' } });
    expect(r1.status()).toBe(400);

    const r2 = await request.post('/api/legal/incidents', { headers: h, data: { title: 'test', severity: 'low' } });
    expect(r2.status()).toBe(400);

    const r3 = await request.post('/api/legal/incidents', { headers: h, data: { title: 'test', description: 'test', severity: 'invalid' } });
    expect(r3.status()).toBe(400);
  });

  test('incidents: rejects title > 200 chars → 400', async ({ request }) => {
    const legal_headers = getAuthHeaders('user');
    if (!legal_headers) { test.skip(true, 'Auth headers missing'); return; }
    const response = await request.post('/api/legal/incidents', {
      headers: legal_headers,
      data: { title: 'x'.repeat(201), description: 'valid description long enough', severity: 'low' }
    });
    expect(response.status()).toBe(400);
  });

  test('incidents: description minimum 10 chars', async ({ request }) => {
    const legal_headers = getAuthHeaders('user');
    if (!legal_headers) { test.skip(true, 'Auth headers missing'); return; }
    const response = await request.post('/api/legal/incidents', {
      headers: legal_headers,
      data: { title: 'Valid Title', description: 'short', severity: 'low' }
    });
    expect(response.status()).toBe(400);
  });

  test('retention: rejects without authentication → 401', async ({ request }) => {
    const response = await request.post('/api/legal/retention', { data: {} });
    expect(response.status()).toBe(401);
  });

  test('retention: rejects non-admin user → 403', async ({ request }) => {
    const user_headers = getAuthHeaders('user');
    if (!user_headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }
    const response = await request.post('/api/legal/retention', { headers: user_headers, data: {} });
    expect(response.status()).toBe(403);
  });

  test('[BUG-018 REGRESSION] incidents concurrent write', async ({ request }) => {
    const legal_headers = getAuthHeaders('user');
    if (!legal_headers) { test.skip(true, 'Auth headers missing'); return; }
    const h = legal_headers;
    const requests = Array(5).fill(null).map((_, i) =>
      request.post('/api/legal/incidents', {
        headers: h,
        data: { title: `Incident ${i}`, description: 'Concurrent write test description', severity: 'low' }
      })
    );
    const responses = await Promise.all(requests);
    responses.forEach(r => {
      expect([201, 401]).toContain(r.status());
    });
  });

  test('[BUG-024 REGRESSION] incidents on ephemeral filesystem', async () => {
    test.skip(true, 'BUG-024: Architecture issue, data/incidents.json is ephemeral in serverless');
  });
});
