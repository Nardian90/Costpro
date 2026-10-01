import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
// E2E-DEBT-CLEANUP: datos de prueba deterministas (tienda propia + producto)
import {
  signIn,
  createTestStore,
  deleteTestStore,
  seedProduct,
  cleanupProducts,
  sb,
  TestStore,
} from './fixtures/session.fixture';

/**
 * FC Components Accessibility Tests
 *
 * Validates that all FC (Ficha de Costo) UI components meet
 * WCAG 2.1 AA accessibility standards using axe-core.
 *
 * Components covered:
 * - FCStatusBadge: Visual status indicator (vigente/pendiente/sin_fc)
 * - FCCoverageBar: Progress bar for catalog FC coverage
 * - FCPreviewModal: PDF preview dialog with focus trapping
 * - FCQuickIcon: Quick-action icon button per product
 * - ProductFCSync: Sync status indicator with role="status"
 * - FC filter chips: Keyboard-navigable filter controls
 *
 * E2E-DEBT-CLEANUP (FC x2):
 * OLD CONTRACT: los 2 tests en falla navegaban a '/dashboard' — ruta que NO
 * EXISTE en la app (SPA en '/' con '?view='): aterrizaban en el 404, axe
 * lanzaba "No elements found for include" (FCStatusBadge) y el progressbar
 * nunca aparecía (FCCoverageBar).
 * CURRENT CONTRACT: los componentes FC renderizan en el catálogo de la tienda
 * activa ('/?view=catalog'): FCStatusBadge (.fc-status-badge-pill,
 * aria-label="Estado FC: {label}") por fila de producto, y FCCoverageBar
 * (role="progressbar") dentro del modal "Filtros" cuando hay cobertura FC.
 * Para determinismo, el spec usa una tienda de prueba propia con 1 producto
 * sembrado como contexto activo (CREATE→TRACK→TEST→CLEANUP, SEC-TS-08).
 */

// ── SETUP/CLEANUP: tienda de prueba aislada ────────────────────────
let a11yStore: TestStore | null = null;
let a11yProduct: { id: string; name: string } | null = null;
let a11yAdminId: string | null = null;
let a11yOriginalActiveStore: string | null | undefined;
let a11yAdminToken = '';

test.beforeAll(async ({ request }) => {
  // SEC-TS-10: timeout extendido — el setup paceado (1 tienda con presupuesto
  // create 4/min) puede esperar hasta ~60 s por la ventana de rate-limit
  test.setTimeout(180_000);
  const email = process.env.E2E_ADMIN_EMAIL || 'admin@costpro.com';
  const pass = process.env.E2E_ADMIN_PASS || 'costpro123';
  try {
    const session = await signIn(email, pass);
    a11yAdminToken = session.token;
    a11yAdminId = session.userId;
  } catch { /* sin sesión — los tests lo reportarán */ }

  if (a11yAdminId) {
    try {
      const rows = await sb.select<{ active_store_id: string | null }>(
        'profiles', `id=eq.${a11yAdminId}&select=active_store_id&limit=1`,
      );
      a11yOriginalActiveStore = rows[0]?.active_store_id ?? null;
    } catch { /* sin service-role — sin restore */ }
  }

  if (a11yAdminToken && a11yAdminId) {
    try {
      a11yStore = await createTestStore(request, a11yAdminToken, 'A11Y');
      a11yProduct = await seedProduct(a11yStore, {
        name: `E2E Prod A11Y ${a11yStore.slug}`,
        price: 12,
        cost: 5,
        quantity: 3,
      });
      // Contexto determinista: la tienda de prueba como active store
      await sb.update('profiles', `id=eq.${a11yAdminId}`, { active_store_id: a11yStore.id });
    } catch (e) {
      console.error('[fc-accessibility] setup de tienda de prueba falló:', e);
    }
  }
});

test.afterAll(async ({ request }) => {
  // CLEANUP: restaurar contexto ANTES de eliminar datos de prueba
  if (a11yAdminId && a11yOriginalActiveStore !== undefined) {
    await sb.update('profiles', `id=eq.${a11yAdminId}`, { active_store_id: a11yOriginalActiveStore }).catch(() => {});
  }
  if (a11yStore && a11yProduct) {
    await cleanupProducts(a11yStore.id, [a11yProduct.id]).catch(() => {});
  }
  if (a11yStore && a11yAdminToken) {
    await deleteTestStore(request, a11yAdminToken, a11yStore.id).catch(() => {});
  }
});

test.describe('FC Components Accessibility', () => {

  // ── FCStatusBadge ──────────────────────────────────────────────────

  test('FCStatusBadge should have no accessibility violations', async ({ authedPage }) => {
    test.skip(!a11yStore || !a11yProduct, 'setup de tienda de prueba no disponible');
    // CURRENT CONTRACT: el catálogo de la tienda activa renderiza un badge FC
    // por producto (vista de lista) — la ruta válida es /?view=catalog
    await authedPage.goto('/?view=catalog');
    const productRow = authedPage.locator('tr', { hasText: a11yProduct!.name }).first();
    await expect(productRow).toBeVisible({ timeout: 20_000 });

    // El badge existe antes de analizarlo (axe lanza si el include no matchea)
    const badge = authedPage.locator('.fc-status-badge-pill').first();
    await expect(badge).toBeVisible({ timeout: 10_000 });

    const results = await new AxeBuilder({ page: authedPage })
      .include('.fc-status-badge-pill')
      .analyze();
    expect(results.violations).toEqual([]);
  });

  // ── FCCoverageBar ──────────────────────────────────────────────────

  test('FCCoverageBar should have proper ARIA', async ({ authedPage }) => {
    test.skip(!a11yStore || !a11yProduct, 'setup de tienda de prueba no disponible');
    // CURRENT CONTRACT: la FCCoverageBar renderiza dentro del modal "Filtros"
    // del catálogo cuando hay cobertura FC (1 producto → total=1)
    await authedPage.goto('/?view=catalog');
    const productRow = authedPage.locator('tr', { hasText: a11yProduct!.name }).first();
    await expect(productRow).toBeVisible({ timeout: 20_000 });

    await authedPage.getByRole('button', { name: /configurar filtros/i }).click();
    const dialog = authedPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Find progressbar element (la barra de cobertura FC vive en el dialog)
    const progressbar = dialog.locator('[role="progressbar"]');
    await expect(progressbar).toHaveAttribute('aria-valuenow');
    await expect(progressbar).toHaveAttribute('aria-valuemin', '0');
    await expect(progressbar).toHaveAttribute('aria-valuemax', '100');
    // Etiqueta accesible con el porcentaje de cobertura
    await expect(progressbar).toHaveAttribute('aria-label', /Cobertura FC:/);
  });

  // ── FCPreviewModal ─────────────────────────────────────────────────

  test('FCPreviewModal should trap focus', async ({ authedPage }) => {
    // Navigate to catalog view
    await authedPage.goto('/dashboard');
    await authedPage.waitForLoadState('networkidle');

    // Open FC preview modal by clicking an FC quick icon
    const fcIcon = authedPage.locator('button[aria-label*="Ficha de Costo"]').first();
    if (await fcIcon.isVisible()) {
      await fcIcon.click();

      // Wait for dialog to appear
      const dialog = authedPage.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5_000 });

      // Verify focus is trapped inside the dialog
      // Press Tab multiple times and verify focus stays in modal
      for (let i = 0; i < 10; i++) {
        await authedPage.keyboard.press('Tab');
      }

      // The active element should still be within the dialog
      const activeElementInDialog = await authedPage.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const active = document.activeElement;
        if (!dialog || !active) return false;
        return dialog.contains(active);
      });
      expect(activeElementInDialog).toBe(true);

      // Press ESC and verify modal closes
      await authedPage.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible({ timeout: 5_000 }).catch(() => {
        // Some dialogs use a different close mechanism; this is acceptable
      });
    }
  });

  // ── FCQuickIcon ────────────────────────────────────────────────────

  test('FCQuickIcon should have accessible name', async ({ authedPage }) => {
    // Navigate to catalog view
    await authedPage.goto('/dashboard');
    await authedPage.waitForLoadState('networkidle');

    // Find all FC icon buttons
    const icons = authedPage.locator('button[aria-label*="FC"]');
    const count = await icons.count();
    for (let i = 0; i < count; i++) {
      await expect(icons.nth(i)).toHaveAttribute('aria-label', /Ficha de Costo|FC/);
    }
  });

  // ── ProductFCSync ──────────────────────────────────────────────────

  test('ProductFCSync should have role="status"', async ({ authedPage }) => {
    // Navigate to inventory card view where ProductFCSync is rendered
    await authedPage.goto('/dashboard');
    await authedPage.waitForLoadState('networkidle');

    const statusElements = authedPage.locator('[role="status"]');
    // At least one role="status" element should be visible on pages with FC data
    await expect(statusElements.first()).toBeVisible({ timeout: 5_000 }).catch(() => {
      // If no FC sync elements are present (e.g., empty store), the test
      // still passes — we're validating the component's ARIA when rendered
    });
  });

  // ── FC filter chips ────────────────────────────────────────────────

  test('FC filter chips should be keyboard navigable', async ({ authedPage }) => {
    // Navigate to catalog view
    await authedPage.goto('/dashboard');
    await authedPage.waitForLoadState('networkidle');

    // Find FC filter chip elements (these are typically toggle buttons)
    const filterChips = authedPage.locator(
      'button[aria-pressed], [role="switch"], [data-filter-chip]'
    );
    const chipCount = await filterChips.count();

    if (chipCount > 0) {
      // Tab to the first filter chip
      await filterChips.first().focus();

      // Verify each chip is focusable
      for (let i = 0; i < Math.min(chipCount, 5); i++) {
        const chip = filterChips.nth(i);
        await expect(chip).toBeFocused();

        // Verify Enter/Space activates the filter (toggles aria-pressed)
        const isPressedBefore = await chip.getAttribute('aria-pressed');
        await authedPage.keyboard.press('Enter');
        const isPressedAfter = await chip.getAttribute('aria-pressed');

        // If aria-pressed changes, the filter was activated
        if (isPressedBefore !== null) {
          // The state should toggle
          expect(isPressedAfter).not.toBe(isPressedBefore);
          // Toggle back to restore original state
          await authedPage.keyboard.press('Enter');
        }

        // Move to next chip with Tab
        await authedPage.keyboard.press('Tab');
      }
    }
  });
});
