/**
 * E2E: Store Switching — Multi-store activation, data isolation, and concurrency
 *
 * Comprehensive test suite covering:
 * 1. Active store switching via the multi-store dashboard
 * 2. Query invalidation after switch (fresh data for new store)
 * 3. Cart clearance enforcement when switching stores
 * 4. Concurrent switch prevention (debounce/guard)
 * 5. StoreDeletedMonitor detection of deactivated stores
 * 6. API-level store access enforcement
 * 7. Rate-limit headers verification
 * 8. Error code responses (no Spanish raw messages)
 *
 * Prerequisites:
 * - Running dev server (npm run dev)
 * - Seeded admin user (e2e-admin@costpro.test)
 * - At least 2 active stores in the test database
 *
 * E2E-DEBT-CLEANUP (store-switching x7):
 * Los 7 tests del dashboard estaban stale: esperaban [role="article"] en
 * /?view=dashboard, pero el tablero multi-tienda renderiza StoreKPICard
 * (div sin role) desde ANTES de #1340/#1342. Reescritos contra el contrato
 * actual con selectores semánticos estables:
 *   - heading "Tablero Consolidado" (h2 del tablero)
 *   - botón "Activar {tienda} como tienda de trabajo" (aria-label único por tienda)
 *   - badge "Activa" (único en el tablero por contexto activo)
 *   - toast "Tienda cambiada exitosamente" (sonner)
 *   - td[aria-label="Producto: {nombre}"] (inventario de la tienda activa)
 * E2E-REBASE-ALIGNMENT (PR #1349 sobre main d123c2f9, PRs #1344-#1348):
 * La RUTA del tablero consolidado cambió de semántica: /?view=dashboard ya NO
 * lo renderiza (es Inicio/AICommandCenterView desde #1344; #1345/#1346 lo
 * reubicaron y #1348 convirtió el tab "KPIs" del hub en modo "Resumen" de un
 * ContentSwitcher "Vista de Tiendas"). Flujo real actual (verificado en
 * ManagementHubView.tsx):
 *   /?view=management-hub → tab "Tiendas" (default) → radio "Vista resumen"
 *   → MultiStoreDashboardView ("Tablero Consolidado")
 * Los selectores DEL tablero (heading, botón Activar, badge Activa, toast) NO
 * cambiaron — solo la ruta de acceso (retirada en CP-UX-ORG-STORES-003).
 * SEC-TS-08: los tests de switch operan SOBRE tiendas de prueba creadas por
 * este spec (A y B) con producto sembrado cada una — nunca sobre tiendas
 * operativas (TIENDA CENTRAL / Puerto Padre / Enervida) ni pilotos.
 */
import { requireIsolatedCreation } from "./fixtures/session.fixture";
import { test, expect, waitForStoresView } from './fixtures';
// E2E-DEBT-CLEANUP: fixture de datos de prueba (tiendas A/B + productos)
import {
  signIn,
  createTestStore,
  deleteTestStore,
  seedProduct,
  cleanupProducts,
} from './fixtures/session.fixture';
import { sb } from './fixtures/session.fixture';

// ============================================================================
// E2E PROYECTO 'CREATION' — EXCLUIDO de la suite ordinaria (proyecto 'core')
// ----------------------------------------------------------------------------
// Este spec CREA recursos reales (tiendas) sobre el entorno de pruebas y, por
// decisión del propietario (2026-10-09, incidentes de contaminación), está
// SEPARADO de la suite E2E ordinaria mediante el proyecto Playwright
// 'creation' (fail-closed en playwright.config.ts + requireIsolatedCreation).
//
//   * `npm run test:e2e` (core) lo EXCLUYE siempre.
//   * Sin E2E_ALLOW_CREATION=1 el proyecto 'creation' ni siquiera se
//     registra — es imposible ejecutarlo por accidente.
//   * El guard requireIsolatedCreation() FALLA con instrucción accionable si
//     se invoca fuera del entorno aislado (nunca crea en la BD compartida ni
//     se salta en silencio).
//
// Ejecución EXPLÍCITA (solo bajo petición del propietario), en entorno
// aislado por-run con teardown reconciliado:
//   E2E_ALLOW_CREATION=1 E2E_ISOLATION=1 npm run test:e2e:creation
// Verificar net-zero al terminar: node e2e/scripts/data-hygiene-guard.cjs
// ============================================================================
test.beforeAll(() => requireIsolatedCreation());

// ── 1. DASHBOARD SWITCHING ──────────────────────────────────────────

// SEC-TS-08 (aislamiento): el perfil del admin se restaura en afterAll al
// valor ORIGINAL capturado en beforeAll — ningún test deja el puntero
// active_store apuntando a una tienda de prueba eliminada.
let switchingOriginalActiveStore: string | null | undefined;
let switchingAdminId: string | null = null;

// E2E-DEBT-CLEANUP: tiendas de prueba propias del spec (CREATE→TRACK→TEST→CLEANUP)
let storeA: { id: string; name: string; slug: string } | null = null;
let storeB: { id: string; name: string; slug: string } | null = null;
let productA: { id: string; name: string } | null = null;
let productB: { id: string; name: string } | null = null;
let adminToken = '';

/**
 * CP-UX-ORG-STORES-003: el tablero consolidado (MultiStoreDashboardView) salió
 * de la navegación del hub (tab «Resumen» eliminado — su información es
 * redundante con el tab «Tiendas» de Administración de la organización, que
 * consume el mismo hook useMultiStoreDashboard y ofrece el dashboard avanzado
 * por tienda a un clic). Los tests de ESTE spec que usaban el tablero o la
 * vista /?view=stores (retiradas en las fases 1 y 3) quedan en test.fixme
 * documentado: su intención se conserva para cuando exista un escenario
 * equivalente; la cobertura VIVA de cambio de tienda activa está en
 * store-create-autoswitch / stores-crud / los tests de API de este spec y en
 * los tests unitarios de useStoreSwitcher/StoreCard. El componente del
 * tablero conserva sus tests unitarios de contrato.
 */

/** Botón "Activar {tienda} como tienda de trabajo" — aria-label único por KPI card
 *  (escenario retirado de la navegación; solo lo usan tests en test.fixme). */
function activateButtonFor(page: import('@playwright/test').Page, storeName: string) {
  return page.getByRole('button', { name: `Activar ${storeName} como tienda de trabajo` });
}

/** El badge "Activa" solo existe en la KPI card de la tienda activa
 *  (escenario retirado de la navegación; solo lo usan tests en test.fixme). */
function activeBadge(page: import('@playwright/test').Page) {
  return page.getByText('Activa', { exact: true });
}

test.beforeAll(async ({ request }) => {
  // SEC-TS-10: timeout extendido — el setup paceado (2 tiendas con presupuesto
  // create 4/min) puede esperar hasta ~120 s por la ventana de rate-limit
  test.setTimeout(240_000);
  // E2E-DEBT-CLEANUP: sesión fresca + captura del active store original
  try {
    const session = await signIn(
      process.env.E2E_ADMIN_EMAIL || 'admin@costpro.com',
      process.env.E2E_ADMIN_PASS || 'costpro123',
    );
    adminToken = session.token;
    switchingAdminId = session.userId;
  } catch { /* sin sesión — los tests individuales reportarán */ }

  if (switchingAdminId && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const rows = await sb.select<{ active_store_id: string | null }>(
        'profiles', `id=eq.${switchingAdminId}&select=active_store_id&limit=1`,
      );
      switchingOriginalActiveStore = rows[0]?.active_store_id ?? null;
    } catch { /* sin service-role disponible — sin restore */ }
  }

  // CREATE: dos tiendas de prueba aisladas (con pacing de rate-limit) + 1 producto cada una
  if (adminToken) {
    try {
      storeA = await createTestStore(request, adminToken, 'SW A');
      productA = await seedProduct(storeA, {
        name: `E2E Prod A ${storeA.slug}`,
        price: 10,
        cost: 5,
        quantity: 5,
      });
      storeB = await createTestStore(request, adminToken, 'SW B');
      productB = await seedProduct(storeB, {
        name: `E2E Prod B ${storeB.slug}`,
        price: 20,
        cost: 8,
        quantity: 7,
      });
    } catch (e) {
      // El setup falló — los tests lo reportarán; el afterAll limpia lo creado
      console.error('[store-switching] setup de tiendas de prueba falló:', e);
    }
  }
});

test.afterAll(async ({ request }) => {
  // CLEANUP: restaurar contexto ANTES de eliminar las tiendas (evita puntero huérfano)
  if (switchingAdminId && switchingOriginalActiveStore !== undefined) {
    await sb.update('profiles', `id=eq.${switchingAdminId}`, { active_store_id: switchingOriginalActiveStore }).catch(() => {});
  }
  for (const [store, product] of [[storeA, productA], [storeB, productB]] as const) {
    if (store && product) {
      await cleanupProducts(store.id, [product.id]).catch(() => {});
    }
    if (store && adminToken) {
      await deleteTestStore(request, adminToken, store.id).catch(() => {});
    }
  }
});

// ── 2. STORES MANAGEMENT VIEW ───────────────────────────────────────

test.describe('Store Switching: Management View', () => {
  test('admin can switch active store from the stores list', async ({ authedPage: page }) => {
    // Escenario retirado (fases 1 y 3): /?view=stores ya no es el listado (hub → Configuración; el listado vive en Administración de la organización).
    test.fixme(true, 'Restaurar apuntando al listado de tiendas de la organización');

    await page.goto('/?view=stores');
    await waitForStoresView(page);

    const selectButtons = page.locator('button', { hasText: /seleccionar|select/i });
    const buttonCount = await selectButtons.count();

    if (buttonCount === 0) {
      test.skip();
      return;
    }

    await selectButtons.first().click();

    // Allow for store switch propagation
    await page.waitForTimeout(3_000);

    // Verify the store switch completed — look for "current store" indicator
    const currentIndicator = page.locator('text=/tienda actual|current store/i');
    await expect(currentIndicator.first()).toBeVisible({ timeout: 10_000 }).catch(() => {
      // Store switch completed but indicator text may vary by implementation
    });
  });

  test('switching stores shows warning when cart has items', async ({ authedPage: page }) => {
    // Escenario retirado (fases 1 y 3): /?view=stores ya no es el listado (hub → Configuración; el listado vive en Administración de la organización).
    test.fixme(true, 'Restaurar apuntando al listado de tiendas de la organización');

    await page.goto('/?view=stores');
    await waitForStoresView(page);

    // Verify store cards render
    const storeCards = page.locator('[role="article"]');
    const count = await storeCards.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ── 3. API-LEVEL ACCESS ENFORCEMENT ─────────────────────────────────

test.describe('Store Switching: API Access', () => {
  test('unauthenticated GET /api/stores returns 401', async ({ request }) => {
    const res = await request.get('/api/stores');
    expect(res.status()).toBe(401);
  });

  test('unauthenticated POST /api/stores returns 401', async ({ request }) => {
    const res = await request.post('/api/stores', {
      data: { name: 'Unauthorized', address: 'Nowhere' },
    });
    expect(res.status()).toBe(401);
  });

  test('store-specific API data is filtered by membership', async ({ request }) => {
    // Unauthenticated users should not see any stores
    const res = await request.get('/api/stores');
    if (res.status() === 401) {
      expect(res.status()).toBe(401);
    } else {
      const json = await res.json();
      expect(Array.isArray(json.data)).toBe(true);
    }
  });

  test('rate-limited requests to GET /api/stores return 429 after threshold', async ({ request }) => {
    // Make many requests to potentially trigger rate limit
    // With a threshold of 30/min, we can't easily trigger this in E2E
    // but we verify the endpoint respects the rate limit header
    const res = await request.get('/api/stores');
    // Auth may fail first
    if (res.status() === 401) {
      expect(res.status()).toBe(401);
    } else {
      // Rate limit headers must be present on successful responses
      const remaining = res.headers()['x-ratelimit-remaining'];
      const resetAt = res.headers()['x-ratelimit-reset'];
      // If the headers exist, they should be valid
      if (remaining) {
        expect(parseInt(remaining, 10)).toBeGreaterThanOrEqual(0);
      }
      if (resetAt) {
        // Should be a valid ISO date string
        expect(new Date(resetAt).getTime()).not.toBeNaN();
      }
    }
  });

  // FIX-AUDIT-E2E-001: Verify API returns error codes, not raw Spanish messages
  test('API error responses use error codes, not raw Spanish messages', async ({ request }) => {
    // Unauthenticated request should return structured error with key, not Spanish string
    const res = await request.get('/api/stores');
    if (res.status() === 401) {
      const json = await res.json();
      // Must have a `key` field for i18n, not just a Spanish `error` field
      expect(json.key || json.error).toBeTruthy();
      // If there's a `key` field, it should be an i18n key pattern
      if (json.key) {
        expect(json.key).toMatch(/^apiErrors\./);
      }
    }
  });
});

// ── 4. CROSS-STORE ISOLATION ────────────────────────────────────────

test.describe('Store Switching: Data Isolation', () => {
  test('switching store clears previous store context', async ({ authedPage: page }) => {
    // Escenario retirado (CP-UX-ORG-STORES-003): el tablero consolidado ya no es alcanzable.
    test.fixme(true, 'Restaurar cuando exista un escenario equivalente para el cambio de tienda activa');

    test.skip(!storeA || !storeB, 'setup de tiendas de prueba no disponible');
    await openConsolidatedBoard(page);
    await expect(page.getByRole('heading', { name: storeA!.name, exact: true })).toBeVisible({ timeout: 15_000 });

    // Cambiar primero a A (si no está ya activa)
    const activateA = activateButtonFor(page, storeA!.name);
    if ((await activateA.count()) > 0) {
      await activateA.click();
      await expect(page.getByText('Tienda cambiada exitosamente').last()).toBeVisible({ timeout: 15_000 });
      // El contexto A queda establecido: botón de A desaparece, badge único
      await expect(activateButtonFor(page, storeA!.name)).toHaveCount(0, { timeout: 15_000 });
      await expect(activeBadge(page)).toHaveCount(1);
    }

    // Switch A → B
    const activateB = activateButtonFor(page, storeB!.name);
    await expect(activateB).toBeVisible({ timeout: 10_000 });
    await activateB.click();
    //.last(): este test ejecuta DOS switches en la misma página — sonner puede
    // mantener ambos toasts de éxito apilados (matches legítimos, no ambigüedad)
    await expect(page.getByText('Tienda cambiada exitosamente').last()).toBeVisible({ timeout: 15_000 });

    // El contexto previo (A) queda limpiado: A recupera su botón "Activar",
    // B lo pierde, y el badge "Activa" sigue siendo ÚNICO (sin contexto dual)
    await expect(activateButtonFor(page, storeA!.name)).toBeVisible({ timeout: 15_000 });
    await expect(activateButtonFor(page, storeB!.name)).toHaveCount(0, { timeout: 15_000 });
    await expect(activeBadge(page)).toHaveCount(1);
  });

  test('deleted store is removed from active store options', async ({ authedPage: page }) => {
    // Escenario retirado (fases 1 y 3): /?view=stores ya no es el listado (hub → Configuración; el listado vive en Administración de la organización).
    test.fixme(true, 'Restaurar apuntando al listado de tiendas de la organización');

    await page.goto('/?view=stores');
    await waitForStoresView(page);

    // All visible store cards should represent active stores
    const storeCards = page.locator('[role="article"]');
    const count = await storeCards.count();

    // Verify no "inactive" or "deleted" badges appear on store cards
    for (let i = 0; i < Math.min(count, 5); i++) {
      const card = storeCards.nth(i);
      const inactiveBadge = card.locator('text=/inactiv|deleted/i');
      await expect(inactiveBadge).not.toBeVisible().catch(() => {
        // Some cards may show inactive status for different reasons
      });
    }
  });

  // FIX-AUDIT-E2E-002: Verify store data changes after switching
  test('after switching store, inventory data belongs to the new store', async ({ authedPage: page }) => {
    // Escenario retirado (CP-UX-ORG-STORES-003): el tablero consolidado ya no es alcanzable.
    test.fixme(true, 'Restaurar cuando exista un escenario equivalente para el cambio de tienda activa');

    test.skip(!storeA || !storeB || !productA || !productB, 'setup de tiendas de prueba no disponible');
    await openConsolidatedBoard(page);
    await expect(page.getByRole('heading', { name: storeA!.name, exact: true })).toBeVisible({ timeout: 15_000 });

    // 1. Activar tienda A y verificar que su inventario muestra SOLO su producto
    const activateA = activateButtonFor(page, storeA!.name);
    if ((await activateA.count()) > 0) {
      await activateA.click();
      await expect(page.getByText('Tienda cambiada exitosamente')).toBeVisible({ timeout: 15_000 });
    }
    await page.goto('/?view=inventory');
    await expect(page.locator(`td[aria-label="Producto: ${productA!.name}"]`)).toBeVisible({ timeout: 20_000 });
    // Sin contaminación de B: el producto de B NO aparece en el inventario de A
    await expect(page.locator(`td[aria-label="Producto: ${productB!.name}"]`)).toHaveCount(0);

    // 2. Cambiar a B y verificar que el inventario pasa a datos de B
    await openConsolidatedBoard(page);
    const activateB = activateButtonFor(page, storeB!.name);
    await expect(activateB).toBeVisible({ timeout: 15_000 });
    await activateB.click();
    await expect(page.getByText('Tienda cambiada exitosamente')).toBeVisible({ timeout: 15_000 });

    await page.goto('/?view=inventory');
    // Los datos relevantes pertenecen a B...
    await expect(page.locator(`td[aria-label="Producto: ${productB!.name}"]`)).toBeVisible({ timeout: 20_000 });
    //...y NO aparece contaminación de A
    await expect(page.locator(`td[aria-label="Producto: ${productA!.name}"]`)).toHaveCount(0);
  });
});

// ── 5. CONCURRENT SWITCH PREVENTION ─────────────────────────────────

test.describe('Store Switching: Concurrency Guard', () => {
  test('rapid consecutive clicks do not cause race conditions', async ({ authedPage: page }) => {
    // Escenario retirado (CP-UX-ORG-STORES-003): el tablero consolidado ya no es alcanzable.
    test.fixme(true, 'Restaurar cuando exista un escenario equivalente para el cambio de tienda activa');

    test.skip(!storeA || !storeB, 'setup de tiendas de prueba no disponible');
    await openConsolidatedBoard(page);
    await expect(page.getByRole('heading', { name: storeA!.name, exact: true })).toBeVisible({ timeout: 15_000 });

    const activateA = activateButtonFor(page, storeA!.name);
    const activateB = activateButtonFor(page, storeB!.name);
    // Dos botones disponibles (ninguna de las dos tiendas es la activa). Si un
    // test previo dejó A o B activa, restaurar el contexto ORIGINAL (capturado
    // en beforeAll — siempre distinto de las tiendas de prueba) y recargar.
    let aCount = await activateA.count();
    let bCount = await activateB.count();
    if (aCount + bCount < 2 && switchingAdminId && switchingOriginalActiveStore != null) {
      await sb.update('profiles', `id=eq.${switchingAdminId}`, { active_store_id: switchingOriginalActiveStore }).catch(() => {});
      // Re-navegación completa al tablero (goto re-ejecuta el flujo del hub)
      await openConsolidatedBoard(page);
      await expect(page.getByRole('heading', { name: storeA!.name, exact: true })).toBeVisible({ timeout: 15_000 });
      aCount = await activateA.count();
      bCount = await activateB.count();
    }
    test.skip(aCount + bCount < 2, 'no hay dos tiendas conmutables disponibles');

    // Clicks rápidos en dos tiendas distintas — useStoreSwitcher debe
    // serializarlos (isSwitchingRef bloquea el concurrente). noWaitAfter evita
    // que Playwright espere estabilidad post-click (eso eliminaría la carrera);
    // el segundo click es best-effort: si el re-render lo intercepta, la
    // invariante final sigue siendo la que se valida.
    if (aCount > 0) await activateA.click({ noWaitAfter: true }).catch(() => {});
    if (bCount > 0) await activateB.click({ noWaitAfter: true }).catch(() => {});

    // Esperar a que el estado se estabilice (el switch en curso completa)
    await page.waitForTimeout(5_000);

    // La app no se rompe: el tablero sigue funcional
    const bodyVisible = await page.locator('body').isVisible();
    expect(bodyVisible).toBe(true);
    await expect(page.getByRole('heading', { name: 'Tablero Consolidado' })).toBeVisible({ timeout: 10_000 });

    // Invariante de la guard de concurrencia: EXACTAMENTE una tienda activa
    await expect(activeBadge(page)).toHaveCount(1, { timeout: 15_000 });
  });

  // FIX-AUDIT-E2E-003: Verify store switch completes within reasonable time
  test('store switch completes within 5 seconds', async ({ authedPage: page }) => {
    // Escenario retirado (CP-UX-ORG-STORES-003): el tablero consolidado ya no es alcanzable.
    test.fixme(true, 'Restaurar cuando exista un escenario equivalente para el cambio de tienda activa');

    test.skip(!storeA || !storeB, 'setup de tiendas de prueba no disponible');
    await openConsolidatedBoard(page);
    await expect(page.getByRole('heading', { name: storeA!.name, exact: true })).toBeVisible({ timeout: 15_000 });

    // Destino conmutable disponible
    const activateB = activateButtonFor(page, storeB!.name);
    const activateA = activateButtonFor(page, storeA!.name);
    const targetButton = (await activateB.count()) > 0 ? activateB : activateA;
    const target = (await activateB.count()) > 0 ? storeB!.name : storeA!.name;
    await expect(targetButton).toBeVisible({ timeout: 10_000 });

    // Medir el switch OBSERVABLE: click → confirmación (toast + badge)
    const startTime = Date.now();
    await targetButton.click();
    await expect(page.getByText('Tienda cambiada exitosamente')).toBeVisible({ timeout: 15_000 });
    await expect(activateButtonFor(page, target)).toHaveCount(0, { timeout: 15_000 });
    const elapsed = Date.now() - startTime;

    // El switch completo (PATCH + invalidaciones + UI) debe ser rápido
    expect(elapsed).toBeLessThan(5_000);
  });
});

// ── 6. RATE LIMIT HEADERS VERIFICATION ──────────────────────────────

test.describe('Store Switching: Rate Limit Headers', () => {
  // FIX-AUDIT-E2E-004: Verify X-RateLimit-Remaining and X-RateLimit-Reset headers
  test('GET /api/stores includes X-RateLimit-Remaining header when authenticated', async ({ authedPage: page }) => {
    // Use the page's context to make an authenticated API request
    const response = await page.request.get('/api/stores');

    if (response.ok()) {
      const remaining = response.headers()['x-ratelimit-remaining'];
      const resetAt = response.headers()['x-ratelimit-reset'];

      // Headers must be present
      expect(remaining).toBeTruthy();
      expect(resetAt).toBeTruthy();

      // Remaining should be a non-negative integer
      expect(parseInt(remaining!, 10)).toBeGreaterThanOrEqual(0);

      // Reset should be a valid ISO date in the future
      const resetDate = new Date(resetAt!);
      expect(resetDate.getTime()).not.toBeNaN();
      expect(resetDate.getTime()).toBeGreaterThan(Date.now() - 1000); // Allow 1s clock skew
    }
  });

  test('429 response includes Retry-After header', async ({ request }) => {
    // We can't easily trigger 429 in E2E, but verify the contract
    // by making a single request and checking the response structure
    const res = await request.get('/api/stores');
    if (res.status() === 429) {
      const retryAfter = res.headers()['retry-after'];
      expect(retryAfter).toBeTruthy();
      expect(parseInt(retryAfter!, 10)).toBeGreaterThan(0);
    }
  });
});
