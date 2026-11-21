// CP-NAV-FINANCIAL-STATEMENTS-TOP-LEVEL-NAVIGATION-001 — Verificación VISUAL
// de la reorganización del menú lateral (READ-ONLY: solo navegación y capturas;
// NINGUNA mutación de datos: no se confirman ventas, recepciones ni pagos).
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = '/home/z/my-project/download/cp-nav-financial-statements-001/evidencia-ui';
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

// Orden de los destinos de navegación dentro del aside (ítems con texto),
// ignorando «Inicio» fijo y la sección «Fijados» (sin pins en sesión nueva).
const navOrder = async () => {
  const aside = page.locator('aside[data-sidebar]');
  const texts = await aside.locator('button span').allTextContents();
  const wanted = ['Estados Financieros', 'OPERACIÓN', 'RECURSOS HUMANOS'];
  const pos = wanted.map(w => {
    const i = texts.findIndex(t => t.trim() === w);
    return i;
  });
  return { texts, pos };
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
  await page.goto(`${BASE}/?login=1`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  try { await page.getByRole('button', { name: /aceptar|accept/i }).first().click({ timeout: 2500 }); } catch {}
  await page.locator('button[type="submit"], button:has-text("Iniciar")').first().click();
  await page.waitForTimeout(7000);
  await dismissTasas();

  // ═══ 1. Escritorio expandido: orden del menú ═══
  console.log('\n== 1. Escritorio: Estados Financieros primero, luego OPERACIÓN, RECURSOS HUMANOS ==');
  await page.goto(`${BASE}/?view=dashboard`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(6000);
  // asegurar sidebar expandido (toggle hasta 'expanded' como mucho 2 clics)
  for (let i = 0; i < 3; i++) {
    const cls = await page.locator('aside[data-sidebar]').getAttribute('class');
    if (cls?.includes('w-64') || cls?.includes('w-72')) break;
    await page.locator('header button').first().click().catch(() => {});
    await page.waitForTimeout(900);
  }
  await page.screenshot({ path: `${OUT}/01-desktop-expandido-inicio.png` });
  const { pos: p1 } = await navOrder();
  check('1a. Estados Financieros presente en el menú', p1[0] >= 0);
  check('1b. OPERACIÓN presente', p1[1] >= 0);
  check('1c. RECURSOS HUMANOS presente', p1[2] >= 0);
  check('1d. Orden: Estados Financieros ANTES de OPERACIÓN', p1[0] >= 0 && p1[1] >= 0 && p1[0] < p1[1], `[EF=${p1[0]}, OP=${p1[1]}]`);
  check('1e. Orden: OPERACIÓN antes de RECURSOS HUMANOS', p1[1] >= 0 && p1[2] >= 0 && p1[1] < p1[2]);

  // ═══ 2. Sin duplicación dentro de OPERACIÓN ═══
  console.log('\n== 2. OPERACIÓN sin Estados Financieros ==');
  await page.locator('aside[data-sidebar] button', { hasText: 'OPERACIÓN' }).first().click();
  await page.waitForTimeout(1200);
  const focusTexts = (await page.locator('aside[data-sidebar] button span').allTextContents()).map(t => t.trim());
  const dupInOp = focusTexts.filter(t => t === 'Estados Financieros').length;
  check('2a. Focus OPERACIÓN abierto sin hoja Estados Financieros', dupInOp === 0, `apariciones=${dupInOp}`);
  await page.screenshot({ path: `${OUT}/02-desktop-focus-operacion-sin-EF.png` });
  // salir del focus mode (breadcrumb INICIO — patrón de la app: el focus
  // muestra SOLO los hijos del módulo enfocado, como cualquier otro módulo)
  await page.locator('aside[data-sidebar] button[aria-label="Volver al inicio"]').first().click();
  await page.waitForTimeout(1000);

  // ═══ 3. Clic directo → vista + resaltado activo ═══
  console.log('\n== 3. Acceso directo y resaltado ==');
  await page.locator('aside[data-sidebar] button', { hasText: 'Estados Financieros' }).first().click();
  await page.waitForTimeout(4000);
  check('3a. URL con view=financial-statements', page.url().includes('view=financial-statements'), page.url());
  const efActive = await page.locator('aside[data-sidebar] button[aria-current="page"]').allTextContents();
  check('3b. Resaltado activo en Estados Financieros (aria-current)', efActive.some(t => t.trim() === 'Estados Financieros'), JSON.stringify(efActive));
  await page.screenshot({ path: `${OUT}/03-desktop-estados-financieros-activo.png` });

  // ═══ 4. Navegar a otra área → el resaltado se actualiza ═══
  console.log('\n== 4. Resaltado se actualiza al salir ==');
  await page.locator('aside[data-sidebar] button', { hasText: 'OPERACIÓN' }).first().click();
  await page.waitForTimeout(1500);
  // el clic en el módulo raíz navega a su vista por defecto (MODULE_DEFAULT_VIEW.operacion = pos)
  check('4a. URL con view=pos (vista por defecto de OPERACIÓN)', page.url().includes('view=pos'), page.url());
  let efActive2 = await page.locator('aside[data-sidebar] button[aria-current="page"]').allTextContents();
  check('4b. Estados Financieros YA NO activo', !efActive2.some(t => t.trim() === 'Estados Financieros'), JSON.stringify(efActive2));
  // navegar por el submenú Ventas → Vender (dentro del focus)
  await page.locator('aside[data-sidebar] button', { hasText: 'Ventas' }).first().click();
  await page.waitForTimeout(700);
  await page.locator('aside[data-sidebar] button', { hasText: 'Vender' }).first().click();
  await page.waitForTimeout(5000);
  await dismissTasas();
  check('4c. Submenú Ventas → Vender mantiene view=pos', page.url().includes('view=pos'), page.url());
  efActive2 = await page.locator('aside[data-sidebar] button[aria-current="page"]').allTextContents();
  check('4d. Estados Financieros sigue sin resaltado dentro de OPERACIÓN', !efActive2.some(t => t.trim() === 'Estados Financieros'));
  await page.screenshot({ path: `${OUT}/04-desktop-pos-activo.png` });

  // ═══ 5. Regreso → resaltado vuelve ═══
  console.log('\n== 5. Regreso a Estados Financieros ==');
  // salir del focus de OPERACIÓN (el ítem directo no es visible dentro del focus)
  await page.locator('aside[data-sidebar] button[aria-label="Volver al inicio"]').first().click();
  await page.waitForTimeout(1000);
  await page.locator('aside[data-sidebar] button', { hasText: 'Estados Financieros' }).first().click();
  await page.waitForTimeout(3500);
  const efActive3 = await page.locator('aside[data-sidebar] button[aria-current="page"]').allTextContents();
  check('5a. Resaltado vuelve a Estados Financieros', efActive3.some(t => t.trim() === 'Estados Financieros'));

  // ═══ 6. Deep-link directo ═══
  console.log('\n== 6. Deep-link y favoritos ==');
  await page.goto(`${BASE}/?view=financial-statements`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(4000);
  check('6a. Deep-link /?view=financial-statements carga la vista', page.url().includes('view=financial-statements'));
  const efActive4 = await page.locator('aside[data-sidebar] button[aria-current="page"]').allTextContents();
  check('6b. Resaltado correcto tras deep-link', efActive4.some(t => t.trim() === 'Estados Financieros'), JSON.stringify(efActive4));
  const title = await page.locator('header').first().textContent();
  check('6c. Título de la vista en el header', /Estados Financieros/i.test(title || ''), (title || '').slice(0, 90));

  // ═══ 7. Rail (menú contraído) ═══
  console.log('\n== 7. Rail (contraído) ==');
  for (let i = 0; i < 4; i++) {
    const cls = await page.locator('aside[data-sidebar]').getAttribute('class');
    if (cls?.includes('w-20')) break;
    await page.locator('header button').first().click().catch(() => {});
    await page.waitForTimeout(900);
  }
  const railCls = await page.locator('aside[data-sidebar]').getAttribute('class');
  check('7a. Sidebar en rail (w-20)', railCls?.includes('w-20') || railCls?.includes('w-0'), railCls || '');
  const railLabels = (await page.locator('aside[data-sidebar] button span').allTextContents()).map(t => t.trim());
  check('7b. Rail sin etiquetas de texto', !railLabels.includes('Estados Financieros'), railLabels.join('|').slice(0, 80));
  await page.screenshot({ path: `${OUT}/05-desktop-rail-contraido.png` });
  // restaurar expandido
  for (let i = 0; i < 4; i++) {
    const cls = await page.locator('aside[data-sidebar]').getAttribute('class');
    if (cls?.includes('w-64') || cls?.includes('w-72')) break;
    await page.locator('header button').first().click().catch(() => {});
    await page.waitForTimeout(900);
  }

  // ═══ 8. Móvil: drawer + sheet «Más» ═══
  console.log('\n== 8. Móvil (375×812) ==');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE}/?view=dashboard`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(5000);
  await page.locator('header button').first().click().catch(() => {});
  await page.waitForTimeout(1200);
  const mOrder = await navOrder();
  check('8a. Móvil drawer: Estados Financieros primero (antes de OPERACIÓN)', mOrder.pos[0] >= 0 && mOrder.pos[1] >= 0 && mOrder.pos[0] < mOrder.pos[1], `[EF=${mOrder.pos[0]}, OP=${mOrder.pos[1]}]`);
  await page.screenshot({ path: `${OUT}/06-movil-drawer-EF-primero.png` });
  await page.locator('aside[data-sidebar] button', { hasText: 'Estados Financieros' }).first().click();
  await page.waitForTimeout(4000);
  check('8b. Móvil: tap accede a la vista', page.url().includes('view=financial-statements'));
  const mActive = await page.locator('aside[data-sidebar] button[aria-current="page"]').allTextContents();
  check('8c. Móvil: resaltado activo', mActive.some(t => t.trim() === 'Estados Financieros'));
  // sheet «Más»
  const masBtn = page.getByRole('button', { name: /^Más$|mas$/i }).first();
  try { await masBtn.click({ timeout: 4000 }); } catch { await page.locator('button:has-text("Más")').last().click(); }
  await page.waitForTimeout(1200);
  const sheetTxt = await page.locator('[role="dialog"], .fixed.inset-0').last().textContent();
  check('8d. Sheet «Más»: grupo Estados Financieros presente', /Estados Financieros/i.test(sheetTxt || ''));
  await page.screenshot({ path: `${OUT}/07-movil-sheet-mas-EF.png` });
  // cerrar sheet
  await page.keyboard.press('Escape').catch(() => {});

  // ═══ 9. Tableta ═══
  console.log('\n== 9. Tableta (768×1024) ==');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(`${BASE}/?view=financial-statements`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(4500);
  const tActive = await page.locator('aside[data-sidebar] button[aria-current="page"]').allTextContents();
  check('9a. Tableta: vista financiera activa con resaltado', tActive.some(t => t.trim() === 'Estados Financieros'));
  await page.screenshot({ path: `${OUT}/08-tableta-EF-activo.png` });

  // ═══ 10. Errores de consola ═══
  check('10a. Sin errores pageerror durante toda la sesión', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' § '));
} catch (e) {
  check('EXCEPCIÓN del script', false, String(e).slice(0, 300));
} finally {
  await page.screenshot({ path: `${OUT}/99-final.png` }).catch(() => {});
  await browser.close();
  const ok = results.filter(r => r.ok).length;
  console.log(`\nRESULTADO: ${ok}/${results.length} checks PASS`);
  fs.writeFileSync(`${OUT}/resultados.json`, JSON.stringify(results, null, 2));
}
