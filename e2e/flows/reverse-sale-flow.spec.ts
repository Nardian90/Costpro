/**
 * E2E P0 — REVERSIÓN DE VENTA (documento)
 * ============================================================================
 * Escenarios (ver e2e/SCENARIO-INVENTORY.md):
 *   E2E-REV-001 (P0) revertir venta → tx anulada, stock restaurado exacto
 *   E2E-REV-002 (P0) restauración = cantidad vendida (invariante)
 *   E2E-REV-003 (P1) motivo inválido (corto) → 400
 *   E2E-REV-004 (P1) reversión duplicada → rechazada, stock sin doble restauración
 *
 * Nota: /api/reverse tiene rate limit 5/min — este spec hace ≤3 llamadas.
 * ============================================================================
 */
import { test, expect, type APIRequestContext } from '@playwright/test';

/** Contexto de request propio del spec */
let api: APIRequestContext;
import {
  signIn, apiHeaders, sb, createTestStore, deleteTestStore, seedProduct,
  getInventory, getStockMovements, cleanupProducts, num,
} from '../fixtures/session.fixture';

let adminToken: string;
let adminId: string;
let store: { id: string; name: string; slug: string };
let product: { id: string; name: string; price: number; cost: number; initialStock: number };

const PRICE = 100;
const COST = 60;
const INITIAL_STOCK = 50;

async function createSale(qty: number): Promise<string> {
  const res = api.post('/api/pos/checkout', {
    headers: apiHeaders(adminToken),
    data: {
      store_id: store.id,
      seller_id: adminId,
      payment_method: 'cash',
      total_amount: qty * PRICE,
      subtotal: qty * PRICE,
      cash_amount: qty * PRICE,
      sale_currency: 'CUP',
      idempotency_key: `rev-setup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      items: [{ product_id: product.id, quantity: qty, price: PRICE, cost: COST }],
    },
  });
  const res2 = await res;
  const json = await res2.json();
  expect(res2.status(), `venta setup: ${JSON.stringify(json).slice(0, 200)}`).toBe(200);
  return json.transaction_id;
}

async function reverse(type: string, id: string, reason: string) {
  return api.post('/api/reverse', {
    headers: apiHeaders(adminToken),
    data: { type, id, reason },
  });
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000' });
  const admin = await signIn('admin@costpro.com', 'costpro123');
  adminToken = admin.token;
  adminId = admin.userId;
});

test.afterAll(async () => {
  if (store?.id) {
    await cleanupProducts(store.id, product ? [product.id] : []).catch(() => {});
    await deleteTestStore(api, adminToken, store.id);
  }
  await api?.dispose().catch(() => {});
});

test.describe('Reversión de venta — integridad de stock', () => {
  test.beforeAll(async () => {
    store = await createTestStore(api, adminToken, 'REV');
    product = await seedProduct(store, { name: 'Producto E2E Reversa', price: PRICE, cost: COST, quantity: INITIAL_STOCK });
  });

  test('E2E-REV-001 (P0) revertir venta anula la transacción y restaura el stock', async () => {
    const txId = await createSale(4); // stock 50 → 46
    expect(num((await getInventory(store.id, product.id))?.quantity)).toBe(46);

    const res = await reverse('transaction', txId, 'Reversión E2E — error de factura de prueba');
    expect(res.status(), `body: ${await res.text()}`).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('success');
    expect(num(json.units_restored)).toBe(4);

    // Estado persistido: transacción anulada
    const tx = await sb.select('transactions', `id=eq.${txId}&select=status`);
    expect(tx[0].status).toBe('voided');

    // Stock restaurado: 46 + 4 = 50
    expect(num((await getInventory(store.id, product.id))?.quantity)).toBe(50);

    // Movimiento de restauración registrado y vinculado
    const movements = await getStockMovements(store.id, product.id);
    const restore = movements.find((m) => num(m.quantity_change) === 4 && m.movement_type !== 'sale');
    expect(restore, 'debe existir movimiento +4 de restauración').toBeTruthy();
  });

  test('E2E-REV-002 (P0) invariante: stock final = inicial tras venta+reversión', async () => {
    const txId = await createSale(7); // 50 → 43
    await reverse('transaction', txId, 'Reversión E2E invariante — prueba automatizada');
    const stock = num((await getInventory(store.id, product.id))?.quantity);
    expect(stock, 'venta + reversión debe devolver el stock al valor inicial').toBe(50);
  });

  test('E2E-REV-003 (P1) motivo demasiado corto → 400', async () => {
    const txId = await createSale(1);
    const res = await reverse('transaction', txId, 'x');
    expect(res.status()).toBe(400);
    // La venta sigue activa y el stock sin restaurar (49)
    const tx = await sb.select('transactions', `id=eq.${txId}&select=status`);
    expect(tx[0].status).toBe('completed');
    expect(num((await getInventory(store.id, product.id))?.quantity)).toBe(49);
  });

  test('E2E-REV-004 (P1) reversión duplicada → rechazada sin doble restauración', async () => {
    const txId = await createSale(2); // 49 → 51 tras reversión previa... calcular
    const stockBefore = num((await getInventory(store.id, product.id))?.quantity);

    const first = await reverse('transaction', txId, 'Reversión E2E duplicada — primera llamada');
    expect(first.status()).toBe(200);
    const stockAfterFirst = num((await getInventory(store.id, product.id))?.quantity);
    expect(stockAfterFirst).toBe(stockBefore + 2);

    const second = await reverse('transaction', txId, 'Reversión E2E duplicada — segunda llamada');
    // Semántica del RPC: idempotente por diseño — si la tx ya está voided
    // devuelve 200 con status='idempotent' SIN restaurar stock de nuevo.
    expect(second.status()).toBe(200);
    const secondJson = await second.json();
    expect(secondJson.status, 'la doble reversión debe reportarse como idempotent').toBe('idempotent');

    const stockAfterSecond = num((await getInventory(store.id, product.id))?.quantity);
    expect(stockAfterSecond, 'el stock no debe restaurarse dos veces').toBe(stockAfterFirst);
  });
});
