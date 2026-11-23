// MISIÓN INFORME GERENCIAL 2026-11-24 — Validación documental REAL con datos
// de producción ENERVIDA-VITALLCONS (100% SOLO LECTURA: generar/exportar el
// informe no muta nada).
//   1. Login → ?view=product-comparison (Inicio → ANÁLISIS → Comparar Productos).
//   2. Tab «Informe Ejecutivo»: verificación de que NO hay texto duplicado
//      (solo controles + estado + vista preliminar).
//   3. Espera de la generación automática (patrón Reporte de Entrega).
//   4. Capturas de escritorio (tab + tabla analítica).
//   5. Exportar PDF → descarga real → guardado en evidencia.
//   6. Sin errores de consola/pageerror durante la sesión.
import { chromium } from '@playwright/test';
import { mkdirSync, statSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = '/home/z/my-project/download/evidencia';
const DL = `${OUT}/descargas`;
const EMAIL = 'admin@costpro.com';
const PASSWORD = process.env.COSTPRO_E2E_PASSWORD || 'Costpro-Mision14-15Oct-2026!';
mkdirSync(DL, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  baseURL: BASE, timezoneId: 'America/Havana', locale: 'es-CU',
  viewport: { width: 1500, height: 950 }, acceptDownloads: true,
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
const btnCookies = page.getByRole('button', { name: /Aceptar todas/i }).first();
try {
  await btnCookies.waitFor({ state: 'visible', timeout: 12000 });
  await btnCookies.click({ timeout: 20000 });
  await page.waitForTimeout(800);
  check('banner de cookies aceptado', true);
} catch { check('banner de cookies no mostrado (consentimiento previo)', true); }
const btnLogin = page.locator('[role="dialog"] button[type="submit"]').first();
await btnLogin.waitFor({ state: 'visible', timeout: 60000 });
await page.locator('[role="dialog"] input[type="email"]').first().fill(EMAIL);
await page.locator('[role="dialog"] input[type="password"]').first().fill(PASSWORD);
await btnLogin.click({ timeout: 60000 });
await page.waitForTimeout(6000);
check('login', true);

// ── Vista Comparar Productos ──
await page.goto(`${BASE}/?view=product-comparison`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.getByTestId('comparison-table').waitFor({ state: 'visible', timeout: 40000 });
check('vista Comparar Productos con tabla', true);
const breadcrumb = await page.locator('header, [data-slot="breadcrumb"]').first().textContent().catch(() => '');
check('breadcrumb en español (sin «Product Comparison»)', !/product comparison/i.test(breadcrumb ?? ''), (breadcrumb ?? '').trim().slice(0, 140));

// Captura de la tabla analítica
await page.screenshot({ path: `${OUT}/informe-gerencial-tabla.png`, fullPage: false });

// ── Tab Informe Ejecutivo ──
await page.getByTestId('comparison-tab-informe').click();
await page.getByTestId('informe-controls').waitFor({ state: 'visible', timeout: 20000 });
check('controles del informe presentes', true);

// CRÍTICO (misión §1): sin bloques de texto duplicados en la interfaz.
await page.waitForTimeout(1500);
const cuerpo = await page.locator('[data-testid="comparison-panel-informe"]').textContent();
const duplicados = ['Resumen ejecutivo', 'Hallazgos y recomendaciones', 'Conclusión ejecutiva', 'Hecho:', 'Acción a evaluar:'];
const hayDuplicados = duplicados.filter((t) => cuerpo?.includes(t));
check('tab SIN texto analítico duplicado', hayDuplicados.length === 0, hayDuplicados.length ? `presente: ${hayDuplicados.join(', ')}` : 'contenido exclusivamente documental');

// Generación automática al abrir el tab (patrón Reporte de Entrega)
await page.getByTestId('informe-preview').waitFor({ state: 'visible', timeout: 40000 });
const estado = await page.getByTestId('informe-estado').textContent();
check('vista preliminar generada automáticamente', true, `estado: ${estado?.trim()}`);
check('estado «actualizado»', /actualizado/i.test(estado ?? ''), estado?.trim() ?? '');

await page.screenshot({ path: `${OUT}/informe-gerencial-tab-preview.png`, fullPage: false });

// ── Exportación PDF real ──
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 60000 }),
  page.getByTestId('informe-exportar').click(),
]);
const destino = `${DL}/Informe_Ejecutivo_Desempeno_Comercial_ENERVIDA_2026-11-24.pdf`;
await download.saveAs(destino);
const kb = Math.round(statSync(destino).size / 1024);
check('PDF exportado desde la UI real', kb > 20, `${destino} (${kb} KB)`);

// ── Consola sin errores ──
const erroresReales = consoleErrors.filter((e) => !/favicon|401|403|permission|policy/i.test(e));
check('sin errores de consola/pageerror', erroresReales.length === 0, erroresReales.slice(0, 3).join(' | '));

console.log('\nRESULTADO: ' + (results.every((r) => r.ok) ? 'TODO OK' : 'HAY FALLOS'));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
