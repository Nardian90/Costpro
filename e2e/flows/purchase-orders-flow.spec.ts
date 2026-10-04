/**
 * E2E P0/P1 — COMPRAS: ÓRDENES DE COMPRA
 * ============================================================================
 * Escenarios:
 *   E2E-PO-001 (P0) crear OC con items → 201 + persistencia atómica
 *   E2E-PO-002 (P0) item inválido (cantidad 0 / costo 0) → 400 sin persistir
 *   E2E-PO-003 (P1) listado por tienda incluye la OC
 *   E2E-PO-004 (P1) creación sin sesión → 401
 * ============================================================================
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { signIn, apiHeaders, sb, createTestStore, deleteTestStore, seedProduct, cleanupProducts, num, ADMIN_EMAIL, ADMIN_PASS } from '../fixtures/session.fixture';

let api: APIRequestContext;
let adminToken: string;
let store: { id: string; name: string; slug: string };
let product: { id: string; name: string; price: number; cost: number; initialStock: number };
let poId: string;

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000' });
  const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  adminToken = admin.token;
  store = await createTestStore(api, adminToken, 'PO');
  product = await seedProduct(store, { name: 'Producto E2E Compra', price: 100, cost: 60, quantity: 10 });
});

test.afterAll(async () => {
  if (store?.id) {
    if (poId) await sb.delete('purchase_order_items', `po_id=eq.${poId}`).catch(() => {});
    await sb.delete('purchase_orders', `store_id=eq.${store.id}`).catch(() => {});
    await cleanupProducts(store.id, product ? [product.id] : []).catch(() => {});
    await deleteTestStore(api, adminToken, store.id);
  }
  await api?.dispose().catch(() => {});
});

test.describe('Compras — órdenes de compra', () => {
  test('E2E-PO-001 (P0) crear OC con items válidos → persistencia completa', async () => {
    const res = await api.post('/api/purchase-orders', {
      headers: apiHeaders(adminToken),
      data: {
        store_id: store.id,
        supplier_name: 'Proveedor E2E',
        items: [{ product_id: product.id, product_name: product.name, quantity_ordered: 5, unit_cost: 55 }],
        notes: 'OC E2E',
      },
    });
    expect(res.status(), `body: ${await res.text()}`).toBe(201);
    const json = await res.json();
    poId = json.order_id; // respuesta real: {order_id, po_number, total_amount}
    expect(poId).toBeTruthy();

    // Persistencia: cabecera + items
    const po = await sb.select('purchase_orders', `id=eq.${poId}&select=store_id,supplier_name,status,total_amount`);
    expect(po[0].store_id).toBe(store.id);
    expect(po[0].supplier_name).toBe('Proveedor E2E');
    const items = await sb.select('purchase_order_items', `po_id=eq.${poId}&select=product_id,quantity_ordered,unit_cost`);
    expect(items.length).toBe(1);
    expect(items[0].product_id).toBe(product.id);
    expect(num(items[0].quantity_ordered)).toBe(5);
    expect(num(items[0].unit_cost)).toBe(55);
  });

  test('E2E-PO-002 (P0) item con cantidad inválida → 400 sin persistir', async () => {
    const countBefore = (await sb.select('purchase_orders', `store_id=eq.${store.id}&select=id`)).length;

    const res = await api.post('/api/purchase-orders', {
      headers: apiHeaders(adminToken),
      data: {
        store_id: store.id,
        supplier_name: 'Proveedor Inválido E2E',
        items: [{ product_id: product.id, quantity_ordered: 0, unit_cost: 10 }],
      },
    });
    expect(res.status()).toBe(400);

    const countAfter = (await sb.select('purchase_orders', `store_id=eq.${store.id}&select=id`)).length;
    expect(countAfter).toBe(countBefore);
  });

  test('E2E-PO-003 (P1) listado por tienda incluye la OC creada', async () => {
    const res = await api.get(`/api/purchase-orders?store_id=${store.id}`, {
      headers: apiHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    const list = json.orders ?? json.data ?? [];
    expect(list.some((o: any) => o.id === poId), 'la OC creada debe aparecer en el listado').toBe(true);
  });

  test('E2E-PO-004 (P1) creación sin sesión → 401', async () => {
    const res = await api.post('/api/purchase-orders', {
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      data: { store_id: store.id, supplier_name: 'X', items: [{ product_id: product.id, quantity_ordered: 1, unit_cost: 1 }] },
    });
    expect(res.status()).toBe(401);
  });
});
