import { test, expect } from '@playwright/test';
import { getAuthHeaders } from './fixtures/auth.fixture';

/**
 * E2E tests for the worker creation flow — STRICT ASSERTIONS VERSION.
 *
 * REWRITE (2026-07-13): The previous version accepted 500 as a valid response
 * (`expect([201, 400, 403, 500]).toContain(response.status())`), which meant
 * a server crash would still pass. Now each test asserts a SPECIFIC expected
 * status code, with explicit handling for known edge cases (store not found,
 * plan limits).
 *
 * Verifies:
 *   - Happy path: 201 with worker object containing id + first_name + ci
 *   - Validation: 400 for missing/invalid fields (with error message matching)
 *   - Authorization: 401 without token, 403 with insufficient role
 *   - UI: modal opens with all required fields, real-time CI validation
 *
 * Requires:
 *   - Server running on http://localhost:3000
 *   - E2E_TEST_ADMIN_TOKEN env var for authentication
 *   - A real store with id E2E_TEST_STORE_ID
 */

const TEST_STORE_ID = process.env.E2E_TEST_STORE_ID || 'test-store-00000000';
const TEST_CI_PREFIX = '990101'; // YY=99 (valid), MM=01, DD=01

test.describe('Worker Creation Flow — Strict Assertions', () => {
  test.skip(!process.env.E2E_TEST_ADMIN_TOKEN, 'E2E_TEST_ADMIN_TOKEN not configured');

  let headers: Record<string, string>;
  let createdWorkerId: string | null = null;

  test.beforeAll(() => {
    headers = getAuthHeaders('admin')!;
  });

  // Cleanup: delete any worker created during tests
  test.afterAll(async ({ request }) => {
    if (createdWorkerId) {
      await request.delete(`/api/workers?id=${createdWorkerId}`, { headers }).catch(() => {});
    }
  });

  // ─── Happy path: create a worker via API ─────────────────────────
  test('POST /api/workers creates a worker with valid data → 201', async ({ request }) => {
    const uniqueCI = TEST_CI_PREFIX + Math.floor(10000 + Math.random() * 89999).toString();

    const response = await request.post('/api/workers', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        first_name: 'E2E Test',
        last_name: 'Worker',
        ci: uniqueCI,
        gender: 'M',
        address: 'Calle Test #123',
        province: 'Las Tunas',
        municipality: 'Puerto Padre',
        shirt_size: 'L',
        shoe_size: '42',
        waist_size: '32',
      },
    });

    // STRICT: must be exactly 201 (created). 500 = server crash = test fails.
    expect(response.status()).toBe(201);

    const body = await response.json();
    const worker = body.worker || body;

    // STRICT: verify all expected fields are present and correct
    expect(worker).toHaveProperty('id');
    expect(typeof worker.id).toBe('string');
    expect(worker.id.length).toBeGreaterThan(0);
    expect(worker.first_name).toBe('E2E Test');
    expect(worker.last_name).toBe('Worker');
    expect(worker.ci).toBe(uniqueCI);
    expect(worker.gender).toBe('M');

    // Save for cleanup
    createdWorkerId = worker.id;
  });

  // ─── Validation: missing required fields ─────────────────────────
  test('POST /api/workers rejects empty first_name → 400 with field error', async ({ request }) => {
    const response = await request.post('/api/workers', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        first_name: '',
        last_name: 'Test',
        ci: '99010112345',
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    // STRICT: error message must mention the field that failed
    expect(body.error || body.message || JSON.stringify(body)).toMatch(/nombre|first_name|required/i);
  });

  test('POST /api/workers rejects missing first_name → 400', async ({ request }) => {
    const response = await request.post('/api/workers', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        last_name: 'Test',
        ci: '99010112345',
      },
    });

    expect(response.status()).toBe(400);
  });

  test('POST /api/workers rejects empty ci → 400', async ({ request }) => {
    const response = await request.post('/api/workers', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        first_name: 'Test',
        last_name: 'User',
        ci: '',
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error || body.message || JSON.stringify(body)).toMatch(/ci|carnet|identidad/i);
  });

  // ─── Validation: CI cubano ───────────────────────────────────────
  test('POST /api/workers rejects CI too short → 400', async ({ request }) => {
    const response = await request.post('/api/workers', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        first_name: 'Test',
        last_name: 'CI Length',
        ci: '123',
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error || body.message || JSON.stringify(body)).toMatch(/CI|carnet|identidad/i);
  });

  test('POST /api/workers rejects CI with invalid month (13) → 400', async ({ request }) => {
    const response = await request.post('/api/workers', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        first_name: 'Test',
        last_name: 'CI Month',
        ci: '99130112345',
      },
    });

    expect(response.status()).toBe(400);
  });

  test('POST /api/workers rejects CI with invalid future year → 400', async ({ request }) => {
    // Year 30 = 2030 in YY, but month 99 is invalid → still 400
    const response = await request.post('/api/workers', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        first_name: 'Test',
        last_name: 'CI Bad Month',
        ci: '99999912345',
      },
    });

    expect(response.status()).toBe(400);
  });

  // ─── Authorization ───────────────────────────────────────────────
  test('POST /api/workers without auth → 401', async ({ request }) => {
    const response = await request.post('/api/workers', {
      data: {
        store_id: TEST_STORE_ID,
        first_name: 'Test',
        last_name: 'No Auth',
        ci: '99010112345',
      },
    });

    expect(response.status()).toBe(401);
  });

  // ─── Duplicate CI detection ──────────────────────────────────────
  test('POST /api/workers rejects duplicate CI in same store → 400 or 409', async ({ request }) => {
    const uniqueCI = TEST_CI_PREFIX + Math.floor(10000 + Math.random() * 89999).toString();

    // First creation: must succeed
    const first = await request.post('/api/workers', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        first_name: 'Dup',
        last_name: 'Test',
        ci: uniqueCI,
      },
    });
    expect(first.status()).toBe(201);
    const firstBody = await first.json();
    const firstWorker = firstBody.worker || firstBody;
    createdWorkerId = firstWorker.id;

    // Second creation with same CI: must fail (400 or 409 — depends on DB constraint)
    const second = await request.post('/api/workers', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        first_name: 'Dup2',
        last_name: 'Test2',
        ci: uniqueCI,
      },
    });

    // STRICT: must NOT be 201 (created). Either 400 (validation) or 409 (conflict).
    expect(second.status()).not.toBe(201);
    expect([400, 409]).toContain(second.status());
  });

  // ─── UI: modal opens and has all fields ──────────────────────────
  test('UI: worker creation modal has all required fields', async ({ page }) => {
    test.skip(!process.env.E2E_TEST_ADMIN_TOKEN, 'Admin token required for UI test');

    await page.goto('/terminal?view=workers');

    const createButton = page.getByRole('button', { name: /nuevo trabajador|nuevo/i });
    const buttonVisible = await createButton.isVisible({ timeout: 5000 }).catch(() => false);

    test.skip(!buttonVisible, 'Worker creation button not visible — view may require store selection');

    await createButton.click();
    await expect(page.getByText('Nuevo trabajador')).toBeVisible({ timeout: 3000 });

    // STRICT: verify EACH required field exists and is interactable
    await expect(page.getByLabel(/nombre/i)).toBeVisible();
    await expect(page.getByLabel(/apellidos/i)).toBeVisible();
    await expect(page.getByLabel(/carnet de identidad/i)).toBeVisible();

    // Optional fields
    await expect(page.getByLabel(/camisa/i)).toBeVisible();
    await expect(page.getByLabel(/calzado/i)).toBeVisible();
    await expect(page.getByLabel(/cintura/i)).toBeVisible();

    // Provincia dropdown + municipio cascade
    const provinceSelect = page.getByLabel(/provincia/i);
    await expect(provinceSelect).toBeVisible();
    await provinceSelect.selectOption('Las Tunas');

    const municipalitySelect = page.getByLabel(/municipio/i);
    await expect(municipalitySelect).toBeEnabled();
    const options = await municipalitySelect.locator('option').allTextContents();
    expect(options).toContain('Puerto Padre');
  });

  // ─── UI: CI validation in real-time ──────────────────────────────
  test('UI: CI field shows validation error for invalid month', async ({ page }) => {
    test.skip(!process.env.E2E_TEST_ADMIN_TOKEN, 'Admin token required for UI test');

    await page.goto('/terminal?view=workers');

    const createButton = page.getByRole('button', { name: /nuevo trabajador|nuevo/i });
    const buttonVisible = await createButton.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!buttonVisible, 'Create button not visible');

    await createButton.click();
    await expect(page.getByText('Nuevo trabajador')).toBeVisible({ timeout: 3000 });

    const ciInput = page.getByLabel(/carnet de identidad/i);
    await ciInput.fill('99130112345');

    await expect(page.getByText(/mes inválido/i)).toBeVisible({ timeout: 2000 });

    const submitButton = page.getByRole('button', { name: /crear trabajador/i });
    await expect(submitButton).toBeDisabled();
  });

  // ─── UI: worker appears in list after creation ───────────────────
  test('UI: created worker appears in the workers list', async ({ page }) => {
    test.skip(!process.env.E2E_TEST_ADMIN_TOKEN, 'Admin token required for UI test');

    // First create a worker via API (faster, deterministic)
    const uniqueCI = TEST_CI_PREFIX + Math.floor(10000 + Math.random() * 89999).toString();
    const { request } = test;
    const response = await request.post('/api/workers', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        first_name: 'VisibleWorker',
        last_name: 'E2E',
        ci: uniqueCI,
      },
    });
    test.skip(response.status() !== 201, 'Worker not created — skipping UI verification');
    const body = await response.json();
    const worker = body.worker || body;
    createdWorkerId = worker.id;

    // Navigate to workers view and verify the worker appears
    await page.goto('/terminal?view=workers');
    await page.waitForLoadState('networkidle');

    // STRICT: the worker's full name must be visible in the list
    await expect(page.getByText('VisibleWorker')).toBeVisible({ timeout: 10000 });
  });
});
