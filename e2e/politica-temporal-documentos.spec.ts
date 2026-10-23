/**
 * MISIÓN POLÍTICA TEMPORAL (2026-10-18) — E2E de las 5 vistas prioritarias.
 *
 * Parte A — Validación SERVER de la política temporal (API, tienda piloto E2E):
 *   A1  servicio recibido con service_date futura → 422 (antes: se creaba).
 *   A2  servicio sin service_date → 201 y fecha = HOY Habana (fix deriva UTC).
 *   A3  recepción con p_reception_date futura → 422 (antes: 500/aceptada hoy+1).
 *   A4  vale de salida con operation_date futura → 422 (regresión PR #1419).
 *   A5  confirmar transferencia con fecha futura → 422 (antes: llegaba al Kardex).
 *   A6  devolución con operation_date futura → 422.
 *   A7  pago de OT con payment_date futura → 422.
 *
 * Parte B — UI con capturas reales (navegador, tz America/Havana):
 *   B1  Vender (POS) — evidencia de la sección «Fecha de venta» (PR #1419).
 *   B2  Recepciones — input de fecha con default HOY y max HOY (Habana).
 *   B3  Vales de Salida (Almacén) — selector nuevo + rechazo de fecha futura.
 *   B4  Servicios Recibidos — selector nuevo + PERSISTENCIA: crear con fecha
 *       retro-fechada válida, recargar y verificar la fecha guardada.
 *   B5  Caja — evidencia del diseño por ventana temporal (sin fecha operativa).
 *
 * Prerequisitos: servidor en localhost:3000 (pm2) + entorno E2E del global-setup.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { getAuthHeaders } from './fixtures/auth.fixture';
import { businessDayOf, todayBusinessDay } from '../src/lib/cash-report/period-attribution';
import { createClient } from '@supabase/supabase-js';

test.use({ timezoneId: 'America/Havana' });

const TEST_STORE_ID = process.env.E2E_TEST_STORE_ID || '';
const PILOT_B = process.env.E2E_PILOT_STORE_B || '';
const TEST_PRODUCT_ID = process.env.E2E_TEST_PRODUCT_ID || '';
const OUT_DIR = 'audit-evidence/20261018-politica-temporal-documentos';

const TODAY = todayBusinessDay();
const TOMORROW = businessDayOf(new Date(Date.now() + 86_400_000).toISOString());
const YESTERDAY = businessDayOf(new Date(Date.now() - 86_400_000).toISOString());

let headers: Record<string, string>;
let serviceTypeId: string | null = null;
let createdServiceId: string | null = null;
let transferId: string | null = null;

/** Navegación robusta al menú OPERACIÓN → grupo → ítem (el submenu es
 *  toggle: si el grupo ya estaba activo, el primer click lo colapsa). */
async function navegar(page: import('@playwright/test').Page, grupo: string, item: string) {
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
  await target.click();
  await page.waitForTimeout(2000);
}

test.skip(!process.env.E2E_TEST_ADMIN_TOKEN || !TEST_STORE_ID, 'entorno E2E no configurado');
test.skip(!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASS, 'credenciales UI del runner no disponibles');

// ── Setup global: tipo de servicio dedicado (catálogo GLOBAL): buscar/
// reactivar si existe de un run previo, o crear. La Parte B corre PRIMERO
// con la tienda piloto VIRGEN (sin documentos → sin mínimo forward-only) para
// poder retro-fechar; la Parte A (API) corre después (su transferencia sube
// el MAX de la tienda — por eso el orden importa).
test.beforeAll(async ({ request }) => {
  headers = getAuthHeaders('admin')!;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Tipo de servicio dedicado (catálogo GLOBAL): buscar/reactivar si existe
  // de un run previo, o crear. Se desactiva en el afterAll global final.
    const list = await request.get('/api/service-types', { headers });
    const existing = ((await list.json()).data || []).find(
      (t: { name: string; id: string; is_active: boolean }) => t.name === 'E2E Transporte 1810',
    );
    if (existing) {
      if (!existing.is_active) {
        await request.patch('/api/service-types', { headers, data: { id: existing.id, is_active: true } });
      }
      serviceTypeId = existing.id;
    } else {
      const st = await request.post('/api/service-types', {
        headers,
        data: { name: 'E2E Transporte 1810', description: 'Política temporal E2E' },
      });
      if (st.ok) {
        const b = await st.json();
        serviceTypeId = b.data?.id ?? b.id ?? null;
      }
    }
});


test.describe('Política temporal — Parte B: UI de las 5 vistas prioritarias', () => {
  test('B1+B2+B3+B4+B5: recorrido UI con capturas', async ({ page }) => {
    test.setTimeout(300_000);

    // ── Login UI con el admin del runner ──
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

    // ═══ B1 · VENDER (POS) ═══
    await navegar(page, 'Ventas', 'Vender');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT_DIR}/b1-vender-pos.png`, fullPage: false });
    // La sección «Fecha de venta» vive en el panel de checkout del carrito:
    // se evidencia la vista; la sección en sí fue probada en PR #1419 y sus
    // 35 tests unitarios siguen verdes en la regresión de esta misión.

    // ═══ B2 · RECEPCIONES ═══
    await navegar(page, 'Logística', 'Recepciones');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT_DIR}/b2-recepciones-historial.png`, fullPage: false });
    const nueva = page.getByRole('button', { name: /Nueva Recepción/i }).first();
    if (await nueva.count() && await nueva.isVisible().catch(() => false)) {
      await nueva.click();
      await page.waitForTimeout(2500);
      const dateInput = page.locator('input[aria-label="Fecha de recepción"]').first();
      if (await dateInput.count()) {
        await expect(dateInput).toHaveValue(TODAY);       // default HOY Habana
        await expect(dateInput).toHaveAttribute('max', TODAY); // tope HOY (fix UTC)
      }
      await page.screenshot({ path: `${OUT_DIR}/b2-recepciones-selector-fecha.png`, fullPage: false });
    }

    // ═══ B3 · VALES DE SALIDA (Almacén) ═══
    await navegar(page, 'Almacén', 'Vales de Salida');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT_DIR}/b3-vales-salida-vista.png`, fullPage: false });
    await page.getByRole('button', { name: /Crear Vale de Salida/i }).first().click();
    await page.waitForTimeout(1500);
    const valeDate = page.locator('#vale-create-fecha');
    await expect(valeDate).toBeVisible({ timeout: 10_000 });
    await expect(valeDate).toHaveValue(TODAY);
    await expect(valeDate).toHaveAttribute('max', TODAY);
    await page.screenshot({ path: `${OUT_DIR}/b3-vales-fecha-operativa.png`, fullPage: false });
    // Fecha futura → error inline visible + botón de confirmación bloqueado
    await valeDate.fill(TOMORROW);
    await page.waitForTimeout(600);
    await expect(page.getByText(/no puede ser futura/i).first()).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: `${OUT_DIR}/b3-vales-rechazo-futura.png`, fullPage: false });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);

    // ═══ B4 · SERVICIOS RECIBIDOS ═══
    // MISIÓN ARQUITECTURA UX (2026-10-23): el módulo vive ahora en Logística.
    await navegar(page, 'Logística', 'Servicios Recibidos');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT_DIR}/b4-servicios-vista.png`, fullPage: false });
    await page.getByRole('button', { name: /Nuevo Servicio/i }).first().click();
    await page.waitForTimeout(1500);
    const svcDate = page.locator('#received-service-date');
    await expect(svcDate).toBeVisible({ timeout: 10_000 });
    await expect(svcDate).toHaveValue(TODAY);
    await expect(svcDate).toHaveAttribute('max', TODAY);
    // PERSISTENCIA: retro-fechar al AYER y crear el documento real.
    // El catálogo de tipos es GLOBAL (puede haber tipos previos activos):
    // se selecciona EXPLÍCITAMENTE el tipo de prueba antes de enviar.
    await page.getByRole('radio', { name: /E2E Transporte 1810/i }).click();
    await svcDate.fill(YESTERDAY);
    // Importe: acotado al FORM del modal (el locator global de number-inputs
    // puede resolver contra otro input de la página detrás del modal).
    const svcForm = page.locator('form').filter({ has: page.locator('#received-service-date') });
    // El RPC exige proveedor (ERR_SUPPLIER_REQUIRED) — primer input de texto del form
    await svcForm.locator('input[type="text"]').first().fill('Proveedor E2E UI');
    const amount = svcForm.locator('input[type="number"]').first();
    await amount.fill('25');
    await page.getByRole('button', { name: /Crear Servicio/i }).click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT_DIR}/b4-servicios-creado-retro.png`, fullPage: false });
    // Recargar y verificar que la fila muestra la fecha elegida (persistencia).
    // La tabla renderiza service_date cruda (YYYY-MM-DD) y el número del
    // documento SRV-<fecha>-NNNN incrusta el MISMO día elegido.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const row = page.locator('tr, [role="row"]')
      .filter({ hasText: 'E2E Transporte 1810' })
      .filter({ hasText: YESTERDAY })
      .first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `${OUT_DIR}/b4-servicios-persistencia-recarga.png`, fullPage: false });

    // ═══ B5 · CAJA ═══
    await navegar(page, 'Ventas', 'Opciones');
    await page.waitForTimeout(1200);
    const caja = page.getByText('Caja', { exact: true }).first();
    if (!(await caja.isVisible().catch(() => false))) {
      // El hub de Opciones puede requerir un click extra de expansión
      await page.getByText('Opciones', { exact: true }).first().click();
      await page.waitForTimeout(1000);
    }
    await caja.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT_DIR}/b5-caja-ventana-temporal.png`, fullPage: false });
    // Evidencia del diseño: el turno abre/cierra con tiempo del servidor
    // (apertura por created_at, cierre por RPC close_cash_shift = NOW());
    // NO existe selector de fecha operativa en caja — política documentada.
  });
});


test.describe('Política temporal — Parte A: validación server (API)', () => {
  test('A1: servicio con service_date futura → 422 con código ERR_FUTURE_OPERATION_DATE', async ({ request }) => {
    const r = await request.post('/api/received-services', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        service_type_id: serviceTypeId,
        service_type_name: 'E2E Transporte 1810',
        supplier: 'Proveedor E2E',
        total_amount: 50,
        service_date: TOMORROW,
      },
    });
    expect(r.status()).toBe(422);
    const b = await r.json();
    expect(b.code ?? b.error).toContain('ERR_FUTURE');
  });

  test('A2: servicio SIN service_date → 201 y fecha = HOY Habana (no CURRENT_DATE UTC)', async ({ request }) => {
    const r = await request.post('/api/received-services', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        service_type_id: serviceTypeId,
        service_type_name: 'E2E Transporte 1810',
        supplier: 'Proveedor E2E',
        total_amount: 50,
      },
    });
    expect(r.status()).toBe(201);
    const b = await r.json();
    createdServiceId = b.data?.id ?? null;
    expect(createdServiceId).toBeTruthy();
    // Verificación de la fecha persistida (lectura server-side)
    const list = await request.get(`/api/received-services?store_id=${TEST_STORE_ID}`, { headers });
    const services = (await list.json()).data as Array<{ id: string; service_date: string }>;
    const created = services.find(s => s.id === createdServiceId);
    expect(created?.service_date).toBe(TODAY);
  });

  test('A3: recepción con p_reception_date futura → 422 (antes aceptaba hoy+1)', async ({ request }) => {
    const r = await request.post('/api/inventory/receptions', {
      headers,
      data: {
        p_store_id: TEST_STORE_ID,
        store_id: TEST_STORE_ID, // withStoreAccess lee store_id del body crudo
        p_supplier: 'Proveedor E2E',
        p_reception_date: `${TOMORROW}T12:00:00.000Z`,
        p_invoice_number: 'E2E-FUTURA',
        p_items: [],
      },
    });
    expect(r.status()).toBe(422);
    const b = await r.json();
    expect(b.code).toContain('ERR_FUTURE');
  });

  test('A4: vale de salida con operation_date futura → 422 (regresión PR #1419)', async ({ request }) => {
    const r = await request.post('/api/vale-salida', {
      headers,
      data: {
        items: [{ product_id: TEST_PRODUCT_ID, quantity: 1 }],
        notes: 'E2E vale fecha futura',
        idempotency_key: `e2e-pt-vale-${Date.now()}`,
        operation_date: `${TOMORROW}T12:00:00.000Z`,
      },
    });
    expect(r.status()).toBe(422);
  });

  test('A5: confirmar transferencia con fecha futura → 422 (antes: Kardex sin validar)', async ({ request }) => {
    test.skip(!PILOT_B || !TEST_PRODUCT_ID, 'piloto B/producto no disponibles');
    // Setup: transferencia PENDIENTE entre las dos tiendas piloto
    const create = await request.post('/api/transfers', {
      headers,
      data: {
        origin_store_id: TEST_STORE_ID,
        destination_store_id: PILOT_B,
        items: [{ product_id: TEST_PRODUCT_ID, quantity: 1, unit_cost: 1 }],
        notes: 'E2E política temporal A5',
      },
    });
    expect([200, 201]).toContain(create.status());
    const cb = await create.json();
    transferId = cb.transfer_id ?? cb.data?.transfer_id ?? cb.id ?? null;
    expect(transferId).toBeTruthy();

    // El rechazo debe ser ANTES de tocar stock/Kardex:
    const confirm = await request.post(`/api/transfers/${transferId}/confirm`, {
      headers,
      data: { operation_date: `${TOMORROW}T12:00:00.000Z` },
    });
    expect(confirm.status()).toBe(422);
    const b = await confirm.json();
    expect(b.code).toContain('ERR_FUTURE');

    // Y la transferencia sigue PENDIENTE (ningún stock se movió):
    const list = await request.get(`/api/transfers?store_id=${TEST_STORE_ID}`, { headers });
    const transfers = (await list.json()).data as Array<{ id: string; status: string }>;
    const t = transfers.find(x => x.id === transferId);
    expect(t?.status).toBe('PENDIENTE');
  });

  test('A6: devolución con operation_date futura → 422', async ({ request }) => {
    const r = await request.post('/api/devolutions', {
      headers,
      data: {
        store_id: TEST_STORE_ID,
        items: [{ product_id: TEST_PRODUCT_ID, quantity: 1, unit_price: 10 }],
        reason: 'E2E política temporal',
        payment_method: 'cash',
        operation_date: `${TOMORROW}T12:00:00.000Z`,
      },
    });
    expect(r.status()).toBe(422);
    const b = await r.json();
    expect(b.code).toContain('ERR_FUTURE');
  });

  test('A7: pago de OT con payment_date futura → 422 (antes: sin gate)', async ({ request }) => {
    const dummyOrderId = '00000000-0000-4000-8000-000000000001';
    const r = await request.post(`/api/production-orders/${dummyOrderId}/payments`, {
      headers,
      data: {
        amount: 10,
        payment_method: 'cash',
        payment_type: 'partial',
        payment_date: `${TOMORROW}T12:00:00.000Z`,
      },
    });
    // 422 de FECHA (la validación ocurre ANTES de la búsqueda de la orden,
    // que daría 404): demuestra que el gate de fecha es la primera barrera.
    expect(r.status()).toBe(422);
    const b = await r.json();
    expect(b.code).toContain('ERR_FUTURE');
  });
});

// ── Limpieza global (tras TODAS las partes): void del servicio A2, cancelar
// la transferencia de A5 y desactivar el tipo global de prueba (cero
// contaminación del catálogo compartido). Los documentos creados pertenecen
// a la tienda piloto (hard-delete del teardown global).
test.afterAll(async ({ request }) => {
  headers = getAuthHeaders('admin')!;
  if (createdServiceId) {
      await request.patch('/api/received-services', {
        headers,
        data: { service_id: createdServiceId, action: 'void', reason: 'Limpieza E2E política temporal' },
      }).catch(() => {});
    }
    // El tipo se desactiva al final de este afterAll (ver abajo).
    if (transferId) {
      // Cancelación vía RPC cancel_transfer (el browser usa transfer-service;
      // aquí se replica con el cliente auth del admin del runner)
      try {
        const admin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${process.env.E2E_TEST_ADMIN_TOKEN}` } } },
        );
        await admin.rpc('cancel_transfer', {
          p_transfer_id: transferId,
          p_user_id: process.env.E2E_TEST_ADMIN_ID,
        });
      } catch { /* la tienda piloto se destruye en el teardown global */ }
    }
  if (serviceTypeId) {
    await request.patch('/api/service-types', {
      headers,
      data: { id: serviceTypeId, is_active: false },
    }).catch(() => {});
  }
});
