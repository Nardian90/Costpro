/**
 * Verificación visual del FAB arrastrable del agente IA (Darian).
 *
 * Escenarios (contra la app local PM2 :3000, login admin de prueba):
 *   V1. FAB visible en posición por defecto (abajo-derecha).
 *   V2. Arrastre con mouse → se mueve y al soltar hace imán al borde
 *       horizontal más cercano; NO abre el chat (supresión de click).
 *   V3. Persistencia: tras recargar, el FAB conserva la posición dejada.
 *   V4. Click simple (sin arrastre) SÍ abre el chat (WCAG 2.5.7).
 *   V5. Re-clamp: viewport angosto → el FAB queda dentro de pantalla.
 *
 * Salida: capturas PNG + trazas JSON en audit-evidence/CP-UI-FAB-DRAGGABLE-20261108/
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EMAIL = 'admin@costpro.com';
const PASSWORD = process.env.COSTPRO_E2E_PASSWORD || 'Costpro-Mision14-15Oct-2026!';
const BASE = 'http://localhost:3000';
const OUT = resolve(process.cwd(), 'audit-evidence/CP-UI-FAB-DRAGGABLE-20261108');
mkdirSync(OUT, { recursive: true });

const traces = {};
const ARIA = 'Abrir chat con Darian';

async function fabBox(page) {
  const fab = page.getByRole('button', { name: ARIA });
  await fab.waitFor({ state: 'visible', timeout: 15000 });
  return fab.boundingBox();
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// ── Login (landing → escudo de autenticación) ───────────────────────────────
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
// Hermeticidad: eliminar posición guardada de ejecuciones previas (V1 exige
// la posición por defecto abajo-derecha).
await page.evaluate(() => { try { localStorage.removeItem('costpro.chatbot-fab-pos.v1'); } catch {} });
// El landing público muestra «Entrar a COSTPRO» (data-testid=path-costpro) que abre el login modal
const entrar = page.locator('[data-testid="path-costpro"]');
await entrar.waitFor({ state: 'visible', timeout: 30000 });
await page.waitForTimeout(1500); // hidratación de React antes del primer click
for (let i = 0; i < 5; i++) {
  await entrar.click().catch(() => {});
  try {
    await page.locator('#email').waitFor({ state: 'visible', timeout: 3000 });
    break;
  } catch { /* aún sin hidratar → reintentar */ }
}
await page.locator('#email').fill(EMAIL);
await page.locator('#password').fill(PASSWORD);
await page.locator('button[type="submit"]').first().click();
await page.waitForSelector('text=Panel de Control', { timeout: 60000 });
// GATE 20.7: el flotante se oculta en 'dashboard' (Darian embebido allí).
// Deep-link a Inventario vía URL sync (?view=inventory) — GATE 1 §6.
await page.goto(BASE + '/?view=inventory', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('button[aria-label="' + ARIA + '"]', { timeout: 60000 });
console.log('LOGIN OK + vista Inventario con FAB');

// ── V1: posición por defecto (abajo-derecha) ────────────────────────────────
const b0 = await fabBox(page);
traces.v1_default = b0;
console.log('V1 default:', JSON.stringify(b0));
await page.screenshot({ path: OUT + '/v1-default-abajo-derecha.png' });

// ── V2: arrastre MÁS ALLÁ del centro → imán al borde izquierdo ─────────────
const fab = page.getByRole('button', { name: ARIA });
await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
await page.mouse.down();
for (let i = 1; i <= 14; i++) {
  await page.mouse.move(b0.x + b0.width / 2 - i * 60, b0.y + b0.height / 2 - i * 15);
}
await page.mouse.up();
await page.waitForTimeout(400); // glide del snap + cierre del timer
const b1 = await fabBox(page);
traces.v2_after_drag = b1;
console.log('V2 tras arrastre:', JSON.stringify(b1));
const snappedLeft = Math.abs(b1.x - 16) < 3; // FAB_MARGIN=16
const moved = Math.abs(b1.y - b0.y) > 80;    // el FAB viajó verticalmente
// El click del PROPIO release debe estar suprimido: el chat NO se abre
await page.waitForTimeout(600);
const dialogAfterDrag = await page.locator('[role="dialog"][aria-label*="Darian"]').count();
traces.v2_assert = { snappedLeft, moved, clickSuppressed: dialogAfterDrag === 0 };
console.log('V2 asertos: snappedLeft=' + snappedLeft, 'moved=' + moved, 'click del release suprimido=' + (dialogAfterDrag === 0));
await page.screenshot({ path: OUT + '/v2-tras-arrastre-borde-izquierdo.png' });

// ── V2b: click simple sobre el FAB SÍ abre el chat (positivo de control) ────
await page.mouse.click(b1.x + b1.width / 2, b1.y + b1.height / 2);
const dialog2 = page.locator('[role="dialog"][aria-label*="Darian"]');
await dialog2.waitFor({ state: 'visible', timeout: 8000 });
traces.v2b_click_opens = true;
console.log('V2b click simple abre el chat: OK (WCAG 2.5.7)');
// cerrar el chat (Escape) para continuar
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

// ── V3: persistencia tras recarga ───────────────────────────────────────────
// La sesión sobrevive en localStorage; la recarga puede restaurar cualquier
// vista, así que volvemos a Inventario y esperamos el FAB con margen amplio.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.goto(BASE + '/?view=inventory', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('button[aria-label="' + ARIA + '"]', { timeout: 90000 });
const b2 = await fabBox(page);
traces.v3_after_reload = b2;
const persisted = Math.abs(b2.x - b1.x) < 5 && Math.abs(b2.y - b1.y) < 5;
traces.v3_assert = { persisted };
console.log('V3 persistencia:', persisted, JSON.stringify(b2));

// ── V4: click simple abre el chat ───────────────────────────────────────────
await page.getByRole('button', { name: ARIA }).click();
const dialog = page.locator('[role="dialog"][aria-label*="Darian"]');
await dialog.waitFor({ state: 'visible', timeout: 10000 });
traces.v4_click_opens = true;
console.log('V4 click simple abre el chat: OK');
await page.screenshot({ path: OUT + '/v4-click-abre-chat.png' });
// cerrar el chat para seguir
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

// ── V5: viewport angosto (resize) → re-clamp dentro de pantalla ─────────────
// Cierre robusto del chat: Escape puede necesitar reintento si el foco quedó
// en un input del propio chat.
for (let i = 0; i < 3; i++) {
  const abierto = await page.locator('[role="dialog"][aria-label*="Darian"]').count();
  if (!abierto) break;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
}
const fabV5 = page.getByRole('button', { name: ARIA });
await fabV5.waitFor({ state: 'visible', timeout: 15000 });
// Llevar el FAB a la esquina inferior derecha (drag + snap) para que el
// re-clamp del resize sea observable.
const bPre = await fabV5.boundingBox();
await page.mouse.move(bPre.x + bPre.width / 2, bPre.y + bPre.height / 2);
await page.mouse.down();
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(bPre.x + bPre.width / 2 + i * 60, bPre.y + bPre.height / 2 + i * 22);
}
await page.mouse.up();
await page.waitForTimeout(500);
const bCorner = await fabV5.boundingBox();
traces.v5_corner_before_resize = bCorner;
console.log('V5 esquina inferior derecha:', JSON.stringify(bCorner));
// Resize a desktop ANGOSTO (900×700): <768 sería modo móvil y el shell oculta
// el FAB por diseño (GATE 20.7). Con 900 el FAB debe seguir visible y el
// re-clamp debe traerlo dentro (y guardada ≈828 > máx 628 → 628).
await page.setViewportSize({ width: 900, height: 700 });
await page.waitForTimeout(500);
await fabV5.waitFor({ state: 'visible', timeout: 15000 });
const b3 = await fabV5.boundingBox();
const inBounds = b3.x >= 0 && b3.x + b3.width <= 900 && b3.y >= 0 && b3.y + b3.height <= 700;
const reclampedY = Math.abs(b3.y - (700 - 56 - 16)) < 3; // y clamp 628
traces.v5_reclamp = { box: b3, inBounds, reclampedY };
console.log('V5 re-clamp viewport 900×700:', JSON.stringify(b3), 'inBounds=' + inBounds, 'yReclamp=' + reclampedY);
await page.screenshot({ path: OUT + '/v5-reclamp-viewport-angosto.png' });

writeFileSync(OUT + '/trazas.json', JSON.stringify(traces, null, 1));
const fails = [];
if (!moved) fails.push('V2:no se movió');
if (!snappedLeft) fails.push('V2:no imán a borde izquierdo');
if (!traces.v2_assert?.clickSuppressed) fails.push('V2:click del release abrió el chat');
if (!traces.v2b_click_opens) fails.push('V2b:click no abrió');
if (!persisted) fails.push('V3:no persistió');
if (!traces.v4_click_opens) fails.push('V4:click no abrió');
if (!inBounds) fails.push('V5:fuera de pantalla');
if (!traces.v5_reclamp.reclampedY) fails.push('V5:y no se re-clampeó');
console.log(fails.length ? 'FALLOS: ' + fails.join(' | ') : 'TODOS LOS ESCENARIOS OK');
await browser.close();
process.exit(fails.length ? 1 : 0);
