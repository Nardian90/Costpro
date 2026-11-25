/**
 * E2E P0 — VENTAS / POS: CHECKOUT V2 + INTEGRIDAD DE DATOS
 * ============================================================================
 * Escenarios (ver e2e/SCENARIO-INVENTORY.md):
 *   E2E-POS-001 (P0) venta cash exitosa → tx creada + items + stock -N + movimiento 'sale'
 *   E2E-POS-002 (P0) idempotencia: misma key no duplica venta ni descuenta stock 2×
 *   E2E-POS-003 (P0) stock insuficiente → 409 y DB sin cambios
 *   E2E-POS-004 (P0) descuadre de totales → 422 y DB sin cambios
 *   E2E-POS-005 (P0) checkout sin sesión → 401
 *   E2E-POS-006 (P0) checkout en tienda sin membership (clerk) → 403
 *   E2E-POS-007 (P1) producto ajeno a la tienda → 400
 *   E2E-POS-008 (P1) venta pago mixto (efectivo+transferencia) persiste split
 *   E2E-POS-009 (P0) UI: usuario real agrega producto → Cobrar → Venta Completada
 *                     + verificación en DB
 *
 * Principio: Browser/UI → /api/pos/checkout → RPC create_sale_v2 → Postgres.
 * El estado persistido se verifica con service-role (solo lectura).
 * Setup determinista: tienda aislada + producto con stock conocido (100).
 * ============================================================================
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  ADMIN_EMAIL, ADMIN_PASS, CLERK_EMAIL, CLERK_PASS,
  signIn, apiHeaders, sb, createTestStore, deleteTestStore,
  seedProduct, getInventory, getStockMovements, getTransaction,
  getTransactionItems, cleanupProducts, num, TestStore, SeededProduct,
  restoreActiveStore,
} from '../fixtures/session.fixture';

let adminToken: string;
let adminId: string;
let clerkToken: string;
let store: TestStore;
let product: SeededProduct;
let foreignProductId: string; // producto de otra tienda (Tienda Central)

const SALE_PRICE = 100;
const SALE_COST = 60;
const INITIAL_STOCK = 100;

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    store_id: store.id,
    seller_id: adminId,
    payment_method: 'cash',
    total_amount: 2 * SALE_PRICE,
    subtotal: 2 * SALE_PRICE,
    cash_amount: 2 * SALE_PRICE,
    transfer_amount: 0,
    zelle_amount: 0,
    tax_amount: 0,
    sale_currency: 'CUP',
    idempotency_key: `e2e80-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    items: [
      { product_id: product.id, quantity: 2, price: SALE_PRICE, cost: SALE_COST },
    ],
    ...overrides,
  };
}

test.beforeAll(async () => {
  const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  adminToken = admin.token;
  adminId = admin.userId;
  const clerk = await signIn(CLERK_EMAIL, CLERK_PASS);
  clerkToken = clerk.token;
});

test.afterAll(async ({ request }: { request: APIRequestContext }) => {
  if (store?.id) {
    await cleanupProducts(store.id, product ? [product.id] : []).catch(() => {});
    await restoreActiveStore(adminId);
  await deleteTestStore(request, adminToken, store.id);
  }
});

test.describe('POS Checkout V2 — API + integridad de datos', () => {
  test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
    store = await createTestStore(request, adminToken, 'POS');
    product = await seedProduct(store, {
      name: 'Producto E2E POS',
      price: SALE_PRICE,
      cost: SALE_COST,
      quantity: INITIAL_STOCK,
    });
    // SEC-TS-08: producto de OTRA tienda para E2E-POS-007 — usa el producto
    // de referencia de PILOT STORE B (dedicado), no un producto real de una
    // tienda operativa. E2E_TEST_PRODUCT_ID (A) queda reservado para la
    // tienda activa de los specs legacy.
    foreignProductId = process.env.E2E_TEST_FOREIGN_PRODUCT_ID || '';
  });

  test('E2E-POS-001 (P0) venta cash exitosa registra transacción, items y descuenta stock', async ({ request }) => {
    const payload = basePayload();
    const res = await request.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: payload,
    });
    expect(res.status(), `body: ${await res.text()}`).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.status).toBe('success');
    const txId: string = json.transaction_id;
    expect(txId).toBeTruthy();

    // ── Verificación de estado persistido (integridad) ──
    // 1. Transacción: tienda, vendedor, total, estado
    const tx = await getTransaction(txId);
    expect(tx, 'la transacción debe existir en la DB').not.toBeNull();
    expect(tx!.store_id).toBe(store.id);
    expect(tx!.seller_id).toBe(adminId);
    expect(num(tx!.total_amount)).toBe(2 * SALE_PRICE);
    expect(tx!.status).toBe('completed');
    expect(tx!.payment_method).toBe('cash');

    // 2. Items: producto, cantidad, precio y costo de venta
    const items = await getTransactionItems(txId);
    expect(items.length).toBe(1);
    expect(items[0].product_id).toBe(product.id);
    expect(num(items[0].quantity)).toBe(2);
    expect(num(items[0].price_at_sale)).toBe(SALE_PRICE);
    expect(num(items[0].cost_at_sale)).toBe(SALE_COST);

    // 3. Inventario: stock inicial 100 − 2 = 98
    const inv = await getInventory(store.id, product.id);
    expect(num(inv!.quantity)).toBe(INITIAL_STOCK - 2);

    // 4. Movimiento de stock: tipo 'sale', delta −2, referencia = transacción
    const movements = await getStockMovements(store.id, product.id);
    const saleMovement = movements.find((m) => m.reference_id === txId);
    expect(saleMovement, 'debe existir stock_movements con reference_id = transacción').toBeTruthy();
    expect(saleMovement!.movement_type).toBe('sale');
    expect(num(saleMovement!.quantity_change)).toBe(-2);
    expect(saleMovement!.store_id).toBe(store.id);
  });

  test('E2E-POS-002 (P0) idempotencia: misma key devuelve la misma venta sin duplicar stock', async ({ request }) => {
    const payload = basePayload({ total_amount: 3 * SALE_PRICE, subtotal: 3 * SALE_PRICE, cash_amount: 3 * SALE_PRICE });
    payload.items = [{ product_id: product.id, quantity: 3, price: SALE_PRICE, cost: SALE_COST }];

    const first = await request.post('/api/pos/checkout', { headers: apiHeaders(adminToken), data: payload });
    expect(first.status()).toBe(200);
    const firstJson = await first.json();

    const second = await request.post('/api/pos/checkout', { headers: apiHeaders(adminToken), data: payload });
    expect(second.status()).toBe(200);
    const secondJson = await second.json();

    // Misma transacción, sin duplicar
    expect(secondJson.transaction_id).toBe(firstJson.transaction_id);
    expect(['idempotent', 'success']).toContain(secondJson.status);

    // Stock decrementado UNA sola vez: 98 − 3 = 95
    const inv = await getInventory(store.id, product.id);
    expect(num(inv!.quantity)).toBe(95);

    // Un único movimiento 'sale' nuevo para esa transacción
    const movements = await getStockMovements(store.id, product.id);
    const txMovements = movements.filter((m) => m.reference_id === firstJson.transaction_id);
    expect(txMovements.length).toBe(1);
  });

  test('E2E-POS-003 (P0) stock insuficiente → 409 y sin cambios en DB', async ({ request }) => {
    const before = await getInventory(store.id, product.id);
    const txCountBefore = (await sb.select('transactions', `store_id=eq.${store.id}&select=id`)).length;

    const res = await request.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: basePayload({
        total_amount: 5000, subtotal: 5000, cash_amount: 5000,
        items: [{ product_id: product.id, quantity: 500, price: SALE_PRICE, cost: SALE_COST }],
      }),
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('ERR_INSUFFICIENT_STOCK');

    const after = await getInventory(store.id, product.id);
    expect(num(after!.quantity)).toBe(num(before!.quantity));
    const txCountAfter = (await sb.select('transactions', `store_id=eq.${store.id}&select=id`)).length;
    expect(txCountAfter).toBe(txCountBefore);
  });

  test('E2E-POS-004 (P0) descuadre de totales → 422 y sin cambios en DB', async ({ request }) => {
    const before = await getInventory(store.id, product.id);

    const res = await request.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: basePayload({ total_amount: 999, subtotal: 2 * SALE_PRICE, cash_amount: 999 }),
    });
    expect(res.status()).toBe(422);

    const after = await getInventory(store.id, product.id);
    expect(num(after!.quantity)).toBe(num(before!.quantity));
  });

  test('E2E-POS-005 (P0) checkout sin sesión → 401', async ({ request }) => {
    const res = await request.post('/api/pos/checkout', {
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      data: basePayload(),
    });
    expect(res.status()).toBe(401);
  });

  test('E2E-POS-006 (P0) usuario sin membership en la tienda no puede vender → 403', async ({ request }) => {
    // CICLO 2 (hallazgo local 2026-10-22): en run aislado el cajero ES
    // miembro del piloto A (provisión §5 de run-env.ts) — el test solo era
    // verde POR ACCIDENTE de orden: el round-robin A/B del fixture asigna
    // pilotos por orden de archivo (en CI pos-checkout recibía B; en una
    // corrida local con este archivo primero recibía A → 200). Fix: en run
    // aislado la tienda 'ajena' es SIEMPRE el PILOTO B (sin membership),
    // independiente del round-robin. En legacy, el cajero demo no es
    // miembro de los pilotos persistentes → store.id como antes.
    const tiendaAjena = process.env.E2E_ISOLATION === '1' && process.env.E2E_PILOT_STORE_B
      ? process.env.E2E_PILOT_STORE_B
      : store.id;
    const res = await request.post('/api/pos/checkout', {
      headers: apiHeaders(clerkToken),
      data: basePayload({ seller_id: 'c3333333-3333-3333-3333-333333333333', store_id: tiendaAjena }),
    });
    expect(res.status()).toBe(403);

    // Sin efecto en stock
    const inv = await getInventory(store.id, product.id);
    expect(num(inv!.quantity)).toBe(95);
  });

  test('E2E-POS-007 (P1) producto de otra tienda → rechazo y sin efecto en stock', async ({ request }) => {
    // HALLAZGO CICLO 2 (2026-10-22, corrida CI 39781104338, reproducido):
    // create_sale_v2 (26 args) y register_stock_movement (12 args) NO
    // implementan ERR_STORE_MISMATCH/ERR_PRODUCT_NOT_FOUND NI EN PRODUCCIÓN
    // NI en la base E2E (verificado read-only contra ambos refs — cuerpos
    // equivalentes): una venta con producto de OTRA tienda se ACEPTA (200).
    // CIERRE (misión catálogo maestro, 2026-10-28): la migración
    // 20261028090000_cp_catalogo_cierre_fallback_create_sale_v2.sql elimina
    // el fallback sin filtro de tienda y fail-closed con
    // ERR_STORE_MISMATCH / ERR_PRODUCT_NOT_FOUND. Este test se reactiva y
    // pasa de skip a ejecución efectiva (ver docs/audits del PR).
    test.skip(!foreignProductId, 'sin producto externo disponible');
    const before = await getInventory(store.id, product.id);

    // SEC-TS-10 (fix): el ítem ajeno se envía a su precio NORMAL (100, el
    // precio de lista del producto piloto B). Con price=1 (99% de descuento)
    // el gate de supervisor (ERR_SUPERVISOR_REQUIRED → 403) dispara ANTES
    // que la validación de producto-por-tienda, y el test recibía 403 en
    // lugar del 400. Con precio normal el camino ejercitado es el real de
    // aislamiento: create_sale_v2 → register_stock_movement →
    // ERR_STORE_MISMATCH → 400.
    const res = await request.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: basePayload({
        total_amount: 100,
        subtotal: 100,
        cash_amount: 100,
        items: [{ product_id: foreignProductId, quantity: 1, price: 100, cost: 60 }],
      }),
    });
    // Ambos códigos son rechazos legítimos de la API: 400 = validación
    // cross-store (ERR_STORE_MISMATCH / ERR_PRODUCT_NOT_FOUND); 403 = gate
    // de supervisor si el desvío de precio ≥15% dispara primero. La
    // propiedad de seguridad bajo prueba es: RECHAZO + stock intacto.
    expect([400, 403]).toContain(res.status());

    const after = await getInventory(store.id, product.id);
    expect(num(after!.quantity)).toBe(num(before!.quantity));
  });

  test('E2E-POS-008 (P1) venta con pago mixto persiste el desglose de pagos', async ({ request }) => {
    const qty = 4; // 4 × 100 = 400
    // FIX SEC-TS-10: baseline dinámico — el stock inicial depende de los tests
    // previos del archivo (que pueden fallar/reordenarse); lo robusto es leer
    // el stock ANTES de esta venta y verificar el delta exacto.
    const stockBefore = num((await getInventory(store.id, product.id))!.quantity);
    const res = await request.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: basePayload({
        payment_method: 'mixed',
        total_amount: 4 * SALE_PRICE,
        subtotal: 4 * SALE_PRICE,
        cash_amount: 250,
        transfer_amount: 150,
        items: [{ product_id: product.id, quantity: qty, price: SALE_PRICE, cost: SALE_COST }],
      }),
    });
    expect(res.status(), `body: ${await res.text()}`).toBe(200);
    const json = await res.json();

    const tx = await getTransaction(json.transaction_id);
    expect(tx!.payment_method).toBe('mixed');
    expect(num(tx!.cash_amount)).toBe(250);
    expect(num(tx!.transfer_amount)).toBe(150);
    expect(num(tx!.total_amount)).toBe(4 * SALE_PRICE);

    const inv = await getInventory(store.id, product.id);
    expect(num(inv!.quantity)).toBe(stockBefore - qty);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 (2026-11-25): pagos independientes
  // por producto. items[].payments = distribución REAL por línea → se persiste
  // en transaction_items.payment_distributions (aditivo; históricos NULL) y
  // los pagos consolidados siguen en payment_transactions (ledger intacto).
  // La conciliación exige: Σ distribuciones por línea = Σ ledger = total.
  // ─────────────────────────────────────────────────────────────────────────
  test('E2E-POS-010 (A) un producto, pago completo en efectivo: distribución por línea persistida y conciliada', async ({ request }) => {
    const stockBefore = num((await getInventory(store.id, product.id))!.quantity);
    const res = await request.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: basePayload({
        payment_method: 'cash',
        total_amount: 100,
        subtotal: 100,
        cash_amount: 100,
        items: [{
          product_id: product.id, quantity: 1, price: SALE_PRICE, cost: SALE_COST,
          payments: [{ method: 'cash', currency: 'CUP', amount: 100, discount_type: null, discount_value: 0, discount_currency: 'CUP' }],
        }],
      }),
    });
    expect(res.status(), `body: ${await res.text()}`).toBe(200);
    const json = await res.json();

    const itemRow = (await sb.select<{ payment_distributions: Array<Record<string, unknown>> } | null>(
      'transaction_items', `transaction_id=eq.${json.transaction_id}&select=payment_distributions`,
    ))[0];
    expect(itemRow?.payment_distributions).toBeTruthy();
    expect(itemRow!.payment_distributions).toHaveLength(1);
    expect(itemRow!.payment_distributions[0]).toMatchObject({ method: 'cash', currency: 'CUP', amount: 100 });

    // Ledger consolidado intacto (payment_transactions)
    const ledger = await sb.select<{ payment_method: string; currency: string; amount: string | number; amount_cup: string | number }>(
      'payment_transactions', `transaction_id=eq.${json.transaction_id}&select=payment_method,currency,amount,amount_cup`,
    );
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ payment_method: 'cash', currency: 'CUP' });
    expect(num(ledger[0].amount_cup)).toBe(100);

    // Conciliación: Σ distribuciones = Σ ledger = total
    const sumDist = itemRow!.payment_distributions.reduce((s, d) => s + num(d.amount as string | number), 0);
    expect(sumDist).toBe(100);
    const stockAfter = num((await getInventory(store.id, product.id))!.quantity);
    expect(stockAfter).toBe(stockBefore - 1);
  });

  test('E2E-POS-011 (B) un producto, pago completo por transferencia: referencia por pago en ledger y distribución', async ({ request }) => {
    const res = await request.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: basePayload({
        payment_method: 'transfer',
        total_amount: 100,
        subtotal: 100,
        cash_amount: 0,
        transfer_amount: 100,
        // El cliente real (usePOSCheckout) envía payment_components SIEMPRE que
        // hay referencia de transferencia (requiresPaymentComponents §5.1) — es
        // el ÚNICO camino que persiste la referencia por pago en el ledger.
        payment_components: [{ method: 'transfer', currency: 'CUP', amount: 100, reference: 'TR-E2E-B-1' }],
        items: [{
          product_id: product.id, quantity: 1, price: SALE_PRICE, cost: SALE_COST,
          payments: [{ method: 'transfer', currency: 'CUP', amount: 100, reference: 'TR-E2E-B-1' }],
        }],
      }),
    });
    expect(res.status(), `body: ${await res.text()}`).toBe(200);
    const json = await res.json();

    const ledger = await sb.select<{ payment_method: string; reference: string | null; currency: string }>(
      'payment_transactions', `transaction_id=eq.${json.transaction_id}&select=payment_method,reference,currency`,
    );
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ payment_method: 'transfer', reference: 'TR-E2E-B-1', currency: 'CUP' });

    const itemRow = (await sb.select<{ payment_distributions: Array<Record<string, unknown>> } | null>(
      'transaction_items', `transaction_id=eq.${json.transaction_id}&select=payment_distributions`,
    ))[0];
    expect(itemRow!.payment_distributions[0]).toMatchObject({ method: 'transfer', amount: 100, reference: 'TR-E2E-B-1' });
  });

  test('E2E-POS-012 (C) un producto mixto efectivo + transferencia: dos filas, dos filas de ledger', async ({ request }) => {
    const res = await request.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: basePayload({
        payment_method: 'mixed',
        total_amount: 100,
        subtotal: 100,
        cash_amount: 60,
        transfer_amount: 40,
        items: [{
          product_id: product.id, quantity: 1, price: SALE_PRICE, cost: SALE_COST,
          payments: [
            { method: 'cash', currency: 'CUP', amount: 60 },
            { method: 'transfer', currency: 'CUP', amount: 40, reference: 'TR-E2E-C-1' },
          ],
        }],
      }),
    });
    expect(res.status(), `body: ${await res.text()}`).toBe(200);
    const json = await res.json();

    const itemRow = (await sb.select<{ payment_distributions: Array<Record<string, unknown>> } | null>(
      'transaction_items', `transaction_id=eq.${json.transaction_id}&select=payment_distributions`,
    ))[0];
    expect(itemRow!.payment_distributions).toHaveLength(2);
    expect(itemRow!.payment_distributions.map((d) => d.method).sort()).toEqual(['cash', 'transfer']);

    const ledger = await sb.select<{ payment_method: string; reference: string | null; amount: string | number }>(
      'payment_transactions', `transaction_id=eq.${json.transaction_id}&select=payment_method,reference,amount&order=payment_method.asc`,
    );
    expect(ledger).toHaveLength(2);
    const sumLedger = ledger.reduce((s, r) => s + num(r.amount), 0);
    expect(sumLedger).toBe(100);
  });

  test('E2E-POS-013 (D) tres productos con métodos diferentes: distribución por línea + conciliación global', async ({ request }) => {
    const p2 = await seedProduct(store, { name: 'Producto E2E POS D2', price: 50, cost: 30, quantity: 50, sku: `E2E80-PERITEM-${Date.now()}-D2` });
    const p3 = await seedProduct(store, { name: 'Producto E2E POS D3', price: 25, cost: 15, quantity: 50, sku: `E2E80-PERITEM-${Date.now()}-D3` });
    const total = 100 + 50 + 25; // 175: A cash / B transfer / C mixto
    const res = await request.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: basePayload({
        payment_method: 'mixed',
        total_amount: total,
        subtotal: total,
        cash_amount: 100 + 10,
        transfer_amount: 50 + 15,
        items: [
          { product_id: product.id, quantity: 1, price: SALE_PRICE, cost: SALE_COST,
            payments: [{ method: 'cash', currency: 'CUP', amount: 100 }] },
          { product_id: p2.id, quantity: 1, price: 50, cost: 30,
            payments: [{ method: 'transfer', currency: 'CUP', amount: 50, reference: 'TR-E2E-D-2' }] },
          { product_id: p3.id, quantity: 1, price: 25, cost: 15,
            payments: [
              { method: 'cash', currency: 'CUP', amount: 10 },
              { method: 'transfer', currency: 'CUP', amount: 15, reference: 'TR-E2E-D-3' },
            ] },
        ],
      }),
    });
    expect(res.status(), `body: ${await res.text()}`).toBe(200);
    const json = await res.json();

    const itemRows = await sb.select<{ product_id: string; payment_distributions: Array<Record<string, unknown>> }>(
      'transaction_items', `transaction_id=eq.${json.transaction_id}&select=product_id,payment_distributions`,
    );
    expect(itemRows).toHaveLength(3);
    const byProduct = new Map(itemRows.map((r) => [r.product_id, r.payment_distributions || []]));
    expect(byProduct.get(product.id)![0]).toMatchObject({ method: 'cash', amount: 100 });
    expect(byProduct.get(p2.id)![0]).toMatchObject({ method: 'transfer', amount: 50, reference: 'TR-E2E-D-2' });
    expect(byProduct.get(p3.id)).toHaveLength(2);

    // Conciliación global: Σ distribuciones (CUP) = Σ ledger = total de la venta
    const sumDist = itemRows.reduce(
      (s, r) => s + (r.payment_distributions || []).reduce((ps, d) => ps + num(d.amount as string | number), 0), 0,
    );
    expect(sumDist).toBe(total);
    const ledger = await sb.select<{ amount_cup: string | number }>(
      'payment_transactions', `transaction_id=eq.${json.transaction_id}&select=amount_cup`,
    );
    const sumLedger = ledger.reduce((s, r) => s + num(r.amount_cup), 0);
    expect(sumLedger).toBe(total);
  });

  test('E2E-POS-014 (F) venta con transferencia + cliente: customer_name y customer_ci persistidos', async ({ request }) => {
    const res = await request.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: basePayload({
        payment_method: 'transfer',
        total_amount: 100,
        subtotal: 100,
        cash_amount: 0,
        transfer_amount: 100,
        customer_name: 'Cliente QA Transferencia',
        customer_ci: '92031112345',
        items: [{
          product_id: product.id, quantity: 1, price: SALE_PRICE, cost: SALE_COST,
          payments: [{ method: 'transfer', currency: 'CUP', amount: 100, reference: 'TR-E2E-F-1' }],
        }],
      }),
    });
    expect(res.status(), `body: ${await res.text()}`).toBe(200);
    const json = await res.json();

    const tx = await getTransaction(json.transaction_id);
    expect(tx!.customer_name).toBe('Cliente QA Transferencia');
    expect(tx!.customer_ci).toBe('92031112345');
  });

  test('E2E-POS-014b (G) venta sin transferencia y sin CI: el campo queda null (no se exigen datos personales)', async ({ request }) => {
    const res = await request.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: basePayload({
        total_amount: 100, subtotal: 100, cash_amount: 100,
        items: [{
          product_id: product.id, quantity: 1, price: SALE_PRICE, cost: SALE_COST,
          payments: [{ method: 'cash', currency: 'CUP', amount: 100 }],
        }],
      }),
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    const tx = await getTransaction(json.transaction_id);
    expect(tx!.customer_ci).toBeNull();
    expect(tx!.customer_name).toBeNull();
  });

  test('E2E-POS-015 (I) importe parcialmente distribuido sin incidencias: rechazo 422 (no autorizado)', async ({ request }) => {
    const res = await request.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: basePayload({
        payment_method: 'mixed',
        total_amount: 100,
        subtotal: 100,
        cash_amount: 60,
        transfer_amount: 0,
        items: [{
          product_id: product.id, quantity: 1, price: SALE_PRICE, cost: SALE_COST,
          payments: [{ method: 'cash', currency: 'CUP', amount: 60 }],
        }],
      }),
    });
    // El servidor ES la autoridad: sin incidencias documentadas, la venta con
    // faltante se rechaza (invariante I1b/PT011) — el cliente solo permite
    // este camino cuando el cajero confirma la incidencia (política vigente).
    expect([422, 500]).toContain(res.status());
    const txCount = await sb.select<{ n: number }>(
      'transactions', `store_id=eq.${store.id}&total_amount=eq.60&select=id`,
    );
    expect(txCount.length).toBe(0);
  });

  test('E2E-POS-015b (I2) importe parcial CON incidencias documentadas: se registra (política MISIÓN-FLEX vigente)', async ({ request }) => {
    const res = await request.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: basePayload({
        payment_method: 'mixed',
        total_amount: 100,
        subtotal: 100,
        cash_amount: 60,
        transfer_amount: 0,
        payment_incidents: [{
          type: 'insufficient_payment',
          expected_cup: 100,
          received_cup: 60,
          difference_cup: -40,
          detail: 'E2E: faltante documentado por el cajero',
        }],
        items: [{
          product_id: product.id, quantity: 1, price: SALE_PRICE, cost: SALE_COST,
          payments: [{ method: 'cash', currency: 'CUP', amount: 60 }],
        }],
      }),
    });
    expect(res.status(), `body: ${await res.text()}`).toBe(200);
    const json = await res.json();
    const tx = await getTransaction(json.transaction_id);
    expect(tx!.payment_incidents).toBeTruthy();
  });

  test('E2E-POS-016 (J) importe distribuido SUPERIOR sin incidencias: rechazo (no se inventa vuelto)', async ({ request }) => {
    const res = await request.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: basePayload({
        payment_method: 'mixed',
        total_amount: 100,
        subtotal: 100,
        cash_amount: 150,
        transfer_amount: 0,
        items: [{
          product_id: product.id, quantity: 1, price: SALE_PRICE, cost: SALE_COST,
          payments: [{ method: 'cash', currency: 'CUP', amount: 150 }],
        }],
      }),
    });
    expect([422, 500]).toContain(res.status());
  });

  test('E2E-POS-017 distribución inválida (transferencia sin referencia): 422 fail-closed ERR_ITEM_PAYMENTS_INVALID', async ({ request }) => {
    const res = await request.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: basePayload({
        payment_method: 'transfer',
        total_amount: 100,
        subtotal: 100,
        cash_amount: 0,
        transfer_amount: 100,
        items: [{
          product_id: product.id, quantity: 1, price: SALE_PRICE, cost: SALE_COST,
          payments: [{ method: 'transfer', currency: 'CUP', amount: 100 }],
        }],
      }),
    });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain('Distribución de pago por producto inválida');
  });

  test('E2E-POS-017b distribución inválida (método desconocido): 422 fail-closed', async ({ request }) => {
    const res = await request.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: basePayload({
        total_amount: 100, subtotal: 100, cash_amount: 100,
        items: [{
          product_id: product.id, quantity: 1, price: SALE_PRICE, cost: SALE_COST,
          payments: [{ method: 'cripto', currency: 'CUP', amount: 100 }],
        }],
      }),
    });
    // Zod del route (400) o fail-closed del RPC (422) — ambos RECHAZAN
    expect([400, 422]).toContain(res.status());
  });

  test('E2E-POS-018 (M) filas multi-moneda por línea (CUP + USD): distribución conserva ambas con su moneda', async ({ request }) => {
    // Producto de 120 CUP: 100 CUP + 20/450 USD (≈ 0.0444 USD → se usa una fila USD de 20 CUP-equivalentes no válida;
    // para mantener el cuadre exacto: 100 CUP + 20 CUP (fila USD NO) — se usa venta de 100 CUP con fila USD de tasa 450
    // cuyo equivalente cierra el total: USD 20 × ... NO. Se modela: total 100 = 80 CUP + USD 20/450 → no exacto.
    // Escenario válido exacto: producto 190 CUP = 100 CUP + USD 0.2 × 450 = 90 CUP. Se siembra a 190.
    const pMulti = await seedProduct(store, { name: 'Producto E2E POS Multi', price: 190, cost: 100, quantity: 10, sku: `E2E80-PERITEM-${Date.now()}-M` });
    // Prerrequisito §6.1: tasa USD de la tienda (autoridad del servidor para
    // componentes en USD). Idempotente: select-then-insert (sb no tiene upsert).
    const rateRow = await sb.select('store_exchange_rates', `store_id=eq.${store.id}&currency=eq.USD&select=id`);
    if (rateRow.length === 0) {
      await sb.insert('store_exchange_rates', [{ store_id: store.id, currency: 'USD', rate: 450 }]);
    }
    const total = 190; // 100 CUP + 0.2 USD × 450 = 90 CUP
    const res = await request.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: basePayload({
        payment_method: 'mixed',
        total_amount: total,
        subtotal: total,
        sale_currency: 'CUP',
        cash_amount: 190,
        transfer_amount: 0,
        payment_components: [
          { method: 'cash', currency: 'CUP', amount: 100 },
          { method: 'cash', currency: 'USD', amount: 0.2 },
        ],
        items: [{
          product_id: pMulti.id, quantity: 1, price: 190, cost: 100, currency: 'CUP', exchange_rate: 1,
          payments: [
            { method: 'cash', currency: 'CUP', amount: 100 },
            { method: 'cash', currency: 'USD', amount: 0.2, exchange_rate: 450 },
          ],
        }],
      }),
    });
    expect(res.status(), `body: ${await res.text()}`).toBe(200);
    const json = await res.json();

    const itemRow = (await sb.select<{ payment_distributions: Array<Record<string, unknown>> } | null>(
      'transaction_items', `transaction_id=eq.${json.transaction_id}&select=payment_distributions`,
    ))[0];
    expect(itemRow!.payment_distributions).toHaveLength(2);
    expect(itemRow!.payment_distributions.map((d) => d.currency).sort()).toEqual(['CUP', 'USD']);
    // La fila USD conserva su tasa informativa (la autoritativa es la del servidor)
    const usdRow = itemRow!.payment_distributions.find((d) => d.currency === 'USD');
    expect(num(usdRow!.exchange_rate as string | number)).toBe(450);
    // Ledger: una fila por componente con moneda real
    const ledger = await sb.select<{ currency: string; amount: string | number; amount_cup: string | number }>(
      'payment_transactions', `transaction_id=eq.${json.transaction_id}&select=currency,amount,amount_cup`,
    );
    expect(ledger).toHaveLength(2);
    const sumLedgerCup = ledger.reduce((s, r) => s + num(r.amount_cup), 0);
    expect(sumLedgerCup).toBe(total);
  });
});

test.describe('POS Checkout V2 — flujo UI de usuario real', () => {
  test('E2E-POS-009 (P0) flujo completo: agregar al carrito → Cobrar → Venta Completada', async ({ page, request }) => {
    test.setTimeout(120_000);

    // Setup: tienda + producto + sesión (la tienda de este describe es la misma)
    const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    adminToken = admin.token;
    adminId = admin.userId;

    // Active store = tienda de prueba (setup de datos, no el flujo bajo prueba)
    await sb.update('profiles', `id=eq.${adminId}`, { active_store_id: store.id });

    await page.addInitScript(([key, val]: any) => window.localStorage.setItem(key, val), [
      `sb-${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https?:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]}-auth-token`,
      JSON.stringify({
        access_token: admin.token,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'mock-refresh',
        user: { id: admin.userId, email: ADMIN_EMAIL },
      }),
    ]);

    const stockBefore = num((await getInventory(store.id, product.id))!.quantity);

    // 1. Abrir POS
    await page.goto('/?view=pos');
    await expect(page.locator('[aria-label="Cerrar sesión"]').first()).toBeVisible({ timeout: 45_000 });

    // 1.b Descartar el banner de cookies ANTES de tocar la grilla: el
    // overlay fijo (z-50, pointer-events-auto en su tarjeta) cubre la
    // zona inferior y en el primer load intercepta el click en la tarjeta
    // del producto ("subtree intercepts pointer events" ×132 — hallazgo
    // local 2026-10-22). Antes este paso vivía DESPUÉS del click.
    const banner = page.locator('[aria-label="Consentimiento de cookies"]');
    if (await banner.isVisible().catch(() => false)) {
      await page.locator('[aria-label="Rechazar cookies opcionales"]').click().catch(() => {});
      await page.waitForTimeout(300);
    }

    // 2. El producto de la tienda aparece en la grilla del POS
    //    (ProductCard variant="pos" → button aria-label "Agregar {name} al carrito…")
    const productCard = page.locator(`[aria-label^="Agregar ${product.name} al carrito"]`).first();
    await expect(productCard, 'el producto sembrado debe verse en el POS').toBeVisible({ timeout: 45_000 });

    // 3. Agregar 1 unidad al carrito (click en la tarjeta del producto)
    await productCard.click();

    // 3.b MISIÓN-TASAS: al abrirse el carrito por primera vez del DÍA
    // operativo (usuario sintético + tienda del run → SIEMPRE ocurre en
    // contexto limpio), RatesConfirmationModal cubre el POS y los clicks
    // en 'Cobrar' aterrizan en él aunque el locator resuelva al botón
    // (force:true no reasigna el objetivo — el elemento SUPERIOR en el
    // punto recibe el evento). OJO: la decisión de mostrarlo es ASYNC
    // (user_preferences del servidor) — un probe instantáneo llega antes
    // del render y el dialog aparece después (reproducido 2026-10-22): se
    // espera hasta 5s por él y se descarta con 'Continuar sin confirmar'
    // (silencio por sesión).
    const tasas = page.getByRole('dialog', { name: '¿Confirma que las tasas de cambio siguen vigentes?' });
    try {
      await tasas.waitFor({ state: 'visible', timeout: 15_000 });
      console.log('[POS-009] 3.b dialog de tasas VISIBLE — descartando con Continuar sin confirmar');
      await page.getByRole('button', { name: 'Continuar sin confirmar' }).click();
      await expect(tasas).toBeHidden({ timeout: 5_000 });
      console.log('[POS-009] 3.b dialog de tasas descartado');
    } catch {
      console.log('[POS-009] 3.b dialog de tasas NO apareció en 15s (o ya confirmado)');
    }

    // 4. Abrir el carrito (si no está abierto)
    const openCart = page.locator('[aria-label^="Abrir carrito"]').first();
    if (await openCart.isVisible().catch(() => false)) {
      await openCart.click();
    }

    // 6. CTA "Cobrar N productos por $X" — 1.er click cambia al tab de pago,
    //    2.º click dispara el modal de confirmación. La animación pulsante del
    //    botón impide la estabilidad → force:true.
    const cobrar = page.locator('[aria-label^="Cobrar "][aria-label*="productos"]').first();
    await expect(cobrar).toBeVisible({ timeout: 20_000 });
    // 6.a Si el dialog de tasas (re)apareció (la decisión es async y en dev
    // StrictMode puede remontar el hook tras el descarte), descartarlo
    // ANTES del click: el overlay captura los clicks en 'Cobrar'.
    if (await tasas.isVisible().catch(() => false)) {
      console.log('[POS-009] 6.a dialog de tasas presente antes de Cobrar — descartando');
      await page.getByRole('button', { name: 'Continuar sin confirmar' }).click().catch(() => {});
      await page.waitForTimeout(300);
    }
    await cobrar.click({ force: true });
    // Gate de commit del tab: el 1.er click pone activeTab='checkout'; el
    // panel de pago (#pos-cart-checkout-zone — siempre montado, oculto por
    // clase CSS) se VUELVE visible cuando React commitea el estado.
    try {
      await expect(page.locator('#pos-cart-checkout-zone')).toBeVisible({ timeout: 5_000 });
    } catch {
      // El click pudo caer en el dialog de tasas (re)aparecido: descartar y
      // reintentar UNA vez — con log, nunca silencioso.
      if (await tasas.isVisible().catch(() => false)) {
        console.log('[POS-009] 6.b el click de Cobrar cayó en el dialog de tasas — descartando y reintentando');
        await page.getByRole('button', { name: 'Continuar sin confirmar' }).click().catch(() => {});
        await page.waitForTimeout(300);
        await cobrar.click({ force: true });
      }
      await expect(page.locator('#pos-cart-checkout-zone')).toBeVisible({ timeout: 10_000 });
    }
    const confirm = page.getByRole('button', { name: /^confirmar$/i }).first();
    if (!(await confirm.isVisible().catch(() => false))) {
      await cobrar.click({ force: true });
      await expect(confirm).toBeVisible({ timeout: 15_000 });
    }

    // 7. Confirmar la venta
    await confirm.click();

    // 8. Resultado observable en UI: vista de éxito
    await expect(page.locator('#sale-success-content')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('¡Venta Completada!')).toBeVisible();

    // 9. Verificación de estado persistido: stock −1 y transacción completada
    const stockAfter = num((await getInventory(store.id, product.id))!.quantity);
    expect(stockAfter).toBe(stockBefore - 1);

    const txs = await sb.select('transactions', `store_id=eq.${store.id}&select=id,status,total_amount&order=created_at.desc&limit=1`);
    expect(txs[0].status).toBe('completed');
    expect(num(txs[0].total_amount)).toBe(SALE_PRICE);
  });
});
