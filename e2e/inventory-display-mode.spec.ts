/**
 * CP-INVENTORY-UNIT-VALUE-TO-STOCK-AMOUNT-001 — E2E del selector de
 * visualización Unitario/Importe en la vista Inventario (BD AISLADA).
 *
 * Escenario (misión §2/§5/§6/§9 + §13 capturas):
 *   C1  Login UI + navegación OPERACIÓN → Almacén → Inventario (tab Stock Actual).
 *   C2  Selector «Visualización» junto al botón Filtros, con Unitario por
 *       defecto (aria-pressed=true) — comportamiento actual intacto.
 *   C3  Modo Unitario: encabezados «Precio / Empresa / Costo» unitarios.
 *   C4  Cambio a Importe: encabezados «Precio (importe) / Costo (importe)» y
 *       valores = existencia × valor unitario, comparados contra el MISMO
 *       formateador Intl que usa la app (es-CU, CUP, 2 decimales).
 *   C5  La existencia NO cambia entre modos (§4: mismo origen de datos).
 *   C6  Vuelta a Unitario: valores originales restaurados al instante.
 *   C7  Cero escrituras durante todo el ciclo (solo presentación): ninguna
 *       request PATCH/POST a products ni llamadas a perform_inventory_adjustment.
 *
 * Registra errores de consola/pageerror para diagnóstico.
 */
import { test, expect, type Page } from '@playwright/test';

const EVIDENCE_DIR = 'audit-evidence/cp-inventory-unit-value-to-stock-amount-001';

const consoleErrors: string[] = [];

/** Formateador idéntico al de la app (formatCurrency: es-CU, CUP, 2 decimales). */
const fmt = (n: number): string =>
  new Intl.NumberFormat('es-CU', {
    style: 'currency',
    currency: 'CUP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

/**
 * Parsea un texto monetario es-* ("$5,00" · "5,00 $" · "$1.234,56") a number.
 * La app multiplica el valor parseado tal cual (sin redondeo) y luego
 * formatea — aquí replicamos exactamente esa aritmética.
 */
function parseMoney(text: string): number {
  const cleaned = text.replace(/[^\d.,-]/g, '');
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;
  if (hasComma && hasDot) {
    const decSep = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.') ? ',' : '.';
    const thouSep = decSep === ',' ? '.' : ',';
    normalized = cleaned.split(thouSep).join('').replace(decSep, '.');
  } else if (hasComma) {
    normalized = cleaned.replace(',', '.');
  }
  return Number(normalized) || 0;
}

async function loginUi(page: Page) {
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

test('CP-INVENTORY-UNIT-VALUE-TO-STOCK-AMOUNT-001 · selector Unitario/Importe — cálculo exacto, toggle sin escrituras y capturas', async ({ page }) => {
  // ── Vigilancia de escrituras (§9: alternar NO genera escrituras) ──
  const writeRequests: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    if ((method === 'PATCH' || method === 'POST') && /rest\/v1\/products/.test(url)) {
      writeRequests.push(`${method} ${url.slice(0, 120)}`);
    }
    if (method === 'POST' && /perform_inventory_adjustment/.test(url)) {
      writeRequests.push(`${method} ${url.slice(0, 120)}`);
    }
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[console.error] ${msg.text().slice(0, 300)}`);
  });
  page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${String(err).slice(0, 300)}`));

  // ── C1: login + navegación ──────────────────────────────────────────────
  await loginUi(page);
  await page.getByText('OPERACIÓN', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByText('Almacén', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByText('Inventario', { exact: true }).first().click();
  await page.waitForTimeout(4000); // compilación bajo demanda + RPC paginada

  // ── C2: selector presente junto a Filtros, Unitario por defecto ─────────
  const selector = page.getByRole('group', { name: 'Visualización de precios y costos' });
  await selector.waitFor({ state: 'visible', timeout: 30_000 });
  const btnUnitario = selector.getByRole('button', { name: 'Unitario' });
  const btnImporte = selector.getByRole('button', { name: 'Importe' });
  await expect(btnUnitario).toHaveAttribute('aria-pressed', 'true');
  await expect(btnImporte).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Filtros' })).toBeVisible(); // convive con Filtros

  // ── C3: tabla en modo Unitario — comportamiento actual ─────────────────
  // (Encabezados ambiguados con el sidebar → se consultan AMBITADOS a la tabla)
  const table = page.getByLabel('Tabla de productos del inventario');
  const firstRow = table.locator('tbody tr').first();
  await firstRow.waitFor({ state: 'visible', timeout: 30_000 });
  await expect(table.getByRole('button', { name: 'Precio', exact: true })).toBeVisible();
  await expect(table.getByRole('button', { name: 'Costo', exact: true })).toBeVisible();

  const readCell = async (row: ReturnType<Page['locator']>, label: string) =>
    (((await row.locator(`td[data-label="${label}"]`).textContent()) ?? '').trim());

  const stockText = (await readCell(firstRow, 'Stock')).trim();
  const stock = parseFloat(stockText); // el número va primero; badges van después
  expect(Number.isFinite(stock), `existencia legible en primera fila: "${stockText}"`).toBe(true);

  const precioUnitText = await readCell(firstRow, 'Precio');
  const costoUnitText = await readCell(firstRow, 'Costo');
  const precioUnit = parseMoney(precioUnitText);
  const costoUnit = parseMoney(costoUnitText);

  await page.screenshot({ path: `${EVIDENCE_DIR}/modo-unitario.png`, fullPage: false });

  // ── C4/C5: cambio a Importe — importes exactos con el mismo formateador ─
  await btnImporte.click();
  const importeHeader = table.getByRole('button', { name: 'Precio (importe)' });
  await expect(importeHeader).toBeVisible({ timeout: 10_000 });
  await expect(btnImporte).toHaveAttribute('aria-pressed', 'true');
  await expect(btnUnitario).toHaveAttribute('aria-pressed', 'false');
  await expect(table.getByText('Empresa (importe)', { exact: true })).toBeVisible();

  const rowAfter = table.locator('tbody tr').first();
  const precioImporteText = await readCell(rowAfter, 'Precio (importe)');
  const costoImporteText = await readCell(rowAfter, 'Costo (importe)');
  // §9.2: existencia × precio unitario — SIN redondeo prematuro, MISMA moneda
  expect(precioImporteText, `importe precio = ${stock} × ${precioUnit}`).toBe(fmt(stock * precioUnit));
  // §9.1: existencia × costo unitario (mismo campo cost_price del modo Unitario)
  expect(costoImporteText, `importe costo = ${stock} × ${costoUnit}`).toBe(fmt(stock * costoUnit));
  // §9.3 coherencia: si la unidad es 0, el importe también es 0
  if (precioUnit === 0) expect(precioImporteText).toBe(fmt(0));
  if (costoUnit === 0) expect(costoImporteText).toBe(fmt(0));
  // §9.5: la existencia NO cambia entre modos (mismo origen de datos)
  const stockAfter = parseFloat(((await readCell(rowAfter, 'Stock'))).trim());
  expect(stockAfter).toBe(stock);

  await page.screenshot({ path: `${EVIDENCE_DIR}/modo-importe.png`, fullPage: false });

  // ── C6: vuelta a Unitario — valores originales restaurados ──────────────
  await btnUnitario.click();
  await expect(table.getByRole('button', { name: 'Precio', exact: true })).toBeVisible({ timeout: 10_000 });
  expect(await readCell(table.locator('tbody tr').first(), 'Precio')).toBe(precioUnitText);
  expect(await readCell(table.locator('tbody tr').first(), 'Costo')).toBe(costoUnitText);

  // ── C7: cero escrituras en todo el ciclo + sin errores de página ────────
  expect(writeRequests, `escrituras detectadas: ${writeRequests.join(' | ')}`).toHaveLength(0);
  const pageErrors = consoleErrors.filter((e) => e.startsWith('[pageerror]'));
  expect(pageErrors, `pageerror: ${pageErrors.join(' | ')}`).toHaveLength(0);
  if (consoleErrors.length > 0) console.log('[display-mode] console errors (informativo):', consoleErrors);
});
