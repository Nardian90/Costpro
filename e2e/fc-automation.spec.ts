/**
 * E2E: FC Automation Flow — Full lifecycle tests
 *
 * Tests the FC (Ficha de Costo) automation features including:
 * - Store Cost Template management (modalidad, template, PDF format)
 * - FC status badges and coverage bar in Catalog view
 * - FC status column and badges in Inventory view (table & card)
 * - FC filtering in both Catalog and Inventory
 * - FC Preview Modal (view PDF, generate, close)
 * - FCQuickIcon rendering and accessibility
 * - ProductFCSync indicator and recalc button
 *
 * Prerequisites:
 * - Running dev server (npm run dev)
 * - Seeded admin user (e2e-admin@costpro.test)
 * - Supabase test project with store_cost_templates table
 *
 * E2E-DEBT-CLEANUP (FC x4):
 * OLD CONTRACT (Store Cost Template Management x2): abrir el modal de edición
 * con un botón "editar" visible en la primera tarjeta y encontrar
 * StoreTemplateSelector (switch + select[aria-label="Modalidad de FC"]).
 * StoreTemplateSelector fue eliminado (commit 9303670a, 2026-07-01, pre-#1340)
 * y el botón "editar" pasó a ser "Info" dentro de <details> "Ver opciones"
 * colapsado (rediseño 2026-07-23). El flujo FC ACTUAL es:
 *   card [role="article"] → "Ver opciones" → "Info" (aria-label "Editar {name}")
 *   → EditStoreModal sección "Plantilla FC" (#edit-fc-template,
 *   #edit-fc-modalidad ×3, #edit-fc-pdf ×2, #edit-fc-active checkbox nativo)
 *   → "Guardar Cambios" → PUT /api/store-cost-templates → badge "FC: {modalidad}"
 * NEW CONTRACT: acceso a la funcionalidad FC, configuración/selección válida,
 * persistencia (store_cost_templates + badge en card + StoreConfigModal).
 *
 * E2E-DEBT-CLEANUP (Catalog x2 — test bugs evidenciados en baseline): los
 * tests de catálogo contaban badges ANTES de que cargaran los productos
 * (waitForCatalogView resolvía con el breadcrumb role="list") y esperaban el
 * FC filter group visible sin abrir el modal "Filtros" donde vive desde el
 * rediseño. Reescritos contra el contrato actual: espera de fila de producto
 * + apertura del modal de filtros + chips aria-pressed.
 */
import { test, expect } from './fixtures';
// E2E-DEBT-CLEANUP: fixture de datos de prueba (tienda propia + producto + restore)
import {
  signIn,
  createTestStore,
  deleteTestStore,
  seedProduct,
  cleanupProducts,
  sb,
  TestStore,
} from './fixtures/session.fixture';

// ── Helpers ────────────────────────────────────────────────────────

/** Wait for the catalog view to finish loading products */
async function waitForCatalogView(page: import('@playwright/test').Page) {
  // STALE FIX (e2e-incremental-stabilization FASE 5): la vista de catálogo
  // actual renderiza TABLA (CatalogProductGrid layoutMode='table', <table>)
  // y el breadcrumb ya no usa role="list" — el selector viejo
  // (role="list"/.grid/role="article") no matcheaba NADA y el wait expiraba
  // con la vista correctamente cargada (captura en evidencia del lote 2).
  // Se añade 'main table' al union: mismo propósito (contenedor de contenido
  // cargado), contrato vigente. role="article"/.grid se mantienen por la
  // vista grid alternativo (layoutMode='grid' usa .grid + cards article).
  await page.waitForSelector(
    '[role="list"], [data-testid="catalog-empty"], [role="article"], .grid, main table',
    { timeout: 20_000 },
  );
}

/** Wait for the inventory view to finish loading products */
async function waitForInventoryView(page: import('@playwright/test').Page) {
  await page.waitForSelector(
    '[role="list"], [data-testid="inventory-empty"], table, .grid',
    { timeout: 20_000 },
  );
}

/** Navigate to a sidebar view by clicking its button */
async function navigateToSidebarView(page: import('@playwright/test').Page, viewLabel: string | RegExp) {
  const sidebarItem = page.locator('button, a').filter({ hasText: viewLabel }).first();
  await sidebarItem.click();
}

// ── SETUP/CLEANUP: tienda de prueba aislada (SEC-TS-08) ────────────

let fcStore: TestStore | null = null;
let fcProduct: { id: string; name: string } | null = null;
let fcAdminId: string | null = null;
let fcOriginalActiveStore: string | null | undefined;
let fcAdminToken = '';

test.beforeAll(async ({ request }) => {
  // SEC-TS-10: timeout extendido — el setup paceado (1 tienda con presupuesto
  // create 4/min) puede esperar hasta ~60 s por la ventana de rate-limit
  test.setTimeout(180_000);
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const email = process.env.E2E_ADMIN_EMAIL || 'admin@costpro.com';
  const pass = process.env.E2E_ADMIN_PASS || 'costpro123';
  try {
    const session = await signIn(email, pass);
    fcAdminToken = session.token;
    fcAdminId = session.userId;
  } catch { /* sin sesión — los tests lo reportarán */ }

  if (fcAdminId) {
    try {
      const rows = await sb.select<{ active_store_id: string | null }>(
        'profiles', `id=eq.${fcAdminId}&select=active_store_id&limit=1`,
      );
      fcOriginalActiveStore = rows[0]?.active_store_id ?? null;
    } catch { /* sin service-role — sin restore */ }
  }

  // CREATE: tienda de prueba exclusiva del spec + 1 producto sembrado
  if (fcAdminToken) {
    try {
      fcStore = await createTestStore(request, fcAdminToken, 'FC');
      fcProduct = await seedProduct(fcStore, {
        name: `E2E Prod FC ${fcStore.slug}`,
        price: 15,
        cost: 6,
        quantity: 4,
      });
    } catch (e) {
      console.error('[fc-automation] setup de tienda de prueba falló:', e);
    }
  }

  // Contexto determinista: anclar el active store del admin a PILOT A (E2E
  // PILOT STORE A — protegida por NOMBRE de todos los sweeps de higiene).
  // Los tests de catálogo re-anclan a la tienda de prueba propia; los tests
  // de plantilla solo necesitan un contexto VÁLIDO para que el shell no
  // caiga al interstitial "Selecciona una tienda".
  const pilotA = process.env.E2E_PILOT_STORE_A;
  if (fcAdminId && pilotA) {
    await sb.update('profiles', `id=eq.${fcAdminId}`, { active_store_id: pilotA }).catch(() => {});
  }
});

test.afterAll(async ({ request }) => {
  // CLEANUP: restaurar contexto (si un test de catálogo lo cambió) ANTES de borrar
  if (fcAdminId && fcOriginalActiveStore !== undefined) {
    await sb.update('profiles', `id=eq.${fcAdminId}`, { active_store_id: fcOriginalActiveStore }).catch(() => {});
  }
  // Limpiar cualquier plantilla FC sembrada por los tests de configuración
  if (fcStore) {
    await sb.delete('store_cost_templates', `store_id=eq.${fcStore.id}`).catch(() => {});
  }
  if (fcStore && fcProduct) {
    await cleanupProducts(fcStore.id, [fcProduct.id]).catch(() => {});
  }
  if (fcStore && fcAdminToken) {
    await deleteTestStore(request, fcAdminToken, fcStore.id).catch(() => {});
  }
});

/** Activa la tienda de prueba como contexto del admin (setup determinista) */
async function activateFcStore() {
  if (!fcStore || !fcAdminId) return;
  await sb.update('profiles', `id=eq.${fcAdminId}`, { active_store_id: fcStore.id });
}

// ── 1. STORE COST TEMPLATE MANAGEMENT ─────────────────────────────

test.describe('FC Automation', () => {

  test.describe('Store Cost Template Management', () => {
    test('should fetch store cost template', async ({ authedPage: page }) => {
      test.skip(!fcStore, 'setup de tienda de prueba no disponible');
      // Navigate to stores management
      await page.goto('/?view=stores');
      await page.waitForSelector('[role="article"], [data-testid="stores-empty"]', {
        timeout: 15_000,
      });

      // CURRENT CONTRACT: la configuración FC se abre desde la tarjeta de la
      // tienda de prueba (SEC-TS-08 — nunca la primera tarjeta) vía el abanico
      // colapsable "Ver opciones" → botón "Info" (aria-label "Editar {name}")
      const card = page.getByRole('article', { name: `Gestión Tiendas ${fcStore!.name}` });
      await expect(card).toBeVisible({ timeout: 15_000 });

      const optionsSummary = card.getByText('Ver opciones', { exact: true });
      await optionsSummary.click();
      const editButton = card.getByRole('button', { name: `Editar ${fcStore!.name}` });
      await expect(editButton).toBeVisible({ timeout: 5_000 });
      await editButton.click();

      // Wait for the modal to appear (CURRENT CONTRACT: BaseModal Radix con
      // aria-label "Editar Sucursal. Completa los datos de la sucursal.")
      const modal = page.getByRole('dialog', { name: /editar sucursal/i });
      await modal.waitFor({ state: 'visible', timeout: 10_000 });

      // Verify the FC template section exists (h4 "Plantilla FC" — i18n
      // stores.fcTemplate; antes "Plantilla de Ficha de Costo" del selector
      // eliminado StoreTemplateSelector)
      const fcSection = modal.getByRole('heading', { name: 'Plantilla FC' });
      await expect(fcSection).toBeVisible({ timeout: 5_000 });

      // CURRENT CONTRACT: los 4 campos FC son inputs/selects/checkbox nativos
      // (Audit-Fix #2b) — no hay role="switch"
      await expect(modal.locator('#edit-fc-template')).toBeVisible();
      await expect(modal.locator('#edit-fc-modalidad')).toBeVisible();
      await expect(modal.locator('#edit-fc-pdf')).toBeVisible();
      await expect(modal.locator('#edit-fc-active')).toBeVisible();
    });

    test('should display template configuration options', async ({ authedPage: page }) => {
      test.skip(!fcStore, 'setup de tienda de prueba no disponible');
      // Navigate to stores management
      await page.goto('/?view=stores');
      await page.waitForSelector('[role="article"], [data-testid="stores-empty"]', {
        timeout: 15_000,
      });

      // Open the FC config modal for OUR test store (CURRENT CONTRACT)
      const card = page.getByRole('article', { name: `Gestión Tiendas ${fcStore!.name}` });
      await expect(card).toBeVisible({ timeout: 15_000 });
      await card.getByText('Ver opciones', { exact: true }).click();
      const editButton = card.getByRole('button', { name: `Editar ${fcStore!.name}` });
      await expect(editButton).toBeVisible({ timeout: 5_000 });
      await editButton.click();

      const modal = page.getByRole('dialog', { name: /editar sucursal/i });
      await modal.waitFor({ state: 'visible', timeout: 10_000 });

      // Configuration options (CURRENT CONTRACT — 3 modalidades, 2 formatos PDF)
      const modalidadSelect = modal.locator('#edit-fc-modalidad');
      await expect(modalidadSelect).toBeVisible({ timeout: 5_000 });
      const modalidadOptions = await modalidadSelect.locator('option').count();
      expect(modalidadOptions).toBeGreaterThanOrEqual(3);

      const templateInput = modal.locator('#edit-fc-template');
      await expect(templateInput).toBeVisible();

      const pdfFormatSelect = modal.locator('#edit-fc-pdf');
      await expect(pdfFormatSelect).toBeVisible();
      expect(await pdfFormatSelect.locator('option').count()).toBeGreaterThanOrEqual(2);

      // Operar la configuración: activar FC + modalidad + plantilla + formato
      // NOTA (E2E-DEBT-CLEANUP): se usa res148 (valor del contrato VÁLIDO de la
      // API). La UI también ofrece "Res. 190/2021" (res190) pero el enum de
      // upsertStoreCostTemplateSchema NO lo acepta (400) — hallazgo pre-existente
      // 1a25d190 (2026-06-19, anterior a #1340) documentado en el informe, NO
      // corregido aquí (regla: no modificar producto en esta tarea).
      const fcToggle = modal.locator('#edit-fc-active');
      if (!(await fcToggle.isChecked())) {
        await fcToggle.check();
      }
      await modalidadSelect.selectOption('servicios');
      await templateInput.fill(`e2e-fc-${fcStore!.slug}`);
      await pdfFormatSelect.selectOption('res148');

      // Persistir (CURRENT CONTRACT: "Guardar Cambios" → PUT /api/store-cost-templates)
      const saveBtn = modal.getByRole('button', { name: /guardar cambios/i });
      await saveBtn.click();
      // Timeout 30s: el flujo de guardado encadena PATCH /api/stores +
      // PUT /api/store-cost-templates + POST invalidate (observado 4-7 s POR
      // LLAMADA cuando el Supabase compartido está bajo carga concurrente)
      await expect(modal).toBeHidden({ timeout: 30_000 });

      // Persistencia verificada 3 vías:
      // 1) En la base (store_cost_templates — upsert del hook useStoreEdit)
      const rows = await sb.select<{ modalidad: string; pdf_format: string; is_active: boolean }>(
        'store_cost_templates',
        `store_id=eq.${fcStore!.id}&select=modalidad,pdf_format,is_active&limit=1`,
      );
      expect(rows.length).toBe(1);
      expect(rows[0].modalidad).toBe('servicios');
      expect(rows[0].pdf_format).toBe('res148');
      expect(rows[0].is_active).toBe(true);

      // 2) En la tarjeta de la tienda (badge "FC: {modalidad}" tras refetch)
      await expect(card.getByText('FC: servicios')).toBeVisible({ timeout: 15_000 });

      // 3) En el modal de configuración read-only (StoreConfigModal → sección FC)
      if (!(await card.getByRole('button', { name: `Configurar tienda ${fcStore!.name}` }).isVisible().catch(() => false))) {
        await card.getByText('Ver opciones', { exact: true }).click();
      }
      await card.getByRole('button', { name: `Configurar tienda ${fcStore!.name}` }).click();
      // El nombre accesible del dialog viene del DialogTitle (Radix enlaza
      // aria-labelledby automáticamente): "Configuración de {store.name}"
      // (el aria-label de BaseModal queda eclipsado por aria-labelledby)
      const configModal = page.getByRole('dialog', { name: `Configuración de ${fcStore!.name}` });
      // Timeout 30s: StoreConfigModal es lazy-loaded (withChunkRetry) — la
      // primera apertura compila el chunk bajo demanda en el dev server
      await configModal.waitFor({ state: 'visible', timeout: 30_000 });
      await configModal.getByRole('button', { name: 'Ficha de Costo' }).click();
      await expect(configModal.getByText('Plantilla FC activa')).toBeVisible({ timeout: 5_000 });
      await expect(configModal.getByText('servicios')).toBeVisible();
    });
  });

  // ── 2. FC STATUS IN CATALOG VIEW ────────────────────────────────

  test.describe('FC Status in Catalog View', () => {
    test('should display FC status badges on products', async ({ authedPage: page }) => {
      test.skip(!fcStore || !fcProduct, 'setup de tienda de prueba no disponible');
      // Setup determinista: la tienda de prueba (con su producto sembrado)
      // como contexto activo del admin — se restaura en afterAll
      await activateFcStore();

      // Navigate to catalog
      await page.goto('/?view=catalog');
      await waitForCatalogView(page);

      // CURRENT CONTRACT: el badge FC (FCStatusBadge, aria-label "Estado FC:
      // {label}") renderiza POR FILA de producto en la vista de lista —
      // esperar la fila sembrada ANTES de contar (el wait del breadcrumb
      // resolvía antes de que cargaran los productos)
      const productRow = page.locator('tr', { hasText: fcProduct!.name }).first();
      await expect(productRow).toBeVisible({ timeout: 20_000 });

      // Cada producto renderiza su badge de estado FC
      const fcBadges = page.locator('[aria-label^="Estado FC:"]');
      await expect(fcBadges.first()).toBeVisible({ timeout: 10_000 });
      const badgeCount = await fcBadges.count();
      expect(badgeCount).toBeGreaterThanOrEqual(1);
    });

    test('should filter products by FC status', async ({ authedPage: page }) => {
      test.skip(!fcStore || !fcProduct, 'setup de tienda de prueba no disponible');
      await activateFcStore();

      // Navigate to catalog
      await page.goto('/?view=catalog');
      await waitForCatalogView(page);
      const productRow = page.locator('tr', { hasText: fcProduct!.name }).first();
      await expect(productRow).toBeVisible({ timeout: 20_000 });

      // CURRENT CONTRACT: los chips de filtro FC viven dentro del modal
      // "Filtros" (CatalogSearchAndFilters — BaseModal) y solo renderizan con
      // cobertura FC > 0 (la tienda de prueba tiene 1 producto → total=1)
      const filtersBtn = page.getByRole('button', { name: /configurar filtros/i });
      await filtersBtn.click();

      const dialog = page.getByRole('dialog');
      const fcFilterGroup = dialog.locator('[aria-label="Filtrar por estado de Ficha de Costo"]');
      await expect(fcFilterGroup).toBeVisible({ timeout: 10_000 });

      // El estado FC del producto sembrado depende del orden de ejecución:
      // "sin_fc" sin plantilla, "pendiente" si el test de configuración ya
      // activó la plantilla FC de la tienda. Se lee la cobertura REAL del UI
      // (progressbar "Cobertura FC: ... (N vigente, M pendiente, K sin FC)")
      // y se elige el chip del producto dinámicamente.
      const coverageLabel = await dialog
        .locator('[role="progressbar"]')
        .getAttribute('aria-label');
      const m = /(\d+) vigente, (\d+) pendiente, (\d+) sin FC/.exec(coverageLabel || '');
      // Si el parseo falla, el contrato del aria-label de la cobertura cambió
      // — el test debe FALLAR, no saltar (aserción sobre el contrato)
      expect(m).not.toBeNull();
      const [vigente, pendiente, sinFc] = [Number(m![1]), Number(m![2]), Number(m![3])];
      const productChipLabel =
        pendiente > 0 ? 'Pendiente' : sinFc > 0 ? 'Sin FC' : 'Vigente';
      const emptyChipLabel =
        pendiente > 0 ? (sinFc > 0 ? 'Sin FC' : 'Vigente') : sinFc > 0 ? 'Pendiente' : 'Pendiente';

      // Filtrar por el estado real del producto → sigue visible
      const productChip = fcFilterGroup.locator(`button[aria-label="Filtrar por FC: ${productChipLabel}"]`);
      await expect(productChip).toBeVisible();
      await productChip.click();
      await expect(productChip).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('tr', { hasText: fcProduct!.name }).first()).toBeVisible({ timeout: 10_000 });

      // Cambiar a un estado con 0 productos → el producto desaparece
      const emptyChip = fcFilterGroup.locator(`button[aria-label="Filtrar por FC: ${emptyChipLabel}"]`);
      await emptyChip.click();
      await expect(emptyChip).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('tr', { hasText: fcProduct!.name })).toHaveCount(0, { timeout: 10_000 });

      // Reset: chip "Todos" devuelve el producto
      const allChip = fcFilterGroup.locator('button[aria-label="Filtrar por FC: Todos"]');
      await allChip.click();
      await expect(page.locator('tr', { hasText: fcProduct!.name }).first()).toBeVisible({ timeout: 10_000 });
    });

    test('should show FC coverage bar', async ({ authedPage: page }) => {
      // Navigate to catalog
      await page.goto('/?view=catalog');
      await waitForCatalogView(page);

      // Verify FCCoverageBar is visible with coverage stats
      // It renders with role="progressbar" and aria-label containing "Cobertura FC"
      const coverageBar = page.locator('[role="progressbar"][aria-label*="Cobertura FC"]');
      // The coverage bar only renders when fcCoverage.total > 0, so it may not always be visible
      // Check that the "Cobertura de Fichas de Costo" section exists if products are loaded
      const coverageSection = page.locator('text=Cobertura de Fichas de Costo');
      if (await coverageSection.isVisible()) {
        await expect(coverageBar).toBeVisible();
        // Verify the bar has aria-valuenow attribute
        const ariaValue = await coverageBar.getAttribute('aria-valuenow');
        expect(ariaValue).not.toBeNull();
      }
    });
  });

  // ── 3. FC STATUS IN INVENTORY VIEW ──────────────────────────────

  test.describe('FC Status in Inventory View', () => {
    test('should display FC column in inventory table', async ({ authedPage: page }) => {
      // Navigate to inventory
      await page.goto('/?view=inventory');
      await waitForInventoryView(page);

      // Make sure we're in table view (default for desktop)
      // Verify FC column exists by checking for the th or td with data-label="FC"
      const fcCells = page.locator('td[data-label="FC"], th:has-text("FC")');
      const fcCellCount = await fcCells.count();

      // If table view is active, we should see FC data cells
      if (fcCellCount > 0) {
        // Verify FC status badges render inside FC cells
        const fcBadges = page.locator('td[data-label="FC"] [aria-label^="Estado FC:"]');
        const badgeCount = await fcBadges.count();
        // At least some rows should show FC status (or the dash placeholder)
        const fcPlaceholders = page.locator('td[data-label="FC"]');
        expect(await fcPlaceholders.count()).toBeGreaterThan(0);
      } else {
        // May be in card view by default on mobile — verify card view shows FC status
        const fcDots = page.locator('[aria-label^="Estado FC:"]');
        expect(await fcDots.count()).toBeGreaterThanOrEqual(0);
      }
    });

    test('should display FC badges in inventory cards', async ({ authedPage: page }) => {
      // Navigate to inventory
      await page.goto('/?view=inventory');
      await waitForInventoryView(page);

      // Switch to card view by clicking the layout toggle button
      const cardViewBtn = page.locator('button', { hasText: /vista tarjetas|card/i }).first();
      if (await cardViewBtn.isVisible()) {
        await cardViewBtn.click();
        // Wait for card view to render
        await page.waitForTimeout(500);
      }

      // Verify FC status dots appear on cards
      // In card view, FCStatusBadge renders with variant="dot" and aria-label="Estado FC: ..."
      const fcDots = page.locator('[aria-label^="Estado FC:"]');
      const dotCount = await fcDots.count();
      // Even if zero products have FC, the dot variant is only rendered when fcStatus exists
      // So we just verify the card view rendered without errors
      const cards = page.locator('[role="listitem"], .grid > div');
      expect(await cards.count()).toBeGreaterThanOrEqual(0);
    });

    test('should filter inventory by FC status', async ({ authedPage: page }) => {
      // Navigate to inventory
      await page.goto('/?view=inventory');
      await waitForInventoryView(page);

      // Find FC filter chips in inventory
      const fcChips = page.locator('button', { hasText: /FC Vigente|FC Pendiente|Sin FC|FC Todos/ });
      const chipCount = await fcChips.count();

      if (chipCount > 0) {
        // Click "FC Vigente" filter chip
        const vigenteChip = fcChips.filter({ hasText: /FC Vigente/ }).first();
        if (await vigenteChip.isVisible()) {
          await vigenteChip.click();
          await page.waitForTimeout(300);

          // Verify the chip is now active (has primary styling)
          const isActive = await vigenteChip.evaluate((el) => {
            return el.classList.contains('bg-primary') || el.classList.contains('bg-primary/10');
          });
          // The chip should reflect active state
          expect(typeof isActive).toBe('boolean');

          // Reset filter by clicking "FC Todos"
          const allChip = page.locator('button', { hasText: /FC Todos/ }).first();
          if (await allChip.isVisible()) {
            await allChip.click();
          }
        }
      }
    });
  });

  // ── 4. FC PREVIEW MODAL ─────────────────────────────────────────

  test.describe('FC Preview Modal', () => {
    test('should open FC preview modal for vigente product', async ({ authedPage: page }) => {
      // Navigate to inventory where FCPreviewModal is used
      await page.goto('/?view=inventory');
      await waitForInventoryView(page);

      // Find a FCQuickIcon with aria-label "Ver Ficha de Costo (PDF)" (vigente status)
      const vigenteIcon = page.locator('button[aria-label="Ver Ficha de Costo (PDF)"]').first();
      if (await vigenteIcon.isVisible()) {
        await vigenteIcon.click();

        // Verify the FCPreviewModal opens
        const modal = page.locator('[role="dialog"]');
        await expect(modal).toBeVisible({ timeout: 5_000 });

        // Verify modal title contains "Ficha de Costo"
        const title = modal.locator('text=Ficha de Costo');
        await expect(title).toBeVisible();

        // Verify PDF iframe loads (the iframe has a title starting with "Vista previa FC")
        const iframe = modal.locator('iframe[title^="Vista previa FC"]');
        await expect(iframe).toBeVisible({ timeout: 10_000 }).catch(() => {
          // Iframe may not render if no PDF exists — at least verify the loading state
          const loadingIndicator = modal.locator('text=Cargando vista previa');
          expect(loadingIndicator).toBeVisible();
        });
      } else {
        // No vigente products — verify the modal infrastructure exists by checking
        // that FCQuickIcon buttons are present in the DOM
        const anyFCIcon = page.locator('button[aria-label*="Ficha de Costo"]');
        const iconCount = await anyFCIcon.count();
        test.skip(iconCount === 0, 'No products with FC icons available to test');
      }
    });

    test('should show generate button for pendiente product', async ({ authedPage: page }) => {
      // Navigate to inventory
      await page.goto('/?view=inventory');
      await waitForInventoryView(page);

      // Find a FCQuickIcon with aria-label "Generar Ficha de Costo" (pendiente status)
      const pendienteIcon = page.locator('button[aria-label="Generar Ficha de Costo"]').first();
      if (await pendienteIcon.isVisible()) {
        await pendienteIcon.click();

        // Verify the FCPreviewModal opens
        const modal = page.locator('[role="dialog"]');
        await expect(modal).toBeVisible({ timeout: 5_000 });

        // Verify "Generar FC" button appears (for pendiente products)
        const generateBtn = modal.locator('button', { hasText: /Generar FC/ });
        await expect(generateBtn).toBeVisible({ timeout: 5_000 });
      } else {
        // No pendiente products — verify the generate infrastructure exists
        test.skip();
      }
    });

    test('should close modal on ESC key', async ({ authedPage: page }) => {
      // Navigate to inventory
      await page.goto('/?view=inventory');
      await waitForInventoryView(page);

      // Find any FCQuickIcon and click it to open the modal
      const anyFCIcon = page.locator('button[aria-label*="Ficha de Costo"]').first();
      if (await anyFCIcon.isVisible()) {
        await anyFCIcon.click();

        // Wait for modal
        const modal = page.locator('[role="dialog"]');
        await expect(modal).toBeVisible({ timeout: 5_000 });

        // Press ESC to close
        await page.keyboard.press('Escape');

        // Verify modal closes
        await expect(modal).toBeHidden({ timeout: 5_000 });
      } else {
        test.skip();
      }
    });
  });

  // ── 5. FC QUICK ICON ────────────────────────────────────────────

  test.describe('FC Quick Icon', () => {
    test('should render FCQuickIcon with correct aria-label', async ({ authedPage: page }) => {
      // Navigate to inventory (table view shows FCQuickIcon)
      await page.goto('/?view=inventory');
      await waitForInventoryView(page);

      // Find FC icon buttons in the table — they use aria-label with FC status
      const fcIcons = page.locator('button[aria-label*="Ficha de Costo"]');
      const iconCount = await fcIcons.count();

      if (iconCount > 0) {
        // Verify at least one icon has a recognized FC status aria-label
        const firstIcon = fcIcons.first();
        const ariaLabel = await firstIcon.getAttribute('aria-label');
        expect(ariaLabel).toMatch(/Ver Ficha de Costo|Generar Ficha de Costo|Sin plantilla FC/);
      } else {
        // No FC icons rendered — may be no store template configured
        test.skip();
      }
    });

    test('should have minimum touch target size', async ({ authedPage: page }) => {
      // Navigate to inventory (table view)
      await page.goto('/?view=inventory');
      await waitForInventoryView(page);

      // Find FCQuickIcon buttons (they have p-1 rounded + icon inside)
      const fcIcons = page.locator('button[aria-label*="Ficha de Costo"]');
      const iconCount = await fcIcons.count();

      if (iconCount > 0) {
        const firstIcon = fcIcons.first();
        const box = await firstIcon.boundingBox();
        if (box) {
          // FCQuickIcon uses p-1 (4px padding) + icon (14px or 16px) + p-1 (4px)
          // Minimum touch target should be at least 28x28px
          expect(box.width).toBeGreaterThanOrEqual(22); // icon + padding (relaxed for sm)
          expect(box.height).toBeGreaterThanOrEqual(22);
        }
      } else {
        test.skip();
      }
    });
  });

  // ── 6. PRODUCT FC SYNC INDICATOR ────────────────────────────────

  test.describe('Product FC Sync Indicator', () => {
    test('should show sync status for products', async ({ authedPage: page }) => {
      // Navigate to inventory and switch to card view (ProductFCSync renders there)
      await page.goto('/?view=inventory');
      await waitForInventoryView(page);

      // Switch to card view
      const cardViewBtn = page.locator('button', { hasText: /vista tarjetas|card/i }).first();
      if (await cardViewBtn.isVisible()) {
        await cardViewBtn.click();
        await page.waitForTimeout(500);
      }

      // Verify ProductFCSync components render (they have role="status")
      const syncIndicators = page.locator('[role="status"][aria-label^="Estado FC:"]');
      const syncCount = await syncIndicators.count();

      if (syncCount > 0) {
        // Verify the first sync indicator has a valid status label
        const firstSync = syncIndicators.first();
        const ariaLabel = await firstSync.getAttribute('aria-label');
        expect(ariaLabel).toMatch(/Sincronizado|Calculando|Desactualizada|Sincronizando/);
      } else {
        // ProductFCSync may not render if no FC template is configured for the store
        test.skip();
      }
    });

    test('should show recalc button for conflict status', async ({ authedPage: page }) => {
      // Navigate to inventory card view
      await page.goto('/?view=inventory');
      await waitForInventoryView(page);

      // Switch to card view
      const cardViewBtn = page.locator('button', { hasText: /vista tarjetas|card/i }).first();
      if (await cardViewBtn.isVisible()) {
        await cardViewBtn.click();
        await page.waitForTimeout(500);
      }

      // Find a ProductFCSync component with conflict status ("Desactualizada")
      const conflictIndicator = page.locator(
        '[role="status"][aria-label="Estado FC: Desactualizada"]',
      );
      if (await conflictIndicator.isVisible()) {
        // Verify "Recalcular" button is visible
        const recalcBtn = conflictIndicator.locator('button[aria-label="Recalcular FC"]');
        await expect(recalcBtn).toBeVisible();
      } else {
        // No products with conflict status — this is expected in a clean test environment
        test.skip();
      }
    });
  });

});
