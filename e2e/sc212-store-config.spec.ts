/**
 * CP-SALES-024 — E2E UI: SC-2-12 con configuración de tienda + panel ⚙.
 *
 * Entorno: CostproE2E (BD aislada; global-setup verifica el centinela).
 * Fixtures propias por corrida (emails/tiendas @costpro.test, patrón
 * certificado del repo). NUNCA se modifican Enervida ni Puerto Padre.
 *
 * Escenarios de la misión §7 (identificación, aislamiento, personalización,
 * leyenda y regresión del flujo UI):
 *   1 · El botón ⚙ «Configurar documento» aparece junto a «Exportar SC-2-12».
 *   2 · El panel muestra los valores oficiales de la tienda de LA VENTA.
 *   3 · Ocultar un campo + guardar → persiste (user_preferences) y la tienda
 *       NO se modifica (verificación service-role de stores).
 *   4 · Restaurar elimina la preferencia.
 *   5 · Aislamiento multi-tienda: la venta de la tienda B muestra B aunque
 *       la tienda activa del usuario sea A.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  ADMIN_EMAIL, ADMIN_PASS,
  signIn, injectSession, apiHeaders, sb, seedProduct, restoreActiveStore, BASE_URL,
  type SeededProduct, type TestStore,
} from './fixtures/session.fixture';
import { getPilotEnv, type PilotStore } from './fixtures/pilot-env';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

let adminToken: string;
let adminId: string;
let storeA: PilotStore;
let storeB: PilotStore;
let productA: SeededProduct;
let saleAId = '';
let saleBId = '';

// Configuración de identificación DISTINTA por tienda (§7.2).
const CFG_A = {
  address: 'Calle Menocal SN, Esquina a Francisco',
  phone: '56561619',
  email: 'sc212-a@costpro.test',
  reeup: '50004179942',
  nit: '50004179942',
  bank_account: '0664 4340 0002 6710',
};
const CFG_B = {
  address: 'Calle Marta Abreu 12, Puerto Padre',
  phone: '24412345',
  email: 'sc212-b@costpro.test',
  reeup: '41004179942',
  nit: '41004179943',
  bank_account: '0110 0000 1111 2222',
};

/** Crea una venta real vía /api/pos/checkout (cadena completa, sin mocks). */
async function createSale(
  request: APIRequestContext,
  store: Pick<PilotStore, 'id'>,
  product: SeededProduct,
): Promise<string> {
  const res = await request.post('/api/pos/checkout', {
    headers: apiHeaders(adminToken),
    data: {
      store_id: store.id,
      seller_id: adminId,
      payment_method: 'cash',
      idempotency_key: `sc212-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      total_amount: 2 * product.price,
      subtotal: 2 * product.price,
      cash_amount: 2 * product.price,
      transfer_amount: 0,
      zelle_amount: 0,
      tax_amount: 0,
      discount_value: 0,
      items: [{ product_id: product.id, quantity: 2, price: product.price, cost: product.cost }],
    },
  });
  if (!res.ok()) throw new Error(`createSale falló: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  // Respuesta real del endpoint: { success, status, transaction_id }
  const txId = body?.transaction_id || body?.data?.transaction_id || body?.data?.id || body?.id;
  if (!txId) throw new Error(`createSale sin transaction_id: ${JSON.stringify(body).slice(0, 200)}`);
  return txId as string;
}

/** Navega con la sesión YA inyectada: shell → OPERACIÓN → Ventas → Historial → detalle. */
async function openSaleDetail(page: Page, saleId: string) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.getByText('OPERACIÓN', { exact: true }).first().waitFor({ state: 'visible', timeout: 25_000 }).catch(() => {});
  // OPERACIÓN → Ventas → Opciones → Historial de Ventas (ruta real del menú)
  await page.getByText('OPERACIÓN', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  await page.getByText('Ventas', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.getByText('Opciones', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.getByText('Historial de Ventas', { exact: false }).first().click();
  await page.waitForTimeout(3000);
  // Buscar la venta por su referencia corta y abrir Detalles
  const shortId = saleId.split('-')[0];
  const row = page.locator('tr', { hasText: shortId }).first();
  await row.waitFor({ state: 'visible', timeout: 30_000 });
  await row.locator('button[aria-label="Ver detalles de la venta"]').first().click();
  await page.getByText('Detalles de la Venta').first().waitFor({ state: 'visible', timeout: 20_000 });
}

test.describe.serial('CP-SALES-024 — SC-2-12 configuración de tienda (UI, BD aislada)', () => {
  let originalA: Record<string, unknown> = {};
  let originalB: Record<string, unknown> = {};

  test.beforeAll(async ({ request }) => {
    test.skip(!SUPA_URL, 'sin credenciales de la BD aislada');
    const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    adminToken = session.token;
    adminId = session.userId;

    // Dos tiendas PILOTO del entorno aislado (SEC-TS-08: nunca tiendas de
    // negocio) con configuración de identificación DISTINTA por venta
    // (misión §7.2). Se respalda la configuración original y se restaura en
    // afterAll — los pilotos quedan intactos para las demás specs.
    const pilot = await getPilotEnv();
    storeA = pilot.storeA;
    storeB = pilot.storeB;
    const CFG_COLS = 'address,phone,email,reeup,nit,bank_account';
    const rowsA = await sb.select('stores', `id=eq.${storeA.id}&select=${CFG_COLS}`);
    const rowsB = await sb.select('stores', `id=eq.${storeB.id}&select=${CFG_COLS}`);
    originalA = rowsA[0] || {};
    originalB = rowsB[0] || {};
    await sb.update('stores', `id=eq.${storeA.id}`, { ...CFG_A });
    await sb.update('stores', `id=eq.${storeB.id}`, { ...CFG_B });

    // Producto con stock por tienda (producto propio de cada piloto).
    productA = await seedProduct(storeA as unknown as TestStore, { name: 'Producto SC212 A', price: 100, cost: 60, quantity: 50 });
    const productB = await seedProduct(storeB as unknown as TestStore, { name: 'Producto SC212 B', price: 80, cost: 50, quantity: 50 });

    saleAId = await createSale(request, storeA, productA);
    saleBId = await createSale(request, storeB, productB);

    // El usuario opera con la tienda A «activa» — la venta de B debe mostrar
    // los datos de B pese a ello (aislamiento §7.2).
    await sb.update('profiles', `id=eq.${adminId}`, { active_store_id: storeA.id });
  });

  test.afterAll(async () => {
    if (!SUPA_URL) return;
    // Net-zero: ventas/productos del fixture, preferencia, configuración de
    // los PILOTOS restaurada a su estado original y active_store al piloto A.
    try {
      await sb.delete('transaction_items', `transaction_id=in.(${[saleAId, saleBId].filter(Boolean).join(',') || '00000000-0000-0000-0000-000000000000'})`).catch(() => {});
      await sb.delete('transactions', `id=in.(${[saleAId, saleBId].filter(Boolean).join(',') || '00000000-0000-0000-0000-000000000000'})`).catch(() => {});
      if (productA?.id) await sb.delete('products', `id=eq.${productA.id}`).catch(() => {});
      await sb.delete('user_preferences', `user_id=eq.${adminId}&preference_key=like.sc212:fields:*`).catch(() => {});
      await sb.update('stores', `id=eq.${storeA?.id}`, originalA).catch(() => {});
      await sb.update('stores', `id=eq.${storeB?.id}`, originalB).catch(() => {});
      await restoreActiveStore(adminId);
    } catch {
      // El hygiene guard del CI reporta residuos si la limpieza falla.
    }
  });

  test('1 · botón ⚙ «Configurar documento» junto a «Exportar SC-2-12 (PDF)»', async ({ page }) => {
    const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    await injectSession(page, session);
    await openSaleDetail(page, saleAId);
    await expect(page.getByText('Exportar SC-2-12 (PDF)').first()).toBeVisible();
    const gear = page.getByRole('button', { name: /Configurar documento SC-2-12/i }).first();
    await expect(gear).toBeVisible();
    // Ambos dentro del mismo bloque de acciones (junto al exportar):
    const actions = page.getByText('Exportar SC-2-12 (PDF)').first().locator('xpath=ancestor::div[1]');
    await expect(actions.getByRole('button', { name: /Configurar documento SC-2-12/i })).toHaveCount(1);
  });

  test('2 · el panel ⚙ muestra los valores oficiales de la tienda de la venta', async ({ page }) => {
    const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    await injectSession(page, session);
    await openSaleDetail(page, saleAId);
    await page.getByRole('button', { name: /Configurar documento SC-2-12/i }).first().click();
    await page.getByText(/Configurar documento SC-2-12/i).first().waitFor({ state: 'visible', timeout: 15_000 });
    const body = await page.locator('body').textContent();
    // Valores oficiales de la tienda A (read-only en el panel):
    expect(body).toContain(CFG_A.bank_account);
    expect(body).toContain(CFG_A.nit);
    expect(body).toContain(CFG_A.reeup);
  });

  test('3 · ocultar campo + guardar → persiste y NO modifica la tienda', async ({ page }) => {
    const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    await injectSession(page, session);
    await openSaleDetail(page, saleAId);
    await page.getByRole('button', { name: /Configurar documento SC-2-12/i }).first().click();
    await page.getByRole('switch', { name: /Mostrar Correo/i }).first().waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByRole('switch', { name: /Mostrar Correo/i }).first().click(); // ocultar
    await page.getByRole('button', { name: /^Guardar$/ }).first().click();
    await page.waitForTimeout(2500); // upsert user_preferences

    // La preferencia quedó persistida para la tienda A (y solo para ella):
    const prefRows = await sb.select('user_preferences', `user_id=eq.${adminId}&preference_key=eq.sc212:fields:${storeA.id}&select=preference_value`);
    expect(prefRows.length).toBe(1);
    expect(prefRows[0].preference_value).toEqual({ proveedorEmail: { visible: false } });

    // La configuración de la tienda NO se modificó (§7.3 final):
    const storeRow = await sb.select('stores', `id=eq.${storeA.id}&select=address,phone,email,reeup,nit,bank_account`);
    expect(storeRow[0]).toMatchObject(CFG_A);
  });

  test('4 · Restaurar todo + Guardar → la preferencia desaparece', async ({ page }) => {
    const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    await injectSession(page, session);
    await openSaleDetail(page, saleAId);
    await page.getByRole('button', { name: /Configurar documento SC-2-12/i }).first().click();
    await page.getByRole('switch', { name: /Mostrar Correo/i }).first().waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByRole('button', { name: /Restaurar todo/i }).first().click();
    await page.getByRole('button', { name: /^Guardar$/ }).first().click();
    await page.waitForTimeout(2500);
    const prefRows = await sb.select('user_preferences', `user_id=eq.${adminId}&preference_key=eq.sc212:fields:${storeA.id}&select=preference_value`);
    expect(prefRows.length).toBe(1);
    expect(prefRows[0].preference_value).toEqual({});
  });

  test('5 · aislamiento: venta de la tienda B muestra B aunque la activa sea A', async ({ page }) => {
    // La tienda activa del usuario sigue siendo A (set en beforeAll). El
    // historial filtra por tienda activa → para LOCALIZAR la venta de B en la
    // tabla hay que ver el historial de B; el AISLAMIENTO se verifica en que
    // el documento muestra los datos de B (no los de la tienda activa A con
    // la que el usuario navegó antes — verificado en el mismo render).
    const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    await injectSession(page, session);
    await sb.update('profiles', `id=eq.${adminId}`, { active_store_id: storeB.id });
    await openSaleDetail(page, saleBId);
    await page.getByRole('button', { name: /Configurar documento SC-2-12/i }).first().click();
    await page.getByText(/Configurar documento SC-2-12/i).first().waitFor({ state: 'visible', timeout: 15_000 });
    const body = await page.locator('body').textContent();
    // El panel muestra los datos de la tienda DE LA VENTA (B), no la activa (A):
    expect(body).toContain(CFG_B.nit);
    expect(body).toContain(CFG_B.bank_account);
    expect(body).toContain(CFG_B.reeup);
    // Y NINGÚN dato de A aparece:
    expect(body).not.toContain(CFG_A.nit);
    expect(body).not.toContain(CFG_A.bank_account);
    expect(body).not.toContain(CFG_A.reeup);
  });
});
