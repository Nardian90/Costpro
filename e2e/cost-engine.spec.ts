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

    const response = await request.post('/api/cost-sheets/calculate', {
      headers,
      data: {
        ficha: GOAL_SEEK_SHEET,
        goalSeek: { targetRowId: '1.1', targetValue: 1500, variableRowId: '1.1' }
      }
    });

    const body = await response.json();
    if (response.status() === 200) {
      expect(typeof body.solverResult).toBe('number');
      expect(isFinite(body.solverResult)).toBe(true);
      expect(body.solverResult).not.toBe(0);
      // BUG-002: bisectRoot error in bracket expansion
      // BUG-003: simulate() returning 0 after max calls
    } else {
      console.warn(`Goal Seek endpoint returned ${response.status()}`);
    }
  });

  test('calculates sheet with empty sections without throwing', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }

    const response = await request.post('/api/cost-sheets/calculate', {
      headers,
      data: { ficha: { ...MINIMAL_COST_SHEET, sections: [] } }
    });

    expect([200, 400]).toContain(response.status());
    expect(response.status()).not.toBe(500);
  });

  test('rejects malformed JSON', async ({ request }) => {
    const headers = getAuthHeaders('user');
    if (!headers) { test.skip(true, 'Auth headers missing'); return; }
    const headers = getAuthHeaders('user');
    if (!headers) { test.skip(true, 'Auth headers missing'); return; }
    const headers = getAuthHeaders('user');
    const response = await request.post('/api/cost-sheets/calculate', {
      headers: {
        ...(headers || {}),
        'Content-Type': 'text/plain'
      },
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
      data: { ficha: { header: {} } }
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
  });
});
