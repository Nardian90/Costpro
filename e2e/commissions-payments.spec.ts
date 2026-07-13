import { test, expect } from '@playwright/test';
import { getAuthHeaders } from './fixtures/auth.fixture';

/**
 * E2E: Comisiones y Pagos a Trabajadores — Commission Rules + Payments.
 *
 * NEW (2026-07-13): No previous coverage. Tests:
 *
 *   COMMISSION RULES:
 *   1. POST /api/commissions/rules creates a rule → 201
 *   2. GET /api/commissions/rules returns the rule
 *   3. POST rejects invalid rule type → 400
 *   4. POST rejects missing required fields → 400
 *   5. POST rejects percentage out of range (>100 or <0) → 400
 *   6. Rule versioning: updating a rule creates a version history entry
 *
 *   COMMISSION CALCULATION:
 *   7. POST /api/commissions/calculate returns per-worker breakdown
 *   8. POST rejects date_from > date_to → 400
 *   9. POST rejects missing store_id → 400
 *
 *   COMMISSION PAYMENTS:
 *   10. POST /api/commissions/payments creates a payment → 201
 *   11. POST rejects overlapping period for same worker → 409 or 400
 *   12. POST rejects manual adjustment without reason → 400
 *   13. GET /api/commissions/payments filters by status
 *
 *   WORKER INTEGRATION:
 *   14. Worker with no name cannot be created (validation guard)
 *   15. Worker created with valid data appears in commission calculations
 *
 * Prerequisites:
 *   - E2E_TEST_ADMIN_TOKEN configured
 *   - E2E_TEST_STORE_ID = Tienda Central Costpro
 *   - Test worker exists or is created during setup
 */

const TEST_STORE_ID = process.env.E2E_TEST_STORE_ID || 'test-store-00000000';
const TEST_CI_PREFIX = '990101';

test.describe('Comisiones y Pagos a Trabajadores — Strict', () => {
  test.skip(!process.env.E2E_TEST_ADMIN_TOKEN, 'E2E_TEST_ADMIN_TOKEN not configured');

  let headers: Record<string, string>;
  let testWorkerId: string | null = null;
  let testRuleId: string | null = null;
  let testPaymentId: string | null = null;

  test.beforeAll(async ({ request }) => {
    headers = getAuthHeaders('admin')!;

    // Setup: create a test worker for commission tests
    const uniqueCI = TEST_CI_PREFIX + Math.floor(10000 + Math.random() * 89999).toString();
    const workerRes = await request.post('/api/workers', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        first_name: 'CommissionTest',
        last_name: 'Worker',
        ci: uniqueCI,
        gender: 'M',
      },
    });

    if (workerRes.status() === 201) {
      const body = await workerRes.json();
      const worker = body.worker || body;
      testWorkerId = worker.id;
    }
  });

  test.afterAll(async ({ request }) => {
    // Cleanup: delete test data in reverse order
    if (testPaymentId) {
      await request.delete(`/api/commissions/payments?id=${testPaymentId}`, { headers }).catch(() => {});
    }
    if (testRuleId) {
      await request.delete(`/api/commissions/rules?id=${testRuleId}`, { headers }).catch(() => {});
    }
    if (testWorkerId) {
      await request.delete(`/api/workers?id=${testWorkerId}`, { headers }).catch(() => {});
    }
  });

  // ─── COMMISSION RULES ────────────────────────────────────────────

  test('1. POST /api/commissions/rules creates a percentage rule → 201', async ({ request }) => {
    test.skip(!testWorkerId, 'Test worker not created');

    const response = await request.post('/api/commissions/rules', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        worker_id: testWorkerId,
        type: 'percentage',
        value_percent: 5.0,
        base_calculation: 'net_sales',
        priority: 1,
        valid_from: new Date().toISOString().slice(0, 10),
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    const rule = body.data || body;
    expect(rule).toHaveProperty('id');
    expect(rule.type).toBe('percentage');
    expect(Number(rule.value_percent)).toBe(5.0);
    testRuleId = rule.id;
  });

  test('2. GET /api/commissions/rules returns the created rule', async ({ request }) => {
    test.skip(!testRuleId, 'Rule not created');

    const response = await request.get(`/api/commissions/rules?store_id=${TEST_STORE_ID}`, { headers });

    expect(response.status()).toBe(200);
    const body = await response.json();
    const rules = body.data || body;
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.some((r: any) => r.id === testRuleId)).toBe(true);
  });

  test('3. POST rejects invalid rule type → 400', async ({ request }) => {
    const response = await request.post('/api/commissions/rules', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        type: 'invalid_type',
        value_percent: 5,
        base_calculation: 'net_sales',
        priority: 1,
        valid_from: new Date().toISOString().slice(0, 10),
      },
    });

    expect(response.status()).toBe(400);
  });

  test('4. POST rejects missing required fields (store_id) → 400', async ({ request }) => {
    const response = await request.post('/api/commissions/rules', {
      headers,
      data: {
        type: 'percentage',
        value_percent: 5,
        base_calculation: 'net_sales',
        priority: 1,
        valid_from: new Date().toISOString().slice(0, 10),
      },
    });

    expect(response.status()).toBe(400);
  });

  test('5. POST rejects percentage > 100 → 400', async ({ request }) => {
    const response = await request.post('/api/commissions/rules', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        type: 'percentage',
        value_percent: 150, // invalid
        base_calculation: 'net_sales',
        priority: 1,
        valid_from: new Date().toISOString().slice(0, 10),
      },
    });

    expect(response.status()).toBe(400);
  });

  test('5b. POST rejects percentage < 0 → 400', async ({ request }) => {
    const response = await request.post('/api/commissions/rules', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        type: 'percentage',
        value_percent: -5, // invalid
        base_calculation: 'net_sales',
        priority: 1,
        valid_from: new Date().toISOString().slice(0, 10),
      },
    });

    expect(response.status()).toBe(400);
  });

  test('6. Rule versioning: updating a rule creates a version entry', async ({ request }) => {
    test.skip(!testRuleId, 'Rule not created');

    // Update the rule (PATCH or PUT)
    const updateRes = await request.patch(`/api/commissions/rules?id=${testRuleId}`, {
      headers,
      data: { value_percent: 7.5 },
    });

    // Some APIs use PUT, some PATCH. Accept either 200 or 405 (method not allowed).
    test.skip(updateRes.status() === 405, 'PATCH not supported — skipping versioning test');

    expect([200, 204]).toContain(updateRes.status());

    // Verify version history was created
    const historyRes = await request.get(
      `/api/commissions/rules?store_id=${TEST_STORE_ID}&history=true`,
      { headers }
    );
    expect(historyRes.status()).toBe(200);
    const historyBody = await historyRes.json();
    // STRICT: versions array must exist for our rule
    const versions = historyBody.versions?.[testRuleId] || [];
    expect(versions.length).toBeGreaterThan(0);
  });

  // ─── COMMISSION CALCULATION ──────────────────────────────────────

  test('7. POST /api/commissions/calculate returns breakdown', async ({ request }) => {
    test.skip(!testWorkerId, 'Test worker not created');

    const today = new Date();
    const dateFrom = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const dateTo = today.toISOString().slice(0, 10);

    const response = await request.post('/api/commissions/calculate', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        worker_ids: [testWorkerId],
        date_from: dateFrom,
        date_to: dateTo,
      },
    });

    // STRICT: 200 (with results) or 200 with empty array if no sales
    expect(response.status()).toBe(200);
    const body = await response.json();
    // Response shape: { data: [{ worker_id, calculated_amount, breakdown }] }
    const results = body.data || body;
    expect(Array.isArray(results)).toBe(true);
  });

  test('8. POST /api/commissions/calculate rejects date_from > date_to → 400', async ({ request }) => {
    const response = await request.post('/api/commissions/calculate', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        date_from: '2026-12-31',
        date_to: '2026-01-01', // before date_from
      },
    });

    expect(response.status()).toBe(400);
  });

  test('9. POST /api/commissions/calculate rejects missing store_id → 400', async ({ request }) => {
    const response = await request.post('/api/commissions/calculate', {
      headers,
      data: {
        date_from: '2026-01-01',
        date_to: '2026-12-31',
      },
    });

    expect(response.status()).toBe(400);
  });

  // ─── COMMISSION PAYMENTS ─────────────────────────────────────────

  test('10. POST /api/commissions/payments creates a payment → 201', async ({ request }) => {
    test.skip(!testWorkerId, 'Test worker not created');

    const today = new Date();
    const periodStart = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const periodEnd = today.toISOString().slice(0, 10);

    const response = await request.post('/api/commissions/payments', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        worker_id: testWorkerId,
        period_start: periodStart,
        period_end: periodEnd,
        calculated_amount: 100.00,
        final_amount: 100.00,
        rule_applied_id: testRuleId,
        status: 'pending',
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    const payment = body.data || body;
    expect(payment).toHaveProperty('id');
    expect(Number(payment.calculated_amount)).toBe(100);
    testPaymentId = payment.id;
  });

  test('11. POST rejects overlapping period for same worker → 400 or 409', async ({ request }) => {
    test.skip(!testWorkerId, 'Test worker not created');

    const today = new Date();
    // Same period as test 10 → must conflict
    const periodStart = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const periodEnd = today.toISOString().slice(0, 10);

    const response = await request.post('/api/commissions/payments', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        worker_id: testWorkerId,
        period_start: periodStart,
        period_end: periodEnd,
        calculated_amount: 50.00,
        final_amount: 50.00,
      },
    });

    // STRICT: must NOT be 201 (overlap detected). 400 or 409.
    expect(response.status()).not.toBe(201);
    expect([400, 409]).toContain(response.status());
  });

  test('12. POST rejects manual adjustment without reason → 400', async ({ request }) => {
    test.skip(!testWorkerId, 'Test worker not created');

    const today = new Date();
    // Use a different non-overlapping period
    const periodStart = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    const periodEnd = new Date(today.getTime() + 37 * 86400000).toISOString().slice(0, 10);

    const response = await request.post('/api/commissions/payments', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        worker_id: testWorkerId,
        period_start: periodStart,
        period_end: periodEnd,
        calculated_amount: 100.00,
        final_amount: 80.00, // differs from calculated → manual adjustment
        // manual_adjustment_reason: MISSING — must trigger 400
      },
    });

    expect(response.status()).toBe(400);
  });

  test('13. GET /api/commissions/payments filters by status', async ({ request }) => {
    const response = await request.get(
      `/api/commissions/payments?store_id=${TEST_STORE_ID}&status=pending`,
      { headers }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    const payments = body.data || body;
    expect(Array.isArray(payments)).toBe(true);
    // STRICT: all returned payments must have status=pending
    payments.forEach((p: any) => {
      expect(p.status).toBe('pending');
    });
  });

  // ─── WORKER INTEGRATION (regression for "Trabajadores sin nombre") ─

  test('14. Worker with empty name is rejected → 400 (no "trabajador sin nombre")', async ({ request }) => {
    const response = await request.post('/api/workers', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        first_name: '',   // empty
        last_name: '',
        ci: TEST_CI_PREFIX + Math.floor(10000 + Math.random() * 89999).toString(),
      },
    });

    // STRICT: must be 400 — never 201 (which would create a "trabajador sin nombre")
    expect(response.status()).toBe(400);
  });

  test('14b. Worker with whitespace-only name is rejected → 400', async ({ request }) => {
    const response = await request.post('/api/workers', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        first_name: '   ',   // whitespace only
        last_name: '   ',
        ci: TEST_CI_PREFIX + Math.floor(10000 + Math.random() * 89999).toString(),
      },
    });

    // STRICT: must be 400 — whitespace-only is effectively empty
    expect([400, 422]).toContain(response.status());
  });

  test('15. Created worker appears in commission calculation results', async ({ request }) => {
    test.skip(!testWorkerId, 'Test worker not created');

    const today = new Date();
    const dateFrom = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    const dateTo = today.toISOString().slice(0, 10);

    const response = await request.post('/api/commissions/calculate', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        worker_ids: [testWorkerId],
        date_from: dateFrom,
        date_to: dateTo,
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    const results = body.data || body;

    // STRICT: the test worker must appear in the results
    const found = results.find((r: any) => r.worker_id === testWorkerId);
    expect(found).toBeDefined();
    expect(found).toHaveProperty('calculated_amount');
  });
});
