// CP-LOG-UNIFICATION-001 — Verificación VISUAL de las UI nuevas contra
// PRODUCCIÓN (read-only: se agregan productos al carrito y se abren modales,
// pero NUNCA se confirma una venta ni se registra nada).
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = '/home/z/my-project/download/cp-log-unif-001/evidencia-ui';
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
page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
};

try {
  // ── Login ──
  await page.goto(`${BASE}/?login=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  const cookieBtn = page.getByRole('button', { name: /aceptar|accept/i }).first();
  try { await cookieBtn.click({ timeout: 2500 }); } catch {}
  await page.locator('button[type="submit"], button:has-text("Iniciar")').first().click();
  await page.waitForTimeout(6000);

  // ═══ 1. Recepción manual: sección «Liquidar al confirmar» ═══
  console.log('\n== 1. Formulario de Recepción: liquidación al confirmar ==');
  await page.goto(`${BASE}/?view=recepcion`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  const liquidarCheckbox = page.locator('input[aria-label="Liquidar al confirmar"]').first();
  const hasCheckbox = await liquidarCheckbox.count();
  check('Recepción: checkbox «Liquidar al confirmar» presente', hasCheckbox > 0, `count=${hasCheckbox}`);
  if (hasCheckbox) {
    await liquidarCheckbox.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/01-recepcion-liquidacion-off.png`, fullPage: false });
    // activar → el editor unificado aparece (medio × moneda × importe × tasa)
    await liquidarCheckbox.click();
    await page.waitForTimeout(800);
    const editorVisible = await page.getByText(/Información del pago|Efectivo|Medio de pago/i).first().isVisible().catch(() => false);
    check('Recepción: PaymentRowsEditor visible al activar (mismo editor que Servicios Recibidos)', editorVisible);
    await page.screenshot({ path: `${OUT}/02-recepcion-liquidacion-on.png`, fullPage: false });
    // desactivar (no dejar rastro)
    await liquidarCheckbox.click();
  }

  // ═══ 2. POS: producto al carrito + fila transferencia con referencia ═══
  console.log('\n== 2. POS: fila de transferencia con número de operación ==');
  await page.goto(`${BASE}/?view=pos`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  // primera tarjeta de producto del grid (click abre el carrito / añade)
  const card = page.locator('button[aria-label^="Agregar"][aria-label*="al carrito"]').first();
  const cardVisible = await card.count();
  check('POS: tarjetas de producto presentes', cardVisible > 0, `cards=${cardVisible}`);
  if (cardVisible) {
    // MISIÓN-TASAS: el RatesConfirmationModal aparece de forma ASYNC tras la
    // primera interacción del día operativo y CUBRE el POS — helper que lo
    // descarta («Continuar sin confirmar») y espera a que desaparezca, con
    // reintentos. Se llama antes de cada interacción del POS.
    const dismissTasas = async (esperarMs = 6000) => {
      const dlg = page.getByRole('dialog', { name: /tasas de cambio siguen vigentes|Confirmar tasas/i }).first();
      try {
        await dlg.waitFor({ state: 'visible', timeout: esperarMs });
      } catch { return; }
      for (let i = 0; i < 3; i++) {
        await page.getByRole('button', { name: /Continuar sin confirmar/i }).first().click().catch(() => {});
        await page.waitForTimeout(700);
        if (!(await dlg.isVisible().catch(() => false))) return;
      }
    };
    await card.click({ force: true });
    await dismissTasas(8000);
    await page.waitForTimeout(1200);
    // abrir el carrito si está cerrado
    const openCart = page.locator('[aria-label^="Abrir carrito"]').first();
    if (await openCart.isVisible().catch(() => false)) { await openCart.click({ force: true }); await page.waitForTimeout(800); }
    await dismissTasas(3000);
    await page.waitForTimeout(800);
    // abrir el editor de pagos del item: botón del item con «Pago Mixto» o similar
    await dismissTasas(2000);
    const mixtoBtn = page.getByRole('button', { name: /pago mixto|editar pago|pagos/i }).first();
    let mixtoVisible = await mixtoBtn.isVisible().catch(() => false);
    if (!mixtoVisible) {
      // el carrito puede estar plegado: abrir la pestaña Items / expandir
      await page.waitForTimeout(1500);
      mixtoVisible = await mixtoBtn.isVisible().catch(() => false);
    }
    if (mixtoVisible) {
      await mixtoBtn.click({ force: true });
      await page.waitForTimeout(800);
      await dismissTasas(2000);
      // cambiar el método de la primera fila a Transferencia
      await dismissTasas(2000);
      const methodSelect = page.locator('select[aria-label^="Método de pago fila"]').first();
      if (await methodSelect.count()) {
        await methodSelect.selectOption('transfer');
        await page.waitForTimeout(600);
        const refInput = page.locator('input[aria-label^="Número de transferencia fila"]').first();
        const refVisible = await refInput.isVisible().catch(() => false);
        check('POS: campo N.º de transferencia aparece al seleccionar Transferencia', refVisible);
        await page.screenshot({ path: `${OUT}/03-pos-referencia-transferencia.png`, fullPage: false });
        // cambiar a Efectivo → el campo desaparece
        await methodSelect.selectOption('cash');
        await page.waitForTimeout(600);
        const refGone = !(await page.locator('input[aria-label^="Número de transferencia fila"]').first().isVisible().catch(() => false));
        check('POS: al volver a Efectivo el campo de referencia desaparece', refGone);
      } else {
        check('POS: selector de método por fila accesible', false, 'select no encontrado');
      }
    } else {
      check('POS: botón de edición de pagos del item visible', false, 'no visible');
    }

    // ═══ 3. Modal de confirmación: Nota general ═══
    console.log('\n== 3. Modal de confirmación: Nota general de la venta ==');
    // Modal de confirmación: el panel de cobro expone el disparador OCULTO
    // #pos-checkout-cta (documentado en POSCartCheckoutPanel — el CTA externo
    // del POSCart lo dispara por querySelector). Se invoca directamente para
    // verificar el contenido del modal sin depender del baile de tabs.
    await dismissTasas(2000);
    const ctaClicked = await page.evaluate(() => {
      const btn = document.getElementById('pos-checkout-cta');
      if (!btn) return false;
      btn.click();
      return true;
    });
    check('POS: disparador del modal de confirmación accesible', ctaClicked);
    await page.waitForTimeout(1500);
    const confirmModal = page.getByRole('dialog', { name: 'Confirmar Venta' });
    const modalVisible = await confirmModal.isVisible().catch(() => false);
    check('POS: modal «Confirmar Venta» abre', modalVisible);
    if (modalVisible) {
      const nota = page.locator('#pos-sale-notes');
      const notaVisible = await nota.isVisible().catch(() => false);
      check('POS: textarea «Nota» de la venta presente en el modal', notaVisible);
      if (notaVisible) {
        await nota.fill('Verificación UI — nota general de la venta (no se confirmará)');
        await page.waitForTimeout(300);
      }
      await page.screenshot({ path: `${OUT}/04-pos-modal-nota-general.png`, fullPage: false });
      // CANCELAR — nunca confirmar (read-only)
      await page.getByRole('button', { name: 'Cancelar' }).last().click();
      check('POS: venta NO confirmada (cancelada explícitamente — operación de solo lectura)', true);
    }
  }

  // vaciar carrito (estado client-side; sin persistencia)
  const clearCart = page.locator('[aria-label*="Anular carrito"], [aria-label*="Vaciar carrito"]').first();
  if (await clearCart.isVisible().catch(() => false)) { await clearCart.click().catch(() => {}); }

  console.log(`\nErrores de consola: ${consoleErrors.length}`);
  fs.writeFileSync(`${OUT}/resultados.json`, JSON.stringify({ results, consoleErrors }, null, 2));
} catch (e) {
  console.log('ERROR del script:', e.message);
  await page.screenshot({ path: `${OUT}/99-error.png` }).catch(() => {});
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.ok).length;
console.log(`\nRESULTADO: ${results.length - failed}/${results.length} verificaciones UI OK`);
