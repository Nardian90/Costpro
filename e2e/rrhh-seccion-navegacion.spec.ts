/**
 * MISIÓN 2026-11-13 — Sección «RECURSOS HUMANOS» del menú lateral (E2E UI).
 *
 * Contexto: la misión NÓMINAS SC-4-06 (PR #1607) convirtió «Trabajadores y
 * Comisiones» en un módulo de RRHH completo (trabajadores + comisiones +
 * pagos + nóminas Res. 13/2007 MFP). Este spec verifica el traslado de la
 * vista desde OPERACIÓN a su nueva sección propia:
 *
 *   R1  La sección «RECURSOS HUMANOS» existe en el menú lateral y «Trabajadores
 *       y Comisiones» YA NO cuelga de OPERACIÓN (focus mode de OPERACIÓN sin
 *       la hoja). (captura)
 *   R2  «Trabajadores y Comisiones» cuelga de RECURSOS HUMANOS: click en la
 *       sección → hoja visible → click → vista workers con breadcrumb
 *       «Inicio > RECURSOS HUMANOS > Trabajadores y Comisiones» y la pestaña
 *       «Nóminas» de la misión anterior intacta. (captura)
 *   R3  Deep-link /?view=workers: el sidebar auto-enfoca la sección
 *       RECURSOS HUMANOS (wayfinding coherente tras recarga). (captura)
 *
 * Solo lectura para la BD (navegación + capturas): sin creación de datos,
 * net-zero por construcción. Prerequisitos: pm2 + global-setup E2E
 * (identidad aislada provisionada por provisionRunEnv).
 */
import { test, expect } from './fixtures';
import fs from 'node:fs';

test.use({ timezoneId: 'America/Havana' });

const OUT_DIR = 'audit-evidence/20261113-recursos-humanos';

test.beforeAll(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

/** Espera robusta del shell (dev mode puede tardar en hidratar). */
async function esperarShell(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByText('OPERACIÓN', { exact: true }).first()
    .waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  // Banner de cookies puede tapar el sidebar — cerrarlo si aparece.
  const cookie = page.getByText('Aceptar todas', { exact: false }).first();
  if (await cookie.count() && await cookie.isVisible().catch(() => false)) {
    await cookie.click().catch(() => {});
    await page.waitForTimeout(600);
  }
}

test.describe('MISIÓN 2026-11-13 — Sección RECURSOS HUMANOS (menú lateral)', () => {

  test('R1 — la sección existe y «Trabajadores y Comisiones» ya no cuelga de OPERACIÓN', async ({ authedPage: page }) => {
    await esperarShell(page);

    // La sección nueva es visible en modo normal del sidebar.
    const rrhh = page.getByText('RECURSOS HUMANOS', { exact: true }).first();
    await expect(rrhh).toBeVisible({ timeout: 15_000 });

    // Focus mode de OPERACIÓN: sus hojas directas (Dashboard, Ventas, Caja…)
    // son visibles pero «Trabajadores y Comisiones» YA NO está entre ellas.
    await page.getByText('OPERACIÓN', { exact: true }).first().click();
    await page.waitForTimeout(1200);
    await expect(page.getByText('Dashboard', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    const hoja = page.getByText('Trabajadores y Comisiones', { exact: true }).first();
    await expect(hoja).toHaveCount(0);
    await page.screenshot({ path: `${OUT_DIR}/R1-operacion-focus-sin-workers.png`, fullPage: false });
  });

  test('R2 — hoja bajo RECURSOS HUMANOS → vista workers con breadcrumb y pestaña Nóminas', async ({ authedPage: page }) => {
    await esperarShell(page);

    // Entrar al focus mode de la sección nueva.
    await page.getByText('RECURSOS HUMANOS', { exact: true }).first().click();
    await page.waitForTimeout(1200);

    // La hoja del módulo cuelga ahora de esta sección.
    const hoja = page.getByText('Trabajadores y Comisiones', { exact: true }).first();
    await expect(hoja).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: `${OUT_DIR}/R2-rrhh-focus-con-hoja.png`, fullPage: false });

    // Navegar a la vista: URL ?view=workers + breadcrumb con la sección.
    await hoja.click();
    await page.waitForTimeout(2500);
    await expect(page).toHaveURL(/view=workers/);
    await expect(page.getByText('RECURSOS HUMANOS', { exact: true }).first())
      .toBeVisible({ timeout: 15_000 });

    // La pestaña Nóminas de la misión anterior (SC-4-06) sigue intacta
    // (UnifiedTabs renderiza role="tab").
    const tabNominas = page.getByRole('tab', { name: /Nóminas/i }).first();
    if (!(await tabNominas.count())) {
      await page.getByRole('button', { name: /Nóminas/i }).first().waitFor({ state: 'visible', timeout: 20_000 });
    } else {
      await expect(tabNominas).toBeVisible({ timeout: 20_000 });
    }
    await page.screenshot({ path: `${OUT_DIR}/R2-vista-workers-breadcrumb.png`, fullPage: false });
  });

  test('R3 — deep-link /?view=workers auto-enfoca la sección RECURSOS HUMANOS', async ({ authedPage: page }) => {
    await page.goto('/?view=workers', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Focus mode del sidebar sobre la sección contenedora (breadcrumb del
    // panel lateral «INICIO / RECURSOS HUMANOS») + hoja visible.
    await expect(page.getByText('RECURSOS HUMANOS', { exact: true }).first())
      .toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Trabajadores y Comisiones', { exact: true }).first())
      .toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/view=workers/);
    await page.screenshot({ path: `${OUT_DIR}/R3-deeplink-autofocus-rrhh.png`, fullPage: false });
  });
});
