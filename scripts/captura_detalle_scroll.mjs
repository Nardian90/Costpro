// Captura del acordeón expandido con scroll + FASE F: integridad (solo lectura)
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const OUT = 'audit-evidence/20261016-reporte-entrega-1510/post-fix';
const EMAIL = 'admin@costpro.com';
const PASSWORD = process.env.COSTPRO_E2E_PASSWORD || 'Costpro-Mision14-15Oct-2026!';

const browser = await chromium.launch();
const page = await (await browser.newContext({ baseURL: BASE, timezoneId: 'America/Havana', locale: 'es-CU', viewport: { width: 1440, height: 1100 } })).newPage();

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
for (const t of ['Iniciar sesión', 'Entrar', 'Acceder']) {
  const btn = page.getByText(t, { exact: false }).first();
  if (await btn.count() && await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); break; }
}
await page.waitForTimeout(1200);
await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASSWORD);
await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Iniciar")').first().click();
await page.waitForTimeout(6000);
const cookie = page.getByText('Aceptar todas', { exact: false }).first();
if (await cookie.count() && await cookie.isVisible().catch(() => false)) { await cookie.click(); await page.waitForTimeout(700); }
await page.getByText('OPERACIÓN', { exact: true }).first().click();
await page.waitForTimeout(800);
await page.getByText('Ventas', { exact: true }).first().click();
await page.waitForTimeout(800);
await page.getByText('Reporte Entrega', { exact: true }).first().click();
await page.waitForTimeout(2000);
await page.locator('#cr-sd').fill('2026-10-15');
await page.locator('#cr-ed').fill('2026-10-15');
await page.getByRole('button', { name: /Generar reporte|Actualizar reporte/ }).first().click();
await page.waitForTimeout(4500);
const acc = page.getByTestId('cash-report-view').getByText('1 comisiones').first();
await acc.scrollIntoViewIfNeeded().catch(() => {});
await acc.click();
await page.waitForTimeout(3200);
const row = page.getByText('Periodo 2026-10-15 → 2026-10-15').first();
await row.scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/detalle-comision-dia15-scroll.png`, fullPage: false });
console.log('captura con scroll OK');
await browser.close();
