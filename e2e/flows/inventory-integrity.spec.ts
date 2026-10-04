/**
 * E2E P0 — INVENTARIO: AJUSTES + INTEGRIDAD DE STOCK
 * ============================================================================
 * Escenarios (ver e2e/SCENARIO-INVENTORY.md):
 *   E2E-INV-001 (P0) ajuste entrada (+5) → stock sube + movimiento 'adjustment'
 *   E2E-INV-002 (P0) ajuste salida (−3) → stock baja + movimiento negativo
 *   E2E-INV-003 (P0) invariante: stock final = inicial + Σ movimientos
 *                     + consistencia inventory.quantity ≡ products.stock_current
 *   E2E-INV-004 (P1) reducción mayor que el stock → comportamiento documentado
 *                     (floor a 0 en perform_inventory_adjustment) sin inconsistencia
 *   E2E-INV-005 (P1) kardex: GET /api/inventory/{id}/history lista los movimientos
 *   E2E-INV-006 (P1) conflicto de versión (optimistic lock) → 409
 *   E2E-INV-007 (P0) usuario sin membership (clerk) → 403 en ajuste de tienda ajena
 *   E2E-INV-008 (P1) UI: vista inventario muestra producto/stock; modal de ajuste
 *                     aplica +N y actualiza el stock visible + DB
 *
 * Nota de arquitectura: la UI moderna ajusta vía RPC perform_inventory_adjustment
 * (browser → Supabase). Los tests invocan el MISMO RPC con el JWT del usuario,
 * replicando exactamente la llamada del cliente. La ruta legacy
 * /api/inventory/adjust se prueba para su superficie documentada (409/403).
 * ============================================================================
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  ADMIN_EMAIL, ADMIN_PASS, CLERK_EMAIL, CLERK_PASS, signIn, apiHeaders, sb, rpcAsUser, createTestStore, deleteTestStore,
  seedProduct, getInventory, getStockMovements, cleanupProducts, num,
  restoreActiveStore,
} from '../fixtures/session.fixture';

let adminToken: string;
let adminId: string;
let clerkToken: string;
let store: { id: string; name: string; slug: string };
let product: { id: string; name: string; price: number; cost: number; initialStock: number };

const INITIAL_STOCK = 50;

async function adjust(delta: number, reason = 'E2E adjustment') {
  return rpcAsUser('perform_inventory_adjustment', adminToken, {
    p_store_id: store.id,
    p_product_id: product.id,
    p_user_id: adminId,
    p_quantity_delta: delta,
    p_reason: reason,
  });
}

async function getProductStock(): Promise<number> {
  const rows = await sb.select('products', `id=eq.${product.id}&select=stock_current`);
  return num(rows[0]?.stock_current);
}

async function assertStockConsistency(label: string) {
  const inv = await getInventory(store.id, product.id);
  const prodStock = await getProductStock();
  expect(num(inv?.quantity), `${label}: inventory.quantity debe reflejar el stock real`).toBe(prodStock);
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

test.describe('Inventario — ajustes e integridad de stock', () => {
  test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
    store = await createTestStore(request, adminToken, 'INV');
    product = await seedProduct(store, {
      name: 'Producto E2E Inventario',
      price: 100,
      cost: 60,
      quantity: INITIAL_STOCK,
    });
  });

  test('E2E-INV-001 (P0) ajuste de entrada +5 incrementa stock y registra movimiento', async () => {
    const res = await adjust(5, 'Entrada E2E');
    expect(res.ok, `rpc error: ${res.error}`).toBe(true);
    expect(res.data?.success).toBe(true);
    expect(num(res.data?.new_stock)).toBe(INITIAL_STOCK + 5);

    // Estado persistido
    const inv = await getInventory(store.id, product.id);
    expect(num(inv?.quantity)).toBe(INITIAL_STOCK + 5);

    const movements = await getStockMovements(store.id, product.id);
    const entry = movements.find((m) => m.movement_type === 'adjustment' && num(m.quantity_change) === 5);
    expect(entry, 'debe existir movement adjustment +5').toBeTruthy();
    expect(entry!.store_id).toBe(store.id);
    expect(entry!.product_id).toBe(product.id);

    await assertStockConsistency('INV-001');
  });

  test('E2E-INV-002 (P0) ajuste de salida −3 reduce stock y registra movimiento negativo', async () => {
    const res = await adjust(-3, 'Salida E2E');
    expect(res.ok, `rpc error: ${res.error}`).toBe(true);

    const inv = await getInventory(store.id, product.id);
    expect(num(inv?.quantity)).toBe(INITIAL_STOCK + 5 - 3);

    const movements = await getStockMovements(store.id, product.id);
    const exit = movements.find((m) => m.movement_type === 'adjustment' && num(m.quantity_change) === -3);
    expect(exit, 'debe existir movement adjustment −3').toBeTruthy();

    await assertStockConsistency('INV-002');
  });

  test('E2E-INV-003 (P0) invariante: stock final = inicial + Σ movimientos', async () => {
    // Añadimos más operaciones para reforzar el invariante
    await adjust(10, 'Serie 1');
    await adjust(-4, 'Serie 2');

    const movements = await getStockMovements(store.id, product.id);
    const sumOfChanges = movements.reduce((acc, m) => acc + num(m.quantity_change), 0);

    const inv = await getInventory(store.id, product.id);
    expect(
      num(inv?.quantity),
      `stock actual (${inv?.quantity}) debe ser inicial (${INITIAL_STOCK}) + Σ movimientos (${sumOfChanges})`,
    ).toBe(INITIAL_STOCK + sumOfChanges);

    // El último balance_after registrado debe coincidir con el stock actual
    const lastMovement = movements[movements.length - 1];
    expect(num(lastMovement.balance_after)).toBe(num(inv?.quantity));

    await assertStockConsistency('INV-003');
  });

  test('E2E-INV-004 (P1) reducción mayor que el stock documenta comportamiento sin inconsistencia', async () => {
    // La RPC perform_inventory_adjustment aplica floor(0) en products y el
    // movimiento se registra; verificamos que NUNCA quede estado inconsistente.
    const res = await adjust(-9999, 'Reducción excesiva E2E');
    // La llamada puede aceptarse (floor) o rechazarse — ambas son válidas SI
    // el estado queda consistente. Documentamos el resultado real:
    const inv = await getInventory(store.id, product.id);
    const prodStock = await getProductStock();
    console.log(`INV-004: rpc ok=${res.ok} err=${res.error} → inventory=${inv?.quantity} products=${prodStock}`);

    expect(num(inv?.quantity), 'inventory nunca debe quedar inconsistente con products').toBe(prodStock);
    expect(num(inv?.quantity), 'stock nunca debe ser negativo').toBeGreaterThanOrEqual(0);
  });

  test('E2E-INV-005 (P1) kardex: el historial del producto lista los movimientos', async ({ request }) => {
    const res = await request.get(`/api/inventory/${product.id}/history?storeId=${store.id}`, {
      headers: apiHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    const items = Array.isArray(json) ? json : (json.data ?? json.movements ?? []);
    expect(items.length, 'el kardex debe contener los movimientos del spec').toBeGreaterThanOrEqual(4);
  });

  test('E2E-INV-006 (P1) [DEFECT-001 REPARADO] ruta /api/inventory/adjust aplica el ajuste vía service-role', async ({ request }) => {
    // DEFECT-001 (documentado en E2E-COVERAGE-REPORT.md) + ACL REM-INV-6:
    // la ruta estaba rota por (a) llamada con el client del usuario a una RPC
    // service_role-only (42501 permission denied → 500) y (b) movementType
    // 'add'|'subtract'|'set' sin mapear al enum movement_type. Reparada en
    // E2E-PRODUCT-FIX-ROUND1 (admin client + mapeo 'adjustment' con delta,
    // p_user_id siempre del JWT). Regresión del contrato reparado: el ajuste
    // aplica, deja exactamente un movimiento y mantiene la consistencia.
    const before = await getInventory(store.id, product.id);
    const movementsBefore = (await getStockMovements(store.id, product.id)).length;

    const res = await request.post('/api/inventory/adjust', {
      headers: apiHeaders(adminToken),
      data: {
        productId: product.id,
        storeId: store.id,
        quantity: 4,
        movementType: 'add',
        version: 1,
        reason: 'E2E INV-006 reparada',
      },
    });
    expect(res.status(), 'la ruta reparada debe responder 200').toBe(200);
    const json = await res.json();
    expect(num(json.newQuantity), 'la respuesta debe reflejar el nuevo stock').toBe(num(before?.quantity) + 4);
    expect(json.newVersion, 'la respuesta debe incluir la nueva versión').toBeTruthy();

    // Estado persistido: stock incrementado
    const after = await getInventory(store.id, product.id);
    expect(num(after?.quantity), 'el stock debe reflejar +4 tras el ajuste vía API').toBe(num(before?.quantity) + 4);

    // Exactamente un movimiento nuevo (+4, tipo adjustment)
    const movements = await getStockMovements(store.id, product.id);
    expect(movements.length, 'debe registrarse exactamente un movimiento nuevo').toBe(movementsBefore + 1);
    const added = movements[movements.length - 1];
    expect(num(added.quantity_change), 'el movimiento debe ser +4').toBe(4);
    expect(added.movement_type, 'el tipo debe ser adjustment').toBe('adjustment');

    await assertStockConsistency('INV-006');
  });

  test('E2E-INV-007 (P0) clerk sin membership no puede ajustar en tienda ajena → 403', async ({ request }) => {
    const res = await request.post('/api/inventory/adjust', {
      headers: apiHeaders(clerkToken),
      data: {
        productId: product.id,
        storeId: store.id,
        quantity: 1,
        movementType: 'add',
        version: 1,
        reason: 'Intento cruzado E2E',
      },
    });
    expect(res.status()).toBe(403);
  });
});

test.describe('Inventario — flujo UI', () => {
  test('E2E-INV-008 (P1) vista inventario muestra stock y el modal de ajuste lo actualiza', async ({ page, request }) => {
    test.setTimeout(120_000);

    // Recrear datos propios (el describe anterior ya limpió el suyo)
    const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    adminToken = admin.token;
    adminId = admin.userId;
    store = await createTestStore(request, admin.token, 'INV-UI');
    product = await seedProduct(store, { name: 'Producto E2E InvUI', price: 100, cost: 60, quantity: 30 });

    await sb.update('profiles', `id=eq.${adminId}`, { active_store_id: store.id });
    await page.addInitScript(([key, val]: any) => window.localStorage.setItem(key, val), [
      `sb-${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https?:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]}-auth-token`,
      JSON.stringify({
        access_token: admin.token, token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'mock-refresh',
        user: { id: admin.userId, email: ADMIN_EMAIL },
      }),
    ]);

    // 1. Abrir vista inventario
    await page.goto('/?view=inventory');
    await expect(page.locator('[aria-label="Cerrar sesión"]').first()).toBeVisible({ timeout: 45_000 });

    // 2. El producto sembrado aparece con su stock
    const productRow = page.locator('tr', { hasText: product.name }).first();
    await expect(productRow, 'el producto debe aparecer en la tabla de inventario').toBeVisible({ timeout: 45_000 });

    // 3. Abrir el modal de ajuste del producto
    // 5da9228a2 (fix(ui): stabilize inventory row actions): las acciones de
    // fila se consolidaron en un menú desplegable — botón "Opciones de
    // [producto]" (⋮) → ítem "Ajustar stock" (mismos handlers/modal que el
    // botón directo anterior). El spec se actualiza al contrato de UI vigente.
    await productRow.getByRole('button', { name: /^Opciones de / }).first().click();
    await page.getByRole('menuitem', { name: /Ajustar stock/ }).first().click();
    const unitsInput = page.locator('#ajusteUnidades');
    await expect(unitsInput).toBeVisible({ timeout: 15_000 });

    // 4. Ajustar +7 unidades, motivo obligatorio y confirmar
    await unitsInput.fill('7');
    await page.locator('#reason').fill('Ajuste E2E automatizado');
    // El banner de cookies (fixed z-50) intercepta el click del footer del modal
    const banner = page.locator('[aria-label="Consentimiento de cookies"]');
    if (await banner.isVisible().catch(() => false)) {
      await page.locator('[aria-label="Rechazar cookies opcionales"]').click().catch(() => {});
      await page.waitForTimeout(300);
    }
    // La validación forward-only de la fecha es asíncrona → esperar a que el
    // botón Confirmar quede habilitado
    const confirmBtn = page.locator('[aria-label="Confirmar ajuste de inventario"]');
    await expect(confirmBtn).toBeEnabled({ timeout: 15_000 });
    await confirmBtn.click({ force: true });

    // 5. Resultado observable: toast de éxito y modal cerrado
    await expect(page.locator('[aria-label="Confirmar ajuste de inventario"]')).toHaveCount(0, { timeout: 30_000 });

    // 6. Verificación de estado persistido: stock 30 + 7 = 37
    await page.waitForTimeout(1500); // margen para propagación
    const inv = await getInventory(store.id, product.id);
    expect(num(inv?.quantity), 'el stock en DB debe reflejar +7 tras el ajuste UI').toBe(37);

    const movements = await getStockMovements(store.id, product.id);
    const uiMovement = movements.find((m) => num(m.quantity_change) === 7);
    expect(uiMovement, 'debe existir movement +7 generado desde la UI').toBeTruthy();

    // Cleanup del describe UI
    await cleanupProducts(store.id, [product.id]);
    await deleteTestStore(request, adminToken, store.id);
  });
});
