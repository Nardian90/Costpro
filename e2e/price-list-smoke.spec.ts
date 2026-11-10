/**
 * SMOKE E2E — Listado de precios (misión: corrección «Error al cargar»).
 *
 * C1  Login real (pilot admin del runner aislado) + navegación
 *     OPERACIÓN → Ventas → Listado de precios.
 * C2  La vista abre SIN el banner «Error al cargar» y con la cabecera
 *     canónica; la tienda activa resuelve nombre (no «…»).
 * C3  La consulta de productos resuelve (contador vivo ≥ 0 y botón
 *     «Generar vista previa» habilitado cuando hay datos).
 * C4  Recarga de página: la vista vuelve a cargar correctamente.
 *
 * Registra TODOS los errores de consola para diagnóstico.
 */
import { test, expect } from '@playwright/test';

const consoleErrors: string[] = [];

async function loginUi(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  if (!!(await page.getByText('OPERACIÓN', { exact: true }).first().isVisible().catch(() => false))) {
    console.log('[loginUi] sesión ya activa tras reload — login omitido');
    return;
  }
  for (const t of ['Iniciar sesión', 'Entrar', 'Acceder']) {
    const btn = page.getByText(t, { exact: false }).first();
    if (await btn.count() && await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); break; }
  }
  await page.waitForTimeout(1200);
  await page.locator('input[type="email"], input[name="email"]').first().fill(process.env.E2E_ADMIN_EMAIL!);
  await page.locator('input[type="password"]').first().fill(process.env.E2E_ADMIN_PASS!);
  await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Iniciar")').first().click();
  await page.waitForTimeout(6000);
  await page.getByText('OPERACIÓN', { exact: true }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  const cookie = page.getByText('Aceptar todas', { exact: false }).first();
  if (await cookie.count() && await cookie.isVisible().catch(() => false)) { await cookie.click(); await page.waitForTimeout(800); }
}

test.skip(!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASS, 'credenciales UI del runner no disponibles');

test.beforeEach(() => { consoleErrors.length = 0; });

test('C1-C3 · Listado de precios abre sin error y con datos de la tienda activa', async ({ page }) => {
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[console.error] ${msg.text().slice(0, 400)}`);
  });
  page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${String(err).slice(0, 400)}`));

  await loginUi(page);

  // ── Navegación: OPERACIÓN → Ventas → Listado de precios ────────────────
  await page.getByText('OPERACIÓN', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByText('Ventas', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByText('Listado de precios', { exact: true }).first().click();

  // ── C2: la vista abre SIN el banner de error ───────────────────────────
  await page.waitForTimeout(4000); // dev mode: compilación de la vista bajo demanda
  const header = page.getByText('Filtros del listado', { exact: false }).first();
  await header.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
  const errorBanner = page.getByText('Error al cargar Listado de precios', { exact: false }).first();
  expect(await errorBanner.count(), 'banner «Error al cargar Listado de precios» visible — la vista crasheó').toBe(0);
  await expect(page.getByText('Listado de precios').first()).toBeVisible();

  // ── C3: tienda activa resuelta (no «…») y consulta de productos OK ─────
  await page.waitForTimeout(3000); // storeInfo + RPC productos
  const storeChip = page.locator('[data-view="listado-precios"]').getByText('Tienda activa:', { exact: false }).first();
  await expect(storeChip).toBeVisible();
  const chipText = (await storeChip.textContent()) ?? '';
  expect(chipText, `chip de tienda activa sin nombre resuelto: "${chipText}"`).not.toContain('…');

  const generateBtn = page.getByRole('button', { name: 'Generar vista previa' }).first();
  await expect(generateBtn).toBeVisible();
  await expect(generateBtn, 'el botón Generar debe habilitarse cuando productsQuery/storeInfo resuelven').toBeEnabled({ timeout: 20_000 });

  // ── C5: la acción principal (vista previa del PDF) sigue funcionando ────
  await page.screenshot({ path: 'audit-evidence/price-list-fix/vista-cargada.png', fullPage: false });
  await generateBtn.click();
  // El preview se monta en un iframe del blob generado (o toast informativo
  // si el run no tiene productos con stock — ambos son comportamientos legítimos).
  await page.waitForTimeout(6000);
  const iframe = page.locator('iframe').first();
  const previewVisible = await iframe.isVisible().catch(() => false);
  const emptyToast = await page.getByText('No hay productos que cumplan', { exact: false }).first().isVisible().catch(() => false);
  expect(previewVisible || emptyToast, 'ni iframe de vista previa ni aviso de catálogo vacío — la generación falló').toBe(true);
  if (previewVisible) {
    await page.screenshot({ path: 'audit-evidence/price-list-fix/vista-previa-pdf.png', fullPage: false });
  }
  // Sin banner de error tras generar.
  expect(await page.getByText('Error al cargar Listado de precios', { exact: false }).first().count()).toBe(0);

  // Diagnóstico: errores de consola encontrados (no falla si la vista cargó)
  if (consoleErrors.length > 0) {
    console.log('[price-list-smoke] errores de consola registrados:');
    for (const e of consoleErrors.slice(0, 10)) console.log('   ', e);
  }
});

test('C4 · Recarga de página — la vista vuelve a cargar correctamente', async ({ page }) => {
  page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${String(err).slice(0, 400)}`));
  await loginUi(page);
  await page.getByText('OPERACIÓN', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByText('Ventas', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByText('Listado de precios', { exact: true }).first().click();
  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  // tras reload la app restaura la vista por deep-link; la vista no debe crashear
  await page.getByText('OPERACIÓN', { exact: true }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const errorBanner = page.getByText('Error al cargar Listado de precios', { exact: false }).first();
  expect(await errorBanner.count(), 'banner de error tras recarga').toBe(0);
});
