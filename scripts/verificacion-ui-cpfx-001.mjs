// CP-FX-001 — Verificación VISUAL de la tarjeta premium del dólar informal y
// de la continuidad histórica en Inteligencia Cambiaria (READ-ONLY: solo
// navegación y capturas; NINGUNA mutación de datos).
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = '/home/z/my-project/download/cpfx-evidencia';
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
page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message.slice(0, 160)}`));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
};

const dismissTasas = async (esperarMs = 5000) => {
  const dlg = page.getByRole('dialog', { name: /tasas de cambio siguen vigentes|Confirmar tasas/i }).first();
  try { await dlg.waitFor({ state: 'visible', timeout: esperarMs }); } catch { return; }
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: /Continuar sin confirmar/i }).first().click().catch(() => {});
    await page.waitForTimeout(600);
    if (!(await dlg.isVisible().catch(() => false))) return;
  }
};

try {
  // ── Login ──
  await page.goto(`${BASE}/?login=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  try { await page.getByRole('button', { name: /aceptar|accept/i }).first().click({ timeout: 2500 }); } catch {}
  await page.locator('button[type="submit"], button:has-text("Iniciar")').first().click();
  await page.waitForTimeout(7000);
  await dismissTasas();
  check('login admin', !(await page.locator('input[type="password"]').first().isVisible().catch(() => false)));

  // ── 1) Panel de Control (Inicio): tarjeta premium ──
  await page.waitForTimeout(4000);
  const card = page.getByTestId('fx-card');
  try {
    await card.waitFor({ state: 'visible', timeout: 30000 });
    check('FASE 1: tarjeta fx-card visible en el Panel de Control', true);
    const rate = await page.getByTestId('fx-rate-value').textContent();
    check('tarjeta muestra 1 USD = X CUP', /1 USD =/.test(rate ?? '') && /CUP/.test(rate ?? ''), (rate ?? '').trim().slice(0, 40));
    const fecha = await page.getByTestId('fx-data-date').textContent();
    check('fecha real del dato visible', /Dato: \d{2}\/\d{2}\/\d{4}/.test(fecha ?? ''), (fecha ?? '').trim());
    const chip = await page.getByTestId('fx-status-chip').textContent();
    check('chip de estado (Observada hoy / Última disponible)', /Observada hoy|Última disponible/.test(chip ?? ''), (chip ?? '').trim());
    const varBadge = await page.getByTestId('fx-variation-badge').textContent().catch(() => null);
    const varMissing = await page.getByTestId('fx-variation-missing').textContent().catch(() => null);
    check('variación diaria (badge o sin dato honesto)', Boolean(varBadge || varMissing), (varBadge ?? varMissing ?? '').trim().slice(0, 60));
    await page.screenshot({ path: `${OUT}/tarjeta-desktop-1440.png`, fullPage: false });
  } catch (e) {
    check('FASE 1: tarjeta fx-card visible en el Panel de Control', false, e.message.slice(0, 120));
    await page.screenshot({ path: `${OUT}/tarjeta-desktop-ERROR.png`, fullPage: true });
  }

  // ── 2) Acceso directo «Ver evolución» → Inteligencia Cambiaria ──
  try {
    await page.getByTestId('fx-ver-evolucion').click();
    await page.waitForTimeout(6000);
    const enIC = await page.getByText('Inteligencia Cambiaria').first().isVisible().catch(() => false);
    check('FASE 1 §D: «Ver evolución» navega a Inteligencia Cambiaria', enIC);
  } catch (e) {
    check('FASE 1 §D: «Ver evolución» navega a Inteligencia Cambiaria', false, e.message.slice(0, 120));
  }

  // ── 3) Histórico: continuidad + serie estimada diferenciada ──
  try {
    await page.getByRole('tab', { name: /Histórico/i }).first().click();
    await page.waitForTimeout(9000); // carga del archivo completo (days=all)
    const leyendaEst = await page.getByText('USD Informal estimada').first().isVisible().catch(() => false);
    check('FASE 5: leyenda «USD Informal estimada» visible', leyendaEst);
    const leyendaObs = await page.getByText('USD Informal', { exact: false }).first().isVisible().catch(() => false);
    check('FASE 5: leyenda «USD Informal» observada visible', leyendaObs);
    const svg = await page.locator('.recharts-wrapper svg').first().isVisible().catch(() => false);
    check('FASE 5: gráfico principal renderiza', svg);
    const dashed = await page.locator('.recharts-wrapper svg path[stroke="#d97706"], .recharts-wrapper svg path[stroke-dasharray="6 4"]').count();
    check('FASE 5: tramos discontinuos ámbar (estimadas) presentes', dashed > 0, `paths=${dashed}`);
    await page.screenshot({ path: `${OUT}/historico-serie-continua.png`, fullPage: false });
  } catch (e) {
    check('FASE 5: pestaña Histórico', false, e.message.slice(0, 120));
    await page.screenshot({ path: `${OUT}/historico-ERROR.png`, fullPage: true });
  }

  // ── 4) Tarjeta en móvil (390px) sin desbordamiento ──
  const mp = await ctx.browser()?.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, timezoneId: 'America/Havana', locale: 'es-CU' });
  if (mp) {
    const mpage = await mp.newPage();
    mpage.on('pageerror', e => consoleErrors.push(`pageerror-movil: ${e.message.slice(0, 160)}`));
    try {
      await mpage.goto(`${BASE}/?login=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await mpage.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 30000 });
      await mpage.locator('input[type="email"]').first().fill(EMAIL);
      await mpage.locator('input[type="password"]').first().fill(PASSWORD);
      try { await mpage.getByRole('button', { name: /aceptar|accept/i }).first().click({ timeout: 2500 }); } catch {}
      await mpage.locator('button[type="submit"], button:has-text("Iniciar")').first().click();
      await mpage.waitForTimeout(8000);
      const mcard = mpage.getByTestId('fx-card');
      await mcard.waitFor({ state: 'visible', timeout: 30000 });
      const overflow = await mpage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check('responsive móvil 390: tarjeta visible sin desborde horizontal', overflow <= 0, `overflow=${overflow}px`);
      await mpage.screenshot({ path: `${OUT}/tarjeta-movil-390.png`, fullPage: false });
    } catch (e) {
      check('responsive móvil 390', false, e.message.slice(0, 120));
      await mpage.screenshot({ path: `${OUT}/tarjeta-movil-ERROR.png`, fullPage: true });
    }
    await mp.close();
  }

  check('sin errores de consola/pageerror', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' · '));
  const pass = results.filter(r => r.ok).length;
  console.log(`\nRESUMEN: ${pass}/${results.length} PASS`);
  fs.writeFileSync(`${OUT}/resultados.json`, JSON.stringify({ results, consoleErrors }, null, 2));
} finally {
  await browser.close();
}
