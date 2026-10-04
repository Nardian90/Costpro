/**
 * E2E P0 — DEVOLUCIONES DE VENTA
 * ============================================================================
 * Escenarios (ver e2e/SCENARIO-INVENTORY.md):
 *   E2E-DEV-001 (P0) devolución tras venta → stock restaurado + devolution registrada
 *   E2E-DEV-002 (P0) importe e items de la devolución correctos
 *   E2E-DEV-003 (P0) clerk (sin canManageStore) → 403
 *   E2E-DEV-004 (P1) GET /api/devolutions lista la devolución de la tienda
 *
 * Flujo: venta real (create_sale_v2) → devolución (create_devolution_v2) →
 * verificación de stock y documentos en DB.
 * ============================================================================
 */
import { test, expect, type APIRequestContext } from '@playwright/test';

/** Contexto de request propio del spec (el fixture de beforeAll no es reutilizable en tests) */
let api: APIRequestContext;
import {
  ADMIN_EMAIL, ADMIN_PASS, CLERK_EMAIL, CLERK_PASS, signIn, apiHeaders, sb, createTestStore, deleteTestStore, seedProduct,
  getInventory, cleanupProducts, num,
} from '../fixtures/session.fixture';

let adminToken: string;
let adminId: string;
let clerkToken: string;
let store: { id: string; name: string; slug: string };
let product: { id: string; name: string; price: number; cost: number; initialStock: number };
let saleTransactionId: string;

const PRICE = 100;
const COST = 60;
const INITIAL_STOCK = 50;
const SOLD_QTY = 3;

async function createSale(): Promise<string> {
  const res = await api.post('/api/pos/checkout', {
    headers: apiHeaders(adminToken),
    data: {
      store_id: store.id,
      seller_id: adminId,
      payment_method: 'cash',
      total_amount: SOLD_QTY * PRICE,
      subtotal: SOLD_QTY * PRICE,
      cash_amount: SOLD_QTY * PRICE,
      sale_currency: 'CUP',
      idempotency_key: `dev-setup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      items: [{ product_id: product.id, quantity: SOLD_QTY, price: PRICE, cost: COST }],
    },
  });
  const json = await res.json();
  expect(res.status(), `venta setup: ${JSON.stringify(json).slice(0, 200)}`).toBe(200);
  return json.transaction_id;
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000' });
  const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  adminToken = admin.token;
  adminId = admin.userId;
  const clerk = await signIn(CLERK_EMAIL, CLERK_PASS);
  clerkToken = clerk.token;
});

test.afterAll(async () => {
  if (store?.id) {
    await cleanupProducts(store.id, product ? [product.id] : []).catch(() => {});
    await deleteTestStore(api, adminToken, store.id);
  }
  await api?.dispose().catch(() => {});
});

test.describe('Devoluciones — flujo tras venta real', () => {
  test.beforeAll(async () => {
    store = await createTestStore(api, adminToken, 'DEV');
    product = await seedProduct(store, { name: 'Producto E2E Devolución', price: PRICE, cost: COST, quantity: INITIAL_STOCK });
    saleTransactionId = await createSale();
  });

  test('E2E-DEV-001 (P0) devolución restaura stock y registra documento', async () => {
    const stockAfterSale = num((await getInventory(store.id, product.id))?.quantity);
    expect(stockAfterSale).toBe(INITIAL_STOCK - SOLD_QTY);

    const res = await api.post('/api/devolutions', {
      headers: apiHeaders(adminToken),
      data: {
        store_id: store.id,
        items: [{ product_id: product.id, quantity: 2, unit_price: PRICE }],
        reason: 'Devolución E2E — producto defectuoso de prueba',
        original_transaction_id: saleTransactionId,
      },
    });
    expect(res.status(), `body: ${await res.text()}`).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('success');
    expect(json.devolution_id).toBeTruthy();

    // Stock restaurado: 47 + 2 = 49
    const stockAfterDev = num((await getInventory(store.id, product.id))?.quantity);
    expect(stockAfterDev).toBe(stockAfterSale + 2);

    // Documento en DB con tienda/vinculación correctas
    const dev = await sb.select('devolutions', `id=eq.${json.devolution_id}&select=store_id,status,total_amount,original_transaction_id`);
    expect(dev[0].store_id).toBe(store.id);
    expect(dev[0].status).toBe('completed');
    expect(num(dev[0].total_amount)).toBe(2 * PRICE);
  });

  test('E2E-DEV-002 (P0) los items de la devolución reflejan cantidad y precio', async () => {
    const devRows = await sb.select('devolutions', `store_id=eq.${store.id}&select=id&order=created_at.desc&limit=1`);
    const devId = devRows[0].id;
    const items = await sb.select('devolution_items', `devolution_id=eq.${devId}&select=product_id,quantity,unit_price`);
    expect(items.length).toBe(1);
    expect(items[0].product_id).toBe(product.id);
    expect(num(items[0].quantity)).toBe(2);
    expect(num(items[0].unit_price)).toBe(PRICE);
  });

  test('E2E-DEV-003 (P0) clerk sin permisos de gestión no puede devolver → 403', async () => {
    const res = await api.post('/api/devolutions', {
      headers: apiHeaders(clerkToken),
      data: {
        store_id: store.id,
        items: [{ product_id: product.id, quantity: 1, unit_price: PRICE }],
        reason: 'Intento no autorizado E2E',
      },
    });
    expect(res.status()).toBe(403);

    // Sin efecto en stock
    const inv = await getInventory(store.id, product.id);
    expect(num(inv?.quantity)).toBe(INITIAL_STOCK - SOLD_QTY + 2);
  });

  test('E2E-DEV-004 (P1) listado de devoluciones de la tienda', async () => {
    const res = await api.get(`/api/devolutions?store_id=${store.id}`, {
      headers: apiHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    const list = Array.isArray(json) ? json : (json.data ?? []);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].store_id ?? list[0].devolutions?.store_id).toBeTruthy();
  });
});
