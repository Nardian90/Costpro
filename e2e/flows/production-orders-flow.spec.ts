/**
 * E2E P1 — PRODUCCIÓN: ÓRDENES
 * ============================================================================
 * Escenarios:
 *   E2E-PRD-001 (P1) crear orden de producción/servicio → 201 + persistencia
 *   E2E-PRD-002 (P1) listado por tienda incluye la orden
 *   E2E-PRD-003 (P1) creación sin sesión → 401
 *
 * NOTA: la orden usa el active_store_id del perfil (derivación server-side).
 * Los flujos profundos (consumo/vale de salida, retiro de terminado,
 * anulación) quedan como pendientes — ver reporte NOT-AUTOMATED.
 * ============================================================================
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { signIn, apiHeaders, sb, createTestStore, deleteTestStore, cleanupProducts, ADMIN_EMAIL, ADMIN_PASS } from '../fixtures/session.fixture';

let api: APIRequestContext;
let adminToken: string;
let adminId: string;
let store: { id: string; name: string; slug: string };
let orderId: string;

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000' });
  const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  adminToken = admin.token;
  adminId = admin.userId;
  store = await createTestStore(api, adminToken, 'PRD');
  // La orden toma la tienda del perfil del usuario
  await sb.update('profiles', `id=eq.${adminId}`, { active_store_id: store.id });
});

test.afterAll(async () => {
  if (store?.id) {
    await sb.delete('production_orders', `store_id=eq.${store.id}`).catch(() => {});
    await deleteTestStore(api, adminToken, store.id);
  }
  await api?.dispose().catch(() => {});
});

test.describe('Producción — órdenes', () => {
  test('E2E-PRD-001 (P1) crear orden de servicio → 201 + persistencia', async () => {
    const res = await api.post('/api/production-orders', {
      headers: apiHeaders(adminToken),
      data: {
        order_type: 'service',
        customer_name: 'Cliente E2E',
        description: 'Orden de prueba E2E automatizada',
        budget_total: 500,
        budget_currency: 'CUP',
        advance_amount: 100,
        advance_method: 'cash',
      },
    });
    expect(res.status(), `body: ${await res.text()}`).toBe(201);
    const json = await res.json();
    orderId = json.id ?? json.data?.id ?? json.order_id;
    expect(orderId).toBeTruthy();

    // Persistencia con la tienda correcta (derivada server-side)
    const rows = await sb.select('production_orders', `id=eq.${orderId}&select=store_id,order_type,customer_name,budget_total,status`);
    expect(rows[0].store_id).toBe(store.id);
    expect(rows[0].order_type).toBe('service');
    expect(rows[0].customer_name).toBe('Cliente E2E');
  });

  test('E2E-PRD-002 (P1) listado incluye la orden creada', async () => {
    const res = await api.get(`/api/production-orders?store_id=${store.id}`, {
      headers: apiHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    const payload = JSON.stringify(json);
    expect(payload.includes(orderId), 'la orden debe aparecer en el listado').toBe(true);
  });

  test('E2E-PRD-003 (P1) creación sin sesión → 401', async () => {
    const res = await api.post('/api/production-orders', {
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      data: { order_type: 'service', budget_total: 1 },
    });
    expect(res.status()).toBe(401);
  });
});
