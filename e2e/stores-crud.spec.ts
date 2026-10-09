/**
 * E2E: Stores CRUD — Full lifecycle test
 *
 * Tests the complete Create → Read → Update → Delete flow for the
 * stores management module, including validation, authorization,
 * and error handling.
 *
 * Prerequisites:
 * - Running dev server (npm run dev)
 * - Seeded admin user (e2e-admin@costpro.test)
 * - Supabase test project with required RPCs deployed
 *
 * SEC-TS-08 (aislamiento): los tests de Update y Delete operan sobre
 * una tienda de PRUEBA creada por el propio spec vía API — NUNCA sobre
 * la primera tarjeta de la lista (que puede ser una tienda real como
 * TIENDA CENTRAL COSTPRO / Puerto Padre / Enervida).
 */
import { test, expect, buildStorePayload, extractStoreId, waitForStoresView } from './fixtures';
import { freshAuthHeaders } from './fixtures/auth.fixture';
// SEC-TS-10: pacing de rate-limit (create 5/min, delete 3/min en /api/stores)
import { waitStoreBudget, freeActiveTestQuota, deleteTestStore as robustDelete } from './fixtures/session.fixture';

// ============================================================================
// ⛔ DESHABILITADO POR EL PROPIETARIO (2026-10-09) — NO ELIMINAR ESTE BLOQUE
// ----------------------------------------------------------------------------
// Este spec CREA tiendas de prueba (CRUD completo sobre /api/stores) en el proyecto Supabase COMPARTIDO (wthkddeleylijmonclxg)
// y fue causa directa de la contaminación de datos del 2026-10-09
// (48 tiendas + 26 usuarios + 6 tenants de prueba; evidencia completa en
// docs/audits/e2e-contamination-cleanup-20261009.md).
//
// Permanece COMENTADO/omitido por defecto. Solo se ejecuta si el propietario
// lo pide EXPLÍCITAMENTE. Para habilitarlo puntualmente:
//   1. Comentar la línea `test.skip(true, ...)` de abajo.
//   2. Ejecutar con E2E_ISOLATION=1 (provisiona entorno aislado efímero con
//      teardown reconciliado) — NUNCA contra tiendas de negocio.
//   3. Verificar net-zero al terminar: node e2e/scripts/data-hygiene-guard.cjs
// ============================================================================
test.skip(true, 'Deshabilitado por el propietario (2026-10-09): crea tiendas. Habilitar solo bajo petición explícita (ver banner).');

const UNIQUE = Date.now().toString(36);

// ── 1. CREATE ──────────────────────────────────────────────────────

test.describe('Stores CRUD: Create', () => {
  test('admin can create a new store via the UI', async ({ authedPage: page }) => {
    // Navigate to stores management
    await page.goto('/?view=stores');
    await waitForStoresView(page);

    // Click the "New Store" action button
    await page.locator('button', { hasText: /nueva|new|crear|create/i }).first().click();

    // Fill in the store creation form
    // SEC-TS-10 (UI REDESIGNADA — quick modal): inputs reales id="quick-name"
    // / id="quick-slug" (sin address/phone — "configura los detalles
    // después"). El submit "Crear Tienda" está DISABLED hasta name≥2 y slug
    // disponible (check-slug debounced 300 ms) → esperar a que habilite.
    const modal = page.getByRole('dialog', { name: /nueva tienda|crear nueva/i });
    await modal.waitFor({ state: 'visible', timeout: 5_000 });

    const nameInput = modal.locator('input[id="quick-name"], input[name="name"], input[id="name"]');
    await nameInput.fill(`E2E Tienda ${UNIQUE}`);

    const slugInput = modal.locator('input[id="quick-slug"], input[name="slug"], input[id="slug"]');
    await slugInput.fill(`e2e_${UNIQUE}`);

    // Submit the form — el botón se habilita cuando el slug pasa check-slug
    // SEC-TS-10 (cuota): liberar cuota activa ANTES del submit — el POST lo
    // hace el BROWSER (sin retry posible) y una cuota llena dejaba el modal
    // abierto con error (reproducido en re-run mini). Se liberan solo
    // test-stores antiguas; pilotos y stores <2 min quedan protegidas.
    await freeActiveTestQuota([]);
    const submitBtn = modal.getByRole('button', { name: /crear tienda/i });
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
    await submitBtn.click();

    // Verify success — modal closes and new store card appears
    await expect(modal).toBeHidden({ timeout: 10_000 });
    // SEC-TS-10: el nombre aparece 2× en la tarjeta (h3 del título + span.sr-only
    // de descripción — ver fix análogo en multi-store 12.4) → aserción sobre el
    // HEADING (elemento visible y único).
    await expect(page.getByRole('heading', { name: `E2E Tienda ${UNIQUE}` })).toBeVisible({ timeout: 10_000 });
  });

  test('create store with missing required fields shows validation error', async ({ authedPage: page }) => {
    await page.goto('/?view=stores');
    await waitForStoresView(page);

    // Open create modal
    await page.locator('button', { hasText: /nueva|new|crear|create/i }).first().click();
    // SEC-TS-10 (UI REDESIGNADA — quick modal): el botón "Crear Tienda"
    // permanece DISABLED con campos requeridos vacíos/inválidos — el submit
    // inválido se PREVIENE en la UI (la validación por toast solo ocurre si
    // el form se envía con canSubmit=false, p.ej. slug ocupado). El contrato
    // actual verificado: sin completar → submit disabled; con slug pero sin
    // nombre → sigue disabled (nombre es requerido).
    const modal = page.getByRole('dialog', { name: /nueva tienda|crear nueva/i });
    await modal.waitFor({ state: 'visible', timeout: 5_000 });

    const submitBtn = modal.getByRole('button', { name: /crear tienda/i });
    await expect(submitBtn).toBeDisabled();

    // Completar SOLO el slug (sin nombre) → el submit sigue disabled
    const slugInput = modal.locator('input[id="quick-slug"], input[name="slug"], input[id="slug"]');
    await slugInput.fill(`e2e_${UNIQUE}`);
    await expect(submitBtn).toBeDisabled();
  });
});

// ── 2. READ ────────────────────────────────────────────────────────

test.describe('Stores CRUD: Read', () => {
  test('stores list loads and displays store cards', async ({ authedPage: page }) => {
    await page.goto('/?view=stores');
    await waitForStoresView(page);

    // Verify at least one store card is rendered
    const storeCards = page.locator('[role="article"]');
    const count = await storeCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('store search filters visible stores', async ({ authedPage: page }) => {
    await page.goto('/?view=stores');
    await waitForStoresView(page);

    // Type a search term into the search bar
    // SEC-TS-10: la SearchBar real de la vista stores renderiza input
    // type="text" con placeholder="Filtrar por nombre o ubicación..."
    // (es.json stores.filterByLocation). NOTA: no usar aria-label*=uscar —
    // el sidebar tiene "Buscar en el menú" ANTES en el DOM y .first()
    // matcheaba el input equivocado. El placeholder de filtrado es único
    // de la vista stores.
    const searchInput = page.locator('input[placeholder*="iltrar"], input[placeholder*="Filter by"]').first();
    await searchInput.fill('ZZZZZZZ_NONEXISTENT');

    // SEC-TS-10 (UI REDESIGNADA): el filtrado es client-side; con 0 matches
    // se renderiza el empty-state exacto "No se encontraron sucursales"
    // (es.json stores.noStores) y ninguna tarjeta [role=article].
    await expect(page.getByText('No se encontraron sucursales')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[role="article"]')).toHaveCount(0);
  });

  test('store card shows key information (name, address)', async ({ authedPage: page }) => {
    await page.goto('/?view=stores');
    await waitForStoresView(page);

    const firstCard = page.locator('[role="article"]').first();
    // Store name should be visible
    await expect(firstCard.locator('h3, [class*="font-black"], [class*="font-bold"]').first()).toBeVisible();
  });
});

// ── 3. UPDATE ──────────────────────────────────────────────────────

test.describe('Stores CRUD: Update', () => {
  test('admin can edit a store name and address (sobre tienda de prueba propia)', async ({ authedPage: page, request }) => {
    // SEC-TS-08: crear tienda de prueba PROPIA vía API y operar SOBRE ELLA.
    // Antes este test editaba la PRIMERA tarjeta de la lista, que puede ser
    // una tienda real → renombraba datos operativos. Aislamiento: nunca más.
    const headers = await freshAuthHeaders('admin');
    test.skip(!headers, 'E2E_TEST_ADMIN_TOKEN not configured');
    const own = `E2E Edit Src ${UNIQUE}`;
    const createRes = await request.post('/api/stores', {
      headers,
      data: buildStorePayload(own),
    });
    test.skip(createRes.status() !== 201, `setup: no se pudo crear tienda propia (${createRes.status()})`);
    // Extracción tolerante (respuesta real: { data: { store_id } } — ver
    // createTestStore en session.fixture)
    const createJson = await createRes.json();
    const ownId = createJson?.data?.store_id ?? createJson?.data?.id ?? createJson?.store_id;

    await page.goto('/?view=stores');
    await waitForStoresView(page);

    // Localizar la tarjeta de la tienda PROPIA (por nombre exacto), no la primera
    const ownCard = page.locator('[role="article"]').filter({ hasText: new RegExp(own.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first();
    await expect(ownCard).toBeVisible({ timeout: 10_000 });
    const editButton = ownCard.locator('button[aria-label*="dit"], button[title*="dit"], button', { hasText: /editar|edit/i }).first();
    await editButton.click();

    // Wait for edit modal
    const modal = page.locator('[role="dialog"], .modal, [data-state="open"]');
    await modal.waitFor({ state: 'visible', timeout: 5_000 });

    // Update the name
    const nameInput = modal.locator('input[name="name"], input[id="name"]');
    await nameInput.clear();
    await nameInput.fill(`E2E Editada ${UNIQUE}`);

    // Submit
    await modal.locator('button[type="submit"], button', { hasText: /guardar|save|actualizar|update/i }).first().click();

    // Verify modal closes and updated name appears
    await expect(modal).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('text=' + `E2E Editada ${UNIQUE}`)).toBeVisible({ timeout: 10_000 });

    // Cleanup: eliminar la tienda de prueba propia
    if (ownId) {
      // SEC-TS-10: cleanup robusto (rate-limit-aware + fallback de archivado)
      await robustDelete(request, headers.Authorization?.replace('Bearer ', '') || '', ownId);
    }
  });
});

// ── 4. DELETE ──────────────────────────────────────────────────────

test.describe('Stores CRUD: Delete', () => {
  test('admin can soft-delete a store (sobre tienda de prueba propia)', async ({ authedPage: page, request }) => {
    // SEC-TS-08: antes este test borraba la PRIMERA tarjeta de la lista —
    // podía soft-deletear una tienda REAL (TIENDA CENTRAL / Puerto Padre /
    // Enervida). Ahora opera exclusivamente sobre una tienda de prueba
    // creada por el propio spec vía API.
    const headers = await freshAuthHeaders('admin');
    test.skip(!headers, 'E2E_TEST_ADMIN_TOKEN not configured');
    const own = `E2E Del Src ${UNIQUE}`;
    const createRes = await request.post('/api/stores', {
      headers,
      data: buildStorePayload(own),
    });
    test.skip(createRes.status() !== 201, `setup: no se pudo crear tienda propia (${createRes.status()})`);
    const createJson = await createRes.json();
    // Extracción tolerante (respuesta real: { data: { store_id } })

    await page.goto('/?view=stores');
    await waitForStoresView(page);

    // Localizar la tarjeta de la tienda PROPIA (por nombre exacto), no la primera
    const ownCard = page.locator('[role="article"]').filter({ hasText: new RegExp(own.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first();
    await expect(ownCard).toBeVisible({ timeout: 10_000 });

    const deleteButton = ownCard.locator('button[aria-label*="liminar"], button[aria-label*="elete"], button', { hasText: /eliminar|delete/i }).first();
    await deleteButton.click();

    // Confirm deletion in the confirmation dialog
    const confirmDialog = page.locator('[role="alertdialog"], [role="dialog"], .modal, [data-state="open"]');
    await confirmDialog.waitFor({ state: 'visible', timeout: 5_000 });

    const confirmButton = confirmDialog.locator('button', { hasText: /confirmar|eliminar|confirm|delete/i }).first();
    await confirmButton.click();

    // Verify the store card is removed from the list
    await expect(ownCard).toBeHidden({ timeout: 10_000 });
  });
});

// ── 5. API-LEVEL CRUD (no UI, direct API calls) ───────────────────

test.describe('Stores CRUD: API Level', () => {
  test('full CRUD cycle via API endpoints', async ({ request }) => {
    const testSlug = `e2e_api_${UNIQUE}`;
    const storePayload = {
      name: `E2E API Tienda ${UNIQUE}`,
      address: `Calle API ${UNIQUE}, La Habana`,
      phone: '+5355550001',
      slug: testSlug,
      plantilla: 'moderna' as const,
    };

    // Note: In a real CI pipeline, the auth token would come from
    // a seeded test user session. For now, we validate the API
    // contract assuming authentication is handled by middleware.

    // CREATE — POST /api/stores
    const createRes = await request.post('/api/stores', {
      data: storePayload,
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
      },
    });

    // Auth middleware will reject unauthenticated requests
    // In CI with proper auth, this would be 201
    if (createRes.status() === 401) {
      test.skip();
      return;
    }

    expect(createRes.status()).toBe(201);
    const createJson = await createRes.json();
    const storeId = extractStoreId(createJson);
    expect(storeId).toBeTruthy();

    // READ — GET /api/stores
    const readRes = await request.get('/api/stores', {
      headers: { Origin: 'http://localhost:3000' },
    });
    expect(readRes.ok()).toBeTruthy();
    const readJson = await readRes.json();
    const found = (readJson.data || []).some((s: { id: string }) => s.id === storeId);
    expect(found).toBeTruthy();

    // UPDATE — PATCH /api/stores
    const updateRes = await request.patch('/api/stores', {
      data: {
        storeId,
        name: `E2E API Updated ${UNIQUE}`,
        address: `Calle Actualizada ${UNIQUE}`,
      },
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
      },
    });
    expect(updateRes.ok()).toBeTruthy();
    const updateJson = await updateRes.json();
    expect(updateJson.data.name).toContain('Updated');

    // DELETE — DELETE /api/stores
    // SEC-TS-10: pacear delete (API: 3/min por usuario)
    await waitStoreBudget('delete');
    const deleteRes = await request.delete('/api/stores', {
      data: { storeId },
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
      },
    });
    expect(deleteRes.ok()).toBeTruthy();

    // Verify deletion — GET again
    const verifyRes = await request.get('/api/stores', {
      headers: { Origin: 'http://localhost:3000' },
    });
    const verifyJson = await verifyRes.json();
    const stillExists = (verifyJson.data || []).some((s: { id: string }) => s.id === storeId);
    expect(stillExists).toBeFalsy(); // Soft-deleted stores are excluded from GET
  });
});

// ── 6. AUTHORIZATION ───────────────────────────────────────────────

test.describe('Stores CRUD: Authorization', () => {
  test('unauthenticated request to GET /api/stores returns 401', async ({ request }) => {
    const res = await request.get('/api/stores');
    expect(res.status()).toBe(401);
  });

  test('unauthenticated POST /api/stores returns 401', async ({ request }) => {
    const res = await request.post('/api/stores', {
      data: { name: 'Unauthorized', address: 'Nowhere' },
    });
    expect(res.status()).toBe(401);
  });

  test('unauthenticated DELETE /api/stores returns 401', async ({ request }) => {
    const res = await request.delete('/api/stores', {
      data: { storeId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status()).toBe(401);
  });
});
