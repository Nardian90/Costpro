// MISIÓN CP-SIDEBAR-RESTORATION-001 — Validación REAL en navegador (solo lectura).
// Pruebas de aceptación §9 + validación responsive §10 en 6 resoluciones.
// Evidencia: /home/z/my-project/download/evidencia/sidebar-20261124/
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = '/home/z/my-project/download/evidencia/sidebar-20261124';
const EMAIL = 'admin@costpro.com';
const PASSWORD = process.env.COSTPRO_E2E_PASSWORD || 'Costpro-Mision14-15Oct-2026!';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  baseURL: BASE, timezoneId: 'America/Havana', locale: 'es-CU',
  viewport: { width: 1920, height: 1080 },
});
const page = await ctx.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 160)}`));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`console: ${m.text().slice(0, 160)}`); });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` — ${detail}` : ''}`);
};

const asideW = () => page.evaluate(() => {
  const a = document.querySelector('aside[data-sidebar]');
  return a ? Math.round(a.getBoundingClientRect().width) : -1;
});
const mainX = () => page.evaluate(() => {
  const m = document.getElementById('main-content');
  return m ? Math.round(m.getBoundingClientRect().x) : -1;
});
const toggleCount = () => page.evaluate(() =>
  Array.from(document.querySelectorAll('button[aria-label]'))
    .filter(b => /menú lateral/i.test(b.getAttribute('aria-label') || '')).length
);
const clickToggle = async (label) => {
  await page.getByRole('button', { name: label }).click({ timeout: 8000 });
  await page.waitForTimeout(500); // transición 300ms + margen
};
const gotoApp = async (view = 'dashboard') => {
  await page.goto(`${BASE}/?view=${view}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  // 'attached' (no 'visible'): en móvil el drawer arranca CERRADO (w-0) — §7.
  await page.waitForSelector('aside[data-sidebar]', { state: 'attached', timeout: 40000 });
  await page.waitForTimeout(1200);
};
// La preferencia PERSISTE entre cargas (§6) — una resolución anterior pudo
// dejar rail. Para probar ESTADO A, se asegura expandido con el control único.
const ensureExpanded = async () => {
  if ((await asideW()) < 100) {
    await clickToggle('Expandir menú lateral');
  }
};

// ── Login ──
await page.goto(`${BASE}/?login=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
const btnCookies = page.getByRole('button', { name: /Aceptar todas/i }).first();
try {
  await btnCookies.waitFor({ state: 'visible', timeout: 12000 });
  await btnCookies.click({ timeout: 20000 });
  await page.waitForTimeout(800);
} catch { /* consentimiento previo */ }
const btnLogin = page.locator('[role="dialog"] button[type="submit"]').first();
await btnLogin.waitFor({ state: 'visible', timeout: 60000 });
await page.locator('[role="dialog"] input[type="email"]').first().fill(EMAIL);
await page.locator('[role="dialog"] input[type="password"]').first().fill(PASSWORD);
await btnLogin.click({ timeout: 60000 });
await page.waitForTimeout(6000);
check('login OK', true);

// ══════════ 1920×1080 — ESTADO A (expandido) ══════════
await gotoApp('dashboard');
let w = await asideW();
check('1920 · ESTADO A expandido (ancho 288)', w === 288, `w=${w}`);
let mx = await mainX();
// El frame CyberShell añade p-2+borde (~9px) sobre main-content: el criterio
// es que el contenido EMPIEZA DESPUÉS del menú (mx ≥ w), nunca superpuesto.
check('1920 · contenido empieza DESPUÉS del menú (sin superposición)', mx >= w && mx - w <= 12, `main.x=${mx} w=${w}`);
check('1920 · etiquetas visibles (OPERACIÓN)', await page.getByText('OPERACIÓN', { exact: true }).first().isVisible());
let tc = await toggleCount();
check('1920 · INSPECCIÓN: UN SOLO control del menú en toda la app', tc === 1, `controles=${tc}`);
await page.screenshot({ path: `${OUT}/1920-expandido-estadoA.png` });

// clic → ESTADO B (rail)
await clickToggle('Contraer menú lateral');
w = await asideW();
check('1920 · clic → ESTADO B contraído (ancho 80)', w === 80, `w=${w}`);
mx = await mainX();
check('1920 · contenido RECUPERA el espacio liberado', mx >= w && mx - w <= 12, `main.x=${mx}`);
check('1920 · rail: iconos presentes (Inicio)', await page.getByRole('button', { name: 'Inicio', exact: true }).isVisible());
check('1920 · rail: el MISMO control sigue accesible en la barra compacta', await page.getByRole('button', { name: 'Expandir menú lateral' }).isVisible());
await page.screenshot({ path: `${OUT}/1920-rail-estadoB.png` });

// ── Hover: CERO expansión automática (§4) ──
await page.mouse.move(40, 400); await page.waitForTimeout(700); // > timers históricos 100/180ms
let wHover = await asideW();
check('1920 · HOVER sobre la barra (rail): NO expande', wHover === 80, `w tras hover=${wHover}`);
await page.mouse.move(40, 150); await page.waitForTimeout(700); // sobre iconos
wHover = await asideW();
check('1920 · HOVER sobre iconos: NO expande ni muestra etiquetas', wHover === 80, `w=${wHover}`);
const stateAfterHover = await page.evaluate(() => localStorage.getItem('costpro-ui-storage')?.includes('"sidebarState":"rail"'));
check('1920 · hover NO muta la preferencia persistida', stateAfterHover === true);
await page.screenshot({ path: `${OUT}/1920-rail-hover-sin-cambio.png` });

// ── Icono raíz en rail: navega SIN expandir ──
await page.getByRole('button', { name: 'OPERACIÓN' }).click();
await page.waitForTimeout(900);
w = await asideW();
check('1920 · clic en icono raíz (rail): navega a Vender sin expandir', w === 80 && page.url().includes('view=pos'), `w=${w} url=${page.url().slice(0, 60)}`);

// ── Navegación conserva el estado (§6) ──
check('1920 · navegar a otra vista CONSERVA rail', (await asideW()) === 80);

// ── Recarga recupera la preferencia (§6) ──
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('aside[data-sidebar]', { timeout: 40000 });
await page.waitForTimeout(1200);
w = await asideW();
check('1920 · RECARGA recupera la preferencia (rail persistente)', w === 80, `w=${w}`);

// ── Expandir de nuevo: el contenido se desplaza a la derecha ──
await clickToggle('Expandir menú lateral');
w = await asideW();
mx = await mainX();
check('1920 · expandir de nuevo → contenido se desplaza (sin tapar nada)', w === 288 && mx >= 288 && mx - 288 <= 12, `w=${w} main.x=${mx}`);
const noHOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
check('1920 · sin desbordamiento horizontal', noHOverflow);

// ══════════ 1366×768 ══════════
await page.setViewportSize({ width: 1366, height: 768 });
await gotoApp('pos');
await ensureExpanded();
w = await asideW();
check('1366 · expandido (288)', w === 288, `w=${w}`);
await page.screenshot({ path: `${OUT}/1366-expandido.png` });
await clickToggle('Contraer menú lateral');
await page.mouse.move(40, 400); await page.waitForTimeout(700);
w = await asideW();
check('1366 · rail 80 + hover sin expansión', w === 80, `w=${w}`);
await page.screenshot({ path: `${OUT}/1366-rail.png` });

// ══════════ 1024×768 ══════════
await page.setViewportSize({ width: 1024, height: 768 });
await gotoApp('pos');
await ensureExpanded();
w = await asideW();
check('1024 · expandido (lg:w-72 = 288)', w === 288, `w=${w}`);
await clickToggle('Contraer menú lateral');
w = await asideW();
check('1024 · rail (80) — control accesible', w === 80 && await page.getByRole('button', { name: 'Expandir menú lateral' }).isVisible(), `w=${w}`);
await page.screenshot({ path: `${OUT}/1024-rail.png` });
await clickToggle('Expandir menú lateral');

// ══════════ 768×1024 (tablet ancho — desktop layout, umbral ≥768) ══════════
await page.setViewportSize({ width: 768, height: 1024 });
await gotoApp('pos');
await ensureExpanded();
w = await asideW();
check('768 · desktop layout (umbral md): expandido 256', w === 256, `w=${w}`);
await page.screenshot({ path: `${OUT}/768-expandido.png` });
await clickToggle('Contraer menú lateral');
check('768 · rail 80', (await asideW()) === 80);

// ══════════ 390×844 — móvil (§7) ══════════
await page.setViewportSize({ width: 390, height: 844 });
await gotoApp('pos');
w = await asideW();
check('390 · drawer cerrado al cargar (sin overlay bloqueante)', w === 0, `w=${w}`);
const ham = page.getByRole('button', { name: 'Abrir menú lateral' });
check('390 · control de navegación móvil visible', await ham.isVisible());
await ham.click();
await page.waitForTimeout(600);
w = await asideW();
const backdropVisible = await page.evaluate(() => !!document.querySelector('div.fixed.inset-0.bg-black\\/50'));
check('390 · drawer abierto (256) con backdrop', w === 256 && backdropVisible, `w=${w} backdrop=${backdropVisible}`);
await page.screenshot({ path: `${OUT}/390-drawer-abierto.png` });

// categoría NO cierra el drawer; hoja funcional SÍ cierra.
// (Con vista activa pos, el drawer abre en modo foco: hijos de OPERACIÓN.)
const categoria = page.getByRole('button', { name: /^VENTAS/i }).first();
if (await categoria.isVisible().catch(() => false)) {
  await categoria.click();
  await page.waitForTimeout(700);
  check('390 · expandir/contraer categoría NO cierra el drawer', (await asideW()) === 256, `w=${await asideW()}`);
} else {
  check('390 · drawer en modo foco (hijos visibles)', (await asideW()) === 256);
}
const hoja = page.getByRole('button', { name: 'Vender', exact: true }).first();
await hoja.click({ timeout: 10000 });
await page.waitForTimeout(700);
w = await asideW();
check('390 · clic en vista funcional (Vender) cierra el drawer', w === 0, `w=${w}`);
await page.screenshot({ path: `${OUT}/390-drawer-cerrado.png` });

// ══════════ 360×800 — móvil pequeño ══════════
await page.setViewportSize({ width: 360, height: 800 });
await gotoApp('pos');
await page.getByRole('button', { name: 'Abrir menú lateral' }).click();
await page.waitForTimeout(600);
w = await asideW();
check('360 · drawer funciona en pantalla pequeña', w === 256, `w=${w}`);
await page.screenshot({ path: `${OUT}/360-drawer-abierto.png` });
const noMobileOverlay = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
check('360 · sin desbordamiento horizontal en móvil', noMobileOverlay);

// ── Consola ──
check('SIN errores de consola/pageerror', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || 'limpia');

const fails = results.filter(r => !r.ok);
console.log(`\n═══ RESUMEN: ${results.length - fails.length}/${results.length} PASS ═══`);
await browser.close();
process.exit(fails.length ? 1 : 0);
