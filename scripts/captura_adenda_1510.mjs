// ADENDA MISIÓN 2026-10-16 — Capturas del Reporte Entrega tras la corrección del DATO
// (paid_at = 15/10 17:00 Habana) + criterio canónico FECHA DEL PAGO:
//   · 15|15 → el pago de comisión SÍ aparece (300 CUP efectivo, su día de pago)
//   · 16|16 exclusivo → NO aparece (0 comisiones)
// Interfaz real, TZ America/Havana, tienda ENERVIDA. Solo lectura (ninguna escritura).
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = 'audit-evidence/20261016-reporte-entrega-1510/adenda-postfix';
const EMAIL = 'admin@costpro.com';
const PASSWORD = process.env.COSTPRO_E2E_PASSWORD || 'Costpro-Mision14-15Oct-2026!';

fs.mkdirSync(OUT, { recursive: true });
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
const cookie = page.getByText('Aceptar todas', { exact: false }).first();
if (await cookie.count() && await cookie.isVisible().catch(() => false)) { await cookie.click(); await page.waitForTimeout(800); }

await page.getByText('OPERACIÓN', { exact: true }).first().click();
await page.waitForTimeout(900);
await page.getByText('Ventas', { exact: true }).first().click();
await page.waitForTimeout(900);
await page.getByText('Reporte Entrega', { exact: true }).first().click();
await page.waitForTimeout(2200);

async function runReport(sd, ed, png, txt) {
  await page.locator('#cr-sd').fill(sd);
  await page.locator('#cr-ed').fill(ed);
  await page.getByRole('button', { name: /Generar reporte|Actualizar reporte/ }).first().click();
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${OUT}/${png}`, fullPage: false });
  const body = await page.locator('body').innerText();
  fs.writeFileSync(`${OUT}/${txt}`, body);
  return body;
}

// ── Día 15 exclusivo: el pago debe aparecer (fecha del pago = 15/10 17:00) ──
const b15 = await runReport('2026-10-15', '2026-10-15', 'adenda-dia15-con-pago.png', 'adenda-dia15-texto.txt');
const acc15 = b15.includes('1 comisiones');
console.log('dia15: acordeón "1 comisiones" presente:', acc15);
console.log('dia15: menciona −$300.00:', b15.includes('-$300.00') || b15.includes('−$300.00') || b15.includes('300.00'));
if (acc15) {
  const acc = page.getByText('1 comisiones').first();
  await acc.scrollIntoViewIfNeeded().catch(() => {});
  await acc.click();
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `${OUT}/adenda-dia15-detalle-extendido.png`, fullPage: false });
  const body2 = await page.locator('body').innerText();
  fs.writeFileSync(`${OUT}/adenda-dia15-detalle-texto.txt`, body2);
  const i = body2.indexOf('Periodo 2026-10-15');
  console.log('dia15 detalle: fila "Periodo 2026-10-15 → 2026-10-15" presente:', i >= 0);
}

// ── Día 16 exclusivo: NO debe aparecer la comisión del 15 ──
const b16 = await runReport('2026-10-16', '2026-10-16', 'adenda-dia16-sin-comision.png', 'adenda-dia16-texto.txt');
console.log('dia16: acordeón "1 comisiones" presente (debe ser false):', b16.includes('1 comisiones'));
console.log('dia16: menciona 300 en comisiones (debe ser false):', /Comisiones[^\n]*300/.test(b16));

await browser.close();
console.log('capturas en', OUT);
