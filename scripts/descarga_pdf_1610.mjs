// Descarga el PDF Diario (16/10) real y lo guarda como evidencia.
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const OUT = 'audit-evidence/20261017-reporte-entrega-monedas-1610';
const EMAIL = 'admin@costpro.com';
const PASSWORD = process.env.COSTPRO_E2E_PASSWORD || 'Costpro-Mision14-15Oct-2026!';

const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: BASE, timezoneId: 'America/Havana', locale: 'es-CU', viewport: { width: 1500, height: 950 }, acceptDownloads: true });
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

// Exportar PDF (descarga explícita)
const dlPromise = page.waitForEvent('download', { timeout: 60000 });
await page.getByRole('button', { name: /exportar pdf/i }).first().click();
const dl = await dlPromise;
await dl.saveAs(`${OUT}/reporte_diario_1610_corregido.pdf`);
console.log('PDF descargado:', dl.suggestedFilename());
await browser.close();
console.log('OK');
