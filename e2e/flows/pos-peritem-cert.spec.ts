/**
 * CP-POS-SMOKE-PRODUCTION-001 — Certificación funcional UI de pagos por artículo
 * ============================================================================
 * MISIÓN: cerrar el ciclo CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 (PR #1708 +
 * PR #1709) con evidencia E2E desde la INTERFAZ REAL de Cajero Express:
 *
 *   CERT-UI-A  3 productos, 3 métodos (cash / transfer / external_transfer USD)
 *              → venta completa + conciliación DB por línea y global.
 *   CERT-UI-B  3 productos, un mismo método (cash) → sin duplicados,
 *              sin datos personales, distribuciones una-fila-por-línea.
 *   CERT-UI-C  2 productos, 2 métodos distintos → distribuciones independientes.
 *   CERT-UI-D  Validaciones negativas en UI (carrito vacío, sobrepago, falta,
 *              pendiente visible, transferencia sin referencia → fail-closed
 *              «Completar datos»); NO se crea ninguna venta inválida.
 *   CERT-UI-E  Persistencia tras reload: /?view=sales → detalles → Desglose de
 *              Pago (ledger consolidado) + datos de la venta originales.
 *   CERT-UI-I  Idempotencia UI: doble clic en Confirmar → UNA sola venta.
 *   CERT-UI-M  Móvil (390×844): barra móvil, carrito móvil, venta completa.
 *
 * Principio: Browser/UI → /api/pos/checkout → RPC create_sale_v2 (/35) →
 * transaction_items.payment_distributions + payment_transactions + stock.
 * Verificación de estado con service-role (SOLO lectura) contra la BD aislada.
 * Artefacto: test-results/cert-sales.jsonl (entrada por venta; la conciliación
 * independiente se ejecuta aparte con scripts/cert-pos-conciliacion.mjs).
 * ============================================================================
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync, appendFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import {
  signIn, sb, createTestStore, deleteTestStore, seedProduct, getInventory,
  getTransaction, getTransactionItems, cleanupProducts, num,
  ADMIN_EMAIL, ADMIN_PASS,
  type TestStore, type SeededProduct, restoreActiveStore,
} from '../fixtures/session.fixture';

let adminToken: string;
let adminId: string;
let store: TestStore;

const STOCK = 50;
const PRICE_A = 100; // CERT-A cash CUP / CERT-B cash
const PRICE_B = 150; // CERT-A transfer CUP + ref
const PRICE_D = 120; // CERT-B cash / CERT-C cash
const PRICE_E = 80;  // CERT-B cash / CERT-C transfer + ref
const PRICE_F = 60;  // CERT-M móvil cash
let PRICE_C = 450;   // CERT-A external_transfer USD 1.00 (= tasa leída de BD)
let RATE = 450;

let pA: SeededProduct, pB: SeededProduct, pC: SeededProduct,
  pD: SeededProduct, pE: SeededProduct, pF: SeededProduct;

const PRODUCT_IDS: string[] = [];
const CERT_OUT = process.env.CERT_OUT || 'test-results/cert-sales.jsonl';
const SHOT_DIR = process.env.CERT_SHOTS || 'test-results';

function record(entry: Record<string, unknown>) {
  mkdirSync(join(process.cwd(), 'test-results'), { recursive: true });
  appendFileSync(CERT_OUT, JSON.stringify(entry) + '\n');
}

/** Descarta el diálogo de tasas (MISIÓN-TASAS) si aparece. Idempotente. */
async function dismissRatesDialog(page: Page) {
  try {
    const dlg = page.getByRole('dialog', { name: /tasas de cambio siguen vigentes/i });
    await dlg.waitFor({ state: 'visible', timeout: 3_000 });
    await page.getByRole('button', { name: 'Continuar sin confirmar' }).click();
    await dlg.waitFor({ state: 'hidden', timeout: 5_000 });
  } catch { /* no apareció */ }
}

/** Descarta el banner de cookies si aparece. */
async function dismissCookies(page: Page) {
  try {
    await page.locator('[aria-label="Consentimiento de cookies"]')
      .waitFor({ state: 'visible', timeout: 3_000 });
    await page.locator('[aria-label="Rechazar cookies opcionales"]').click();
  } catch { /* no apareció */ }
}

/**
 * Sesión REAL en el navegador (patrón E2E-POS-009): token en localStorage
 * + tienda activa del run. La inyección sobrevive a recargas (addInitScript).
 */
async function loginTerminal(page: Page, targetView: string) {
  const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  adminToken = admin.token;
  adminId = admin.userId;
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
  await page.goto(targetView);
  await expect(page.locator('[aria-label="Cerrar sesión"]').first())
    .toBeVisible({ timeout: 45_000 });
  // El indicador dev-tools de Next (bottom-left) intercepta clics en la barra
  // móvil (lección Task 28): se oculta por CSS para todo el run E2E.
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
}

/** Abre el POS en modo Express (portal full-screen). */
async function openExpress(page: Page) {
  await loginTerminal(page, '/?view=pos');
  await dismissCookies(page);
  const toggle = page.locator('[aria-label="Activar modo Cajero Express"]');
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
    await toggle.click();
  }
  await expect(page.locator('h1', { hasText: 'Cajero Express' })).toBeVisible();
  await dismissRatesDialog(page);
}

/** Agrega un producto por SKU exacto desde el buscador Express.
 *  `assertVisible=false` para móvil: la línea vive en el panel de carrito
 *  móvil (aún cerrado); su visibilidad se comprueba al abrir el panel. */
async function addBySku(page: Page, sku: string, productId: string, opts: { assertVisible?: boolean } = {}) {
  const input = page.locator('#pos-express-search-input');
  await expect(input).toBeVisible();
  await input.fill(sku);
  await input.press('Enter');
  if (opts.assertVisible !== false) {
    await expect(page.locator(`[data-testid="express-pay-config-${productId}"]`))
      .toBeVisible({ timeout: 10_000 });
  }
  await input.clear();
}

interface RowSpec {
  method: 'cash' | 'transfer' | 'external_transfer';
  amount?: string;
  reference?: string;
}

/** Configura el pago de UNA línea del carrito mediante el modal.
 *  `scope`: contenedor del carrito visible (desktop o panel móvil). */
async function configureLinePayment(
  page: Page,
  productId: string,
  productName: string,
  rows: RowSpec[],
  scope: Page | ReturnType<Page['locator']> = page,
) {
  await scope.locator(`[data-testid="express-pay-config-${productId}"]`).click();
  const modal = page.locator('[data-testid="pos-express-payment-modal"]');
  await expect(modal).toBeVisible();
  await expect(modal.getByText(`Importe del producto`)).toBeVisible();

  const n = rows.length;
  for (let i = 0; i < n; i++) {
    const idx = i + 1;
    if (i > 0) {
      await modal.getByRole('button', { name: /Agregar Pago/i }).click();
    }
    const row = rows[i];
    await modal.locator(`[aria-label="Método de pago fila ${idx}"]`).selectOption(row.method);
    if (row.amount !== undefined) {
      await modal.locator(`[aria-label^="Monto fila ${idx}"]`).fill(row.amount);
    }
    // NOTA de contrato (hallazgo del cert): el modal mantiene la fila con la
    // fila congelada al abrir — la tienda del carrito SÍ se actualiza (chip de
    // la línea) pero el select/campo condicional puede quedar con el valor
    // inicial. La REFERENCIA de transferencia se captura por la vía canónica
    // del producto: pestaña «Datos de transferencia» (transfer-ref-<id>) en
    // confirmSale — el flujo real del cajero (fail-closed «Completar datos»).
  }
  // La validación del editor debe terminar en «Pago completo» antes de salir.
  await expect(modal.getByText(/Pago completo/)).toBeVisible({ timeout: 5_000 });
  // Captura opcional del modal abierto
  if (process.env.CERT_CAPTURE_MODAL === productId) {
    await page.screenshot({ path: join(SHOT_DIR, 'cert-desktop-modal-pago.png') });
  }
  await modal.locator('[aria-label="Listo, cerrar configuración de pago"]').click();
  await expect(modal).toBeHidden();
}

/** Abre el diálogo de confirmación (Cobrar) y espera el modal. */
async function openConfirmDialog(page: Page) {
  const cobrar = page
    .locator('button[aria-label="Cobrar venta"]')
    .locator('visible=true')
    .first();
  await expect(cobrar).toBeEnabled();
  // force: la barra móvil anima (framer-motion) — patrón POS-009
  await cobrar.click({ force: true });
  const dialog = page.getByRole('dialog', { name: 'Confirmar Venta' });
  await expect(dialog).toBeVisible();
  await dismissRatesDialog(page);
  return dialog;
}

interface ConfirmOpts {
  customerName?: string;
  customerCi?: string;
  /** Referencias por producto para la pestaña Datos de transferencia. */
  transferRefs?: Array<{ productId: string; ref: string }>;
  /** Doble clic intencional (prueba de idempotencia UI). */
  doubleClick?: boolean;
  shot?: string;
}

/** Completa la pestaña de transferencia (si aplica) y confirma la venta. */
async function confirmSale(page: Page, opts: ConfirmOpts): Promise<string> {
  const dialog = await openConfirmDialog(page);
  const hasTransfer = (opts.transferRefs?.length ?? 0) > 0;
  if (hasTransfer) {
    await expect(dialog.locator('[data-testid="tab-datos-transferencia"]')).toBeVisible();
    await dialog.locator('[data-testid="tab-datos-transferencia"]').click();
    await expect(dialog.locator('[data-testid="datos-transferencia-panel"]')).toBeVisible();
    await dialog.locator('#pos-express-transfer-name').fill(opts.customerName || '');
    await dialog.locator('[data-testid="pos-express-transfer-ci"]').fill(opts.customerCi || '');
    for (const t of opts.transferRefs || []) {
      const refInput = dialog.locator(`[data-testid="transfer-ref-${t.productId}"]`);
      if ((await refInput.inputValue()) === '') {
        await refInput.fill(t.ref);
      }
    }
    // Fail-closed: el botón solo se habilita como «Confirmar» con datos completos.
    await expect(dialog.getByRole('button', { name: /^Confirmar$/ })).toBeEnabled({ timeout: 10_000 });
  } else {
    await expect(dialog.locator('[data-testid="tab-datos-transferencia"]')).toHaveCount(0);
  }

  if (opts.shot) {
    await page.screenshot({ path: join(SHOT_DIR, opts.shot) });
  }

  const confirmBtn = dialog.getByRole('button', { name: /^Confirmar$/ });
  const respPromise = page.waitForResponse(
    (r) => r.url().includes('/api/pos/checkout') && r.request().method() === 'POST',
    { timeout: 45_000 },
  );
  await confirmBtn.click();
  if (opts.doubleClick) {
    await confirmBtn.click({ timeout: 1_500 }).catch(() => { /* ya deshabilitado */ });
  }
  const resp = await respPromise;
  expect(resp.status(), `checkout HTTP ${resp.status()}`).toBe(200);
  const json = await resp.json();
  expect(json.success).toBe(true);
  expect(typeof json.transaction_id).toBe('string');

  await expect(page.locator('#sale-success-content')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('¡Venta Completada!')).toBeVisible();
  await expect(page.getByText(`ID: ${json.transaction_id.substring(0, 8)}`)).toBeVisible();
  return json.transaction_id as string;
}

/** Tras una venta: «Nueva Venta» limpia el carrito sin salir de Express. */
async function resetForNextSale(page: Page) {
  const nueva = page.getByRole('button', { name: 'Nueva Venta' });
  if (await nueva.isVisible().catch(() => false)) {
    await nueva.click();
  }
  const vaciar = page.locator('[aria-label="Vaciar carrito"]');
  if (await vaciar.isVisible().catch(() => false)) {
    await vaciar.click();
  }
  await dismissRatesDialog(page);
}

async function getLedger(txId: string) {
  return sb.select<{
    payment_method: string; currency: string; amount: string | number;
    amount_cup: string | number; reference: string | null;
  }>('payment_transactions', `transaction_id=eq.${txId}&select=payment_method,currency,amount,amount_cup,reference`);
}

test.describe.configure({ mode: 'serial' });

test.describe('CP-POS certificación UI — pagos por artículo (Cajero Express)', () => {
  test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
    const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    adminToken = admin.token;
    adminId = admin.userId;
    store = await createTestStore(request, adminToken, 'POSCERT');

    // Tasa vigente de la tienda para USD (origen de la conversión cliente+RPC).
    const existing = await sb.select<{ rate: string | number }>(
      'store_exchange_rates', `store_id=eq.${store.id}&currency=eq.USD&select=rate`,
    );
    if (existing.length > 0) {
      RATE = num(existing[0].rate);
    } else {
      await sb.insert('store_exchange_rates', [{ store_id: store.id, currency: 'USD', rate: 450 }]);
      RATE = 450;
    }
    PRICE_C = RATE; // 1.00 USD exacto a la tasa vigente

    pA = await seedProduct(store, { name: 'CERT-A Efectivo', price: PRICE_A, cost: 40, quantity: STOCK, sku: `E2E80-CERT-A-${Date.now()}` });
    pB = await seedProduct(store, { name: 'CERT-B Transferencia', price: PRICE_B, cost: 50, quantity: STOCK, sku: `E2E80-CERT-B-${Date.now()}` });
    pC = await seedProduct(store, { name: 'CERT-C Exterior USD', price: PRICE_C, cost: 90, quantity: STOCK, sku: `E2E80-CERT-C-${Date.now()}` });
    pD = await seedProduct(store, { name: 'CERT-D Contado', price: PRICE_D, cost: 30, quantity: STOCK, sku: `E2E80-CERT-D-${Date.now()}` });
    pE = await seedProduct(store, { name: 'CERT-E Mixto', price: PRICE_E, cost: 20, quantity: STOCK, sku: `E2E80-CERT-E-${Date.now()}` });
    pF = await seedProduct(store, { name: 'CERT-F Movil', price: PRICE_F, cost: 15, quantity: STOCK, sku: `E2E80-CERT-F-${Date.now()}` });
    PRODUCT_IDS.push(pA.id, pB.id, pC.id, pD.id, pE.id, pF.id);
  });

  test.afterAll(async ({ request }: { request: APIRequestContext }) => {
    if (store?.id) {
      await cleanupProducts(store.id, PRODUCT_IDS).catch(() => {});
      await restoreActiveStore(adminId);
      await deleteTestStore(request, adminToken, store.id);
    }
    record({
      _run: 'cp-pos-smoke-production-001',
      env: 'isolated-e2e',
      store_id: store?.id,
      rate_usd: RATE,
      price_c_usd: PRICE_C,
      products: { pA: pA?.id, pB: pB?.id, pC: pC?.id, pD: pD?.id, pE: pE?.id, pF: pF?.id },
      ts: new Date().toISOString(),
    });
  });

  test('CERT-UI-A — 3 productos, 3 métodos (cash/transfer/USD exterior): venta E2E desde la interfaz', async ({ page }) => {
    test.setTimeout(180_000);
    await openExpress(page);
    await page.screenshot({ path: join(SHOT_DIR, 'cert-desktop-express-catalogo.png') });

    await addBySku(page, pA.sku, pA.id);
    await addBySku(page, pB.sku, pB.id);
    await addBySku(page, pC.sku, pC.id);
    await page.screenshot({ path: join(SHOT_DIR, 'cert-desktop-express-3productos.png') });

    // Asignación por producto: cada línea su método
    await configureLinePayment(page, pA.id, pA.name, [{ method: 'cash', amount: String(PRICE_A) }]);
    await configureLinePayment(page, pB.id, pB.name, [{ method: 'transfer', amount: String(PRICE_B), reference: 'TRF-CERT-A-B-001' }]);
    await configureLinePayment(page, pC.id, pC.name, [{ method: 'external_transfer', amount: '1.00' }]); // USD a la tasa vigente

    const expectedTotal = PRICE_A + PRICE_B + PRICE_C;
    const cart = page.locator('[data-testid="express-cart-desktop"]');
    await expect(cart).toContainText('Efect.');
    await expect(cart).toContainText('Transf.');
    await expect(cart).toContainText('Ext.');
    await expect(cart).not.toContainText('Sin pago asignado');
    await expect(cart.getByText('$' + expectedTotal.toFixed(2)).first()).toBeVisible();
    if (process.env.CERT_CAPTURE_MODAL !== 'none') {
      await page.screenshot({ path: join(SHOT_DIR, 'cert-desktop-express-pagos-asignados.png') });
    }

    const stocksBefore = {
      pA: num((await getInventory(store.id, pA.id))!.quantity),
      pB: num((await getInventory(store.id, pB.id))!.quantity),
      pC: num((await getInventory(store.id, pC.id))!.quantity),
    };

    const txId = await confirmSale(page, {
      customerName: 'Cliente Certificacion A',
      customerCi: '91020304050',
      transferRefs: [
        { productId: pB.id, ref: 'TRF-CERT-A-B-001' },
        { productId: pC.id, ref: 'TRF-CERT-A-C-002' },
      ],
      shot: 'cert-desktop-confirm-datos-transferencia.png',
    });

    // ── Verificación DB (service-role, solo lectura) ──
    const tx = await getTransaction(txId);
    expect(tx).toBeTruthy();
    expect(tx!.status).toBe('completed');
    expect(num(tx!.total_amount as string | number)).toBe(expectedTotal);
    expect(tx!.customer_name).toBe('Cliente Certificacion A');
    expect(tx!.customer_ci).toBe('91020304050');

    const items = await getTransactionItems(txId);
    expect(items).toHaveLength(3);
    const distByProduct = new Map(items.map((r) => [r.product_id, r.payment_distributions || []]));
    expect(distByProduct.get(pA.id)).toHaveLength(1);
    expect(distByProduct.get(pA.id)![0]).toMatchObject({ method: 'cash', currency: 'CUP', amount: PRICE_A });
    expect(distByProduct.get(pB.id)![0]).toMatchObject({ method: 'transfer', currency: 'CUP', amount: PRICE_B, reference: 'TRF-CERT-A-B-001' });

    // La fila USD conserva su moneda ORIGEN y su tasa informativa (contrato
    // CP-POS): el equivalente CUP de una distribución = amount × exchange_rate
    // — PROHIBIDO sumar monedas distintas como equivalentes.
    expect(distByProduct.get(pC.id)![0]).toMatchObject({
      method: 'external_transfer', currency: 'USD', amount: 1, exchange_rate: RATE,
    });

    const ledger = await getLedger(txId);
    const sumLedgerCup = ledger.reduce((s, r) => s + num(r.amount_cup), 0);
    const distCup = (d: Record<string, unknown>) =>
      num(d.amount as string | number) *
      (String(d.currency).toUpperCase() === 'CUP' ? 1 : num(d.exchange_rate as string | number ?? RATE));
    const sumDistCup = items.reduce(
      (s, r) => s + (r.payment_distributions || []).reduce((ps, d) => ps + distCup(d as Record<string, unknown>), 0),
      0,
    );
    expect(sumDistCup).toBe(expectedTotal);
    expect(sumLedgerCup).toBe(expectedTotal);
    const extRow = ledger.find((r) => r.payment_method === 'external_transfer');
    expect(extRow).toBeTruthy();
    expect(num(extRow!.amount)).toBe(1);
    expect(num(extRow!.amount_cup)).toBe(PRICE_C);
    expect(extRow!.reference).toBeTruthy();

    // Inventario: delta exacto −1 por línea + movimiento 'sale' trazado a la venta
    expect(num((await getInventory(store.id, pA.id))!.quantity)).toBe(stocksBefore.pA - 1);
    expect(num((await getInventory(store.id, pB.id))!.quantity)).toBe(stocksBefore.pB - 1);
    expect(num((await getInventory(store.id, pC.id))!.quantity)).toBe(stocksBefore.pC - 1);
    for (const p of [pA, pB, pC]) {
      const moves = await sb.select<{ reference_id: string; movement_type: string; quantity_change: string | number }>(
        'stock_movements', `store_id=eq.${store.id}&product_id=eq.${p.id}&order=created_at.desc&limit=3`,
      );
      const saleMove = moves.find((m) => m.movement_type === 'sale' && m.reference_id === txId);
      expect(saleMove, `movimiento 'sale' de ${p.name} trazado a ${txId}`).toBeTruthy();
      expect(num(saleMove!.quantity_change)).toBe(-1);
    }

    record({
      test: 'CERT-UI-A', sale_id: txId, store_id: store.id, expected_total: expectedTotal,
      lines: [
        { product: pA.id, name: pA.name, price: PRICE_A, expected: [{ method: 'cash', currency: 'CUP', amount: PRICE_A }] },
        { product: pB.id, name: pB.name, price: PRICE_B, expected: [{ method: 'transfer', currency: 'CUP', amount: PRICE_B, reference: 'TRF-CERT-A-B-001' }] },
        { product: pC.id, name: pC.name, price: PRICE_C, expected: [{ method: 'external_transfer', currency: 'USD', amount: 1, reference: 'TRF-CERT-A-C-002', exchange_rate: RATE }] },
      ],
      customer: { name: 'Cliente Certificacion A', ci: '91020304050' },
      stocks_before: stocksBefore, env: 'isolated',
    });

    await resetForNextSale(page);
  });

  test('CERT-UI-D — validaciones negativas en la interfaz (sin crear ventas inválidas)', async ({ page }) => {
    test.setTimeout(120_000);
    await openExpress(page);
    // Carrito vacío: Cobrar deshabilitado
    await expect(page.locator('button[aria-label="Cobrar venta"]').locator('visible=true').first()).toBeDisabled();

    await addBySku(page, pA.sku, pA.id);
    await page.click(`[data-testid="express-pay-config-${pA.id}"]`);
    const modal = page.locator('[data-testid="pos-express-payment-modal"]');
    await expect(modal).toBeVisible();
    const amountInput = modal.locator('[aria-label^="Monto fila 1"]');

    // Sobrepago visible (no se inventa vuelto sin liquidación)
    await amountInput.fill('200');
    await expect(modal.getByText(/Sobrepago/)).toBeVisible();
    // Importe cero / parcial: «Falta» visible
    await amountInput.fill('0');
    await expect(modal.getByText(/Falta/)).toBeVisible();
    // Restaurar pago completo
    await amountInput.fill(String(PRICE_A));
    await expect(modal.getByText(/Pago completo/)).toBeVisible();
    await modal.locator('[aria-label="Listo, cerrar configuración de pago"]').click();
    await expect(modal).toBeHidden();

    // Transferencia SIN referencia → fail-closed «Completar datos» (no confirma)
    await page.click(`[data-testid="express-pay-config-${pA.id}"]`);
    await expect(modal).toBeVisible();
    await modal.locator('[aria-label="Método de pago fila 1"]').selectOption('transfer');
    await modal.locator('[aria-label^="Monto fila 1"]').fill(String(PRICE_A));
    await modal.locator('[aria-label="Listo, cerrar configuración de pago"]').click();
    await expect(modal).toBeHidden();

    const dialog = await openConfirmDialog(page);
    await expect(dialog.locator('[data-testid="tab-datos-transferencia"]')).toBeVisible();
    // Fail-closed: el botón NO es «Confirmar» mientras falten datos de transferencia
    await expect(dialog.getByRole('button', { name: /Completar datos/ })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Confirmar$/ })).toHaveCount(0);
    // Al pulsarlo redirige a la pestaña de datos (no hay POST)
    let posted = false;
    page.on('request', (r) => { if (r.url().includes('/api/pos/checkout') && r.method() === 'POST') posted = true; });
    await dialog.getByRole('button', { name: /Completar datos/ }).click();
    await expect(dialog.locator('[data-testid="datos-transferencia-panel"]')).toBeVisible();
    // La X del portal cierra desde cualquier pestaña (en «datos» el pie es
    // «Volver al resumen», no «Cancelar»)
    await dialog.locator('[aria-label="Cerrar"]').click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#sale-success-content')).toHaveCount(0);
    expect(posted, 'ningún POST de checkout en el flujo inválido').toBe(false);

    // Vaciar carrito: sin estado residual para los tests siguientes
    await page.locator('[aria-label="Vaciar carrito"]').click();
    await expect(page.getByText(/Sin pago asignado/).first()).toBeVisible({ timeout: 10_000 }).catch(() => {});

    record({ test: 'CERT-UI-D', sale_id: null, result: 'validaciones-UI-pass', env: 'isolated' });
  });

  test('CERT-UI-B — 3 productos, un mismo método (cash): una fila por línea, sin duplicados, sin datos personales', async ({ page }) => {
    test.setTimeout(180_000);
    await openExpress(page);
    await addBySku(page, pA.sku, pA.id);
    await addBySku(page, pD.sku, pD.id);
    await addBySku(page, pE.sku, pE.id);

    for (const p of [pA, pD, pE]) {
      await configureLinePayment(page, p.id, p.name, [{ method: 'cash', amount: String(p === pA ? PRICE_A : p === pD ? PRICE_D : PRICE_E) }]);
    }
    const expectedTotal = PRICE_A + PRICE_D + PRICE_E;

    const stocksBefore = {
      pA: num((await getInventory(store.id, pA.id))!.quantity),
      pD: num((await getInventory(store.id, pD.id))!.quantity),
      pE: num((await getInventory(store.id, pE.id))!.quantity),
    };

    const txId = await confirmSale(page, {}); // sin transferencia: pestaña ausente

    const tx = await getTransaction(txId);
    expect(num(tx!.total_amount as string | number)).toBe(expectedTotal);
    expect(tx!.customer_ci).toBeNull();
    expect(tx!.customer_name).toBeNull();

    const items = await getTransactionItems(txId);
    expect(items).toHaveLength(3);
    const distByProduct = new Map(items.map((r) => [r.product_id, r.payment_distributions || []]));
    expect(distByProduct.get(pA.id)).toHaveLength(1);
    expect(distByProduct.get(pD.id)).toHaveLength(1);
    expect(distByProduct.get(pE.id)).toHaveLength(1);
    expect(distByProduct.get(pA.id)![0]).toMatchObject({ method: 'cash', currency: 'CUP', amount: PRICE_A });
    expect(distByProduct.get(pD.id)![0]).toMatchObject({ method: 'cash', currency: 'CUP', amount: PRICE_D });
    expect(distByProduct.get(pE.id)![0]).toMatchObject({ method: 'cash', currency: 'CUP', amount: PRICE_E });

    const ledger = await getLedger(txId);
    expect(ledger.reduce((s, r) => s + num(r.amount_cup), 0)).toBe(expectedTotal);
    // Todos cash: el ledger no debe contener filas de transferencia
    expect(ledger.filter((r) => r.payment_method !== 'cash')).toHaveLength(0);

    expect(num((await getInventory(store.id, pA.id))!.quantity)).toBe(stocksBefore.pA - 1);
    expect(num((await getInventory(store.id, pD.id))!.quantity)).toBe(stocksBefore.pD - 1);
    expect(num((await getInventory(store.id, pE.id))!.quantity)).toBe(stocksBefore.pE - 1);

    record({
      test: 'CERT-UI-B', sale_id: txId, store_id: store.id, expected_total: expectedTotal,
      lines: [
        { product: pA.id, price: PRICE_A, expected: [{ method: 'cash', currency: 'CUP', amount: PRICE_A }] },
        { product: pD.id, price: PRICE_D, expected: [{ method: 'cash', currency: 'CUP', amount: PRICE_D }] },
        { product: pE.id, price: PRICE_E, expected: [{ method: 'cash', currency: 'CUP', amount: PRICE_E }] },
      ],
      customer: null, stocks_before: stocksBefore, env: 'isolated',
    });
    await resetForNextSale(page);
  });

  test('CERT-UI-I+C — 2 productos, 2 métodos independientes + doble clic NO duplica la venta', async ({ page }) => {
    test.setTimeout(180_000);
    await openExpress(page);
    await addBySku(page, pD.sku, pD.id);
    await addBySku(page, pE.sku, pE.id);
    await configureLinePayment(page, pD.id, pD.name, [{ method: 'cash', amount: String(PRICE_D) }]);
    await configureLinePayment(page, pE.id, pE.name, [{ method: 'transfer', amount: String(PRICE_E), reference: 'TRF-CERT-C-E-003' }]);

    const stocksBefore = {
      pD: num((await getInventory(store.id, pD.id))!.quantity),
      pE: num((await getInventory(store.id, pE.id))!.quantity),
    };

    const txId = await confirmSale(page, {
      customerName: 'Cliente Certificacion C',
      customerCi: '92030405060',
      transferRefs: [{ productId: pE.id, ref: 'TRF-CERT-C-E-003' }],
      doubleClick: true, // el botón se deshabilita durante el procesamiento
    });

    const tx = await getTransaction(txId);
    const expectedTotal = PRICE_D + PRICE_E;
    expect(num(tx!.total_amount as string | number)).toBe(expectedTotal);

    const items = await getTransactionItems(txId);
    expect(items).toHaveLength(2);
    const distByProduct = new Map(items.map((r) => [r.product_id, r.payment_distributions || []]));
    expect(distByProduct.get(pD.id)![0]).toMatchObject({ method: 'cash', currency: 'CUP', amount: PRICE_D });
    expect(distByProduct.get(pE.id)![0]).toMatchObject({ method: 'transfer', currency: 'CUP', amount: PRICE_E, reference: 'TRF-CERT-C-E-003' });

    // Idempotencia UI: exactamente UNA venta con ese total en la tienda del run
    const sales = await sb.select<{ id: string }>(
      'transactions', `store_id=eq.${store.id}&total_amount=eq.${expectedTotal}&select=id`,
    );
    expect(sales).toHaveLength(1);
    expect(sales[0].id).toBe(txId);

    expect(num((await getInventory(store.id, pD.id))!.quantity)).toBe(stocksBefore.pD - 1);
    expect(num((await getInventory(store.id, pE.id))!.quantity)).toBe(stocksBefore.pE - 1);

    record({
      test: 'CERT-UI-I+C', sale_id: txId, store_id: store.id, expected_total: expectedTotal,
      lines: [
        { product: pD.id, price: PRICE_D, expected: [{ method: 'cash', currency: 'CUP', amount: PRICE_D }] },
        { product: pE.id, price: PRICE_E, expected: [{ method: 'transfer', currency: 'CUP', amount: PRICE_E, reference: 'TRF-CERT-C-E-003' }] },
      ],
      customer: { name: 'Cliente Certificacion C', ci: '92030405060' },
      stocks_before: stocksBefore, env: 'isolated', note: 'doble clic en Confirmar → 1 venta',
    });
    await resetForNextSale(page);
  });

  test('CERT-UI-E — persistencia tras reload: detalles de la venta en Historial', async ({ page }) => {
    test.setTimeout(120_000);
    // La venta de CERT-UI-A es la más reciente de la tienda del run.
    const sales = await sb.select<{ id: string; total_amount: string | number }>(
      'transactions', `store_id=eq.${store.id}&customer_name=eq.Cliente Certificacion A&order=created_at.desc&limit=1&select=id,total_amount`,
    );
    expect(sales).toHaveLength(1);
    const saleId = sales[0].id;

    await loginTerminal(page, '/?view=pos');
    await dismissCookies(page);
    await page.goto('/?view=sales');
    const histHeading = page.getByRole('heading', { name: 'Historial de Ventas' }).first();
    await expect(histHeading).toBeVisible({ timeout: 30_000 });
    await page.reload(); // persistencia sin estado temporal del navegador
    await expect(page.getByRole('heading', { name: 'Historial de Ventas' }).first()).toBeVisible({ timeout: 30_000 });

    // Búsqueda DETERMINISTA por el ID de la venta (el filtro del historial
    // cubre t.id — useSalesHistoryView §search): deja exactamente 1 fila.
    const search = page.getByPlaceholder('Buscar por referencia, vendedor...');
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill(saleId);
    const rows = page.locator('[aria-label="Ver detalles de la venta"]');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    await expect(rows).toHaveCount(1);
    await rows.first().click();
    const modal = page.getByRole('dialog', { name: /Detalles de la Venta/ });
    await expect(modal.getByText('Desglose de Pago')).toBeVisible({ timeout: 10_000 });
    // Esperar a que la query de items resuelva (skeleton → filas)
    await expect(modal.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });
    await expect(modal.getByText('Completada').first()).toBeVisible();
    await expect(modal.getByText('CERT-A Efectivo')).toBeVisible();
    await expect(modal.getByText('CERT-B Transferencia')).toBeVisible();
    await expect(modal.getByText('CERT-C Exterior USD')).toBeVisible();
    await expect(modal.getByText('$' + (PRICE_A + PRICE_B + PRICE_C).toFixed(2)).first()).toBeVisible();
    await page.screenshot({ path: join(SHOT_DIR, 'cert-desktop-detalles-venta.png') });
    record({ test: 'CERT-UI-E', sale_id: saleId, result: 'persistencia-detalle-pass', env: 'isolated' });
  });

  test('CERT-UI-M — móvil (390×844): carrito móvil, pago por línea y venta completa', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openExpress(page);
    await expect(page.locator('[data-testid="express-mobile-bar"]')).toBeVisible();
    await addBySku(page, pF.sku, pF.id, { assertVisible: false });

    // En móvil el carrito vive en el panel dedicado (el contenedor desktop
    // está oculto): abrir «Ver carrito» y configurar el pago DENTRO del panel.
    // force: la barra móvil anima (framer-motion) — mismo patrón que POS-009
    await page.locator('button[aria-label^="Ver carrito"]').first().click({ force: true });
    const mobileCart = page.locator('[data-testid="express-cart-mobile"]');
    await expect(mobileCart).toBeVisible();
    await expect(mobileCart.locator(`[data-testid="express-pay-config-${pF.id}"]`)).toBeVisible();
    await page.screenshot({ path: join(SHOT_DIR, 'cert-movil-carrito.png') });
    await configureLinePayment(page, pF.id, pF.name, [{ method: 'cash', amount: String(PRICE_F) }], mobileCart);
    await page.screenshot({ path: join(SHOT_DIR, 'cert-movil-express-linea-asignada.png') });

    const stocksBefore = num((await getInventory(store.id, pF.id))!.quantity);
    const txId = await confirmSale(page, {}); // el Cobrar visible del carrito/barra móvil

    const tx = await getTransaction(txId);
    expect(num(tx!.total_amount as string | number)).toBe(PRICE_F);
    const items = await getTransactionItems(txId);
    expect(items).toHaveLength(1);
    expect(items[0].payment_distributions?.[0]).toMatchObject({ method: 'cash', currency: 'CUP', amount: PRICE_F });
    expect(num((await getInventory(store.id, pF.id))!.quantity)).toBe(stocksBefore - 1);
    await page.screenshot({ path: join(SHOT_DIR, 'cert-movil-venta-completada.png') });

    record({
      test: 'CERT-UI-M', sale_id: txId, store_id: store.id, expected_total: PRICE_F,
      lines: [{ product: pF.id, price: PRICE_F, expected: [{ method: 'cash', currency: 'CUP', amount: PRICE_F }] }],
      customer: null, stocks_before: { pF: stocksBefore }, env: 'isolated', viewport: '390x844',
    });
    await resetForNextSale(page);
  });

  test('CERT-CONCILIACION — conciliación financiera INDEPENDIENTE (proceso aparte, antes del cleanup)', async () => {
    test.setTimeout(120_000);
    // FASE 3 de la misión: la conciliación corre ANTES del teardown (las ventas
    // siguen en la BD aislada) pero en un PROCESO y código separados de las
    // aserciones de los tests UI — re-consulta la BD y aplica las reglas
    // monetarias del contrato (moneda origen × exchange_rate; nunca sumar
    // monedas distintas). Falla el run si hay discrepancias.
    execSync('node scripts/cert-pos-conciliacion.mjs --in test-results/cert-sales.jsonl', {
      env: process.env, stdio: 'inherit', cwd: process.cwd(),
    });
  });
});
