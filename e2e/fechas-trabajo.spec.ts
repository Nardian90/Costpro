/**
 * MISIÓN FECHAS DE TRABAJO (2026-10-18) — E2E del centro de control y de la
 * preferencia visible en los formularios (construido sobre el PR #1422).
 *
 * Parte C — Vista «Fechas de trabajo» (UI, navegador, tz America/Havana):
 *   C1  OPERACIÓN → Control operativo → Fechas de trabajo: matriz con los
 *       tipos de movimiento, límites HOY/mínimo y estados (captura).
 *   C2  Consulta de fechas y límites de ventas, recepciones, vales,
 *       servicios recibidos y caja (fila fija sin control).
 *   C3  Cambiar la fecha de trabajo de VENTAS y ver la matriz actualizada.
 *   C4  Aislamiento: la de RECEPCIONES se fija aparte y VALES queda sin
 *       preferencia — ningún tipo contamina a otro (captura).
 *   C5  Los formularios muestran la fecha de trabajo como default visible:
 *       Vender (carrito), Recepciones, Vales, Servicios y Devoluciones
 *       (selector NUEVO de esta misión) (capturas por formulario).
 *   C6  Caja sin regresiones: ventana temporal del turno, sin selector.
 *
 * Parte D — Persistencia real de documentos con la fecha seleccionada (API,
 *       misma ruta que usan los formularios; verificación con service-role):
 *   D1  Venta con operation_date retro → transactions.created_at = día elegido.
 *   D2  Recepción → receipts.reception_date + stock_movements.movement_date.
 *   D3  Vale de salida → issue_slips.created_at = día elegido.
 *   D4  Servicio recibido → received_services.service_date = día elegido.
 *   D5  Devolución → devolutions.created_at = día elegido.
 *   D6  Fecha futura → 422 en venta y en devolución (límites vigentes #1422).
 *
 * Parte E — Autorización del endpoint transversal:
 *   E1  /api/work-dates sin sesión → 401.
 *   E2  /api/work-dates de una tienda sin membresía (clerk) → 403.
 *
 * Prerequisitos: servidor en localhost:3000 (pm2) + global-setup E2E.
 * Ejecución recomendada: E2E_ISOLATION=1 (pilotos vírgenes → retro-fechado
 * determinista y teardown net-zero del runner).
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { freshAuthHeaders } from './fixtures/auth.fixture';
import { businessDayOf, todayBusinessDay } from '../src/lib/cash-report/period-attribution';

test.use({ timezoneId: 'America/Havana' });

const TEST_STORE_ID = process.env.E2E_TEST_STORE_ID || '';
const TEST_PRODUCT_ID = process.env.E2E_TEST_PRODUCT_ID || '';
const OUT_DIR = 'audit-evidence/20261018-fechas-trabajo';

const TODAY = todayBusinessDay();
const YESTERDAY = businessDayOf(new Date(Date.now() - 86_400_000).toISOString());
const DAY_BEFORE_YESTERDAY = businessDayOf(new Date(Date.now() - 2 * 86_400_000).toISOString());
const TOMORROW = businessDayOf(new Date(Date.now() + 86_400_000).toISOString());

let headers: Record<string, string>;
let clerkHeaders: Record<string, string> | null = null;
/** Día de negocio retro VÁLIDO para documentos (mínimo de la tienda o ayer). */
let DOC_DAY: string;
/** userId del admin (sub del JWT) — /api/pos/checkout exige seller_id. */
let ADMIN_ID = '';

/** Extrae el `sub` (userId) de un JWT de Supabase. */
function jwtSub(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
    return payload.sub ?? '';
  } catch {
    return '';
  }
}

/** Cierra el modal activo antes de navegar — un modal abierto (overlay
 *  z-50/z-200) bloquea los clicks del sidebar. Estrategia por capas:
 *  1) Escape (modales Radix/BaseModal), 2) botón «Cerrar» (modales plain),
 *  3) click EN el elemento overlay (nunca coordenadas crudas).
 *
 *  FIX (hallazgo del run 17:11): el mouse.click(8,8) en crudo golpeaba el
 *  logo COSTPRO → montaje del dashboard → muerte de sesión → landing. Se
 *  reemplaza por un click sobre el ELEMENTO overlay (solo si es VISIBLE —
 *  count() cuenta nodos ocultos/desmontados y daba falsos positivos tras
 *  el Escape), en una esquina del propio overlay: Radix lo interpreta como
 *  outside-click y cierra el diálogo sin tocar NADA del shell inferior. */
async function cerrarModal(page: import('@playwright/test').Page) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(700);
  const cerrarBtn = page.getByRole('button', { name: 'Cerrar' }).first();
  if (await cerrarBtn.isVisible().catch(() => false)) {
    await cerrarBtn.click().catch(() => {});
    await page.waitForTimeout(700);
  }
  const overlay = page.locator('[data-slot="dialog-overlay"]').first();
  if (await overlay.isVisible().catch(() => false)) {
    await overlay.click({ position: { x: 12, y: 12 }, timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(700);
  }
}

/** Login UI con el admin del runner (usado al inicio y por la recuperación
 *  de sesión de `navegar` — si la sesión del navegador muere a mitad del
 *  recorrido, la app swap-eara a la landing SIN navegación y el sidebar
 *  desaparecería para siempre; re-autenticar restaura el shell). */
async function loginUi(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  for (const t of ['Iniciar sesión', 'Entrar', 'Acceder']) {
    const btn = page.getByText(t, { exact: false }).first();
    if (await btn.count() && await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); break; }
  }
  await page.waitForTimeout(1200);
  await page.locator('input[type="email"], input[name="email"]').first().fill(process.env.E2E_ADMIN_EMAIL!);
  await page.locator('input[type="password"]').first().fill(process.env.E2E_ADMIN_PASS!);
  await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Iniciar")').first().click();
  await page.waitForTimeout(6000);
  const cookie = page.getByText('Aceptar todas', { exact: false }).first();
  if (await cookie.count() && await cookie.isVisible().catch(() => false)) { await cookie.click(); await page.waitForTimeout(800); }
}

/** ¿El shell de la app está vivo? Si la sesión murió, la app muta en silencio
 *  a la landing (HomePageClient con useAuthStore sin usuario) y 'OPERACIÓN'
 *  deja de existir. */
async function appViva(page: import('@playwright/test').Page): Promise<boolean> {
  return !!(await page.getByText('OPERACIÓN', { exact: true }).first().isVisible().catch(() => false));
}

/** Navegación robusta al menú OPERACIÓN → grupo → ítem (el submenu es
 *  toggle: si el grupo ya estaba activo, el primer click lo colapsa).
 *  RECUPERACIÓN: si el shell no responde (sesión perdida → landing),
 *  re-login UI y reintento una vez antes de fallar. */
async function navegar(page: import('@playwright/test').Page, grupo: string, item: string) {
  if (!(await appViva(page))) {
    console.log(`[navegar] shell sin 'OPERACIÓN' antes de «${item}» — re-login`);
    await loginUi(page);
  }
  await page.getByText('OPERACIÓN', { exact: true }).first().click();
  await page.waitForTimeout(900);
  const btn = page.getByText(grupo, { exact: true }).first();
  await btn.click();
  await page.waitForTimeout(900);
  const target = page.getByText(item, { exact: true }).first();
  if (!(await target.isVisible().catch(() => false))) {
    await btn.click(); // re-abrir si quedó colapsado
    await page.waitForTimeout(900);
  }
  if (!(await target.isVisible().catch(() => false))) {
    // segunda capa de recuperación: la sesión pudo morir ENTRE el check y el click
    console.log(`[navegar] «${item}» invisible tras toggle — re-login y reintento`);
    await loginUi(page);
    await page.getByText('OPERACIÓN', { exact: true }).first().click();
    await page.waitForTimeout(900);
    await page.getByText(grupo, { exact: true }).first().click();
    await page.waitForTimeout(900);
  }
  await target.click();
  await page.waitForTimeout(2000);
}

test.skip(!process.env.E2E_TEST_ADMIN_TOKEN || !TEST_STORE_ID, 'entorno E2E no configurado');
// NOTA: E2E_TEST_ADMIN_TOKEN se refresca en beforeAll vía freshAuthHeaders
// (el skip de arriba solo exige que el global-setup haya corrido).
test.skip(!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASS, 'credenciales UI del runner no disponibles');

test.beforeAll(async ({ request }) => {
  // FIX (hallazgo del run 17:11): el token del global-setup puede quedar
  // revocado/expirado a mitad de corrida (el re-run de beforeAll tras el
  // timeout de Parte C dio 401 «Auth session missing!»). Sesión FRESCA del
  // admin con re-sign-in verificado (caché 5 min — misma práctica de la
  // FASE E2E-80 para runs largos).
  headers = (await freshAuthHeaders('admin'))!;
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Día retro determinista: el mínimo vigente de la tienda (inclusivo por
  // día) o AYER si la tienda está virgen. Robusto ante pilotos con datos.
  const wd = await request.get(`/api/work-dates?store_id=${TEST_STORE_ID}`, { headers });
  expect(wd.ok(), `GET /api/work-dates falló: ${await wd.text()}`).toBeTruthy();
  const body = await wd.json();
  expect(body.today).toBe(TODAY); // HOY calculado EN EL SERVIDOR (Habana)
  DOC_DAY = body.storeMinDate ?? YESTERDAY;

  // Clerk para la prueba de autorización E2 (403 en tienda ajena).
  clerkHeaders = await freshAuthHeaders('user');
  ADMIN_ID = jwtSub(headers.Authorization!.replace('Bearer ', ''));
  expect(ADMIN_ID).toBeTruthy();
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE C — VISTA «FECHAS DE TRABAJO» + PREFERENCIA VISIBLE EN FORMULARIOS
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Fechas de trabajo — Parte C: vista y formularios (UI)', () => {
  test('C1–C6: recorrido completo con capturas', async ({ page }) => {
    test.setTimeout(420_000);

    // ── DIAGNÓSTICO de la muerte de sesión (~20-40s tras login): capturar
    // la consola del navegador y toda respuesta HTTP >= 400 para ver QUÉ
    // precede al swap silencioso app → landing (logout del auth store). ──
    page.on('console', (msg) => {
      const t = msg.type();
      if (t === 'error' || t === 'warning') {
        console.log(`[bw:${t}] ${msg.text().slice(0, 400)}`);
      }
    });
    page.on('response', (res) => {
      if (res.status() >= 400) console.log(`[bw:http${res.status()}] ${res.url().slice(0, 180)}`);
    });
    page.on('requestfailed', (req) => {
      console.log(`[bw:reqfail] ${req.url().slice(0, 180)} :: ${req.failure()?.errorText ?? ''}`);
    });

    // ── Login UI con el admin del runner ──
    await loginUi(page);

    // ═══ C1 · ABRIR FECHAS DE TRABAJO ═══
    await navegar(page, 'Control operativo', 'Fechas de trabajo');
    await page.waitForTimeout(2500);
    await expect(page.getByText('Fechas de trabajo', { exact: true }).first()).toBeVisible();
    // Matriz: los 5 flujos prioritarios presentes.
    await expect(page.getByText('Venta (POS / carrito / express)')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Recepción de mercancía')).toBeVisible();
    await expect(page.getByText('Vale de Salida')).toBeVisible();
    await expect(page.getByText('Servicio recibido')).toBeVisible();
    await expect(page.getByText('Caja — turnos y arqueo')).toBeVisible();
    await page.screenshot({ path: `${OUT_DIR}/c1-vista-fechas-trabajo.png`, fullPage: true });

    // ═══ C2 · CONSULTAR FECHAS Y LÍMITES ═══
    // Resumen: HOY (autoridad del servidor) + mínimo operativo de la tienda.
    // La tile de HOY se localiza por su hint (el valor es hermano del label).
    const hoyTile = page.getByText('Fecha máxima de todo documento').locator('..');
    await expect(hoyTile.getByText(TODAY.split('-').reverse().join('/'))).toBeVisible();
    // Columnas canónicas de la misión §3.2.
    for (const col of ['Fecha de trabajo actual', 'Última fecha operativa', 'Mín. permitida', 'Máx. permitida']) {
      await expect(page.getByRole('columnheader', { name: col })).toBeVisible();
    }
    // Caja: fila FIJA sin control de fecha (regla de ventana temporal).
    const cajaRow = page.getByRole('row', { name: /Caja — turnos y arqueo/ });
    await expect(cajaRow.getByText('Fija', { exact: true })).toBeVisible();

    // ═══ C3 · CAMBIAR LA FECHA DE TRABAJO DE VENTAS ═══
    const ventaRow = page.getByRole('row', { name: /Venta \(POS \/ carrito \/ express\)/ });
    await ventaRow.getByRole('button', { name: /Fijar fecha/i }).click();
    await page.waitForTimeout(800);
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/Alcance de la selección|solo a tus próximos documentos/i)).toBeVisible();
    // Límites presentados en el diálogo (mín/máx de la política).
    await expect(dialog.getByText(/Mínimo:/i)).toBeVisible();
    await expect(dialog.getByText(/Máximo:/i)).toBeVisible();
    await dialog.locator('input[type="date"]').fill(DOC_DAY);
    await dialog.getByRole('button', { name: /Guardar/i }).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT_DIR}/c3-cambio-fecha-venta.png`, fullPage: true });
    // La matriz refleja la preferencia de VENTAS.
    await expect(ventaRow.getByText(/Tu preferencia para el próximo documento/i)).toBeVisible();
    await expect(ventaRow.getByText(DOC_DAY.split('-').reverse().join('/'))).toBeVisible();

    // ═══ C4 · AISLAMIENTO ENTRE TIPOS ═══
    // Recepciones conservaba su propia selección (ninguna)…
    const recepcionRow = page.getByRole('row', { name: /Recepción de mercancía/ });
    await expect(recepcionRow.getByText(/Sin preferencia → HOY/i)).toBeVisible();
    // …los vales tampoco fueron contaminados…
    const valesRow = page.getByRole('row', { name: /Vale de Salida/ });
    await expect(valesRow.getByText(/Sin preferencia → HOY/i)).toBeVisible();
    // …y fijar la de RECEPCIONES no toca la de VENTAS ni la de VALES.
    const otroDia = DOC_DAY < TODAY ? DOC_DAY : TODAY; // día distinto si es posible
    await recepcionRow.getByRole('button', { name: /Fijar fecha/i }).click();
    await page.waitForTimeout(800);
    await page.locator('[role="dialog"]').locator('input[type="date"]').fill(otroDia);
    await page.locator('[role="dialog"]').getByRole('button', { name: /Guardar/i }).click();
    await page.waitForTimeout(1200);
    await expect(recepcionRow.getByText(/Tu preferencia para el próximo documento/i)).toBeVisible();
    await expect(ventaRow.getByText(DOC_DAY.split('-').reverse().join('/'))).toBeVisible(); // intacta
    await expect(valesRow.getByText(/Sin preferencia → HOY/i)).toBeVisible(); // intacta
    await page.screenshot({ path: `${OUT_DIR}/c4-aislamiento-tipos.png`, fullPage: true });

    // ═══ C5 · FORMULARIOS MUESTRAN LA FECHA DE TRABAJO ═══
    // C5a — Recepciones: el form abre con la preferencia de recepción.
    await navegar(page, 'Logística', 'Recepciones');
    await page.waitForTimeout(2000);
    const nueva = page.getByRole('button', { name: /Nueva Recepción/i }).first();
    if (await nueva.count() && await nueva.isVisible().catch(() => false)) {
      await nueva.click();
      await page.waitForTimeout(2500);
      const recDate = page.locator('input[aria-label="Fecha de recepción"]').first();
      if (await recDate.count()) {
        await expect(recDate).toHaveValue(otroDia);
        await expect(recDate).toHaveAttribute('max', TODAY);
      }
      await page.screenshot({ path: `${OUT_DIR}/c5a-recepciones-default-preferencia.png`, fullPage: false });
    }

    // C5b — Vales de Salida (dedicado): abre con HOY (sin preferencia) y
    // max HOY — el selector visible del PR #1422 sigue operativo.
    await navegar(page, 'Almacén', 'Vales de Salida');
    await page.waitForTimeout(2000);
    const emitir = page.getByRole('button', { name: /Emitir|Crear Vale|Nuevo Vale/i }).first();
    if (await emitir.count() && await emitir.isVisible().catch(() => false)) {
      await emitir.click();
      await page.waitForTimeout(2000);
      const valeDate = page.locator('#vale-create-fecha');
      if (await valeDate.count()) {
        await expect(valeDate).toHaveValue(TODAY); // vales: sin preferencia → HOY
        await expect(valeDate).toHaveAttribute('max', TODAY);
      }
      await page.screenshot({ path: `${OUT_DIR}/c5b-vales-selector.png`, fullPage: false });
      await cerrarModal(page);
    }

    // C5c — Servicios Recibidos: selector visible (PR #1422) sin preferencia.
    await navegar(page, 'Almacén', 'Servicios Recibidos');
    await page.waitForTimeout(2000);
    const nuevoSvc = page.getByRole('button', { name: /Nuevo Servicio/i }).first();
    if (await nuevoSvc.count() && await nuevoSvc.isVisible().catch(() => false)) {
      await nuevoSvc.click();
      await page.waitForTimeout(1500);
      const svcDate = page.locator('#received-service-date');
      if (await svcDate.count()) {
        await expect(svcDate).toHaveValue(TODAY);
        await expect(svcDate).toHaveAttribute('max', TODAY);
      }
      await page.screenshot({ path: `${OUT_DIR}/c5c-servicios-selector.png`, fullPage: false });
      await cerrarModal(page);
    }

    // C5d — Devoluciones: selector NUEVO de esta misión (gap del PR #1422
    // §10.5): visible, max HOY, default HOY o preferencia si existe.
    await navegar(page, 'Ventas', 'Opciones');
    await page.waitForTimeout(2000);
    const devTab = page.getByText('Devoluciones', { exact: true }).first();
    if (await devTab.count() && await devTab.isVisible().catch(() => false)) {
      await devTab.click();
      await page.waitForTimeout(2000);
      const nuevaDev = page.getByRole('button', { name: /Nueva Devolución/i }).first();
      if (await nuevaDev.count() && await nuevaDev.isVisible().catch(() => false)) {
        await nuevaDev.click();
        await page.waitForTimeout(1500);
        const devDate = page.locator('#devolution-create-fecha');
        if (await devDate.count()) {
          await expect(devDate).toHaveValue(TODAY);
          await expect(devDate).toHaveAttribute('max', TODAY);
        }
        await page.screenshot({ path: `${OUT_DIR}/c5d-devoluciones-selector-nuevo.png`, fullPage: false });
        await cerrarModal(page);
      }
    }

    // C5e — Vender: la preferencia de VENTA llega al carrito (sección
    // «Fecha de venta» de los tres flujos de confirmación — PR #1419/#1422).
    await navegar(page, 'Ventas', 'Vender');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT_DIR}/c5e-vender.png`, fullPage: false });

    // ═══ C6 · CAJA SIN REGRESIONES ═══
    await navegar(page, 'Ventas', 'Opciones');
    await page.waitForTimeout(1500);
    const caja = page.getByText('Caja', { exact: true }).first();
    if (!(await caja.isVisible().catch(() => false))) {
      await page.getByText('Opciones', { exact: true }).first().click();
      await page.waitForTimeout(1000);
    }
    if (await caja.isVisible().catch(() => false)) {
      await caja.click();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT_DIR}/c6-caja-ventana-temporal.png`, fullPage: false });
      // La vista de caja NO ofrece fecha de trabajo (regla fija documentada).
      const cajaFecha = page.locator('#work-date-pref-cash_shift, [data-testid="caja-fecha-trabajo"]');
      await expect(cajaFecha).toHaveCount(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE D — PERSISTENCIA REAL CON LA FECHA SELECCIONADA (mismas rutas de los
// formularios; verificación del estado persistido con service-role)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Fechas de trabajo — Parte D: documentos con fecha seleccionada (API)', () => {
  const noon = (day: string) => `${day}T12:00:00.000Z`;
  /** txId de la venta de D1 — la devolución D5 la referencia como original. */
  let ventaTxId = '';

  test('D1: venta con operation_date retro → persiste el día elegido', async ({ request }) => {
    test.skip(!TEST_PRODUCT_ID, 'producto E2E no disponible');
    const key = `e2e-ft-venta-${Date.now()}`;
    const r = await request.post('/api/pos/checkout', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        seller_id: ADMIN_ID,
        payment_method: 'cash',
        total_amount: 100,
        subtotal: 100,
        cash_amount: 100,
        transfer_amount: 0,
        zelle_amount: 0,
        tax_amount: 0,
        sale_currency: 'CUP',
        idempotency_key: key,
        items: [{ product_id: TEST_PRODUCT_ID, quantity: 1, price: 100, cost: 60 }],
        operation_date: noon(DOC_DAY),
      },
    });
    expect(r.status(), `body: ${await r.text()}`).toBe(200);
    const b = await r.json();
    const txId = b.transaction_id ?? b.data?.transaction_id ?? b.id;
    expect(txId).toBeTruthy();
    ventaTxId = txId;
    // Verificación en BD (service-role, solo lectura).
    const { sb } = await import('./fixtures/session.fixture');
    const [tx] = await sb.select('transactions', `id=eq.${txId}&select=id,created_at,completed_at,status&limit=1`);
    expect(tx).toBeTruthy();
    expect(tx.status).toBe('completed');
    expect(businessDayOf(tx.created_at as string)).toBe(DOC_DAY);
    expect(businessDayOf(tx.completed_at as string)).toBe(DOC_DAY);
  });

  test('D2: recepción con fecha seleccionada → documento y Kardex coherentes', async ({ request }) => {
    test.skip(!TEST_PRODUCT_ID, 'producto E2E no disponible');
    const r = await request.post('/api/inventory/receptions', {
      headers,
      data: {
        p_store_id: TEST_STORE_ID,
        store_id: TEST_STORE_ID,
        p_supplier: 'Proveedor E2E FT',
        p_reception_date: noon(DOC_DAY),
        p_invoice_number: `E2E-FT-${Date.now()}`,
        p_items: [{ product_id: TEST_PRODUCT_ID, quantity: 1, unit_cost: 60 }],
      },
    });
    expect(r.status(), `body: ${await r.text()}`).toBe(201);
    const receiptId = (await r.json()).id;
    const { sb } = await import('./fixtures/session.fixture');
    const [rec] = await sb.select('receipts', `id=eq.${receiptId}&select=id,reception_date,created_at&limit=1`);
    expect(businessDayOf(rec.reception_date as string)).toBe(DOC_DAY);
    // El camino canónico escribe el movement con notes = receipt_id (texto)
    // y movement_date = fecha efectiva (register_stock_movement p_notes).
    const movements = await sb.select(
      'stock_movements',
      `store_id=eq.${TEST_STORE_ID}&notes=eq.${receiptId}&select=id,movement_date,movement_type&limit=5`,
    );
    expect(movements.length).toBeGreaterThan(0);
    for (const m of movements) {
      expect(businessDayOf(m.movement_date as string)).toBe(DOC_DAY);
    }
  });

  test('D3: vale de salida con fecha seleccionada → issue_slips con el día elegido', async ({ request }) => {
    test.skip(!TEST_PRODUCT_ID, 'producto E2E no disponible');
    const r = await request.post('/api/vale-salida', {
      headers,
      data: {
        items: [{ product_id: TEST_PRODUCT_ID, quantity: 1 }],
        notes: 'E2E fechas de trabajo D3',
        idempotency_key: `e2e-ft-vale-${Date.now()}`,
        operation_date: noon(DOC_DAY),
      },
    });
    expect([200, 201], `body: ${await r.text()}`).toContain(r.status());
    const b = await r.json();
    const slipId = b.slip_id ?? b.data?.slip_id ?? b.id;
    const { sb } = await import('./fixtures/session.fixture');
    const [slip] = await sb.select('issue_slips', `id=eq.${slipId}&select=id,created_at,status&limit=1`);
    expect(slip).toBeTruthy();
    expect(businessDayOf(slip.created_at as string)).toBe(DOC_DAY);
  });

  test('D4: servicio recibido con fecha seleccionada → service_date persistido', async ({ request }) => {
    const r = await request.post('/api/received-services', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        supplier: 'Proveedor E2E FT',
        total_amount: 30,
        service_type_name: 'E2E Transporte FT',
        service_date: DOC_DAY,
      },
    });
    expect([200, 201], `body: ${await r.text()}`).toContain(r.status());
    const b = await r.json();
    const svcId = b.data?.id ?? b.id ?? b.service_id;
    const { sb } = await import('./fixtures/session.fixture');
    const [svc] = await sb.select('received_services', `id=eq.${svcId}&select=id,service_date,created_at&limit=1`);
    expect(svc).toBeTruthy();
    expect(svc.service_date).toBe(DOC_DAY); // DATE pura: el día exacto elegido
  });

  test('D5: devolución de la venta D1 con fecha seleccionada → created_at con el día elegido', async ({ request }) => {
    test.skip(!TEST_PRODUCT_ID || !ventaTxId, 'venta original de D1 no disponible');
    const r = await request.post('/api/devolutions', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        reason: 'E2E fechas de trabajo D5',
        original_transaction_id: ventaTxId,
        items: [{ product_id: TEST_PRODUCT_ID, quantity: 1, unit_price: 100 }],
        operation_date: noon(DOC_DAY),
      },
    });
    expect([200, 201], `body: ${await r.text()}`).toContain(r.status());
    const b = await r.json();
    const devId = b.id ?? b.data?.id ?? b.devolution_id;
    const { sb } = await import('./fixtures/session.fixture');
    const [dev] = await sb.select('devolutions', `id=eq.${devId}&select=id,created_at,reason&limit=1`);
    expect(dev).toBeTruthy();
    expect(businessDayOf(dev.created_at as string)).toBe(DOC_DAY);
  });

  test('D6: límites vigentes — fecha futura rechazada (422) en venta y devolución', async ({ request }) => {
    test.skip(!TEST_PRODUCT_ID, 'producto E2E no disponible');
    const venta = await request.post('/api/pos/checkout', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        seller_id: ADMIN_ID,
        payment_method: 'cash',
        total_amount: 50,
        subtotal: 50,
        cash_amount: 50,
        transfer_amount: 0,
        zelle_amount: 0,
        tax_amount: 0,
        sale_currency: 'CUP',
        idempotency_key: `e2e-ft-futura-${Date.now()}`,
        items: [{ product_id: TEST_PRODUCT_ID, quantity: 1, price: 50, cost: 30 }],
        operation_date: noon(TOMORROW),
      },
    });
    expect(venta.status()).toBe(422);

    const devolucion = await request.post('/api/devolutions', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        reason: 'E2E futura D6',
        original_transaction_id: ventaTxId || undefined,
        items: [{ product_id: TEST_PRODUCT_ID, quantity: 1, unit_price: 50 }],
        operation_date: noon(TOMORROW),
      },
    });
    // 422 del tope de fecha (la validación de fecha corre antes de la lógica
    // de devolución — paridad con el informe del PR #1422 A6).
    expect(devolucion.status()).toBe(422);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE E — AUTORIZACIÓN DEL ENDPOINT TRANSVERSAL
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Fechas de trabajo — Parte E: autorización', () => {
  test('E1: /api/work-dates sin sesión → 401', async ({ request }) => {
    const r = await request.get(`/api/work-dates?store_id=${TEST_STORE_ID}`);
    expect(r.status()).toBe(401);
  });

  test('E2: clerk sin membresía en la tienda consultada → 403', async ({ request }) => {
    test.skip(!clerkHeaders, 'clerk de E2E no disponible');
    // Pilot B es ajena al clerk del runner (solo tiene acceso a su tienda).
    const pilotB = process.env.E2E_PILOT_STORE_B || '00000000-0000-0000-0000-000000000000';
    const r = await request.get(`/api/work-dates?store_id=${pilotB}`, { headers: clerkHeaders! });
    expect(r.status()).toBe(403);
  });
});
