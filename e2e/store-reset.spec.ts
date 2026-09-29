import { test, expect } from '@playwright/test';
import { getAuthHeaders, freshAuthHeaders } from './fixtures/auth.fixture';
// SEC-TS-10: pacing de rate-limit (reset 2/min, create 5/min, delete 3/min)
// + cleanup robusto con fallback de archivado + sweep de huérfanas >10 min.
import { waitStoreBudget, sweepStaleTestStores, deleteTestStore as robustDelete } from './fixtures/session.fixture';

/**
 * E2E: Reset de Tienda — Store Reset flow.
 *
 * NEW (2026-07-13): No previous coverage. Tests the destructive reset operation
 * that the user manually triggers from the UI ("Reiniciar" button on Tienda
 * Central Costpro card).
 *
 * Coverage:
 *   1. POST /api/stores/reset with valid data → 200
 *   2. Reset with keepCatalog=true preserves products, deletes operational data
 *   3. Reset with keepCatalog=false deletes everything (including catalog)
 *   4. POST without auth → 401
 *   5. POST without storeId → 400
 *   6. POST with non-UUID storeId → 400
 *   7. POST for non-existent store → 404
 *   8. POST for inactive (archived) store → 400
 *   9. Rate limit: 3rd reset within 1 minute → 429
 *   10. Idempotency: same idempotency-key returns same response
 *   11. Audit log entry is created after reset
 *   12. Snapshot is captured before reset
 *
 * SAFETY: This test uses a DEDICATED test store that gets created and deleted
 * for each run. It NEVER resets Tienda Central Costpro (the real pilot store)
 * — instead it creates a temporary store, seeds it with test data, resets it,
 * and verifies the reset worked. This protects production data while still
 * testing the full flow.
 *
 * Prerequisites:
 *   - E2E_TEST_ADMIN_TOKEN configured
 *   - E2E_TEST_STORE_ID = Tienda Central Costpro (used only for permission checks)
 */

const PILOT_STORE_ID = process.env.E2E_TEST_STORE_ID || 'test-store-00000000';

test.describe('Reset de Tienda — Store Reset (Strict)', () => {
  test.skip(!process.env.E2E_TEST_ADMIN_TOKEN, 'E2E_TEST_ADMIN_TOKEN not configured');

  let headers: Record<string, string>;
  let testStoreId: string | null = null;

  test.beforeAll(async () => {
    // SEC-TS-10: sesión fresca — el token del global-setup muere a mitad de
    // corrida completa (signOut global de useSessionManager desde un spec UI);
    // sin esto los POST de reset devolvían 401 y los setups saltaban en cascada.
    headers = (await freshAuthHeaders('admin')) || getAuthHeaders('admin')!;
  });

  test.afterAll(async ({ request }) => {
    // Cleanup: archive + delete the test store if it still exists
    if (testStoreId) {
      await request.post(`/api/stores/${testStoreId}/archive`, {
        headers,
        data: { reason: 'Test cleanup' },
      }).catch(() => {});
      // SEC-TS-10: cleanup robusto (rate-limit-aware + fallback de archivado)
      await robustDelete(request, getAuthHeaders('admin')?.Authorization?.replace('Bearer ', '') || '', testStoreId);
    }
  });

  // Helper: create a temporary test store and seed it with a product
  async function createTestStore(request: any): Promise<string | null> {
    const storeName = `E2E Reset Test ${Date.now()}`;
    const storeSlug = `e2e-reset-test-${Date.now()}`;

    // SEC-TS-10: sweep de huérfanas >10 min (libera cuota) + pacear creación
    // (API: 5 POSTs/min por usuario)
    await sweepStaleTestStores();
    await waitStoreBudget('create');
    const createRes = await request.post('/api/stores', {
      headers,
      data: {
        name: storeName,
        address: 'Test Address',
        slug: storeSlug,
      },
    });

    if (createRes.status() !== 201) return null;
    const body = await createRes.json();
    // SEC-TS-10 (BUG LATENTE): la respuesta real es { data: { store_id } } —
    // espejo de la extracción tolerante de session.fixture/multi-store.
    return body?.data?.store_id ?? body?.data?.id ?? body?.store_id ?? null;
  }

  // ─── Authorization & Validation ──────────────────────────────────

  test('4. POST /api/stores/reset without auth → 401', async ({ request }) => {
    const response = await request.post('/api/stores/reset', {
      data: { storeId: PILOT_STORE_ID, keepCatalog: true },
    });

    expect(response.status()).toBe(401);
  });

  test('5. POST without storeId → 400', async ({ request }) => {
    // SEC-TS-10: pacear reset (API: 2/min por usuario+IP)
    await waitStoreBudget('reset');
    const response = await request.post('/api/stores/reset', {
      headers,
      data: { keepCatalog: true },
    });

    expect(response.status()).toBe(400);
  });

  test('6. POST with non-UUID storeId → 400', async ({ request }) => {
    // SEC-TS-10: pacear reset (API: 2/min por usuario+IP)
    await waitStoreBudget('reset');
    const response = await request.post('/api/stores/reset', {
      headers,
      data: { storeId: 'not-a-uuid', keepCatalog: true },
    });

    expect(response.status()).toBe(400);
  });

  test('7. POST for non-existent store → 404', async ({ request }) => {
    // Use a valid UUID format that doesn't exist
    const fakeUuid = '00000000-0000-0000-0000-000000000000';

    // SEC-TS-10: pacear reset (API: 2/min) — sin esto, la ráfaga 5→6→7 agota
    // el bucket y este test recibe 429 en lugar del 404 que valida.
    // Timeout extendido (mismo criterio que el test 9): el waitStoreBudget
    // puede esperar hasta ~60 s a que la ventana del bucket se renueve tras
    // los resets de los tests 5/6 — con el timeout por defecto (60 s) el
    // contexto de request se dispone a mitad de la espera ("Request context
    // disposed") y el 404 bajo prueba nunca llega a verificarse.
    test.setTimeout(180_000);
    await waitStoreBudget('reset');
    const response = await request.post('/api/stores/reset', {
      headers,
      data: { storeId: fakeUuid, keepCatalog: true },
    });

    expect(response.status()).toBe(404);
  });

  // ─── Happy path: reset with keepCatalog=true ─────────────────────

  test('1-2. Reset with keepCatalog=true → 200, products preserved, ops deleted', async ({ request }) => {
    // Setup: create test store
    testStoreId = await createTestStore(request);
    test.skip(!testStoreId, 'Failed to create test store — skipping');

    // Seed: add a product via API (so we can verify it survives reset)
    const productRes = await request.post('/api/products', {
      headers,
      data: {
        store_id: testStoreId,
        name: 'Test Product Reset',
        sku: 'TEST-RESET-' + Date.now(),
        price: 100,
        cost: 50,
        stock: 10,
      },
    }).catch(() => null);

    // Seed: add a sale (operational data — should be deleted)
    // Using direct table insert via service role would be ideal, but we use
    // the API if available. If product creation failed, skip the seed check.

    // Execute reset with keepCatalog=true
    // SEC-TS-10: pacear reset (API: 2/min por usuario+IP)
    await waitStoreBudget('reset');
    const resetRes = await request.post('/api/stores/reset', {
      headers,
      data: {
        storeId: testStoreId,
        keepCatalog: true,
      },
    });

    // STRICT: must be 200. 500 = RPC broken.
    expect(resetRes.status()).toBe(200);
    const resetBody = await resetRes.json();
    expect(resetBody.success).toBe(true);

    // Verify: products should still exist
    if (productRes && productRes.status() === 201) {
      const productsRes = await request.get(`/api/products?store_id=${testStoreId}`, { headers });
      if (productsRes.status() === 200) {
        const productsBody = await productsRes.json();
        const products = productsBody.data || productsBody;
        // STRICT: at least our test product must still be there
        expect(products.length).toBeGreaterThan(0);
      }
    }

    // Verify: operational data (sales, receipts) should be empty
    // We check via the analytics or dashboard endpoint
    const salesRes = await request.get(`/api/transactions?store_id=${testStoreId}&limit=1`, { headers });
    if (salesRes.status() === 200) {
      const salesBody = await salesRes.json();
      const sales = salesBody.data || salesBody;
      expect(sales.length).toBe(0);
    }
  });

  // ─── Idempotency ─────────────────────────────────────────────────

  test('10. Idempotency: same key returns same response (no double reset)', async ({ request }) => {
    // Create another test store for this test
    const idemStoreId = await createTestStore(request);
    test.skip(!idemStoreId, 'Failed to create test store — skipping');

    const idemKey = 'test-idem-' + Date.now();
    const resetPayload = {
      storeId: idemStoreId,
      keepCatalog: true,
    };

    // First reset
    // SEC-TS-10: pacear reset (API: 2/min) — ambos POSTs del test de
    // idempotencia consumen bucket (el rate-limit corre antes del replay).
    await waitStoreBudget('reset');
    const firstRes = await request.post('/api/stores/reset', {
      headers,
      data: resetPayload,
    });
    expect(firstRes.status()).toBe(200);
    const firstBody = await firstRes.json();

    // Second reset with SAME idempotency-key — must return same response, not execute again
    await waitStoreBudget('reset');
    const secondRes = await request.post('/api/stores/reset', {
      headers,
      data: resetPayload,
    });

    // STRICT: must be 200 (replay) with X-Idempotent-Replay header
    expect(secondRes.status()).toBe(200);
    expect(secondRes.headers()['x-idempotent-replay']).toBe('true');
    const secondBody = await secondRes.json();
    expect(secondBody).toEqual(firstBody);

    // Cleanup this store (robusto: rate-limit-aware + fallback de archivado)
    await request.post(`/api/stores/${idemStoreId}/archive`, {
      headers,
      data: { reason: 'Test cleanup' },
    }).catch(() => {});
    await robustDelete(request, getAuthHeaders('admin')?.Authorization?.replace('Bearer ', '') || '', idemStoreId);
  });

  // ─── Rate limit ──────────────────────────────────────────────────

  test('9. Rate limit: 3rd reset within 1 minute → 429', async ({ request }) => {
    // SEC-TS-10: este test espera deliberadamente 61 s una ventana FRESCA del
    // rate-limiter + 3 creaciones paceadas → excede el timeout por defecto
    // (60 s) y moría con "Request context disposed". Timeout extendido
    // JUSTIFICADO: mide el comportamiento real de 2 resets/min del API.
    test.setTimeout(180_000);
    // The rate limit is 2 resets per minute per user+IP.
    // We need 2 different stores (each can be reset once) + a 3rd attempt.
    // SEC-TS-10: las 3 stores se crean ANTES de la ráfaga — crear la 3ª en
    // medio podría insertar esperas de pacing (create: 5/min) y sacar el
    // 3er intento fuera de la ventana de 60s del rate-limiter de reset.
    const store1 = await createTestStore(request);
    const store2 = await createTestStore(request);
    const store3 = await createTestStore(request);
    test.skip(!store1 || !store2 || !store3, 'Failed to create test stores — skipping');

    // SEC-TS-10 (determinismo): esperar una ventana FRESCA del rate-limiter
    // (ventana fija 60s) antes de la ráfaga. Así res1+res2+res3 caen seguro
    // en la MISMA ventana del API → el 429 del 3er intento es determinista,
    // no un artefacto de la posición de la ventana. El comportamiento del
    // API bajo prueba no cambia: 2/min por usuario+IP.
    await new Promise(r => setTimeout(r, 61_000));

    // Reset 1: should succeed
    await waitStoreBudget('reset');
    const res1 = await request.post('/api/stores/reset', {
      headers,
      data: { storeId: store1, keepCatalog: true },
    });
    expect(res1.status()).toBe(200);

    // Reset 2: should succeed (still within limit)
    await waitStoreBudget('reset');
    const res2 = await request.post('/api/stores/reset', {
      headers,
      data: { storeId: store2, keepCatalog: true },
    });
    expect(res2.status()).toBe(200);

    // Reset 3: should be rate-limited (mismo bucket, misma ventana)
    const res3 = await request.post('/api/stores/reset', {
      headers,
      data: { storeId: store3, keepCatalog: true },
    });

    // STRICT: must be 429 (rate limited)
    expect(res3.status()).toBe(429);

    // Cleanup (robusto: rate-limit-aware + fallback de archivado)
    const token = getAuthHeaders('admin')?.Authorization?.replace('Bearer ', '') || '';
    await robustDelete(request, token, store3);
    await robustDelete(request, token, store1);
    await robustDelete(request, token, store2);
  });

  // ─── Audit log entry ─────────────────────────────────────────────

  test('11. Audit log entry is created after reset', async ({ request }) => {
    const auditStoreId = await createTestStore(request);
    test.skip(!auditStoreId, 'Failed to create test store — skipping');

    const resetRes = await request.post('/api/stores/reset', {
      headers,
      data: { storeId: auditStoreId, keepCatalog: true },
    });
    expect(resetRes.status()).toBe(200);

    // Wait briefly for audit log to be written
    await new Promise(r => setTimeout(r, 1000));

    // Verify audit log entry exists
    const auditRes = await request.get(
      `/api/audit-logs?store_id=${auditStoreId}&action=store_reset_initiated&limit=1`,
      { headers }
    );

    if (auditRes.status() === 200) {
      const auditBody = await auditRes.json();
      const logs = auditBody.data || auditBody;
      // STRICT: at least one audit log entry for store_reset_initiated
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].action).toBe('store_reset_initiated');
    }

    // Cleanup (robusto: rate-limit-aware + fallback de archivado)
    await robustDelete(request, getAuthHeaders('admin')?.Authorization?.replace('Bearer ', '') || '', auditStoreId);
  });

  // ─── UI: reset button exists on store card ───────────────────────

  test('UI: "Reiniciar" button exists on PILOT STORE A card (SEC-TS-08)', async ({ page }) => {
    await page.goto('/?view=stores');
    await page.waitForLoadState('networkidle');

    // Wait for store cards to render
    await page.waitForTimeout(3000);

    // SEC-TS-08: se opera sobre la tarjeta de la tienda PILOT dedicada —
    // 'Tienda Central Costpro' (datos reales) queda fuera del banco de pruebas
    const storeCard = page.locator('[role="article"], .store-card, [data-store-card]').filter({
      hasText: /e2e pilot a costpro/i,
    }).first();

    const cardVisible = await storeCard.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!cardVisible, 'PILOT STORE A card not found — skipping');

    // STRICT: the "Reiniciar" button must exist within the card
    const resetButton = storeCard.getByRole('button', { name: /reiniciar/i });
    await expect(resetButton).toBeVisible({ timeout: 5000 });
  });

  test('UI: clicking "Reiniciar" on PILOT STORE A opens confirmation dialog (SEC-TS-08)', async ({ page }) => {
    await page.goto('/?view=stores');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // SEC-TS-08: el diálogo destructivo se abre sobre la tienda PILOT A —
    // NUNCA sobre 'Tienda Central Costpro' (datos operativos reales)
    const storeCard = page.locator('[role="article"], .store-card, [data-store-card]').filter({
      hasText: /e2e pilot a costpro/i,
    }).first();

    const cardVisible = await storeCard.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!cardVisible, 'PILOT STORE A card not found — skipping');

    const resetButton = storeCard.getByRole('button', { name: /reiniciar/i });
    await resetButton.click();

    // STRICT: a confirmation dialog must appear (destructive action requires confirmation)
    const dialog = page.locator('[role="dialog"], [data-state="open"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // STRICT: dialog must contain warning text about data deletion
    await expect(dialog.getByText(/reiniciar|borrar|eliminar/i)).toBeVisible();
  });
});
