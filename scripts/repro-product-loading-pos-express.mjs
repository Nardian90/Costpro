// CP-LOG-RECEPTIONS-SERVICES-POS-UNIFICATION-001 — Reproducción LIVE del bug
// de carga de productos en POS (Vender) y Recepción Express.
// SOLO LECTURA: no crea/elimina nada. Navega, observa y captura evidencia.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = '/home/z/my-project/download/cp-log-unif-001/evidencia-fase1';
const EMAIL = 'admin@costpro.com';
const PASSWORD = process.env.COSTPRO_E2E_PASSWORD || 'Costpro-Mision14-15Oct-2026!';

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  baseURL: BASE, timezoneId: 'America/Havana', locale: 'es-CU',
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

const consoleErrors = [];
const rpcCalls = [];
page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message.slice(0, 250)}`));
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`console: ${m.text().slice(0, 250)}`); });
page.on('response', async r => {
  const u = r.url();
  if (u.includes('/rest/v1/rpc/')) {
    const req = r.request();
    let body = null;
    try { body = req.postData(); } catch {}
    rpcCalls.push({ rpc: u.split('/rpc/')[1].split('?')[0], status: r.status(), body: body ? body.slice(0, 220) : null });
  }
});

const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
  return ok;
};

try {
  // ── Login ──
  await page.goto(`${BASE}/?login=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  // aceptar cookies si aparece (hallazgo H4 de CP-WH-001)
  const cookieBtn = page.getByRole('button', { name: /aceptar|accept/i }).first();
  try { await cookieBtn.click({ timeout: 2500 }); } catch {}
  await page.locator('button[type="submit"], button:has-text("Iniciar")').first().click();
  await page.waitForTimeout(6000);
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/00-home.png` });

  // ¿Tienda activa?
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  const storeLine = bodyText.split('\n').find(l => /ENERVIDA|FERROCARRIL|PUERTO|SHADDAI|COSTPRO/.test(l));
  console.log(`INFO | Tienda visible en home: ${storeLine || '(no encontrada)'}`);

  // ── 1. POS (Vender) ──
  console.log('\n========== POS (Vender) ==========');
  await page.goto(`${BASE}/?view=pos`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000); // esperar carga de productos
  await page.screenshot({ path: `${OUT}/01-pos-inicial.png`, fullPage: false });

  // Buscar tarjetas de producto (grid) o filas de tabla
  const posState = await page.evaluate(() => {
    const txt = document.body.innerText;
    const hasLoading = /cargando/i.test(txt);
    const hasEmpty = /no hay productos|sin productos|no se encontr/i.test(txt);
    const hasError = /error|reintent/i.test(txt);
    // tarjetas de producto del grid: article o elementos con data producto
    const cards = document.querySelectorAll('[class*="grid"] article, [class*="product-card"], [data-product-id]');
    const tables = document.querySelectorAll('table tbody tr');
    return { hasLoading, hasEmpty, hasError, cards: cards.length, tableRows: tables.length,
             snippet: txt.slice(0, 900) };
  });
  console.log('POS estado:', JSON.stringify({ loading: posState.hasLoading, empty: posState.hasEmpty, error: posState.hasError, cards: posState.cards, rows: posState.tableRows }, null, 0));
  check('POS muestra productos', posState.cards > 0 || posState.tableRows > 0, `cards=${posState.cards} rows=${posState.tableRows}`);
  fs.writeFileSync(`${OUT}/pos-texto.txt`, posState.snippet);

  // toggle "ver todo incl agotados" por si el filtro default oculta
  const verTodoBtn = page.getByRole('button', { name: /ver todo|agotados|incluir/i }).first();
  if (await verTodoBtn.count()) {
    try {
      await verTodoBtn.click();
      await page.waitForTimeout(2500);
      const after = await page.evaluate(() => ({
        cards: document.querySelectorAll('[class*="grid"] article, [class*="product-card"], [data-product-id]').length,
        rows: document.querySelectorAll('table tbody tr').length,
      }));
      console.log(`POS con 'ver todo': cards=${after.cards} rows=${after.rows}`);
      await page.screenshot({ path: `${OUT}/02-pos-ver-todo.png` });
    } catch (e) { console.log('toggle ver todo no clickeable:', e.message.slice(0, 80)); }
  }

  // ── 2. Recepción Express ──
  console.log('\n========== Recepción Express ==========');
  await page.goto(`${BASE}/?view=reception_list`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  // buscar botón Express
  const expressBtn = page.getByRole('button', { name: /express/i }).first();
  if (await expressBtn.count()) {
    await expressBtn.click();
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${OUT}/03-recepcion-express.png` });
    const exState = await page.evaluate(() => {
      const txt = document.body.innerText;
      return {
        hasCargando: /cargando/i.test(txt),
        hasSinResultados: /sin resultados|no se encontr/i.test(txt),
        productCells: document.querySelectorAll('[class*="product"], [class*="card"]').length,
        snippet: txt.slice(0, 700),
      };
    });
    console.log('Express estado:', JSON.stringify({ cargando: exState.hasCargando, sinResultados: exState.hasSinResultados, celdas: exState.productCells }));
    fs.writeFileSync(`${OUT}/express-texto.txt`, exState.snippet);
    check('Express muestra productos', exState.productCells > 3 && !exState.hasSinResultados, `celdas=${exState.productCells}`);
  } else {
    console.log('FAIL | No se encontró botón Express en reception_list');
    await page.screenshot({ path: `${OUT}/03-reception-list-sin-express.png` });
  }
} catch (e) {
  console.log('ERROR del script:', e.message);
  await page.screenshot({ path: `${OUT}/99-error.png` }).catch(() => {});
} finally {
  fs.writeFileSync(`${OUT}/rpc-calls.json`, JSON.stringify(rpcCalls.filter(c => /product|pos|reception/.test(c.rpc)), null, 2));
  fs.writeFileSync(`${OUT}/console-errors.json`, JSON.stringify(consoleErrors, null, 2));
  console.log(`\nRPC de productos capturadas: ${rpcCalls.filter(c => /product|pos|reception/.test(c.rpc)).length}`);
  console.log(`Errores de consola: ${consoleErrors.length}`);
  await browser.close();
}
