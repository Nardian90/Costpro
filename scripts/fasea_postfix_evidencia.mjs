// Evidencia POST-corrección (FIX-RE-1510) — Reporte Entrega con datos reales ENERVIDA
// Pruebas A (15|15), B (16|16), C (15–16) + acordeón de comisiones (fila con Periodo).
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = 'audit-evidence/20261016-reporte-entrega-1510/post-fix';
const EMAIL = 'admin@costpro.com';
const PASSWORD = process.env.COSTPRO_E2E_PASSWORD || 'Costpro-Mision14-15Oct-2026!';
fs.mkdirSync(OUT, { recursive: true });

const API_CALLS = [];
const evidence = { generated_at: new Date().toISOString(), tz: 'America/Havana', fix: 'FIX-RE-1510', tests: {} };

const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: BASE, timezoneId: 'America/Havana', locale: 'es-CU', viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
page.on('request', req => { if (req.url().includes('/api/cash-report')) API_CALLS.push(req.url()); });
page.on('request', req => { if (req.url().includes('/api/cash-report/details')) API_CALLS.push(req.url()); });

console.log('[1] login…');
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
for (const t of ['Iniciar sesión', 'Entrar', 'Acceder']) {
  const btn = page.getByText(t, { exact: false }).first();
  if (await btn.count() && await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); break; }
}
await page.waitForTimeout(1200);
const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
await emailInput.waitFor({ state: 'visible', timeout: 20000 });
await emailInput.fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASSWORD);
await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Iniciar")').first().click();
await page.waitForTimeout(6000);

console.log('[2] navegación OPERACIÓN → Ventas → Reporte Entrega…');
await page.getByText('OPERACIÓN', { exact: true }).first().click();
await page.waitForTimeout(1000);
await page.getByText('Ventas', { exact: true }).first().click();
await page.waitForTimeout(1000);
await page.getByText('Reporte Entrega', { exact: true }).first().click();
await page.waitForTimeout(2500);
await page.getByTestId('cash-report-view').waitFor({ state: 'visible', timeout: 20000 });

async function runTest(id, from, to) {
  console.log(`[3] ${id}: ${from} → ${to}`);
  await page.locator('#cr-sd').fill(from);
  await page.locator('#cr-ed').fill(to);
  const before = API_CALLS.length;
  await page.getByRole('button', { name: /Generar reporte|Actualizar reporte/ }).first().click();
  await page.waitForTimeout(4500);
  const calls = API_CALLS.slice(before);
  const view = page.getByTestId('cash-report-view');
  const body = await view.innerText();
  // filas del resumen
  const grab = (label) => {
    const i = body.indexOf(label);
    if (i < 0) return null;
    const seg = body.slice(i + label.length, i + label.length + 40).trim();
    return seg.split('\n')[0].trim();
  };
  const summary = {
    comisionesEfectivo: grab('Comisiones pagadas en efectivo'),
    comisionesTransfer: grab('Comisiones pagadas por transferencia'),
    efectivoEsperado: grab('EFECTIVO ESPERADO A ENTREGAR'),
    ventasEfectivo: grab('Ventas en efectivo'),
  };
  await page.screenshot({ path: `${OUT}/test-${id}-reporte.png`, fullPage: true });
  // expandir acordeón de comisiones (grupo cash/CUP) si la sección existe
  let detail = null;
  const section = body.indexOf('Comisiones a Trabajadores');
  if (section >= 0) {
    try {
      // el acordeón del grupo comisiones: texto "1 comisiones" dentro de la sección
      const acc = view.locator('text=/comisiones$/').last();
      const btn = view.getByText('1 comisiones').first();
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(3000);
        const modal = await page.locator('body').innerText();
        const p = modal.indexOf('Periodo');
        detail = p >= 0 ? modal.slice(Math.max(0, p - 400), p + 300) : null;
        await page.screenshot({ path: `${OUT}/test-${id}-detalle.png`, fullPage: true });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(600);
      }
    } catch (e) { detail = 'ERR ' + e.message.slice(0, 120); }
  }
  evidence.tests[id] = { from, to, api_calls: calls, summary, commissions_section_present: section >= 0, detail };
  console.log('   resumen:', JSON.stringify(summary));
}

await runTest('A-15-15', '2026-10-15', '2026-10-15');
await runTest('B-16-16', '2026-10-16', '2026-10-16');
await runTest('C-15-16', '2026-10-15', '2026-10-16');

fs.writeFileSync(`${OUT}/post_fix_evidencia.json`, JSON.stringify(evidence, null, 1));
console.log(`\n[OK] evidencia post-fix en ${OUT}/`);
await browser.close();
