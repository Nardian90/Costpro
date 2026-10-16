// Captura focal: acordeón "Comisiones a Trabajadores" expandido en el reporte del 15/10
// (fila real: trabajador + Periodo 2026-10-15 → 2026-10-15 + importe).
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = 'audit-evidence/20261016-reporte-entrega-1510/post-fix';
const EMAIL = 'admin@costpro.com';
const PASSWORD = process.env.COSTPRO_E2E_PASSWORD || 'Costpro-Mision14-15Oct-2026!';

const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: BASE, timezoneId: 'America/Havana', locale: 'es-CU', viewport: { width: 1440, height: 1100 } });
const page = await ctx.newPage();

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
// cerrar banner de cookies si aparece
const cookie = page.getByText('Aceptar todas', { exact: false }).first();
if (await cookie.count() && await cookie.isVisible().catch(() => false)) { await cookie.click(); await page.waitForTimeout(800); }

await page.getByText('OPERACIÓN', { exact: true }).first().click();
await page.waitForTimeout(900);
await page.getByText('Ventas', { exact: true }).first().click();
await page.waitForTimeout(900);
await page.getByText('Reporte Entrega', { exact: true }).first().click();
await page.waitForTimeout(2200);
await page.locator('#cr-sd').fill('2026-10-15');
await page.locator('#cr-ed').fill('2026-10-15');
await page.getByRole('button', { name: /Generar reporte|Actualizar reporte/ }).first().click();
await page.waitForTimeout(4500);

const view = page.getByTestId('cash-report-view');
// localizar el acordeón del grupo de comisiones (texto "1 comisiones") y hacer clic
const acc = view.getByText('1 comisiones').first();
if (await acc.count()) {
  await acc.scrollIntoViewIfNeeded().catch(() => {});
  await acc.click();
  await page.waitForTimeout(3200);
  const body = await page.locator('body').innerText();
  const i = body.indexOf('Periodo 2026-10-15');
  fs.writeFileSync(`${OUT}/detalle_comision_15.txt`, i >= 0 ? body.slice(Math.max(0, i - 600), i + 300) : body.slice(0, 2000));
  await page.screenshot({ path: `${OUT}/detalle-comision-dia15.png`, fullPage: false });
  console.log('detalle capturado; "Periodo 2026-10-15" presente:', i >= 0);
} else {
  await page.screenshot({ path: `${OUT}/detalle-no-encontrado.png`, fullPage: true });
  console.log('acordeón de comisiones no encontrado');
}
await browser.close();
