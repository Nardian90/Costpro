import { test, expect } from '@playwright/test';
import { getAuthHeaders, freshAuthHeaders } from './fixtures/auth.fixture';
// SEC-TS-10: los UI tests de este spec navegaban SIN sesión → login wall →
// selectores nunca visibles (y el REGRESSION de enums pasaba vacuamente).
// Inyección de sesión fresca por test (auto-sanable con refresh real).
import { signIn, injectSession } from './fixtures/session.fixture';
// E2E-DEBT-CLEANUP: seed determinista para el test de headers (Opción B del
// plan de deuda: datos test-owned en tienda EXCLUSIVA de test + cleanup)
import {
  createTestStore,
  deleteTestStore,
  sb,
  testSuffix,
} from './fixtures/session.fixture';

const ADMIN_EMAIL = 'admin@costpro.com';
const ADMIN_PASS = 'costpro123';

/** SEC-TS-10: sesión fresca + navegación autenticada */
async function authedGoto(page: import('@playwright/test').Page, view: string) {
  await injectSession(page, await signIn(ADMIN_EMAIL, ADMIN_PASS));
  await page.goto(`/?view=${view}`);
  await page.waitForLoadState('networkidle');
}

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
 *
 * E2E-DEBT-CLEANUP (data-dependent x1): el test de headers fallaba porque la
 * matriz de aging SOLO renderiza <table> cuando existen datos y ninguna
 * tienda operativa tiene cuentas por pagar (la vista muestra su empty state
 * correcto — producto HEALTHY, test data-dependent). El objetivo ESPECÍFICO
 * del test es validar los headers en español (regresión i18n), así que se
 * aplica la Opción B: sembrar received_services en una tienda EXCLUSIVA de
 * test (nunca PILOT A/B ni TIENDA CENTRAL/Puerto Padre/Enervida), apuntar el
 * active_store del admin a esa tienda durante el test y restaurarlo después
 * (CREATE→TRACK→TEST→CLEANUP con cleanup garantizado ante fallo).
 */

const TEST_STORE_ID = process.env.E2E_TEST_STORE_ID || 'test-store-00000000';

test.describe('Cuentas por Pagar — Accounts Payable', () => {
  test.skip(!process.env.E2E_TEST_ADMIN_TOKEN, 'E2E_TEST_ADMIN_TOKEN not configured');

  let headers: Record<string, string>;

  test.beforeAll(async () => {
    // SEC-TS-10: sesión fresca — el token del global-setup muere a mitad de
    // corrida completa (signOut global de useSessionManager desde un spec UI)
    headers = (await freshAuthHeaders('admin')) || getAuthHeaders('admin')!;
  });

  // ─── UI: view loads with correct Spanish title ───────────────────
  test('UI: accounts payable view loads with Spanish title', async ({ page }) => {
    await authedGoto(page, 'accounts_payable');

    // STRICT: title must be "Cuentas por Pagar" in Spanish
    // SEC-TS-10: .first() — el shell renderiza h1 (topbar) + h2 (vista), ambos
    // con el mismo texto → strict-mode violation con 2 matches.
    await expect(page.getByRole('heading', { name: /cuentas por pagar/i }).first()).toBeVisible({ timeout: 10000 });
  });

  // ─── UI: KPI cards render ────────────────────────────────────────
  test('UI: KPI cards render (Vencido, Próx. 7 días, Total Pendiente, Pagado)', async ({ page }) => {
    await authedGoto(page, 'accounts_payable');

    // STRICT: all 4 KPI labels must be present
    await expect(page.getByText(/vencido/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/próx\.?\s*7\s*días/i)).toBeVisible();
    await expect(page.getByText(/total pendiente/i)).toBeVisible();
    await expect(page.getByText(/pagado/i).first()).toBeVisible();
  });

  // ─── UI: filter buttons exist ────────────────────────────────────
  test('UI: filter buttons exist (Todas, Vencidas, Próximas, Pagadas)', async ({ page }) => {
    await authedGoto(page, 'accounts_payable');

    // STRICT: all aging-tab filter buttons must be present
    // SEC-TS-10 (UI REDESIGNADA): la vista usa tabs de aging (Todas, Vencidas,
    // 0-30d, 31-60d, 61-90d, 91-120d, Pagadas) — el botón "Próximas" de la
    // versión anterior YA NO EXISTE por diseño. Aserción alineada a la UI real.
    await expect(page.getByRole('button', { name: /^todas$/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /^vencidas$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^0-30d$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^pagadas$/i })).toBeVisible();
  });

  // ─── UI: filter buttons are clickable ────────────────────────────
  test('UI: clicking "Pagadas" filter updates the view', async ({ page }) => {
    await authedGoto(page, 'accounts_payable');

    const pagadasButton = page.getByRole('button', { name: /^pagadas$/i });
    await expect(pagadasButton).toBeVisible({ timeout: 10000 });
    await pagadasButton.click();

    // STRICT: button must become "active" (selected style)
    await expect(pagadasButton).toHaveClass(/bg-primary/);
  });

  // ─── REGRESSION: no raw English enum values visible ──────────────
  // This is the critical test for the FIX-I18N bug.
  test('REGRESSION: view must NOT show raw "unpaid", "partial", or "paid" as status text', async ({ page }) => {
    // SEC-TS-10: con sesión inyectada — sin auth este test pasaba VACUO
    // (la pantalla de login no contiene los enums ingleses).
    await authedGoto(page, 'accounts_payable');

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
    await authedGoto(page, 'accounts_payable');
    await page.waitForTimeout(2000);

    // STRICT: at least one of the Spanish labels must be visible in the status column
    // (depends on what statuses the existing payables have)
    const statusCell = page.locator('td:has-text(/pendiente|parcial|pagado/i)').first();
    await expect(statusCell).toBeVisible({ timeout: 10000 });
  });

  // ─── UI: empty state shows when no payables in filtered view ──────
  test('UI: empty state message shows when filter has no results', async ({ page }) => {
    await authedGoto(page, 'accounts_payable');

    // Click "Pagadas" — likely empty in a fresh test store
    const pagadasButton = page.getByRole('button', { name: /^pagadas$/i });
    await expect(pagadasButton).toBeVisible({ timeout: 10000 });
    await pagadasButton.click();
    await page.waitForTimeout(1500);

    // STRICT: either the empty state message OR a paid item must be visible
    // (we can't guarantee which, but one must exist)
    // SEC-TS-10 (UI REDESIGNADA): la matriz de aging muestra "N proveedor(es)
    // en esta vista" cuando el filtro tiene resultados — tercer indicador
    // válido de que el filtro aplicó y la vista se actualizó.
    const emptyMessage = page.getByText(/no hay cuentas por pagar en esta categoría/i);
    const paidItem = page.locator('td:has-text(/pagado/i)');
    const providerCount = page.getByText(/proveedor\(es\) en esta vista/i);

    const hasEmpty = await emptyMessage.isVisible().catch(() => false);
    const hasPaid = await paidItem.first().isVisible().catch(() => false);
    const hasProviders = await providerCount.isVisible().catch(() => false);

    expect(hasEmpty || hasPaid || hasProviders).toBe(true);
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
  test('UI: table headers are in Spanish (Proveedor, Tipo, Total, Saldo, Vence, Estado)', async ({ page, request }) => {
    // E2E-DEBT-CLEANUP (Opción B — seed test-owned): el objetivo específico
    // de este test es validar los HEADERS de la matriz de aging, que solo
    // renderizan con datos. Se siembran cuentas por pagar en una tienda
    // EXCLUSIVA de test y se apunta el active_store del admin a ella.
    // TRACK: todo lo creado se limpia en el finally (también ante fallo).
    // SEC-TS-10: timeout extendido — createTestStore paceado (4/min) puede
    // esperar la ventana de rate-limit y superar los 60 s por defecto.
    test.setTimeout(180_000);
    const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    const suffix = testSuffix();
    const seedStore = await createTestStore(request, session.token, 'AP');

    const adminRows = await sb.select<{ active_store_id: string | null }>(
      'profiles', `id=eq.${session.userId}&select=active_store_id&limit=1`,
    );
    const originalActiveStore = adminRows[0]?.active_store_id ?? null;

    // CREATE: 2 cuentas por pagar con aging distinto (1 corriente, 1 vencida)
    const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const pastDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    await sb.insert('received_services', [
      {
        store_id: seedStore.id,
        service_number: `E2E-AP-CUR-${suffix}`,
        service_date: new Date().toISOString().split('T')[0],
        service_type_name: 'Otro',
        supplier: `E2E Proveedor Corriente ${suffix}`,
        currency: 'CUP',
        exchange_rate: 1,
        total_amount: 150.0,
        payment_status: 'unpaid',
        paid_amount: 0,
        due_date: futureDate,
        status: 'active',
      },
      {
        store_id: seedStore.id,
        service_number: `E2E-AP-VEN-${suffix}`,
        service_date: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        service_type_name: 'Otro',
        supplier: `E2E Proveedor Vencido ${suffix}`,
        currency: 'CUP',
        exchange_rate: 1,
        total_amount: 320.5,
        payment_status: 'unpaid',
        paid_amount: 0,
        due_date: pastDate,
        status: 'active',
      },
    ]);

    // TEST (setup del contexto — se restaura en el finally)
    await sb.update('profiles', `id=eq.${session.userId}`, { active_store_id: seedStore.id });

    try {
      await authedGoto(page, 'accounts_payable');

      // STRICT: key column headers must be in Spanish
      // SEC-TS-10 (UI REDESIGNADA): la vista ahora es una matriz de aging por
      // acreedor — headers reales: "Proveedor / Acreedor", "Total", "Saldo",
      // "Por Vencer", "Vencido". Los headers "Tipo/Vence/Estado" de la tabla
      // plana anterior YA NO EXISTEN por diseño. Aserción alineada a la UI real.
      // (E2E-DEBT-CLEANUP: con el seed, la tabla SÍ renderiza → determinista)
      await expect(page.getByRole('columnheader', { name: /proveedor/i })).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('columnheader', { name: /^total/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /^saldo/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /por vencer/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /^vencido/i })).toBeVisible();

      // La matriz renderiza los proveedores sembrados (datos de la tienda de
      // test — evidencia de que la tabla corresponde al contexto activo)
      await expect(page.getByText(`E2E Proveedor Corriente ${suffix}`).first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(`E2E Proveedor Vencido ${suffix}`).first()).toBeVisible();
    } finally {
      // CLEANUP (garantizado ante fallo): restaurar contexto → borrar seed →
      // eliminar la tienda de test. Orden crítico: el puntero active_store se
      // restaura ANTES de borrar la tienda para no dejarlo huérfano.
      await sb.update('profiles', `id=eq.${session.userId}`, { active_store_id: originalActiveStore }).catch(() => {});
      await sb.delete('received_services', `store_id=eq.${seedStore.id}`).catch(() => {});
      await deleteTestStore(request, session.token, seedStore.id).catch(() => {});
    }
  });
});
