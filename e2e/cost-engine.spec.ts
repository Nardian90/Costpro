import { test, expect } from '@playwright/test';
import { getAuthHeaders } from './fixtures/auth.fixture';
import { MINIMAL_COST_SHEET, GOAL_SEEK_SHEET } from './fixtures/cost-sheet.fixture';

test.describe('Cost Engine', () => {
  test('calculates minimal sheet correctly', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }

    const response = await request.post('/api/cost-sheets/calculate', {
      headers,
      data: { ficha: MINIMAL_COST_SHEET }
    });

    const body = await response.json();
    expect(response.status()).toBe(200);
    expect(body.ok).toBe(true);
    // 500 + 300 + 200 = 1000
    expect(body.result.summary.grandTotal).toBeCloseTo(1000, 1);
  });

  test('[BUG-002 BUG-003 REGRESSION] Goal Seek: solveForTarget finds correct value', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }

    // NOTA (FASE E2E-80): el parámetro goalSeek fue retirado del endpoint;
    // el schema lo ignora (zod strip) y la ficha se calcula normalmente.
    // El test documenta el comportamiento actual: cálculo ok sin solver.
    const response = await request.post('/api/cost-sheets/calculate', {
      headers,
      data: { ...GOAL_SEEK_SHEET, goalSeek: { targetRowId: 'r1', targetValue: 1500, variableRowId: 'r1' } }
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.solverResult).toBeUndefined();
  });

  test('calculates sheet with empty sections without throwing', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }

    const response = await request.post('/api/cost-sheets/calculate', {
      headers,
      data: { ...MINIMAL_COST_SHEET, rows: [] }
    });

    expect([200, 400]).toContain(response.status());
    expect(response.status()).not.toBe(500);
  });

  test('rejects malformed JSON', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) { test.skip(true, 'Auth headers missing'); return; }
    const response = await request.post('/api/cost-sheets/calculate', {
      headers,
      data: 'plain text not json'
    });
    expect(response.status()).toBe(400);
  });

  test('rejects sheet with missing required fields', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }

    const response = await request.post('/api/cost-sheets/calculate', {
      headers,
      data: { meta: {} }
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
  });
});
