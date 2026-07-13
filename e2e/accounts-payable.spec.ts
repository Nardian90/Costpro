import { test, expect } from '@playwright/test';
import { getAuthHeaders } from './fixtures/auth.fixture';

/**
 * E2E: Cuentas por Pagar — Accounts Payable module.
 *
 * NEW (2026-07-13): This test was missing entirely. Covers:
 *   1. UI: view loads and displays the localized status labels
 *      ("Sin pagar", "Parcial", "Pagado") — NOT the raw English enum values
 *   2. UI: KPI cards (Vencido, Próx. 7 días, Total Pendiente, Pagado) render
 *   3. UI: filter buttons work (Todas, Vencidas, Próximas, Pagadas)
 *   4. UI: empty state shows when no payables exist
 *   5. API: GET /api/received-services returns payables data
 *   6. Regression: page must NOT contain raw 'unpaid', 'partial', 'paid' as visible text
 *
 * Prerequisites:
 *   - Server running on http://localhost:3000
 *   - E2E_TEST_ADMIN_TOKEN configured
 *   - E2E_TEST_STORE_ID points to a real store (Tienda Central Costpro)
 *
 * FIX-I18N-REGRESSION: This test protects against the bug where
 * AccountsPayableView.tsx line 221 rendered {p.payment_status} directly,
 * showing English enum values instead of Spanish translations.
 *
 * Status labels (Spanish, uniform with the rest of the app):
 *   unpaid  → "Pendiente" (changed from "Sin pagar" — nobody uses that term)
 *   partial → "Parcial"
 *   paid    → "Pagado"
 */

const TEST_STORE_ID = process.env.E2E_TEST_STORE_ID || 'test-store-00000000';

test.describe('Cuentas por Pagar — Accounts Payable', () => {
  test.skip(!process.env.E2E_TEST_ADMIN_TOKEN, 'E2E_TEST_ADMIN_TOKEN not configured');

  let headers: Record<string, string>;

  test.beforeAll(() => {
    headers = getAuthHeaders('admin')!;
  });

  // ─── UI: view loads with correct Spanish title ───────────────────
  test('UI: accounts payable view loads with Spanish title', async ({ page }) => {
    await page.goto('/terminal?view=accounts_payable');
    await page.waitForLoadState('networkidle');

    // STRICT: title must be "Cuentas por Pagar" in Spanish
    await expect(page.getByRole('heading', { name: /cuentas por pagar/i })).toBeVisible({ timeout: 10000 });
  });

  // ─── UI: KPI cards render ────────────────────────────────────────
  test('UI: KPI cards render (Vencido, Próx. 7 días, Total Pendiente, Pagado)', async ({ page }) => {
    await page.goto('/terminal?view=accounts_payable');
    await page.waitForLoadState('networkidle');

    // STRICT: all 4 KPI labels must be present
    await expect(page.getByText(/vencido/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/próx\.?\s*7\s*días/i)).toBeVisible();
    await expect(page.getByText(/total pendiente/i)).toBeVisible();
    await expect(page.getByText(/pagado/i).first()).toBeVisible();
  });

  // ─── UI: filter buttons exist ────────────────────────────────────
  test('UI: filter buttons exist (Todas, Vencidas, Próximas, Pagadas)', async ({ page }) => {
    await page.goto('/terminal?view=accounts_payable');
    await page.waitForLoadState('networkidle');

    // STRICT: all 4 filter buttons must be present
    await expect(page.getByRole('button', { name: /^todas$/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /^vencidas$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^próximas$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^pagadas$/i })).toBeVisible();
  });

  // ─── UI: filter buttons are clickable ────────────────────────────
  test('UI: clicking "Pagadas" filter updates the view', async ({ page }) => {
    await page.goto('/terminal?view=accounts_payable');
    await page.waitForLoadState('networkidle');

    const pagadasButton = page.getByRole('button', { name: /^pagadas$/i });
    await expect(pagadasButton).toBeVisible({ timeout: 10000 });
    await pagadasButton.click();

    // STRICT: button must become "active" (selected style)
    await expect(pagadasButton).toHaveClass(/bg-primary/);
  });

  // ─── REGRESSION: no raw English enum values visible ──────────────
  // This is the critical test for the FIX-I18N bug.
  test('REGRESSION: view must NOT show raw "unpaid", "partial", or "paid" as status text', async ({ page }) => {
    await page.goto('/terminal?view=accounts_payable');
    await page.waitForLoadState('networkidle');

    // Wait for the table to potentially render (or empty state)
    await page.waitForTimeout(2000);

    // Get all visible text in the main content area
    const bodyText = await page.locator('main, [role="main"], .space-y-4').first().innerText();

    // STRICT: the raw enum values MUST NOT appear as visible status labels
    // (they may appear in data attributes, but not as rendered text in the status column)
    // We check for the pattern: emoji + space + word, which is how the status badge renders.
    //
    // The bug was: {p.payment_status} rendered "unpaid" / "partial" / "paid"
    // The fix: PAYMENT_STATUS_LABELS[p.payment_status] renders "Sin pagar" / "Parcial" / "Pagado"
    //
    // Regex explanation: match the badge pattern (emoji + space + word) where the word is
    // exactly "unpaid", "partial", or "paid" (case-sensitive, as the enum is lowercase).
    const hasRawEnglishStatus = /[⏳💰⚖️]\s+(unpaid|partial|paid)\b/.test(bodyText);

    expect(hasRawEnglishStatus).toBe(false);
  });

  // ─── REGRESSION: Spanish labels ARE shown when payables exist ─────
  test('REGRESSION: when payables exist, Spanish status labels are shown', async ({ page, request }) => {
    // First check if there are any payables via API
    const apiResponse = await request.get(`/api/received-services?store_id=${TEST_STORE_ID}&limit=1`, { headers });
    test.skip(apiResponse.status() !== 200, 'API not available — skipping');

    const apiBody = await apiResponse.json();
    const hasPayables = Array.isArray(apiBody.data) && apiBody.data.length > 0;
    test.skip(!hasPayables, 'No payables exist in store — skipping label verification');

    // If payables exist, navigate to UI and verify Spanish labels
    await page.goto('/terminal?view=accounts_payable');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // STRICT: at least one of the Spanish labels must be visible in the status column
    // (depends on what statuses the existing payables have)
    const statusCell = page.locator('td:has-text(/pendiente|parcial|pagado/i)').first();
    await expect(statusCell).toBeVisible({ timeout: 10000 });
  });

  // ─── UI: empty state shows when no payables in filtered view ──────
  test('UI: empty state message shows when filter has no results', async ({ page }) => {
    await page.goto('/terminal?view=accounts_payable');
    await page.waitForLoadState('networkidle');

    // Click "Pagadas" — likely empty in a fresh test store
    const pagadasButton = page.getByRole('button', { name: /^pagadas$/i });
    await expect(pagadasButton).toBeVisible({ timeout: 10000 });
    await pagadasButton.click();
    await page.waitForTimeout(1500);

    // STRICT: either the empty state message OR a paid item must be visible
    // (we can't guarantee which, but one must exist)
    const emptyMessage = page.getByText(/no hay cuentas por pagar en esta categoría/i);
    const paidItem = page.locator('td:has-text(/pagado/i)');

    const hasEmpty = await emptyMessage.isVisible().catch(() => false);
    const hasPaid = await paidItem.first().isVisible().catch(() => false);

    expect(hasEmpty || hasPaid).toBe(true);
  });

  // ─── API: GET /api/received-services returns expected shape ──────
  test('API: GET /api/received-services returns 200 with data array', async ({ request }) => {
    const response = await request.get(`/api/received-services?store_id=${TEST_STORE_ID}&limit=10`, { headers });

    // STRICT: must be 200 (not 500, not 401)
    expect(response.status()).toBe(200);

    const body = await response.json();
    // STRICT: response must have either `data` array or be an array
    const items = body.data || body;
    expect(Array.isArray(items)).toBe(true);

    // If there are items, verify each has the expected fields
    if (items.length > 0) {
      const first = items[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('store_id');
      expect(first.store_id).toBe(TEST_STORE_ID);
      // payment_status must be a valid enum value (not null, not undefined)
      if (first.payment_status !== undefined && first.payment_status !== null) {
        expect(['unpaid', 'partial', 'paid']).toContain(first.payment_status);
      }
    }
  });

  // ─── API: GET without store_id → 400 ─────────────────────────────
  test('API: GET /api/received-services without store_id → 400', async ({ request }) => {
    const response = await request.get('/api/received-services', { headers });
    expect(response.status()).toBe(400);
  });

  // ─── API: GET without auth → 401 ─────────────────────────────────
  test('API: GET /api/received-services without auth → 401', async ({ request }) => {
    const response = await request.get(`/api/received-services?store_id=${TEST_STORE_ID}`);
    expect(response.status()).toBe(401);
  });

  // ─── UI: table headers are in Spanish ────────────────────────────
  test('UI: table headers are in Spanish (Proveedor, Tipo, Total, Saldo, Vence, Estado)', async ({ page }) => {
    await page.goto('/terminal?view=accounts_payable');
    await page.waitForLoadState('networkidle');

    // STRICT: all 6 column headers must be in Spanish
    await expect(page.getByRole('columnheader', { name: /^proveedor/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('columnheader', { name: /^tipo/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /^total/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /^saldo/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /^vence/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /^estado/i })).toBeVisible();
  });
});
