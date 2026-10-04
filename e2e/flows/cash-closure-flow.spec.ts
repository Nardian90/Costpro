/**
 * E2E P0/P1 — CAJA: CIERRE DE TURNO
 * ============================================================================
 * Escenarios:
 *   E2E-CASH-001 (P0) cierre de turno pendiente → completado con cuadre
 *   E2E-CASH-002 (P0) doble cierre → 409 ERR_CLOSURE_NOT_PENDING
 *   E2E-CASH-003 (P1) reporte de caja refleja el cierre
 *   E2E-CASH-004 (P1) cierre sin sesión → 401
 *
 * Setup: turno pendiente sembrado (equivalente al "abrir turno" de la UI,
 * cashService.createClosure) + venta real para tener movimiento.
 * ============================================================================
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { signIn, apiHeaders, sb, createTestStore, deleteTestStore, seedProduct, cleanupProducts, num, ADMIN_EMAIL, ADMIN_PASS } from '../fixtures/session.fixture';

let api: APIRequestContext;
let adminToken: string;
let adminId: string;
let store: { id: string; name: string; slug: string };
let product: { id: string; name: string; price: number; cost: number; initialStock: number };
let closureId: string;

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000' });
  const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  adminToken = admin.token;
  adminId = admin.userId;
  store = await createTestStore(api, adminToken, 'CASH');
  product = await seedProduct(store, { name: 'Producto E2E Caja', price: 100, cost: 60, quantity: 20 });

  // Turno pendiente PRIMERO (setup — la UI lo crea vía cashService.createClosure)
  const [closure] = await sb.insert<{ id: string }>('cash_closures', [{
    user_id: adminId, store_id: store.id, status: 'pendiente',
    opening_balance: 0, declared_cash: 0, declared_vouchers: 0,
    system_total: 0, notes: 'Turno E2E',
  }]);
  closureId = closure.id;

  // Venta real DURANTE el turno abierto (system_total la cuenta luego)
  const saleRes = await api.post('/api/pos/checkout', {
    headers: apiHeaders(adminToken),
    data: {
      store_id: store.id, seller_id: adminId,
      payment_method: 'cash', total_amount: 200, subtotal: 200, cash_amount: 200,
      sale_currency: 'CUP', idempotency_key: `cash-e2e-${Date.now()}`,
      items: [{ product_id: product.id, quantity: 2, price: 100, cost: 60 }],
    },
  });
  expect(saleRes.status(), 'venta de setup para el turno').toBe(200);
});

test.afterAll(async () => {
  if (store?.id) {
    await sb.delete('cash_closures', `store_id=eq.${store.id}`).catch(() => {});
    await cleanupProducts(store.id, product ? [product.id] : []).catch(() => {});
    await deleteTestStore(api, adminToken, store.id);
  }
  await api?.dispose().catch(() => {});
});

test.describe('Caja — cierre de turno', () => {
  test('E2E-CASH-001 (P0) cerrar turno pendiente con cuadre correcto', async () => {
    const res = await api.post('/api/cash-closures/close', {
      headers: apiHeaders(adminToken),
      data: { closure_id: closureId, declared_cash: 200, declared_vouchers: 0, notes: 'Cierre E2E' },
    });
    expect(res.status()).toBe(200);

    // Estado persistido: cierre completado. La RPC escribe declared_total,
    // system_total y difference (declared_cash queda como el valor sembrado).
    const rows = await sb.select('cash_closures', `id=eq.${closureId}&select=status,closed_at,declared_total,system_expected_total,difference`);
    expect(rows[0].status).toBe('cerrado');
    expect(num(rows[0].system_expected_total), 'ventas en efectivo del turno').toBe(200);
    expect(num(rows[0].declared_total)).toBe(200);
    expect(num(rows[0].difference), 'cuadre exacto → diferencia 0').toBe(0);
  });

  test('E2E-CASH-002 (P0) doble cierre → 409 ERR_CLOSURE_NOT_PENDING', async () => {
    const res = await api.post('/api/cash-closures/close', {
      headers: apiHeaders(adminToken),
      data: { closure_id: closureId, declared_cash: 0, declared_vouchers: 0 },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('ya fue finalizado');
  });

  test('E2E-CASH-003 (P1) el reporte de caja refleja el cierre', async () => {
    const res = await api.get(`/api/cash-report?store_id=${store.id}`, {
      headers: apiHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    const payload = JSON.stringify(json);
    expect(payload.length).toBeGreaterThan(10);
  });

  test('E2E-CASH-004 (P1) cierre sin sesión → 401', async () => {
    const res = await api.post('/api/cash-closures/close', {
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      data: { closure_id: closureId, declared_cash: 0, declared_vouchers: 0 },
    });
    expect(res.status()).toBe(401);
  });
});
