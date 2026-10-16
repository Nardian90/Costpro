// FASE A — Reproducción en la interfaz real: Reporte de Caja — Entrega (Reporte Entrega)
// Misión corrección comisiones 15/10/2026 · TZ de negocio: America/Havana
// Evidencia: capturas + extracción de la sección Comisiones + URLs exactas de /api/cash-report
// (los params ISO que envía el frontend documentan la conversión de fechas del navegador).
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = 'audit-evidence/20261016-reporte-entrega-1510';
const EMAIL = 'admin@costpro.com';
const PASSWORD = process.env.COSTPRO_E2E_PASSWORD || 'Costpro-Mision14-15Oct-2026!';
fs.mkdirSync(OUT, { recursive: true });

const API_CALLS = [];
const evidence = { generated_at: new Date().toISOString(), tz: 'America/Havana', tests: {} };

const browser = await chromium.launch();
const ctx = await browser.newContext({
  baseURL: BASE, timezoneId: 'America/Havana', locale: 'es-CU',
  viewport: { width: 1440, height: 1000 },
});
const page = await ctx.newPage();
page.on('request', req => {
  if (req.url().includes('/api/cash-report')) API_CALLS.push({ url: req.url(), ts: new Date().toISOString() });
});

// ── Login real (flujo nativo) ──
console.log('[1] login…');
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
// si aparece landing con botón de sesión, entrar
for (const t of ['Iniciar sesión', 'Iniciar Sesión', 'Entrar', 'Acceder']) {
  const btn = page.getByText(t, { exact: false }).first();
  if (await btn.count() && await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); break; }
}
await page.waitForTimeout(1500);
const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
await emailInput.waitFor({ state: 'visible', timeout: 20000 });
await emailInput.fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASSWORD);
await page.screenshot({ path: `${OUT}/login.png`, fullPage: true });
await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Iniciar")').first().click();
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/post-login.png`, fullPage: false });
console.log('[1] login OK (pantalla post-login capturada)');

// ── Navegación: OPERACIÓN → Ventas → Reporte Entrega ──
console.log('[2] navegación…');
await page.getByText('OPERACIÓN', { exact: true }).first().click().catch(async () => {
  await page.getByRole('button', { name: /operación/i }).first().click();
});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/nav-operacion.png`, fullPage: false });
await page.getByText('Ventas', { exact: true }).first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/nav-ventas.png`, fullPage: false });
await page.getByText('Reporte Entrega', { exact: true }).first().click();
await page.waitForTimeout(2500);
await page.getByTestId('cash-report-view').waitFor({ state: 'visible', timeout: 20000 });
console.log('[2] vista Reporte Entrega visible');

async function runTest(id, from, to) {
  console.log(`[3] prueba ${id}: ${from} → ${to}`);
  const sd = page.locator('#cr-sd');
  const ed = page.locator('#cr-ed');
  await sd.fill(from);
  await ed.fill(to);
  await page.screenshot({ path: `${OUT}/test-${id}-filtros.png`, fullPage: false });
  const beforeCalls = API_CALLS.length;
  await page.getByRole('button', { name: /Generar reporte|Actualizar reporte/ }).first().click();
  await page.waitForTimeout(4500);
  const calls = API_CALLS.slice(beforeCalls).map(c => c.url);
  // evidencia de la sección comisiones + resumen
  const body = await page.locator('[data-testid="cash-report-view"]').innerText();
  const comIdx = body.indexOf('Comisiones a Trabajadores');
  const commissionsSection = comIdx >= 0 ? body.slice(comIdx, comIdx + 400) : '(sección Comisiones no presente — 0 comisiones)';
  const resumenIdx = body.indexOf('Resumen del Día');
  const resumen = resumenIdx >= 0 ? body.slice(resumenIdx, resumenIdx + 700) : '';
  await page.screenshot({ path: `${OUT}/test-${id}-reporte.png`, fullPage: true });
  // expandir acordeón de comisiones si existe (cash/commission)
  let detailRows = null;
  const acc = page.locator('text=/1 comisiones|comisiones/').first();
  try {
    if (comIdx >= 0) {
      const item = page.locator('div', { hasText: /^cash.*CUP/ }).first();
      // más robusto: clic en el acordeón que contiene "comisiones" dentro de la sección
      const btn = page.locator('button:has-text("comisiones")').first();
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(2500);
        const modalText = await page.locator('body').innerText();
        const dIdx = modalText.indexOf('Periodo');
        detailRows = dIdx >= 0 ? modalText.slice(Math.max(0, dIdx - 500), dIdx + 500) : null;
        await page.screenshot({ path: `${OUT}/test-${id}-detalle.png`, fullPage: true });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(800);
      }
    }
  } catch (e) { detailRows = 'ERR ' + e.message; }
  evidence.tests[id] = { from, to, api_urls: calls, commissions_section: commissionsSection, resumen_extract: resumen, detail_rows: detailRows };
  console.log(`   calls: ${calls.length ? calls[0] : '(ninguna)'}`);
  console.log(`   comisiones: ${commissionsSection.slice(0, 220).replace(/\n/g, ' | ')}`);
}

await runTest('A-15-15', '2026-10-15', '2026-10-15');
await runTest('B-16-16', '2026-10-16', '2026-10-16');
await runTest('C-15-16', '2026-10-15', '2026-10-16');

evidence.api_calls_all = API_CALLS;
fs.writeFileSync(`${OUT}/fasea_evidencia.json`, JSON.stringify(evidence, null, 1));
console.log(`\n[OK] evidencia en ${OUT}/ · llamadas API registradas: ${API_CALLS.length}`);
await browser.close();
