/**
 * E2E P0 — TRANSFERENCIAS ENTRE TIENDAS
 * ============================================================================
 * Escenarios (ver e2e/SCENARIO-INVENTORY.md):
 *   E2E-TRA-001 (P0) crear transferencia → PENDIENTE + reserva (stock sin cambio)
 *   E2E-TRA-002 (P0) confirmar → origen −N, producto destino +N, CONFIRMADA
 *   E2E-TRA-003 (P0) conservación: stock total (origen+destino) invariante
 *   E2E-TRA-004 (P0) stock insuficiente al confirmar → error, sin cambios
 *   E2E-TRA-005 (P0) confirmar sin acceso al destino (clerk) → 403
 *   E2E-TRA-006 (P1) doble confirmación → rechazada
 *
 * Semántica real (verificada empíricamente): create_transfer crea
 * transfer_items con destination_product_id AUTO-CREADO en la tienda destino;
 * el stock sale del origen SOLO al confirmar (reserva previa).
 * ============================================================================
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  signIn, apiHeaders, sb, createTestStore, deleteTestStore, seedProduct,
  getInventory, getStockMovements, cleanupProducts, num,
} from '../fixtures/session.fixture';

let adminToken: string;
let adminId: string;
let clerkToken: string;
let storeA: { id: string; name: string; slug: string };
let storeB: { id: string; name: string; slug: string };
let product: { id: string; name: string; price: number; cost: number; initialStock: number };

const QTY = 5;
const INITIAL_STOCK = 50;

function headers(token: string) { return apiHeaders(token); }

async function destProductStock(): Promise<number> {
  const rows = await sb.select(
    'transfer_items',
    `transfer_id=in.(select id from transfers where origin_store_id=eq.${storeA.id})&select=destination_product_id`,
  );
  const destId = rows[rows.length - 1]?.destination_product_id as string;
  if (!destId) return -1;
  const prod = await sb.select('products', `id=eq.${destId}&select=stock_current`);
  return num(prod[0]?.stock_current, -1);
}

test.beforeAll(async () => {
  const admin = await signIn('admin@costpro.com', 'costpro123');
  adminToken = admin.token;
  adminId = admin.userId;
  const clerk = await signIn('cajero@demo.com', 'demo123');
  clerkToken = clerk.token;
});

test.afterAll(async ({ request }: { request: APIRequestContext }) => {
  if (storeA?.id) {
    await cleanupProducts(storeA.id, product ? [product.id] : []).catch(() => {});
    await deleteTestStore(request, adminToken, storeA.id);
  }
  if (storeB?.id) await deleteTestStore(request, adminToken, storeB.id);
});

test.describe('Transferencias — flujo completo e integridad', () => {
  let transferId: string;

  test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
    storeA = await createTestStore(request, adminToken, 'TRA');
    storeB = await createTestStore(request, adminToken, 'TRB');
    product = await seedProduct(storeA, {
      name: 'Producto E2E Transfer',
      price: 100, cost: 60, quantity: INITIAL_STOCK,
    });
  });

  test('E2E-TRA-001 (P0) crear transferencia → PENDIENTE con stock de origen reservado', async ({ request }) => {
    const res = await request.post('/api/transfers', {
      headers: headers(adminToken),
      data: {
        origin_store_id: storeA.id,
        destination_store_id: storeB.id,
        items: [{ product_id: product.id, quantity: QTY, unit_cost: 60 }],
        notes: 'Transferencia E2E',
      },
    });
    expect(res.status(), `body: ${await res.text()}`).toBe(200);
    const json = await res.json();
    transferId = json.transfer_id ?? json.id;
    expect(transferId).toBeTruthy();

    // Estado PENDIENTE
    const rows = await sb.select('transfers', `id=eq.${transferId}&select=status,origin_store_id,destination_store_id`);
    expect(rows[0].status).toBe('PENDIENTE');
    expect(rows[0].origin_store_id).toBe(storeA.id);
    expect(rows[0].destination_store_id).toBe(storeB.id);

    // El stock del origen NO cambia al crear (reserva)
    const inv = await getInventory(storeA.id, product.id);
    expect(num(inv?.quantity)).toBe(INITIAL_STOCK);

    // Items con mapeo a producto destino
    const items = await sb.select('transfer_items', `transfer_id=eq.${transferId}&select=product_id,destination_product_id,quantity,unit_cost,total`);
    expect(items.length).toBe(1);
    expect(items[0].product_id).toBe(product.id);
    expect(items[0].destination_product_id).toBeTruthy();
    expect(num(items[0].quantity)).toBe(QTY);
    expect(num(items[0].total)).toBe(QTY * 60);
  });

  test('E2E-TRA-002 (P0) confirmar transferencia mueve el stock origen→destino', async ({ request }) => {
    const destProductId = (await sb.select('transfer_items', `transfer_id=eq.${transferId}&select=destination_product_id`))[0].destination_product_id as string;
    const destBefore = await sb.select('products', `id=eq.${destProductId}&select=stock_current`);

    const res = await request.post(`/api/transfers/${transferId}/confirm`, {
      headers: headers(adminToken),
      data: {},
    });
    expect(res.status(), `body: ${await res.text()}`).toBe(200);

    // Origen: −5
    const invA = await getInventory(storeA.id, product.id);
    expect(num(invA?.quantity)).toBe(INITIAL_STOCK - QTY);

    // Destino: producto mapeado +5
    const destAfter = await sb.select('products', `id=eq.${destProductId}&select=stock_current`);
    expect(num(destAfter[0].stock_current)).toBe(num(destBefore[0].stock_current, 0) + QTY);

    // Estado CONFIRMADA + audit fields
    const tx = await sb.select('transfers', `id=eq.${transferId}&select=status,confirmed_at,confirmed_by`);
    expect(tx[0].status).toBe('CONFIRMADA');
    expect(tx[0].confirmed_by).toBe(adminId);

    // Movimientos registrados en ambos extremos
    const outMovements = await getStockMovements(storeA.id, product.id);
    expect(outMovements.some((m) => num(m.quantity_change) === -QTY), 'debe existir movimiento −5 en origen').toBe(true);
    const inMovements = await getStockMovements(storeB.id, destProductId);
    expect(inMovements.some((m) => num(m.quantity_change) === QTY), 'debe existir movimiento +5 en destino').toBe(true);
  });

  test('E2E-TRA-003 (P0) conservación: el stock total se mantiene invariante', async () => {
    const originStock = num((await getInventory(storeA.id, product.id))?.quantity);
    const destProductId = (await sb.select('transfer_items', `transfer_id=eq.${transferId}&select=destination_product_id`))[0].destination_product_id as string;
    const destStock = num((await sb.select('products', `id=eq.${destProductId}&select=stock_current`))[0].stock_current);

    // 50 iniciales en origen + 0 del producto destino auto-creado → total constante
    expect(originStock + destStock).toBe(INITIAL_STOCK);
  });

  test('E2E-TRA-004 (P0) stock insuficiente al confirmar → error sin cambios', async ({ request }) => {
    // Transferencia por cantidad mayor al stock disponible
    const res = await request.post('/api/transfers', {
      headers: headers(adminToken),
      data: {
        origin_store_id: storeA.id,
        destination_store_id: storeB.id,
        items: [{ product_id: product.id, quantity: 99999, unit_cost: 60 }],
        notes: 'Transferencia excesiva E2E',
      },
    });
    // La creación puede rechazarla ya (validación) o fallar al confirmar
    if (res.status() === 200) {
      const json = await res.json();
      const tid = json.transfer_id ?? json.id;
      const confirmRes = await request.post(`/api/transfers/${tid}/confirm`, {
        headers: headers(adminToken), data: {},
      });
      expect(confirmRes.status()).toBeGreaterThanOrEqual(400);
      const tx = await sb.select('transfers', `id=eq.${tid}&select=status`);
      expect(tx[0].status).not.toBe('CONFIRMADA');
    } else {
      expect(res.status()).toBeGreaterThanOrEqual(400);
    }

    // Sin cambios en el stock del origen
    const inv = await getInventory(storeA.id, product.id);
    expect(num(inv?.quantity)).toBe(INITIAL_STOCK - QTY);
  });

  test('E2E-TRA-005 (P0) clerk sin acceso al destino no puede confirmar → 403', async ({ request }) => {
    // Transferencia pequeña válida
    const create = await request.post('/api/transfers', {
      headers: headers(adminToken),
      data: {
        origin_store_id: storeA.id,
        destination_store_id: storeB.id,
        items: [{ product_id: product.id, quantity: 1, unit_cost: 60 }],
        notes: 'Transfer permiso E2E',
      },
    });
    expect(create.status()).toBe(200);
    const json = await create.json();
    const tid = json.transfer_id ?? json.id;

    const confirmRes = await request.post(`/api/transfers/${tid}/confirm`, {
      headers: headers(clerkToken),
      data: {},
    });
    expect(confirmRes.status(), 'clerk sin membership en destino debe recibir 403').toBe(403);

    // La transferencia NO quedó confirmada
    const tx = await sb.select('transfers', `id=eq.${tid}&select=status`);
    expect(tx[0].status).toBe('PENDIENTE');
  });

  test('E2E-TRA-006 (P1) doble confirmación → rechazada', async ({ request }) => {
    const res = await request.post(`/api/transfers/${transferId}/confirm`, {
      headers: headers(adminToken),
      data: {},
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);

    // El stock no se movió dos veces
    const inv = await getInventory(storeA.id, product.id);
    expect(num(inv?.quantity)).toBe(INITIAL_STOCK - QTY);
  });
});
