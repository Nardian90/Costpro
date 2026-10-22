// MISIÓN 2026-10-22 · Parte C3 — evidencia visual REAL en navegador (Playwright).
// Requisitos de la misión:
//   1. Reporte Entrega con el panel cerrado.
//   2. Reporte Entrega con la configuración abierta (reporte VISIBLE al lado).
//   3. El mismo reporte después de cerrar el panel.
//   4. Menú principal izquierdo en su estado normal (referencia de patrón).
//   5. Ingresos/Egresos cargando movimientos correctamente (sin el error
//      «No se pudieron cargar los movimientos»).
// Verificaciones programáticas adicionales (no solo capturas):
//   · Ingresos/Egresos: SIN el texto de error PGRST200; el listado/KPIs renderizan.
//   · Reporte Entrega con el panel ABIERTO: el reporte sigue VISIBLE (caja con
//     ancho > 0) y UTILIZABLE (elementFromPoint sobre el centro del periodo
//     cae DENTRO del reporte — no sobre el backdrop/panel) — prueba real del
//     defecto corregido («el contenido principal desaparece o queda inutilizable»).
//   · Sin errores de consola/pageerror durante la sesión.
// SOLO lecturas: no crea operaciones ni documentos.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = '/home/z/my-project/download/evidencia-mision-1022';
const EMAIL = 'admin@costpro.com';
const PASSWORD = process.env.COSTPRO_E2E_PASSWORD || 'Costpro-Mision14-15Oct-2026!';

fs.mkdirSync(OUT, { recursive: true });
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
  console.log(`${ok ? '✓' : '✗✗✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── Login (modal de la landing, abierto con ?login=1) ──────────────────────
await page.goto(`${BASE}/?login=1`, { waitUntil: 'domcontentloaded' });
await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 30000 });
await page.locator('input[type="email"]').first().fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASSWORD);
await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Iniciar")').first().click();
await page.waitForTimeout(4000);
console.log('[login] ok');

try {
  // ══ 5 · INGRESOS/EGRESOS (Parte A) — carga sin el error de relación ══
  // Deep-link canónico de la app: ?view=<id> (mismo destino que el menú).
  await page.goto(`${BASE}/?view=ingresos_egresos`, { waitUntil: 'domcontentloaded' });
  // Espera condicional: el encabezado de la vista (no timeouts fijos — tras
  // el login la app carga tienda/turno antes de pintar el módulo).
  await page.getByRole('heading', { name: /Ingresos \/ Egresos/i }).first()
    .waitFor({ state: 'visible', timeout: 45000 });
  await page.waitForTimeout(2500);
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const hasError = bodyText.includes('No se pudieron cargar los movimientos')
    || bodyText.includes('Could not find a relationship');
  check('A · Ingresos/Egresos SIN el error de movimientos (PGRST200)', !hasError);
  const hasContent = bodyText.includes('Ingresos') && (bodyText.includes('Egresos') || bodyText.includes('caja'));
  check('A · La vista de Ingresos/Egresos renderiza su contenido', hasContent);
  await page.screenshot({ path: `${OUT}/5-ingresos-egresos-cargado.png`, fullPage: false });

  // ══ Navegación a Ventas → Reporte Entrega (deep-link canónico) ══
  await page.goto(`${BASE}/?view=cash_report`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /Reporte de Caja — Entrega/i }).first()
    .waitFor({ state: 'visible', timeout: 45000 });
  await page.waitForTimeout(1500);

  // Generar el reporte del día (datos reales en vivo — solo lectura).
  const generar = page.getByRole('button', { name: /Generar reporte/i }).first();
  if (await generar.count() > 0) { await generar.click(); await page.waitForTimeout(3500); }
  await page.waitForTimeout(1500);

  // ══ 4 · MENÚ PRINCIPAL IZQUIERDO (referencia de patrón) ══
  await page.screenshot({ path: `${OUT}/4-menu-principal-izquierdo-referencia.png`, fullPage: false });
  check('4 · Menú principal izquierdo capturado (referencia de patrón)', true);

  // ══ 1 · REPORTE ENTREGA — PANEL CERRADO ══
  // Métrica de anchura: la FILA DE PESTAÑAS del reporte (la columna completa,
  // no el input de fecha, que tiene max-w propio).
  const tablist = page.getByRole('tablist', { name: /Secciones del reporte/i }).first();
  const periodInput = page.locator('#cr-sd').first();
  const closedBox = await tablist.boundingBox();
  check('1 · Panel cerrado: el reporte ocupa el ancho completo', !!closedBox && closedBox.width > 700, closedBox ? `width=${Math.round(closedBox.width)}px` : 'no box');
  await page.screenshot({ path: `${OUT}/1-reporte-entrega-panel-cerrado.png`, fullPage: false });

  // ══ 2 · REPORTE ENTREGA — CONFIGURACIÓN ABIERTA ══
  await page.getByRole('button', { name: /Configuración del reporte/i }).first().click();
  await page.waitForTimeout(600); // transición de 300ms completa
  const panel = page.locator('[data-testid="cash-report-config-panel"]');
  check('2 · El panel de configuración está abierto', (await panel.getAttribute('data-open')) === 'true');
  const openBox = await tablist.boundingBox();
  check('2 · Con el panel abierto el reporte SIGUE VISIBLE (columna con ancho sustancial)',
    !!openBox && openBox.width > 400, openBox ? `width=${Math.round(openBox.width)}px (cerrado: ${Math.round(closedBox?.width ?? 0)}px)` : 'no box');
  const panelBox = await panel.boundingBox();
  check('2 · El panel ocupa su columna de ~400px del layout',
    !!panelBox && Math.abs(panelBox.width - 400) < 8, panelBox ? `width=${Math.round(panelBox.width)}px` : 'no box');
  // Prueba REAL de interactividad: el punto central del input de periodo cae
  // dentro del reporte — NO sobre un backdrop/velo (defecto original).
  if (openBox) {
    const cx = openBox.x + openBox.width / 2, cy = openBox.y + openBox.height / 2;
    const hit = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? (el.closest('[data-testid="cash-report-view"]') ? 'reporte' : el.closest('[data-testid="cash-report-config-panel"]') ? 'panel' : 'otro') : 'nada';
    }, [cx, cy]);
    check('2 · El periodo del reporte es UTILIZABLE (elementFromPoint cae en el reporte)', hit === 'reporte', `hit=${hit}`);
  }
  // El panel es una columna del layout (no fixed) en escritorio.
  const panelPosition = await panel.evaluate((el) => getComputedStyle(el).position);
  check('2 · El panel es columna del layout (position static, no overlay)', panelPosition === 'static', `position=${panelPosition}`);
  await page.screenshot({ path: `${OUT}/2-reporte-entrega-configuracion-abierta.png`, fullPage: false });

  // ══ 3 · REPORTE ENTREGA — DESPUÉS DE CERRAR EL PANEL ══
  await page.locator('[data-testid="cash-report-config-close"]').first().click();
  await page.waitForTimeout(600);
  const reopenedBox = await tablist.boundingBox();
  check('3 · Tras cerrar, el reporte recupera su ancho (sin saltos acumulativos)',
    !!reopenedBox && Math.abs(reopenedBox.width - (closedBox?.width ?? 0)) < 2,
    reopenedBox ? `width=${Math.round(reopenedBox.width)}px` : 'no box');
  check('3 · El panel quedó cerrado y oculto al árbol de accesibilidad',
    (await panel.getAttribute('data-open')) === 'false' && (await panel.getAttribute('aria-hidden')) === 'true');
  await page.screenshot({ path: `${OUT}/3-reporte-entrega-tras-cerrar-panel.png`, fullPage: false });

  // Reabrir/cerrar repetido (estabilidad del ciclo, §B3.8).
  for (let i = 0; i < 2; i += 1) {
    await page.getByRole('button', { name: /Configuración del reporte/i }).first().click();
    await page.waitForTimeout(450);
    await page.locator('[data-testid="cash-report-config-close"]').first().click();
    await page.waitForTimeout(450);
  }
  const stableBox = await tablist.boundingBox();
  check('B3.8 · Ciclos repetidos: el ancho del reporte es estable (sin deriva)',
    !!stableBox && Math.abs(stableBox.width - (closedBox?.width ?? 0)) < 2,
    stableBox ? `width=${Math.round(stableBox.width)}px` : 'no box');
} catch (e) {
  check('ejecución del guion', false, String(e).slice(0, 300));
}

// Errores de consola relevantes (se filtran los de red de assets de desarrollo).
const relevantErrors = consoleErrors.filter((e) => !/favicon|net::|Failed to load resource|404|sourcemap|WebSocket|HMR|react-refresh|webpack/i.test(e));
check('Sin errores de consola/pageerror relevantes durante la sesión', relevantErrors.length === 0, relevantErrors.slice(0, 3).join(' | ').slice(0, 300));

fs.writeFileSync(`${OUT}/resultados.json`, JSON.stringify({ results, consoleErrors: consoleErrors.slice(0, 20) }, null, 2));
console.log(`\n${results.filter(r => r.ok).length}/${results.length} verificaciones OK · capturas en ${OUT}`);
await browser.close();
process.exit(results.every(r => r.ok) ? 0 : 1);
