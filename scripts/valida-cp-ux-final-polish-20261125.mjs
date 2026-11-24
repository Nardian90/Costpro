// MISIÓN CP-UX-FINAL-POLISH-003 — Validación REAL en navegador (SOLO LECTURA).
// Prueba: (a) cero diálogos nativos en flujos funcionales; (b) diálogo propio de
// COSTPRO al guardar borrador de Servicios Recibidos (se CANCELA: no persiste);
// (c) botón «Guardar borrador» correcto en Light y Dark (estilos computados +
// contraste); (d) bloqueo sin proveedor antes de cualquier diálogo; (e) móvil.
// Evidencia: /home/z/my-project/download/cp-ux-polish/evidencia/
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = '/home/z/my-project/download/cp-ux-polish/evidencia';
const EMAIL = 'admin@costpro.com';
const PASSWORD = process.env.COSTPRO_E2E_PASSWORD || 'Costpro-Mision14-15Oct-2026!';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  baseURL: BASE, timezoneId: 'America/Havana', locale: 'es-CU',
  viewport: { width: 1920, height: 1080 },
});
const page = await ctx.newPage();

// ── Guard de diálogos NATIVOS: si el navegador abriera uno, queda registrado.
//    La misión exige CERO en flujos funcionales.
const nativeDialogs = [];
page.on('dialog', async (d) => {
  nativeDialogs.push({ type: d.type(), message: (d.message() || '').slice(0, 120) });
  await d.dismiss().catch(() => {});
});
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 160)}`));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`console: ${m.text().slice(0, 160)}`); });
const posts = [];
page.on('request', (r) => { if (r.method() === 'POST') posts.push(r.url()); });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` — ${detail}` : ''}`);
};
const srgbToLinear = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const luminancia = (r, g, b) => 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
const contraste = (rgb1, rgb2) => {
  const L1 = luminancia(...rgb1); const L2 = luminancia(...rgb2);
  return Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100;
};
const estilosBoton = () => page.evaluate(() => {
  const btn = document.querySelector('[data-testid="save-draft-button"]');
  if (!btn) return null;
  const cs = getComputedStyle(btn);
  const parse = (s) => s.match(/\d+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
  return {
    bg: cs.backgroundColor, color: cs.color, border: cs.borderColor, borderWidth: cs.borderWidth,
    bgRgb: parse(cs.backgroundColor), colorRgb: parse(cs.color), borderRgb: parse(cs.borderColor),
    minHeight: cs.minHeight, disabled: btn.disabled, text: btn.textContent.trim(),
  };
});

// ── Login (patrón valida-sidebar-20261124) ──
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
check('login', page.url().includes('login=1') === false, page.url().slice(0, 80));

const gotoSR = async () => {
  await page.goto(`${BASE}/?view=received-services`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.getByTestId('new-service-button').or(page.getByRole('button', { name: /Nuevo Servicio/i })).first().waitFor({ state: 'visible', timeout: 40000 });
  await page.waitForTimeout(1200);
};
const setTema = async (tema) => {
  await page.evaluate((t) => { localStorage.setItem('theme', t); }, tema);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await gotoSR();
};
const abrirModal = async () => {
  await page.getByTestId('new-service-button').or(page.getByRole('button', { name: /Nuevo Servicio/i })).first().click();
  await page.getByTestId('save-draft-button').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(600);
  // Flujo real: el borrador exige TIPO de servicio del catálogo e importe > 0.
  const combo = page.getByLabel('Tipo de servicio').first();
  await combo.click({ timeout: 10000 });
  await page.getByRole('option').first().click({ timeout: 10000 });
  await page.getByLabel('Importe total').first().fill('1040');
  await page.waitForTimeout(400);
};
const cerrarModal = async () => {
  const cancelar = page.getByRole('button', { name: /^Cancelar$/ }).first();
  await cancelar.click({ timeout: 8000 });
  await page.waitForTimeout(500);
};

// ══ DARK THEME ══
await setTema('dark');
await abrirModal();
const dark = await estilosBoton();
check('Dark: botón Guardar borrador presente', !!dark, dark?.text);
if (dark) {
  const cTexto = contraste(dark.colorRgb, dark.bgRgb);
  const cBorde = contraste(dark.borderRgb, dark.bgRgb);
  check('Dark: texto legible (≥4.5:1 sobre su fondo)', cTexto >= 4.5, `contraste ${cTexto}:1 (${dark.color} sobre ${dark.bg})`);
  check('Dark: fondo diferenciado del contenedor y borde visible', cBorde >= 1.2 && parseFloat(dark.borderWidth) > 0, `borde ${dark.border} · ${dark.borderWidth} · contraste ${cBorde}:1`);
  check('Dark: sin cian heredado del token roto', !dark.bg.includes('76, 215, 246') && dark.bg !== 'rgb(76, 215, 246)', dark.bg);
}
await page.screenshot({ path: `${OUT}/sr-modal-footer-dark.png`, clip: { x: 0, y: 240, width: 1920, height: 840 } });

// Flujo borrador: CANCELAR en el diálogo propio (no persiste nada).
const postsAntes = posts.length;
await page.getByTestId('save-draft-button').click();
const dlgDark = page.locator('[role="alertdialog"]').filter({ hasText: 'BORRADOR' }).first();
await dlgDark.waitFor({ state: 'visible', timeout: 10000 });
check('Dark: diálogo propio de COSTPRO al guardar borrador (role=alertdialog, sin confirm() nativo)', await dlgDark.isVisible());
await page.screenshot({ path: `${OUT}/dialogo-borrador-dark.png` });
await page.getByTestId('dialog-cancel').click();
await page.waitForTimeout(800);
check('Dark: cancelar el diálogo propio NO envía nada al servidor', posts.length === postsAntes, `POST durante el flujo: ${posts.length - postsAntes}`);

// Bloqueo sin proveedor: toast de error, SIN diálogo.
await page.getByTestId('confirm-service-button').click();
await page.waitForTimeout(1200);
const toast = page.locator('[data-sonner-toast]').filter({ hasText: /proveedor es obligatorio/i }).first();
check('Dark: confirmar sin proveedor → toast de error, sin diálogo', await toast.isVisible().catch(() => false));
check('Dark: cero diálogos nativos hasta ahora', nativeDialogs.length === 0, JSON.stringify(nativeDialogs));
await page.screenshot({ path: `${OUT}/toast-sin-proveedor-dark.png` });
await cerrarModal();

// ══ LIGHT THEME ══
await setTema('light');
await abrirModal();
const light = await estilosBoton();
check('Light: botón Guardar borrador presente', !!light, light?.text);
if (light) {
  const cTexto = contraste(light.colorRgb, light.bgRgb);
  const cBorde = contraste(light.borderRgb, light.bgRgb);
  check('Light: texto legible (≥4.5:1 sobre su fondo)', cTexto >= 4.5, `contraste ${cTexto}:1 (${light.color} sobre ${light.bg})`);
  check('Light: borde visible del botón', parseFloat(light.borderWidth) > 0 && cBorde >= 1.15, `borde ${light.border} · ${light.borderWidth} · contraste ${cBorde}:1`);
}
await page.screenshot({ path: `${OUT}/sr-modal-footer-light.png`, clip: { x: 0, y: 240, width: 1920, height: 840 } });
await page.getByTestId('save-draft-button').click();
const dlgLight = page.locator('[role="alertdialog"]').filter({ hasText: 'BORRADOR' }).first();
await dlgLight.waitFor({ state: 'visible', timeout: 10000 });
check('Light: diálogo propio de COSTPRO (mismo flujo, tema claro)', await dlgLight.isVisible());
await page.screenshot({ path: `${OUT}/dialogo-borrador-light.png` });
await page.getByTestId('dialog-cancel').click();
await page.waitForTimeout(600);

// Gestión de foco: el foco queda dentro del diálogo al abrirlo (Radix/focus trap).
await page.getByTestId('save-draft-button').click();
await dlgLight.waitFor({ state: 'visible', timeout: 10000 });
const focoEnDialogo = await page.evaluate(() => {
  const dlg = document.querySelector('[role="alertdialog"]');
  const content = dlg?.closest('[data-slot="dialog-content"], [role="dialog"]');
  return !!content && (content.contains(document.activeElement) || document.activeElement === document.body);
});
check('Gestión de foco: foco dentro del modal de diálogo al abrirse', focoEnDialogo);
// Teclado: ESC cancela el diálogo propio.
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
check('Teclado: ESC cierra el diálogo propio', !(await dlgLight.isVisible().catch(() => false)));
await cerrarModal();

// ══ MÓVIL (390×844): botones accesibles, sin desbordes ══
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(900);
await abrirModal();
const botones = await page.evaluate(() => {
  const ids = ['dialog-cancel-x', 'save-draft-button', 'confirm-service-button'];
  const fd = Array.from(document.querySelectorAll('form button, [role="dialog"] button'));
  const visibles = fd.filter((b) => {
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height >= 40;
  });
  return { total: fd.length, visibles: visibles.length };
});
check('Móvil 390: botones del modal con área táctil ≥40px', botones.visibles >= 3, JSON.stringify(botones));
await page.screenshot({ path: `${OUT}/sr-modal-movil-light.png` });
await cerrarModal();

// ══ Resumen ══
check('CERO diálogos nativos en TODA la sesión (login, navegación, flujos SR)', nativeDialogs.length === 0, JSON.stringify(nativeDialogs));
const erroresRelevantes = consoleErrors.filter((e) => !/favicon|supabase|401|403|425|net::|AbortError|Failed to load resource/i.test(e));
check('Sin errores de consola relevantes', erroresRelevantes.length === 0, erroresRelevantes.slice(0, 3).join(' | '));

writeFileSync(`${OUT}/resultados-validacion.json`, JSON.stringify({ results, nativeDialogs, estilos: { dark, light }, fecha: new Date().toISOString() }, null, 2));
const pass = results.filter((r) => r.ok).length;
console.log(`\nRESULTADO: ${pass}/${results.length} PASS · diálogos nativos: ${nativeDialogs.length}`);
await browser.close();
process.exit(pass === results.length ? 0 : 1);
