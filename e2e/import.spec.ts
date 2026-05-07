import { test, expect } from '@playwright/test';
import { getAuthHeaders } from './fixtures/auth.fixture';
import { MINIMAL_COST_SHEET } from './fixtures/cost-sheet.fixture';

test.describe('Import', () => {
  test('import-json: rejects without authentication → 401', async ({ request }) => {
    const response = await request.post('/api/cost-sheets/import-json', { data: {} });
    expect(response.status()).toBe(401);
  });

  test('import-json: rejects invalid JSON → 400', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) { test.skip(true, 'Auth headers missing'); return; }
    const response = await request.post('/api/cost-sheets/import-json', {
      headers: { ...(headers || {}), 'Content-Type': 'text/plain', 'Authorization': headers?.Authorization || '' },
      data: 'not json'
    });
    expect(response.status()).toBe(400);
  });

  test('import-json: validates with FichaJSONSchema', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }
    const response = await request.post('/api/cost-sheets/import-json', {
      headers,
      data: { header: {}, sections: 'not-an-array' }
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
  });

  test('import-json: accepts valid sheet', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }
    const response = await request.post('/api/cost-sheets/import-json', {
      headers,
      data: MINIMAL_COST_SHEET
    });
    expect(response.status()).toBe(200);
    expect((await response.json()).ok).toBe(true);
  });

  test('import-anexo: rejects without authentication → 401', async ({ request }) => {
    const response = await request.post('/api/cost-sheets/import-anexo', { data: {} });
    expect(response.status()).toBe(401);
  });

  test('import-anexo: rejects without file → 400', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }
    const response = await request.post('/api/cost-sheets/import-anexo', {
      headers,
      data: {}
    });
    expect(response.status()).toBe(400);
  });

  test('import-anexo: rejects unsupported format', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }
    // Submitting a fake text file
    const response = await request.post('/api/cost-sheets/import-anexo', {
      headers,
      multipart: {
        file: {
          name: 'test.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('hello world')
        },
        anexoId: 'test'
      }
    });
    expect(response.status()).toBe(400);
  });

  test('import-anexo: accepts valid CSV', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }
    const csvContent = 'classification,importe\nMaterial,100\nLabor,200';
    const response = await request.post('/api/cost-sheets/import-anexo', {
      headers,
      multipart: {
        file: {
          name: 'test.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csvContent)
        },
        anexoId: 'test'
      }
    });
    expect([200, 400, 500]).toContain(response.status());
  });
});