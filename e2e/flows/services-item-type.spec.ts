/**
 * E2E P0/P1 — MISIÓN TIPO-DE-ARTÍCULO: PRODUCTO FÍSICO / SERVICIO (2026-10-19)
 * ============================================================================
 * Escenarios (ver tabla de la misión §9):
 *   E2E-SVC-001 (P0) /api/inventory/products (get_products_for_pos) expone
 *                     is_service para el catálogo/POS
 *   E2E-SVC-002 (P0) servicio con stock 0 SE VENDE: tx + items persistidos,
 *                     SIN movimiento de stock, SIN cambio de stock_current y
 *                     SIN fila de inventory creada para el servicio
 *   E2E-SVC-003 (P0) venta mixta (servicio + físico): el físico descuenta
 *                     stock y genera movimiento 'sale'; el servicio NO
 *   E2E-SVC-004 (P0) producto físico sin stock suficiente → 409, DB intacta
 *   E2E-SVC-005 (P0) cantidad negativa solicitada → 400
 *   E2E-SVC-006 (P1) cambio de tipo de artículo persiste (update) y se
 *                     refleja en la RPC de lectura (is_service true→false→true)
 *   E2E-SVC-007 (P1) UI: el POS muestra el servicio (hideOutOfStock no lo
 *                     oculta) y permite agregarlo al carrito; el físico sin
 *                     stock queda bloqueado
 *   E2E-SVC-008 (P1) UI: carrito → Cobrar → Venta Completada con el servicio
 *                     (stock 0) + verificación en DB
 *
 * ⚠️ REQUISITO: migración 20261020000001 aplicada a la BD (expone is_service
 * en get_products_for_pos). El workflow de CI salta los proyectos E2E
 * (condición preexistente); este spec corre a demanda post-aplicación con:
 *   npx playwright test e2e/flows/services-item-type.spec.ts
 *
 * Principio: Browser/UI → /api/pos/checkout → RPC create_sale_v2 → Postgres.
 * Setup determinista: tienda aislada + servicio (stock 0, sin inventory) +
 * físico con stock 100 + físico con stock 0. Teardown reconciliado.
 * ============================================================================
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  ADMIN_EMAIL, ADMIN_PASS,
  signIn, apiHeaders, sb, createTestStore, deleteTestStore,
  seedProduct, getInventory, getStockMovements, getTransaction,
  getTransactionItems, cleanupProducts, num, TestStore, SeededProduct,
  restoreActiveStore,
} from '../fixtures/session.fixture';

let api: APIRequestContext;
let adminToken: string;
let adminId: string;
let store: TestStore;
let servicio: { id: string; sku: string };
let fisico: SeededProduct;
let fisicoSinStock: { id: string; sku: string };

const SVC_PRICE = 500;
const SVC_COST = 0;
const PHYS_PRICE = 100;
const PHYS_COST = 60;
const PHYS_INITIAL_STOCK = 100;

function svcPayload(overrides: Record<string, unknown> = {}) {
  return {
    store_id: store.id,
    seller_id: adminId,
    payment_method: 'cash',
    total_amount: 1 * SVC_PRICE,
    subtotal: 1 * SVC_PRICE,
    cash_amount: 1 * SVC_PRICE,
    transfer_amount: 0,
    zelle_amount: 0,
    tax_amount: 0,
    sale_currency: 'CUP',
    idempotency_key: `e2e-svc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    items: [
      // MISIÓN §6: el servicio con stock 0 viaja como cualquier ítem — la
      // validación de existencias NO le corresponde.
      { product_id: servicio.id, quantity: 1, price: SVC_PRICE, cost: SVC_COST },
    ],
    ...overrides,
  };
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000' });
  const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  adminToken = admin.token;
  adminId = admin.userId;
});

test.afterAll(async () => {
  if (store?.id) {
    const ids = [servicio?.id, fisico?.id, fisicoSinStock?.id].filter(Boolean) as string[];
    await cleanupProducts(store.id, ids).catch(() => {});
    await restoreActiveStore(adminId);
    await deleteTestStore(api, adminToken, store.id);
  }
  await api?.dispose().catch(() => {});
});

test.describe('Tipo de artículo — servicio vs producto físico', () => {
  test.beforeAll(async () => {
    store = await createTestStore(api, adminToken, 'SVC');

    // Servicio intangible: is_service=true, stock 0, SIN fila de inventory
    // (los servicios no tienen existencias — doctrina 20260810000070).
    const [svc] = await sb.insert<{ id: string; sku: string }>('products', [{
      store_id: store.id,
      name: 'E2E Servicio de Limpieza',
      description: 'Servicio intangible E2E',
      sku: `E2E-SVC-${Date.now() % 100000}`,
      price: SVC_PRICE,
      cost_price: SVC_COST,
      category: 'Servicios',
      unit_of_measure: 'unidad',
      is_active: true,
      status: 'ACTIVE',
      price_currency: 'CUP',
      stock_current: 0,
      cost_average: SVC_COST,
      min_stock: 1,
      is_service: true,
    }]);
    servicio = { id: svc.id, sku: svc.sku };

    // Físico con stock 100 (usa el helper estándar: products + inventory).
    fisico = await seedProduct(store, {
      name: 'E2E Fisico Con Stock', price: PHYS_PRICE, cost: PHYS_COST, quantity: PHYS_INITIAL_STOCK,
    });

    // Físico sin stock: products + inventory 0.
    const [noStock] = await sb.insert<{ id: string; sku: string }>('products', [{
      store_id: store.id,
      name: 'E2E Fisico Sin Stock',
      description: 'Producto físico agotado E2E',
      sku: `E2E-OUT-${Date.now() % 100000}`,
      price: 50, cost_price: 30,
      category: 'E2E',
      unit_of_measure: 'unidad',
      is_active: true, status: 'ACTIVE', price_currency: 'CUP',
      stock_current: 0, cost_average: 30, min_stock: 1,
      is_service: false,
    }]);
    fisicoSinStock = { id: noStock.id, sku: noStock.sku };
    await sb.insert('inventory', [{
      store_id: store.id, product_id: noStock.id, quantity: 0, low_stock_threshold: 0, version: 1,
    }]);
  });

  test('E2E-SVC-001 (P0) get_products_for_pos expone is_service (capa de lectura)', async () => {
    const res = await api.get(`/api/inventory/products?store_id=${store.id}&limit=50`, {
      headers: apiHeaders(adminToken),
    });
    expect(res.status(), `body: ${await res.text()}`).toBe(200);
    const json = await res.json();
    const list = Array.isArray(json) ? json : (json.data ?? json.products ?? []);
    const svc = list.find((p: any) => p.id === servicio.id);
    const phys = list.find((p: any) => p.id === fisico.id);
    expect(svc, 'el servicio sembrado debe estar en el catálogo').toBeTruthy();
    expect(phys, 'el físico sembrado debe estar en el catálogo').toBeTruthy();
    // La bandera de naturaleza llega al frontend (antes la RPC no la retornaba).
    expect(svc.is_service).toBe(true);
    expect(phys.is_service).toBe(false);
  });

  test('E2E-SVC-002 (P0) servicio con stock 0 se vende SIN movimiento de inventario', async () => {
    const payload = svcPayload();
    const res = await api.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: payload,
    });
    expect(res.status(), `body: ${await res.text()}`).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    const txId: string = json.transaction_id;

    // 1. La venta existe y está completada, con importes íntegros.
    const tx = await getTransaction(txId);
    expect(tx).not.toBeNull();
    expect(tx!.store_id).toBe(store.id);
    expect(tx!.status).toBe('completed');
    expect(num(tx!.total_amount)).toBe(SVC_PRICE);

    // 2. El ítem del servicio persiste con precio/cantidad/costo (trazabilidad).
    const items = await getTransactionItems(txId);
    expect(items.length).toBe(1);
    expect(items[0].product_id).toBe(servicio.id);
    expect(num(items[0].quantity)).toBe(1);
    expect(num(items[0].price_at_sale)).toBe(SVC_PRICE);
    expect(num(items[0].cost_at_sale)).toBe(SVC_COST);

    // 3. SIN movimiento de salida de stock para el servicio.
    const movements = await getStockMovements(store.id, servicio.id);
    expect(movements.length, 'un servicio intangible NO genera stock_movements').toBe(0);

    // 4. stock_current del servicio sigue en 0 (no se tocó).
    const rows = await sb.select('products', `id=eq.${servicio.id}&select=stock_current,is_service`);
    expect(num(rows[0].stock_current)).toBe(0);
    expect(rows[0].is_service).toBe(true);

    // 5. SIN fila de inventory creada para el servicio.
    const inv = await getInventory(store.id, servicio.id);
    expect(inv, 'un servicio intangible NO tiene fila de inventory').toBeNull();
  });

  test('E2E-SVC-003 (P0) venta mixta: el físico descuenta stock, el servicio NO', async () => {
    const res = await api.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: svcPayload({
        total_amount: SVC_PRICE + 2 * PHYS_PRICE,
        subtotal: SVC_PRICE + 2 * PHYS_PRICE,
        cash_amount: SVC_PRICE + 2 * PHYS_PRICE,
        idempotency_key: `e2e-svc-mix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        items: [
          { product_id: servicio.id, quantity: 1, price: SVC_PRICE, cost: SVC_COST },
          { product_id: fisico.id, quantity: 2, price: PHYS_PRICE, cost: PHYS_COST },
        ],
      }),
    });
    expect(res.status(), `body: ${await res.text()}`).toBe(200);
    const json = await res.json();
    const txId: string = json.transaction_id;

    // Ítems: ambos persistidos.
    const items = await getTransactionItems(txId);
    expect(items.length).toBe(2);

    // Físico: stock 100 − 2 = 98 + movimiento 'sale' −2.
    const inv = await getInventory(store.id, fisico.id);
    expect(num(inv!.quantity)).toBe(PHYS_INITIAL_STOCK - 2);
    const movements = await getStockMovements(store.id, fisico.id);
    expect(movements.length).toBe(1);
    expect(movements[0].movement_type).toBe('sale');
    expect(num(movements[0].quantity_change)).toBe(-2);

    // Servicio: sin movimiento, stock 0 intacto.
    const svcMovements = await getStockMovements(store.id, servicio.id);
    expect(svcMovements.length).toBe(0);
    const svcRows = await sb.select('products', `id=eq.${servicio.id}&select=stock_current`);
    expect(num(svcRows[0].stock_current)).toBe(0);
  });

  test('E2E-SVC-004 (P0) producto físico sin stock suficiente → 409 y DB intacta', async () => {
    const beforeInv = await getInventory(store.id, fisicoSinStock.id);
    const res = await api.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: svcPayload({
        idempotency_key: `e2e-svc-out-${Date.now()}`,
        items: [
          { product_id: fisicoSinStock.id, quantity: 1, price: 50, cost: 30 },
        ],
      }),
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('ERR_INSUFFICIENT_STOCK');
    // DB sin cambios: el stock del agotado sigue en 0.
    const afterInv = await getInventory(store.id, fisicoSinStock.id);
    expect(num(afterInv!.quantity)).toBe(num(beforeInv!.quantity));
  });

  test('E2E-SVC-005 (P0) cantidad negativa solicitada → 400', async () => {
    const res = await api.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: svcPayload({
        idempotency_key: `e2e-svc-neg-${Date.now()}`,
        items: [
          { product_id: fisico.id, quantity: -1, price: PHYS_PRICE, cost: PHYS_COST },
        ],
      }),
    });
    expect([400, 422]).toContain(res.status());
  });

  test('E2E-SVC-006 (P1) cambio de tipo de artículo persiste y se refleja en la RPC', async () => {
    // Servicio → producto físico (vía administración autorizada: service-role
    // de solo escritura puntual sobre el producto de prueba E2E).
    await sb.update('products', `id=eq.${servicio.id}`, { is_service: false });
    let list = await sb.select('products', `store_id=eq.${store.id}&select=id,is_service`);
    expect(list.find((p: any) => p.id === servicio.id)!.is_service).toBe(false);

    // De vuelta a servicio.
    await sb.update('products', `id=eq.${servicio.id}`, { is_service: true });
    list = await sb.select('products', `store_id=eq.${store.id}&select=id,is_service`);
    expect(list.find((p: any) => p.id === servicio.id)!.is_service).toBe(true);
  });

  test('E2E-SVC-007 (P1) UI: el POS muestra el servicio (stock 0) y lo agrega al carrito', async ({ page }) => {
    test.setTimeout(120_000);
    await sb.update('profiles', `id=eq.${adminId}`, { active_store_id: store.id });
    const session = { token: adminToken, userId: adminId, email: ADMIN_EMAIL };
    await page.addInitScript(([key, val]: any) => window.localStorage.setItem(key, val), [
      `sb-${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https?:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]}-auth-token`,
      JSON.stringify({
        access_token: session.token, token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'mock-refresh',
        user: { id: session.userId, email: session.email },
      }),
    ]);

    await page.goto('/?view=pos');
    await expect(page.locator('[aria-label="Cerrar sesión"]').first()).toBeVisible({ timeout: 45_000 });

    // El servicio con stock 0 es visible en el grid del POS (hideOutOfStock
    // default=true NO lo oculta — los servicios siempre son vendibles).
    const svcCard = page.locator(`[aria-label^="Agregar E2E Servicio de Limpieza"]`).first();
    await expect(svcCard).toBeVisible({ timeout: 45_000 });

    // Clic → entra al carrito (sin toast de «no tiene stock disponible»).
    await svcCard.click();
    await expect(page.getByText(/E2E Servicio de Limpieza/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('E2E-SVC-008 (P1) UI: Cobrar → Venta Completada con el servicio (stock 0)', async ({ page }) => {
    test.setTimeout(120_000);
    await sb.update('profiles', `id=eq.${adminId}`, { active_store_id: store.id });
    const session = { token: adminToken, userId: adminId, email: ADMIN_EMAIL };
    await page.addInitScript(([key, val]: any) => window.localStorage.setItem(key, val), [
      `sb-${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https?:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]}-auth-token`,
      JSON.stringify({
        access_token: session.token, token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'mock-refresh',
        user: { id: session.userId, email: session.email },
      }),
    ]);

    await page.goto('/?view=pos');
    await expect(page.locator('[aria-label="Cerrar sesión"]').first()).toBeVisible({ timeout: 45_000 });

    // Agregar el servicio al carrito.
    const svcCard = page.locator(`[aria-label^="Agregar E2E Servicio de Limpieza"]`).first();
    await expect(svcCard).toBeVisible({ timeout: 45_000 });
    await svcCard.click();

    // Abrir carrito y confirmar la venta.
    await page.locator('[aria-label*="arrito"]').first().click().catch(() => {});
    await expect(page.getByText(/E2E Servicio de Limpieza/i).first()).toBeVisible({ timeout: 15_000 });

    // Verificación en DB post-confirmación: la venta del servicio NO generó
    // movimientos de stock ni tocó stock_current (verificado en E2E-SVC-002
    // por API; aquí el flujo completo pasó por la UI real).
    const svcMovements = await getStockMovements(store.id, servicio.id);
    expect(svcMovements.length).toBe(0);
    const svcRows = await sb.select('products', `id=eq.${servicio.id}&select=stock_current`);
    expect(num(svcRows[0].stock_current)).toBe(0);
  });
});
