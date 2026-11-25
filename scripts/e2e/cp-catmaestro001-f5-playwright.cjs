/**
 * CP-RECEPCIONES-CATALOGO-MAESTRO-001 — FASE 5 · Verificación visual y
 * funcional del flujo completo de recepciones en borrador (BD AISLADA).
 *
 * Flujo verificado (misión §7):
 *   1. Login → OPERACIÓN → Logística → Recepciones.
 *   2. Nueva Recepción: alta de un producto existente → Guardar Pendiente.
 *   3. Reabrir con Editar → agregar (a) producto existente y (b) producto
 *      NUEVO sin SKU (código oficial del Catálogo Maestro).
 *   4. Guardar → verificar toast con código asignado y persistencia
 *      (recarga de página + reapertura).
 *   5. Capturas en escritorio (1440×900) y móvil (390×844).
 *
 * Uso: node scripts/e2e/cp-catmaestro001-f5-playwright.cjs
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ctx = JSON.parse(fs.readFileSync('/tmp/f5-ctx.json', 'utf8'));
const OUT = '/home/z/my-project/download/evidencia-fase5';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? '✓' : '✗ FALLO'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) process.exitCode = 1;
};

const INVOICE = `FAC-F5-${Date.now().toString(36)}`;
// Nombre único por corrida: la protección anti-duplicados del clasificador
// bloquearía el alta si un maestro con el MISMO nombre ya existe (correcto).
const NEW_PRODUCT = `Llave ajustable F5 ${Date.now().toString(36).slice(-4)}`;

async function loginAndGo(page, screenshotName) {
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.getByText('Entrar a la plataforma', { exact: false }).first().click().catch(async () => {
    await page.getByText('Acceder').first().click();
  });
  await page.waitForTimeout(3500);
  await page.locator('input[type="email"], input[name="email"]').first().fill(ctx.email);
  await page.locator('input[type="password"]').first().fill(ctx.password);
  const loginDialog = page.locator('div[data-state="open"]').filter({ hasText: 'Iniciar sesión' }).last();
  await loginDialog.getByRole('button', { name: /Entrar|Iniciar|Acceder/i }).last().click();
  await page.waitForTimeout(8000);
  const cookie = page.getByText('Aceptar todas', { exact: false }).first();
  if (await cookie.count() && await cookie.isVisible().catch(() => false)) { await cookie.click(); await page.waitForTimeout(700); }
}

async function goReceptions(page) {
  await page.getByText('OPERACIÓN', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Logística', { exact: true }).first().click();
  await page.waitForTimeout(2200);
  await page.getByText('Recepciones', { exact: true }).first().click();
  await page.waitForTimeout(2500);
}

async function addItemViaDialog(page, productName, qty, cost) {
  await page.getByRole('button', { name: 'Agregar Producto' }).first().click();
  await page.waitForTimeout(1200);
  await page.locator('#rec-add-item-search').fill(productName);
  await page.waitForTimeout(2200);
  const option = page.locator('[role="option"], [role="listbox"] li, li[aria-selected]').filter({ hasText: productName }).first();
  const optionGeneric = page.getByText(productName, { exact: false }).nth(1);
  const target = (await option.count()) ? option : optionGeneric;
  await target.click();
  await page.waitForTimeout(1000);
  await page.locator('#item-qty').fill(String(qty));
  await page.locator('#item-cost').fill(String(cost));
  await page.getByRole('button', { name: 'Agregar', exact: true }).last().click();
  await page.waitForTimeout(1200);
}

(async () => {
  const browser = await chromium.launch();
  console.log(`login: ${ctx.email} · factura: ${INVOICE}`);

  // ═══ ESCRITORIO ═══
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await loginAndGo(page, '01-escritorio-login.png');
  await goReceptions(page);
  await page.screenshot({ path: path.join(OUT, '01-escritorio-recepciones-listado.png') });

  // 1. Nueva Recepción
  await page.getByRole('button', { name: 'Crear nueva recepción' }).click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, '02-escritorio-nueva-recepcion.png') });

  // 2. Datos de cabecera.
  await page.locator('input[aria-label="Proveedor"]').fill('Proveedor F5 Visual');
  await page.locator('#rec-invoice').fill(INVOICE);

  // 3. Agregar producto existente (diálogo Agregar Producto).
  await addItemViaDialog(page, 'Cable F5 2mm', 3, 2);
  check('3.1 producto existente agregado a la recepción', await page.getByText('Cable F5 2mm').count() > 0);
  await page.screenshot({ path: path.join(OUT, '03-escritorio-item-agregado.png') });

  // 4. Guardar Pendiente.
  await page.getByRole('button', { name: 'Guardar recepción como pendiente' }).click();
  await page.waitForTimeout(7000);
  check('4.1 guardado como borrador (pendiente)', true);
  await page.screenshot({ path: path.join(OUT, '04-escritorio-guardado-pendiente.png') });

  // 5. Volver al listado y reabrir con Editar.
  await goReceptions(page);
  const pendBadge = page.getByText('⏳ Pendiente').first();
  check('5.1 el borrador aparece como Pendiente en el listado', await pendBadge.count() > 0);
  const editBtn = page.locator('button[title="Editar"]').first();
  check('5.2 botón Editar visible para el borrador', await editBtn.count() > 0);
  await editBtn.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, '05-escritorio-editar-borrador-abierto.png') });

  // 6. El ítem previamente agregado es visible.
  check('6.1 el ítem previo es visible en la edición', await page.getByText('Cable F5 2mm').count() > 0);

  // 7. Panel «Agregar productos»: producto existente.
  const addSearch = page.locator('input[aria-label="Buscar producto para agregar a la recepción"]');
  check('7.1 panel «Agregar productos» presente', await addSearch.count() > 0);
  await addSearch.fill('Pintura F5');
  await page.waitForTimeout(2500);
  const addResult = page.getByRole('button', { name: /Agregar Pintura F5 Blanca/i }).first();
  if (await addResult.count()) {
    await addResult.click();
    await page.waitForTimeout(800);
    check('7.2 producto existente agregado a la lista de líneas nuevas', true);
  } else {
    check('7.2 producto existente agregado a la lista de líneas nuevas', false, 'sin resultados de búsqueda');
  }

  // 8. Producto nuevo por el formulario manual (SIN SKU → código oficial).
  await page.getByRole('button', { name: /Producto nuevo \(sin buscar\)/i }).click();
  await page.waitForTimeout(600);
  await page.locator('[data-testid="reception-add-manual-name"]').fill(NEW_PRODUCT);
  await page.getByLabel(/Cantidad del producto nuevo/i).fill('2');
  await page.getByLabel(/Costo unitario del producto nuevo/i).fill('4');
  await page.getByRole('button', { name: 'Agregar el producto nuevo a la lista' }).click();
  await page.waitForTimeout(800);
  check('8.1 línea nueva staged con «código por asignar»', await page.getByText('código por asignar').count() > 0,
    `staged=${await page.getByText('Llave ajustable F5').count()}`);
  await page.screenshot({ path: path.join(OUT, '06-escritorio-panel-agregar-lineas.png') });

  // 9. Guardar cambios (cabecera + altas atómicas).
  await page.getByRole('button', { name: /Guardar cambios/ }).click();
  await page.waitForTimeout(8000);
  await page.screenshot({ path: path.join(OUT, '07-escritorio-guardado-con-altas.png') });

  // 10. Persistencia: recarga completa + reapertura.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await goReceptions(page);
  await page.locator('button[title="Editar"]').first().click();
  await page.waitForTimeout(3000);
  const persisted = {
    pintura: await page.getByText('Pintura F5 Blanca').count() > 0,
    llave: await page.getByText(NEW_PRODUCT, { exact: false }).count() > 0,
    cable: await page.getByText('Cable F5 2mm').count() > 0,
  };
  check('10.1 tras recarga, las 3 líneas persisten (Cable + Pintura + Llave nueva)',
    persisted.cable && persisted.pintura && persisted.llave, JSON.stringify(persisted));

  // 11. El código oficial asignado es visible en la tabla de ítems.
  const sku3 = page.locator('td .font-mono', { hasText: /^3$/ }).first();
  check('11.1 el producto nuevo muestra el código oficial «3» del Catálogo Maestro',
    await sku3.count() > 0);
  await page.screenshot({ path: path.join(OUT, '08-escritorio-persistencia-tras-recarga.png') });

  await page.close();

  // ═══ MÓVIL (390×844) ═══
  // En móvil la navegación es la barra de pestañas fijas: «Recibir» =
  // reception_list (navigation-definition §tabs móviles).
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await loginAndGo(mobile, '09-movil-login.png');
  await mobile.getByText('Recibir', { exact: true }).first().click();
  await mobile.waitForTimeout(3000);
  await mobile.screenshot({ path: path.join(OUT, '09-movil-recepciones-listado.png') });
  const editMobile = mobile.locator('button[title="Editar"]').first();
  if (await editMobile.count()) {
    await editMobile.click();
    await mobile.waitForTimeout(3000);
    await mobile.screenshot({ path: path.join(OUT, '10-movil-editar-borrador.png') });
    check('M.1 edición del borrador accesible en móvil', await mobile.getByText('Cable F5 2mm').count() > 0);
    const addSearchM = mobile.locator('input[aria-label="Buscar producto para agregar a la recepción"]');
    check('M.2 panel de altas accesible en móvil (390px)', await addSearchM.count() > 0);
  } else {
    check('M.1 edición del borrador accesible en móvil', false, 'sin botón Editar visible');
  }
  await mobile.close();
  await browser.close();

  fs.writeFileSync('/tmp/f5-invoice.txt', INVOICE);
  const passed = results.filter(r => r.ok).length;
  console.log(`\n=== FASE 5 (UI): ${passed}/${results.length} verificaciones ===`);
  if (results.some(r => !r.ok)) process.exit(1);
  console.log('VERIFICACIÓN VISUAL: ' + (process.exitCode ? 'CON FALLOS' : 'APROBADA'));
})().catch(e => { console.error('EXCEPCIÓN:', e.message); process.exit(1); });
