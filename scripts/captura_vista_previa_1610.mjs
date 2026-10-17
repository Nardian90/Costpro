// Captura de la pestaña Vista previa (PDF Diario) + grupo USD en Resultados.
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const OUT = 'audit-evidence/20261017-reporte-entrega-monedas-1610';
const EMAIL = 'admin@costpro.com';
const PASSWORD = process.env.COSTPRO_E2E_PASSWORD || 'Costpro-Mision14-15Oct-2026!';

const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: BASE, timezoneId: 'America/Havana', locale: 'es-CU', viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
const cb = page.getByRole('button', { name: /aceptar todas/i }).first();
if (await cb.isVisible().catch(() => false)) { await cb.click().catch(() => {}); await page.waitForTimeout(800); }
for (const t of ['Entrar a COSTPRO', 'Iniciar sesión', 'Entrar']) {
  const b = page.getByText(t, { exact: false }).first();
  if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); break; }
}
await page.waitForTimeout(2000);
await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 30000 });
await page.locator('input[type="email"]').first().fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASSWORD);
await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Iniciar")').first().click();
await page.waitForTimeout(8000);

await page.getByText('OPERACIÓN', { exact: true }).first().click().catch(async () => {
  await page.getByRole('button', { name: /operación/i }).first().click();
});
await page.waitForTimeout(1200);
await page.getByText('Ventas', { exact: true }).first().click();
await page.waitForTimeout(1200);
await page.getByText('Reporte Entrega', { exact: true }).first().click();
await page.waitForTimeout(2500);
await page.getByTestId('cash-report-view').waitFor({ state: 'visible', timeout: 20000 });
const dateInputs = page.locator('input[type="date"]');
await dateInputs.nth(0).fill('2026-10-16');
await dateInputs.nth(1).fill('2026-10-16');
await page.getByRole('button', { name: /generar reporte|actualizar reporte/i }).first().click();
await page.waitForTimeout(5000);

// Grupo USD en Resultados (scroll al fondo de la lista de ventas)
const usdGroup = page.getByText('Efectivo (USD)', { exact: false }).first();
if (await usdGroup.isVisible().catch(() => false)) {
  await usdGroup.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/ui_grupo_usd_1610.png`, fullPage: false });
  console.log('[1] grupo USD capturado');
} else {
  console.log('[1] grupo USD no visible en pantalla');
}

// Pestaña VISTA PREVIA
await page.getByText('VISTA PREVIA', { exact: false }).first().click();
await page.waitForTimeout(12000); // builder + jsPDF + render iframe
await page.screenshot({ path: `${OUT}/ui_vista_previa_p1.png`, fullPage: false });
console.log('[2] vista previa p1');
await page.mouse.wheel(0, 900);
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/ui_vista_previa_p2.png`, fullPage: false });
console.log('[3] vista previa scroll');
await page.mouse.wheel(0, 900);
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/ui_vista_previa_p3.png`, fullPage: false });
await browser.close();
console.log('OK');
