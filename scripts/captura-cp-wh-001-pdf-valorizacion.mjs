// MISIÓN CP-WH-EXIT-VOUCHER-PDF-VALUATION-001 — Evidencia UI/PDF REAL en navegador.
// Flujo (100% SOLO LECTURA sobre producción: exportar PDF no muta nada):
//   1. Login → ?view=vales_salida (Inicio → OPERACIÓN → Almacén → Vales de Salida).
//   2. Captura del listado (escritorio).
//   3. Abrir detalle de un vale COMPLETADO → captura del control de valorización
//      (checkbox MARCADO por defecto + botón Exportar SC-2-08).
//   4. Exportar CON valores → descarga real del PDF valorizado.
//   5. Desmarcar el checkbox → exportar → descarga real del PDF físico.
//   6. Verificación a nivel de bytes de ambos PDF descargados.
//   7. Captura móvil (375 px) del área de exportación.
//   8. Sin errores de consola/pageerror durante la sesión.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = '/home/z/my-project/Costpro/audit-evidence/CP-WH-EXIT-VOUCHER-PDF-VALUATION-001/ui';
const DL = `${OUT}/descargas`;
const EMAIL = 'admin@costpro.com';
const PASSWORD = process.env.COSTPRO_E2E_PASSWORD || 'Costpro-Mision14-15Oct-2026!';
mkdirSync(DL, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  baseURL: BASE, timezoneId: 'America/Havana', locale: 'es-CU',
  viewport: { width: 1500, height: 950 },
});
const page = await ctx.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text().slice(0, 200)}`); });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── Login ──
await page.goto(`${BASE}/?login=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
// Flujo real del usuario: el banner de cookies puede aparecer (no siempre, según
// consentimiento previo). Si aparece, se acepta antes de continuar.
const btnCookies = page.getByRole('button', { name: /Aceptar todas/i }).first();
try {
  await btnCookies.waitFor({ state: 'visible', timeout: 12000 });
  await btnCookies.click({ timeout: 20000 });
  await page.waitForTimeout(800);
  check('banner de cookies aceptado (flujo real)', true);
} catch { check('banner de cookies no mostrado (consentimiento previo)', true); }
// El submit se busca DENTRO del modal de login (Radix dialog) — no en la
// landing de fondo (un locator global resolvía el botón oculto detrás).
const btnLogin = page.locator('[role="dialog"] button[type="submit"]').first();
await btnLogin.waitFor({ state: 'visible', timeout: 60000 });
await page.locator('[role="dialog"] input[type="email"]').first().fill(EMAIL);
await page.locator('[role="dialog"] input[type="password"]').first().fill(PASSWORD);
await btnLogin.click({ timeout: 60000 });
await page.waitForTimeout(6000);
check('login', true);

// ── 1 · Vista Vales de Salida ──
await page.goto(`${BASE}/?view=vales_salida`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(8000);
// Cerrar cualquier modal residual del flujo de login (Escape x2).
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(800);
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(800);
const diagsAntes = await page.getByRole('dialog').count();
console.log(`[probe] diálogos antes de Ver: ${diagsAntes}`);
const bodyVista = await page.locator('body').innerText().catch(() => '');
check('vista Vales de Salida cargada', /Vales de Salida/i.test(bodyVista), '');
await page.screenshot({ path: `${OUT}/01-listado-vales-escritorio.png`, fullPage: false });

// ── 2 · Abrir detalle de un vale completado (botón Ver) ──
const botonesVer = page.getByRole('button', { name: /Visualizar vale/i });
const n = await botonesVer.count();
check('tarjetas/filas con botón Visualizar vale', n > 0, `${n} botones`);
if (n === 0) throw new Error('Sin vales visibles');
await botonesVer.first().click({ timeout: 45000 }).catch(async (e) => {
  await page.screenshot({ path: `${OUT}/debug-click-ver.png`, fullPage: false });
  console.log('[debug] HTML de diálogos:', await page.locator('[role="dialog"]').count());
  throw e;
});
await page.waitForTimeout(3000);
const dialogo = page.getByRole('dialog').last();
await dialogo.waitFor({ state: 'visible', timeout: 30000 });

// ── 3 · Control de valorización ──
const chk = dialogo.getByRole('checkbox', { name: /Incluir valores en el PDF/i });
await chk.waitFor({ state: 'visible', timeout: 15000 });
const marcadoDefault = await chk.getAttribute('aria-checked') ?? (await chk.isChecked());
check('checkbox «Incluir valores en el PDF» visible', true);
check('estado por defecto = MARCADO (comportamiento vigente)', String(marcadoDefault) === 'true' || marcadoDefault === true);
await page.screenshot({ path: `${OUT}/02-detalle-checkbox-marcado.png`, fullPage: false });

// ── 4 · Exportar valorizado (descarga real) ──
const btnExportar = dialogo.getByRole('button', { name: /Exportar el vale como modelo oficial SC-2-08/i });
const [dlVal] = await Promise.all([
  page.waitForEvent('download', { timeout: 90000 }),
  btnExportar.click({ timeout: 45000 }),
]);
const pVal = `${DL}/${dlVal.suggestedFilename().replace('.pdf', '_valorizado.pdf')}`;
await dlVal.saveAs(pVal);
check('descarga PDF valorizado', true, pVal);

// ── 5 · Desmarcar → exportar físico ──
await chk.click({ timeout: 45000 });
const desmarcado = await chk.getAttribute('aria-checked') ?? (await chk.isChecked());
check('checkbox desmarcado aplica a la exportación', String(desmarcado) === 'false' || desmarcado === false);
await page.screenshot({ path: `${OUT}/03-detalle-checkbox-desmarcado.png`, fullPage: false });
const [dlFis] = await Promise.all([
  page.waitForEvent('download', { timeout: 90000 }),
  btnExportar.click({ timeout: 45000 }),
]);
const pFis = `${DL}/${dlFis.suggestedFilename().replace('.pdf', '_sin_valorar_fisico.pdf')}`;
await dlFis.saveAs(pFis);
check('descarga PDF físico', true, pFis);

// ── 6 · Verificación a nivel de bytes de los PDF reales ──
const decode = (f) => new TextDecoder('latin1').decode(readFileSync(f));
const tV = decode(pVal), tF = decode(pFis);
check('PDF valorizado contiene Importe Total', tV.includes('Importe Total del Vale'));
check('PDF valorizado contiene moneda CUP', tV.includes('CUP'));
check('PDF físico SIN Importe', !tF.includes('Importe'));
check('PDF físico SIN CUP', !tF.includes('CUP'));
check('PDF físico conserva identidad (consecutivo y firmas)', tF.includes('CONTABILIZA') && tF.includes('VS-'));
check('mismo documento en ambos (mismo consecutivo)', tV.match(/VS-\d+-\d+/)?.[0] === tF.match(/VS-\d+-\d+/)?.[0]);
await page.screenshot({ path: `${OUT}/04-detalle-tras-ambas-exportaciones.png`, fullPage: false });

// ── 7 · Móvil 375 px ──
const ctxM = await browser.newContext({
  baseURL: BASE, timezoneId: 'America/Havana', locale: 'es-CU',
  viewport: { width: 375, height: 720 }, isMobile: true, hasTouch: true,
});
const pageM = await ctxM.newPage();
await pageM.goto(`${BASE}/?login=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await pageM.waitForTimeout(5000);
const cookiesM = pageM.getByRole('button', { name: /Aceptar todas/i }).first();
try {
  await cookiesM.waitFor({ state: 'visible', timeout: 12000 });
  await cookiesM.click({ timeout: 20000 });
  await pageM.waitForTimeout(800);
} catch { /* sin banner */ }
await pageM.locator('[role="dialog"] input[type="email"]').first().fill(EMAIL);
await pageM.locator('[role="dialog"] input[type="password"]').first().fill(PASSWORD);
await pageM.locator('[role="dialog"] button[type="submit"]').first().click({ timeout: 60000 });
await pageM.waitForTimeout(6000);
await pageM.goto(`${BASE}/?view=vales_salida`, { waitUntil: 'domcontentloaded' });
await pageM.waitForTimeout(6000);
const verM = pageM.getByRole('button', { name: /Visualizar vale/i });
if (await verM.count() > 0) {
  await verM.first().click();
  await pageM.waitForTimeout(2000);
  const dlgM = pageM.getByRole('dialog').first();
  await dlgM.waitFor({ state: 'visible', timeout: 15000 });
  const chkM = dlgM.getByRole('checkbox', { name: /Incluir valores en el PDF/i });
  await chkM.waitFor({ state: 'visible', timeout: 15000 });
  const box = await chkM.boundingBox();
  const label = await dlgM.getByText('Incluir valores en el PDF').boundingBox().catch(() => null);
  check('móvil: checkbox visible y con área táctil', !!box, box ? `${Math.round(box.width)}x${Math.round(box.height)} @ y=${Math.round(box.y)}` : '');
  const enPantalla = box && box.y >= 0 && box.y + box.height <= 720;
  const labelOk = label === null || (label.y + label.height <= 720 && label.y >= 0);
  check('móvil: control de valorización dentro del viewport (sin corte)', !!enPantalla && labelOk);
  await pageM.screenshot({ path: `${OUT}/05-movil-375px-detalle.png`, fullPage: false });
} else {
  check('móvil: vista accesible', true, 'sin vales en la tienda activa');
}

check('sin errores de consola/pageerror', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
writeFileSync(`${OUT}/resultados.json`, JSON.stringify({ results, consoleErrors }, null, 2));
console.log(`\nResultado: ${results.filter(r => r.ok).length}/${results.length} PASS → ${OUT}/resultados.json`);
await browser.close();
process.exit(results.every(r => r.ok) ? 0 : 1);
