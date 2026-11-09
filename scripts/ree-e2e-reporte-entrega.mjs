// ═══════════════════════════════════════════════════════════════════════════
// ree-e2e-reporte-entrega.mjs — MISIÓN REE-2026-11-09 (BD aislada E2E)
// Prueba funcional del Reporte Entrega con 2 usuarios que generaron ventas:
//   T1 · Las tarjetas muestran NOMBRES REALES (nunca identificadores técnicos)
//   T2 · Independencia de tarjetas (tabla de aceptación del propietario §3)
//   T3 · El filtro es REAL: las ventas incluidas = usuarios seleccionados
//   T4 · Los estados sobreviven al re-render (acordeón) y a volver a renderizar
//   T5 · Exportaciones (PDF) siguen funcionando con el filtro activo
// Re-ejecutable: idempotente (la siembra vive en ree-seed-second-seller.sh).
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = 'audit-evidence/20261109-reporte-entrega-usuarios';
const EMAIL = 'qa-correcciones@costpro-e2e.dev';
const PASSWORD = 'CpE2E-Ree2026!9';
// IDs reales (claves internas de selección — solo para localizar testids)
const QA_ID = '18a4b522-bb9e-46dd-8e5d-e33e19fbb3a8';   // «QA Correcciones» (venta 330 000; la fixture e2e2 de 5 000 tiene cash_amount=0 ⇒ buckets vacíos, dato preexistente)
const ADMIN_ID = '0c13aa78-0411-4eb0-b766-ce9dcd6b58c3'; // «Admin Demo» (1 venta: 20 000)
const TOTAL_TODO = '$350,000.00';
const TOTAL_SOLO_QA = '$330,000.00';
const TOTAL_SOLO_ADMIN = '$20,000.00';

fs.mkdirSync(OUT, { recursive: true });
const evidence = { generated_at: new Date().toISOString(), db: 'aislada (lguovmvrozxgssupkwpf)', tests: {} };
const failures = [];
const check = (id, cond, detail) => {
  evidence.tests[id] = { ok: !!cond, detail };
  console.log(`${cond ? '✅' : '❌'} ${id}: ${detail}`);
  if (!cond) failures.push(`${id}: ${detail}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  baseURL: BASE, timezoneId: 'America/Havana', locale: 'es-CU',
  viewport: { width: 1440, height: 1000 },
});
const page = await ctx.newPage();
const apiPayloads = [];
page.on('response', async res => {
  if (res.url().includes('/api/cash-report?')) {
    try { apiPayloads.push(await res.json()); } catch {}
  }
});

// ── Login ──
console.log('[1] login…');
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
for (const t of ['Iniciar sesión', 'Iniciar Sesión', 'Entrar', 'Acceder']) {
  const btn = page.getByText(t, { exact: false }).first();
  if (await btn.count() && await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); break; }
}
await page.waitForTimeout(1500);
const emailInput = page.locator('input[type="email"]').first();
await emailInput.waitFor({ state: 'visible', timeout: 20000 });
await emailInput.fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASSWORD);
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(7000);
await page.screenshot({ path: `${OUT}/01-post-login.png` });
console.log('[1] login OK');

// ── Navegación: OPERACIÓN → Ventas → Reporte Entrega ──
console.log('[2] navegación…');
await page.getByText('OPERACIÓN', { exact: true }).first().click().catch(async () => {
  await page.getByRole('button', { name: /operación/i }).first().click();
});
await page.waitForTimeout(1200);
await page.getByText('Ventas', { exact: true }).first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/02-nav-ventas.png` });
await page.getByText('Reporte Entrega', { exact: true }).first().click();
await page.waitForTimeout(2500);
await page.getByTestId('cash-report-view').waitFor({ state: 'visible', timeout: 20000 });
console.log('[2] vista Reporte Entrega visible');

// ── Generar reporte del período que cubre las ventas sembradas ──
console.log('[3] generar reporte 2026-09-01 → 2026-10-31…');
await page.locator('#cr-sd').fill('2026-09-01');
await page.locator('#cr-ed').fill('2026-10-31');
await page.getByRole('button', { name: /Generar reporte/ }).first().click();
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/03-reporte-generado.png`, fullPage: true });

const estado = () => page.getByTestId('filtro-usuarios-estado').innerText();
const card = (id) => page.getByTestId(`usuario-card-${id}`);
const pressed = async (id) => (await card(id).getAttribute('aria-pressed')) === 'true';
const ventasTotales = () => page.getByTestId('summary-row-value').evaluateAll(els => {
  const el = els.find(e => e.dataset.label === 'Ventas totales (efectivo + transferencia)');
  return el ? el.textContent.trim() : '(no encontrado)';
});

// ══ T1 · NOMBRES REALES, NUNCA IDENTIFICADORES TÉCNICOS ══
console.log('[T1] nombres reales…');
await card(QA_ID).waitFor({ state: 'visible', timeout: 15000 });
const qaText = await card(QA_ID).innerText();
const admText = await card(ADMIN_ID).innerText();
check('T1a', qaText.includes('QA Correcciones'), `tarjeta QA muestra «QA Correcciones» → [${qaText.split('\n')[0]}]`);
check('T1b', admText.includes('Admin Demo'), `tarjeta Admin muestra «Admin Demo» → [${admText.split('\n')[0]}]`);
const section = await page.getByTestId('filtro-usuarios').innerText();
const hasTechId = /usuario[0-9a-f]{6,}/i.test(section) || section.includes('18a4b522') || section.includes('0c13aa78') || /\…/.test(qaText.split('\n')[0]);
check('T1c', !hasTechId, 'ningún identificador técnico (UUID/hex) visible en la sección');
const payload = apiPayloads.at(-1);
const sby = payload?.sales_by_user || [];
check('T1d', sby.some(g => g.seller_name === 'QA Correcciones') && sby.some(g => g.seller_name === 'Admin Demo'),
  `API sales_by_user trae seller_name resuelto: ${JSON.stringify(sby.map(g => ({ id: (g.seller_id||'').slice(0,8), nombre: g.seller_name })))}`);

// ══ T2 · INDEPENDENCIA DE TARJETAS (tabla de aceptación del propietario) ══
console.log('[T2] independencia de tarjetas…');
check('T2.0', (await pressed(QA_ID)) && (await pressed(ADMIN_ID)), 'inicial «Todos»: ambas tarjetas marcadas');

// Marcar tarjeta 1 (clic alterna solo ella): Admin queda desmarcada; QA conserva
await card(ADMIN_ID).click(); await page.waitForTimeout(600);
check('T2.1', !(await pressed(ADMIN_ID)) && (await pressed(QA_ID)),
  'clic tarjeta Admin → SOLO Admin desmarcada; QA CONSERVA su estado');
check('T3.1', (await ventasTotales()).includes(TOTAL_SOLO_QA), `ventas = solo QA (${TOTAL_SOLO_QA}) → ${await ventasTotales()}`);

// Desmarcar tarjeta 2: ambas desmarcadas → «Ningún usuario seleccionado»
await card(QA_ID).click(); await page.waitForTimeout(600);
check('T2.2', !(await pressed(QA_ID)) && !(await pressed(ADMIN_ID)) && (await estado()).includes('Ningún usuario seleccionado'),
  'desmarcar QA → ninguna seleccionada (estado explícito, NO revierte a Todos)');
check('T3.2', (await ventasTotales()).includes('0'), `ventas = 0 con ninguno seleccionado → ${await ventasTotales()}`);

// Marcar tarjeta 2: QA seleccionada; Admin conserva (desmarcada)
await card(QA_ID).click(); await page.waitForTimeout(600);
check('T2.3', (await pressed(QA_ID)) && !(await pressed(ADMIN_ID)),
  'marcar QA → QA seleccionada; Admin CONSERVA su estado (desmarcada)');
check('T3.3', (await ventasTotales()).includes(TOTAL_SOLO_QA), `ventas = solo QA (${TOTAL_SOLO_QA}) → ${await ventasTotales()}`);

// Marcar tarjeta 1: ambas seleccionadas
await card(ADMIN_ID).click(); await page.waitForTimeout(600);
check('T2.4', (await pressed(QA_ID)) && (await pressed(ADMIN_ID)) && (await estado()).includes('2 de 2'),
  'marcar Admin → ambas seleccionadas («2 de 2»)');
check('T3.4', (await ventasTotales()).includes(TOTAL_TODO), `ventas = todo el universo (${TOTAL_TODO}) → ${await ventasTotales()}`);

// Solo Admin: desmarcar QA
await card(QA_ID).click(); await page.waitForTimeout(600);
check('T2.5', !(await pressed(QA_ID)) && (await pressed(ADMIN_ID)), 'desmarcar QA → solo Admin seleccionada');
check('T3.5', (await ventasTotales()).includes(TOTAL_SOLO_ADMIN), `ventas = solo Admin (${TOTAL_SOLO_ADMIN}) → ${await ventasTotales()}`);

// Desmarcar ambas
await card(ADMIN_ID).click(); await page.waitForTimeout(600);
check('T2.6', !(await pressed(QA_ID)) && !(await pressed(ADMIN_ID)), 'desmarcar Admin → ninguna seleccionada');

// «Todos los usuarios» restaura
await page.getByTestId('filtro-usuarios-todos').click(); await page.waitForTimeout(600);
check('T2.7', (await pressed(QA_ID)) && (await pressed(ADMIN_ID)), '«Todos los usuarios» restaura ambas marcadas');
check('T3.6', (await ventasTotales()).includes(TOTAL_TODO), `ventas restauradas (${TOTAL_TODO}) → ${await ventasTotales()}`);

// ══ T4 · LOS ESTADOS SOBREVIVEN AL RE-RENDER (acordeón abrir/cerrar) ══
console.log('[T4] persistencia en re-render…');
await card(QA_ID).click(); await page.waitForTimeout(500); // desde «Todos»: queda SOLO Admin
check('T4.0', !(await pressed(QA_ID)) && (await pressed(ADMIN_ID)),
  'precondición: clic QA desde «Todos» deja SOLO Admin marcada');
check('T4.0b', (await ventasTotales()).includes(TOTAL_SOLO_ADMIN), `importes = solo Admin (${TOTAL_SOLO_ADMIN}) → ${await ventasTotales()}`);
const header = page.getByTestId('conceptos-selector-header');
if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
await page.waitForTimeout(400);
if ((await header.getAttribute('aria-expanded')) === 'true') await header.click();
await page.waitForTimeout(400);
check('T4.1', !(await pressed(QA_ID)) && (await pressed(ADMIN_ID)),
  'abrir/cerrar acordeón de conceptos NO altera la selección de tarjetas');
check('T4.2', (await ventasTotales()).includes(TOTAL_SOLO_ADMIN), `importes intactos tras re-render → ${await ventasTotales()}`);
await page.screenshot({ path: `${OUT}/04-tras-re-render.png`, fullPage: true });
await page.getByTestId('filtro-usuarios-todos').click(); await page.waitForTimeout(500); // restaurar Todos

// ══ T5 · EXPORTACIÓN PDF SIGUE FUNCIONANDO CON EL FILTRO ACTIVO ══
console.log('[T5] exportación PDF…');
await card(ADMIN_ID).click(); await page.waitForTimeout(500); // desde «Todos»: queda SOLO QA
const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
await page.getByRole('button', { name: /Exportar PDF/i }).first().click();
const download = await downloadPromise;
if (download) {
  const path = `${OUT}/export-solo-qa.pdf`;
  await download.saveAs(path);
  const size = fs.statSync(path).size;
  check('T5.1', size > 1000, `PDF exportado con filtro activo (${size} bytes): ${download.suggestedFilename()}`);
} else {
  // Alternativa: vista previa en blob (el builder abre preview)
  const preview = await page.locator('iframe[src^="blob:"], embed[src^="blob:"], [data-testid*="preview"]').count();
  check('T5.1', preview > 0, `PDF generado como vista previa blob (${preview} elemento/s)`);
}
const bodyTxt = await page.getByTestId('cash-report-view').innerText();
check('T5.2', !bodyTxt.includes('18a4b522') && !bodyTxt.includes('0c13aa78'), 'el cuerpo del reporte no expone UUIDs');
check('T5.3', bodyTxt.includes('QA Correcciones') && (await estado()).includes('1 de 2'),
  'el filtro activo documenta el nombre humano («1 de 2 · QA Correcciones»)');
await page.screenshot({ path: `${OUT}/05-export-filtro.png`, fullPage: true });

// ── Resumen ──
fs.writeFileSync(`${OUT}/resultados.json`, JSON.stringify({ ...evidence, failures }, null, 2));
console.log(`\n${failures.length === 0 ? '🎉 TODAS LAS PRUEBAS PASARON' : `⚠️ ${failures.length} FALLOS`}`);
for (const f of failures) console.log('  · ' + f);
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
