/**
 * E2E — VISTA DOCUMENTAL DE VALES DE SALIDA (issue_slips).
 *
 * Valida el flujo del brief con la app REAL (browser → API → RPC → DB):
 *   1. Navegación: OPERACIÓN → Almacén → Vales de Salida existe y abre la vista.
 *   2. Listado documental: los vales creados desde el flujo existente
 *      (POST /api/vale-salida — el mismo endpoint que usa el carrito) aparecen
 *      en la vista → UNA sola fuente de verdad documental.
 *   3. Matriz de acciones por estado REAL: completed → [Devolver];
 *      reversed → solo lectura.
 *   4. Crear desde la vista → abre Vender con el modo Vale de Salida activado
 *      (mismo flujo del carrito, sin formulario duplicado).
 *   5. Devolver (FASE 12): modal pide motivo → endpoint EXISTENTE
 *      /api/vale-salida/[id]/reverse → el estado cambia a Devuelto SIN reload
 *      global y el botón Devolver desaparece.
 *   6. Integridad de datos (política HIGH): la reversión genera movimiento
 *      compensatorio y el inventario queda restaurado.
 *   7. Mobile 375px: cards sin scroll horizontal.
 *
 * Requiere: servidor en localhost:3000 + entorno piloto (global-setup).
 * Ejecutar: bunx playwright test e2e/vales-salida-view.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';
import { signIn, injectSession, apiHeaders, seedProduct, sb, BASE_URL, type Session } from './fixtures/session.fixture';

const TEST_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@costpro.com';
const TEST_PASS = process.env.E2E_ADMIN_PASS || 'costpro123';
const PILOT_A = process.env.E2E_PILOT_STORE_A || '';

let session: Session;
let originalActiveStore: string | null | null;
let productId: string;
let completedVale: { slip_id: string; slip_number: string };
let reversedVale: { slip_id: string; slip_number: string };

/** Crea un vale vía el endpoint REAL (idéntico al flujo del carrito). */
async function createValeViaRealApi(
  token: string,
  items: Array<{ product_id: string; quantity: number }>,
  notes: string,
): Promise<{ slip_id: string; slip_number: string; total_cost: number }> {
  const res = await fetch(`${BASE_URL}/api/vale-salida`, {
    method: 'POST',
    headers: apiHeaders(token),
    body: JSON.stringify({
      items,
      notes,
      idempotency_key: `e2e_vales_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`createValeViaRealApi falló ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function gotoValesView(page: Page) {
  await injectSession(page, session);
  await page.goto(`${BASE_URL}/?view=vales_salida`);
  await page.waitForLoadState('networkidle');
  // level:2 — el h1 del Header global también muestra el título de la vista
  await expect(page.getByRole('heading', { name: 'Vales de Salida', level: 2 })).toBeVisible({ timeout: 20_000 });
}

test.beforeAll(async () => {
  test.skip(!PILOT_A, 'Entorno piloto E2E no disponible (E2E_PILOT_STORE_A)');
  session = await signIn(TEST_EMAIL, TEST_PASS);

  // Active store → PILOT A (restaurar al terminar, patrón multi-tienda-docs)
  const rows = await sb.select<{ active_store_id: string | null }>(
    'profiles', `id=eq.${session.userId}&select=active_store_id&limit=1`,
  );
  originalActiveStore = rows[0]?.active_store_id ?? null;
  if (originalActiveStore !== PILOT_A) {
    await sb.update('profiles', `id=eq.${session.userId}`, { active_store_id: PILOT_A });
  }

  // Producto determinista con stock y costo promedio (requisitos de la RPC)
  const product = await seedProduct(
    { id: PILOT_A, name: 'E2E PILOT A CostPro', slug: 'e2e-pilot-a' },
    { name: `E2E Vale Doc ${Date.now()}`, price: 100, cost: 10, quantity: 50 },
  );
  productId = product.id;

  // Vale COMPLETADO (nace así — no existe borrador) vía endpoint real
  completedVale = await createValeViaRealApi(
    session.token, [{ product_id: productId, quantity: 5 }], 'E2E vale para flujo documental',
  );

  // Vale DEVUELTO: crear y revertir por el endpoint real (para la matriz)
  reversedVale = await createValeViaRealApi(
    session.token, [{ product_id: productId, quantity: 3 }], 'E2E vale que se devolverá en setup',
  );
  const rev = await fetch(`${BASE_URL}/api/vale-salida/${reversedVale.slip_id}/reverse`, {
    method: 'POST',
    headers: apiHeaders(session.token),
    body: JSON.stringify({ reason: 'E2E setup: devolución inicial' }),
  });
  if (!rev.ok) throw new Error(`reverse setup falló ${rev.status}: ${await rev.text()}`);
});

test.afterAll(async () => {
  if (session?.userId && originalActiveStore !== undefined && originalActiveStore !== null) {
    await sb.update('profiles', `id=eq.${session.userId}`, { active_store_id: originalActiveStore }).catch(() => {});
  }
});

test.describe('Vales de Salida — vista documental', () => {

  test('1 · navegación: la entrada está registrada y abre la vista correcta (palette + header)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await injectSession(page, session);
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);

    // Command Palette (⌘K / Ctrl+K) — superficie de navegación real derivada
    // de la MISMA definición única que el sidebar (SYSTEM_ACTIONS).
    await page.getByRole('button', { name: /Abrir centro de comando/i }).click();
    const paletteInput = page.getByPlaceholder('Buscar o ejecutar acción...');
    await expect(paletteInput).toBeVisible({ timeout: 10_000 });
    await paletteInput.fill('Vales de Salida');
    await page.waitForTimeout(800);

    const entry = page.getByRole('option', { name: /Vales de Salida/i }).first();
    await expect(entry).toBeVisible({ timeout: 10_000 });
    await entry.click();

    // La vista abre y el Header global refleja el título de la vista
    await expect(page.getByRole('heading', { name: 'Vales de Salida', level: 2 })).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain('view=vales_salida');
    // El botón de creación de la vista está presente (FASE 4)
    await expect(page.getByRole('button', { name: /Crear Vale de Salida/i })).toBeVisible();
  });

  test('2 · listado: los vales del flujo existente aparecen (única fuente de verdad)', async ({ page }) => {
    await gotoValesView(page);
    await expect(page.getByText(completedVale.slip_number)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(reversedVale.slip_number)).toBeVisible();
    // Estados reconocibles (FASE 6) — scoped a la tarjeta del vale
    const cardCompleted = page.locator(`[data-vale-id="${completedVale.slip_id}"]`);
    const cardReversed = page.locator(`[data-vale-id="${reversedVale.slip_id}"]`);
    await expect(cardCompleted.getByText('Completado')).toBeVisible();
    await expect(cardReversed.getByText('Devuelto')).toBeVisible();
  });

  test('3 · matriz de acciones: completed tiene Devolver, reversed no', async ({ page }) => {
    await gotoValesView(page);
    await expect(page.getByText(completedVale.slip_number)).toBeVisible({ timeout: 15_000 });

    const devolverBtn = page.getByRole('button', { name: `Devolver vale ${completedVale.slip_number}` });
    await expect(devolverBtn).toBeVisible();
    await expect(devolverBtn).toBeEnabled();

    await expect(
      page.getByRole('button', { name: `Devolver vale ${reversedVale.slip_number}` }),
    ).toHaveCount(0);
  });

  // PR #1381 sustituyó las filas expandibles («Ver items del vale X») por el
  // modal documental que se abre con «Ver vale X» (ValeSalidaDetalleModal).
  test('4 · detalle documental: datos, productos y trazabilidad (FASE 13)', async ({ page }) => {
    await gotoValesView(page);
    await expect(page.getByText(completedVale.slip_number)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: `Ver vale ${completedVale.slip_number}` }).first().click();
    // El nombre accesible del dialog viene del título («Vale de Salida» + slip + estado)
    const detalle = page.getByRole('dialog', { name: new RegExp(completedVale.slip_number) });
    await expect(detalle).toBeVisible();
    await expect(page.getByText('Responsable')).toBeVisible();
    await expect(page.getByText('Emitido', { exact: true })).toBeVisible();
    await expect(page.getByText(/Productos \(/)).toBeVisible();
    await expect(page.getByText('Creado por')).toBeVisible();

    // Trazabilidad del vale DEVUELTO (motivo visible)
    await page.getByRole('button', { name: 'Cerrar' }).click();
    await expect(detalle).toHaveCount(0);
    await page.getByRole('button', { name: `Ver vale ${reversedVale.slip_number}` }).first().click();
    await expect(page.getByText('Devuelto por')).toBeVisible();
    await expect(page.getByText(/E2E setup: devolución inicial/i)).toBeVisible();
  });

  // PR #1381 introdujo el flujo dedicado: «Crear Vale de Salida» abre el modal
  // de creación (ValeSalidaCreateModal), ya no navega al POS.
  test('5 · crear abre el flujo dedicado de creación (FASE 8/21)', async ({ page }) => {
    await gotoValesView(page);
    await page.getByRole('button', { name: /Crear Vale de Salida/i }).click();

    const crear = page.getByRole('dialog', { name: 'Crear Vale de Salida' });
    await expect(crear).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Documento de salida de almacén sin venta comercial/i)).toBeVisible();
    await expect(page.getByText(/El número de documento se asigna automáticamente al emitir/i)).toBeVisible();
  });

  test('6 · devolver: modal → motivo → estado Devuelto sin reload (FASE 10-12)', async ({ page }) => {
    await gotoValesView(page);
    await expect(page.getByText(completedVale.slip_number)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: `Devolver vale ${completedVale.slip_number}` }).click();

    // Modal: pide motivo, botón deshabilitado hasta 3 chars
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByText('Devolver Vale de Salida')).toBeVisible();
    const submit = page.getByRole('button', { name: /^Devolver Vale$/ });
    await expect(submit).toBeDisabled();

    await page.getByLabel(/Motivo de la devolución/i).fill('E2E: devolución desde vista documental');
    await expect(submit).toBeEnabled();
    await submit.click();

    // Sin reload global: el modal cierra y la tarjeta cambia a Devuelto
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    const card = page.locator(`[data-vale-id="${completedVale.slip_id}"]`);
    await expect(card).toBeVisible();
    await expect(card.getByText('Devuelto')).toBeVisible({ timeout: 15_000 });
    // El botón Devolver ya no está disponible para este vale
    await expect(
      page.getByRole('button', { name: `Devolver vale ${completedVale.slip_number}` }),
    ).toHaveCount(0);
  });

  test('7 · integridad: reversión generó movimiento compensatorio y stock restaurado', async () => {
    // Stock: 50 - 5 (vale 1, devuelto) - 3 (vale 2, devuelto) = 50
    const inv = await sb.select<{ quantity: number }>(
      'inventory', `store_id=eq.${PILOT_A}&product_id=eq.${productId}&select=quantity`,
    );
    expect(Number(inv[0]?.quantity)).toBe(50);

    // Trazabilidad de movimientos: salida + entrada compensatoria por vale
    const movements = await sb.select<{ movement_type: string; reference_id: string; quantity_change: number }>(
      'stock_movements',
      `store_id=eq.${PILOT_A}&product_id=eq.${productId}&select=movement_type,reference_id,quantity_change`,
    );
    const out1 = movements.filter(m => m.reference_id === completedVale.slip_id && m.movement_type === 'issue_slip_out');
    const in1 = movements.filter(m => m.reference_id === completedVale.slip_id && m.movement_type === 'issue_slip_reverse');
    expect(out1.length).toBe(1);
    expect(in1.length).toBe(1);
    expect(Number(in1[0].quantity_change)).toBe(5);
  });

  test('8 · mobile 375px: cards sin scroll horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoValesView(page);
    await expect(page.getByText(reversedVale.slip_number)).toBeVisible({ timeout: 15_000 });
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(2);
  });
});
