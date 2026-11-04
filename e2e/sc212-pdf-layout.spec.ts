/**
 * MISIÓN SC-2-12 PDF — E2E UI: exportación REAL desde Historial de Ventas.
 * ============================================================================
 * Valida el flujo completo que usa el usuario:
 *   Inicio → OPERACIÓN → Ventas → Opciones → Historial de Ventas →
 *   Detalles de la Venta → «Exportar SC-2-12 (PDF)» → DESCARGA del PDF.
 *
 * Guarda los PDF descargados en /tmp/sc212-e2e para la verificación posterior
 * (pdfplumber anti-solape + render página a página). Entorno: CostproE2E
 * (tiendas PILOTO, nunca tiendas de negocio). Net-zero en afterAll.
 *
 * Escenarios:
 *   1 · Venta con pocos productos y todos los campos completos.
 *   2 · Venta con numerosos productos + descripciones extensas (multipágina).
 *   3 · Venta con datos de identificación extremadamente largos (wrap múltiple).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import {
  ADMIN_EMAIL, ADMIN_PASS,
  signIn, injectSession, apiHeaders, sb, seedProduct, restoreActiveStore, BASE_URL,
  type SeededProduct, type TestStore,
} from './fixtures/session.fixture';
import { getPilotEnv, type PilotStore } from './fixtures/pilot-env';

const OUT_DIR = '/tmp/sc212-e2e';
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

// Identificación EXTREMA para forzar wraps múltiples (misión §7.3).
const CFG_STRESS = {
  name: 'E2E PILOT A STRESS — ENTIDAD COMERCIAL CON DENOMINACIÓN EXCEPCIONALMENTE LARGA DE PRUEBA',
  address: 'Avenida de los Grandes Almacenes, Numeral 12345 e/ Calle Primera, Calle Segunda, Calle Tercera y el Paseo del Río, Reparto Muy Largo',
  phone: '56561619',
  email: 'sc212-stress@costpro.test',
  reeup: '50004179942',
  nit: '50004179942',
  bank_account: '0664 4340 0002 6710',
};

let adminToken = '';
let adminId = '';
let storeA: PilotStore;
let productBase: SeededProduct;
const stressProducts: SeededProduct[] = [];
let saleBaseId = '';
let saleMultiId = '';
let saleStressId = '';
let originalStore: Record<string, unknown> = {};

async function createSale(
  request: APIRequestContext,
  store: Pick<PilotStore, 'id'>,
  items: Array<{ product: SeededProduct; quantity: number }>,
  label: string,
): Promise<string> {
  const lineItems = items.map(({ product, quantity }) => ({
    product_id: product.id,
    quantity,
    price: product.price,
    cost: product.cost,
  }));
  const subtotal = items.reduce((acc, { product, quantity }) => acc + product.price * quantity, 0);
  const res = await request.post('/api/pos/checkout', {
    headers: apiHeaders(adminToken),
    data: {
      store_id: store.id,
      seller_id: adminId,
      payment_method: 'cash',
      idempotency_key: `sc212-pdf-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      total_amount: subtotal,
      subtotal,
      cash_amount: subtotal,
      transfer_amount: 0,
      zelle_amount: 0,
      tax_amount: 0,
      discount_value: 0,
      items: lineItems,
    },
  });
  if (!res.ok()) throw new Error(`createSale(${label}) falló: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  const txId = body?.transaction_id || body?.data?.transaction_id || body?.data?.id || body?.id;
  if (!txId) throw new Error(`createSale(${label}) sin transaction_id: ${JSON.stringify(body).slice(0, 200)}`);
  return txId as string;
}

/** Navega con la sesión YA inyectada: shell → OPERACIÓN → Ventas → Opciones → Historial → detalle. */
async function openSaleDetail(page: Page, saleId: string) {
  await page.goto(BASE_URL || '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.getByText('OPERACIÓN', { exact: true }).first().waitFor({ state: 'visible', timeout: 25_000 }).catch(() => {});
  await page.getByText('OPERACIÓN', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  await page.getByText('Ventas', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.getByText('Opciones', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.getByText('Historial de Ventas', { exact: false }).first().click();
  await page.waitForTimeout(3000);
  const shortId = saleId.split('-')[0];
  const row = page.locator('tr', { hasText: shortId }).first();
  await row.waitFor({ state: 'visible', timeout: 30_000 });
  await row.locator('button[aria-label="Ver detalles de la venta"]').first().click();
  await page.getByText('Detalles de la Venta').first().waitFor({ state: 'visible', timeout: 20_000 });
}

/** Exporta el SC-2-12 desde el botón REAL y guarda la descarga. */
async function exportSc212Pdf(page: Page, saleId: string, outPath: string): Promise<string> {
  await openSaleDetail(page, saleId);
  const btn = page.getByText('Exportar SC-2-12 (PDF)').first();
  await btn.waitFor({ state: 'visible', timeout: 20_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    btn.click(),
  ]);
  const filename = download.suggestedFilename();
  expect(filename).toMatch(/^SC-2-12_Factura_.*\.pdf$/);
  await download.saveAs(outPath);
  return filename;
}

test.describe.serial('SC-2-12 PDF — exportación real desde Historial de Ventas (CostproE2E)', () => {
  test.beforeAll(async ({ request }) => {
    test.skip(!SUPA_URL, 'sin credenciales de la BD aislada');
    mkdirSync(OUT_DIR, { recursive: true });
    const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    adminToken = session.token;
    adminId = session.userId;

    const pilot = await getPilotEnv();
    storeA = pilot.storeA;

    // Respaldo (incluye name para el estrés) y configuración extrema.
    const CFG_COLS = 'name,address,phone,email,reeup,nit,bank_account';
    const rows = await sb.select('stores', `id=eq.${storeA.id}&select=${CFG_COLS}`);
    originalStore = rows[0] || {};
    await sb.update('stores', `id=eq.${storeA.id}`, { ...CFG_STRESS });

    // Escenario 1: pocos productos, campos completos.
    productBase = await seedProduct(storeA as unknown as TestStore, {
      name: 'Cable Solar Rojo 4mm', price: 4.5, cost: 2, quantity: 100,
    });
    saleBaseId = await createSale(request, storeA, [{ product: productBase, quantity: 5 }], 'base');

    // Escenario 2: numerosos productos con descripciones extensas (multipágina).
    const multiItems: Array<{ product: SeededProduct; quantity: number }> = [];
    for (let i = 1; i <= 14; i += 1) {
      const p = await seedProduct(storeA as unknown as TestStore, {
        name: `Transformador monofásico de distribución 120/240V con descripción realmente extensa para forzar el ajuste de celdas número ${i}`,
        price: 123.45,
        cost: 60,
        quantity: 500,
        sku: `SKU-PDF-${1000 + i}`,
      });
      stressProducts.push(p);
      multiItems.push({ product: p, quantity: 2.5 });
    }
    saleMultiId = await createSale(request, storeA, multiItems, 'multi');

    // Escenario 3: venta pequeña con identificación extrema (wrap múltiple).
    saleStressId = await createSale(request, storeA, [{ product: productBase, quantity: 3 }], 'stress');

    await sb.update('profiles', `id=eq.${adminId}`, { active_store_id: storeA.id });
  });

  test.afterAll(async () => {
    if (!SUPA_URL) return;
    try {
      const ids = [saleBaseId, saleMultiId, saleStressId].filter(Boolean);
      if (ids.length) {
        await sb.delete('transaction_items', `transaction_id=in.(${ids.join(',')})`).catch(() => {});
        await sb.delete('transactions', `id=in.(${ids.join(',')})`).catch(() => {});
      }
      const productIds = stressProducts.map((p) => p.id).filter(Boolean);
      if (productBase?.id) productIds.push(productBase.id);
      if (productIds.length) {
        await sb.delete('products', `id=in.(${productIds.join(',')})`).catch(() => {});
      }
      if (Object.keys(originalStore).length) {
        await sb.update('stores', `id=eq.${storeA?.id}`, originalStore).catch(() => {});
      }
      await restoreActiveStore(adminId);
    } catch {
      // El hygiene guard del CI reporta residuos si la limpieza falla.
    }
  });

  test('1 · venta con pocos productos → PDF descargado desde la UI', async ({ page }) => {
    test.skip(!SUPA_URL, 'sin credenciales de la BD aislada');
    const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    await injectSession(page, session);
    const out = `${OUT_DIR}/ui-base.pdf`;
    const filename = await exportSc212Pdf(page, saleBaseId, out);
    console.log(`DESCARGADO: ${filename} → ${out}`);
    expect(filename).toContain('Factura');
  });

  test('2 · venta multipágina (14 ítems, descripciones largas) → PDF descargado', async ({ page }) => {
    test.skip(!SUPA_URL, 'sin credenciales de la BD aislada');
    const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    await injectSession(page, session);
    const out = `${OUT_DIR}/ui-multi.pdf`;
    const filename = await exportSc212Pdf(page, saleMultiId, out);
    console.log(`DESCARGADO: ${filename} → ${out}`);
    expect(filename).toContain('Factura');
  });

  test('3 · identificación extrema (wraps múltiples) → PDF descargado', async ({ page }) => {
    test.skip(!SUPA_URL, 'sin credenciales de la BD aislada');
    const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    await injectSession(page, session);
    const out = `${OUT_DIR}/ui-stress.pdf`;
    const filename = await exportSc212Pdf(page, saleStressId, out);
    console.log(`DESCARGADO: ${filename} → ${out}`);
    expect(filename).toContain('Factura');
  });
});
