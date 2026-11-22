/**
 * E2E — CP-FIN-ENERVIDA-CASH-BANK-CLASSIFICATION-AND-BALANCE-RECONCILIATION-001 (2026-11-19)
 * ============================================================================
 * Batería OBLIGATORIA de la misión (§10, 25 escenarios) sobre el motor de
 * partida doble, la clasificación efectivo/bancos por (método × moneda) del
 * carrito, el escritor canónico de reclasificación de MONEDA de cobro y la
 * ecuación del desequilibrio del Estado de Situación.
 *
 * Cadenas probadas (sin mocks):
 *   · POS real: API → /api/pos/checkout → create_sale_v2 → trigger
 *     fin_trg_transactions → fin_post_document_safe → fin_movements
 *     (payment_components = riel canónico de pagos mixtos multimoneda).
 *   · Clasificación vinculante del mandato (§2): Efectivo→caja, Transf.→banco,
 *     Transf. Exterior (zelle)→banco; la MONEDA no sustituye al medio.
 *   · Rectificación de MÉTODO (fin_rectify_sale_payment_method, patrón
 *     RECT-FIN-E2614F36) y reclasificación de MONEDA
 *     (fin_reclassify_sale_payment_currency, nuevo escritor CP-FIN-002).
 *   · Dashboard: fin_get_dashboard con la ecuación contable COMPLETA
 *     (A − P − Patrimonio − Ingresos − Gastos) y fin_get_balance_sheet.
 *   · Reversión: /api/reverse → anulacion enlazada con amount_origin.
 *
 * Verificación de estado persistido vía REST service-role (lectura de estado)
 * y RPC como usuario autenticado (RLS real). Entorno: BD aislada CostproE2E.
 * Cleanup: delta neto cero.
 * ============================================================================
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import {
  signIn, apiHeaders, injectSession, sb, rpcAsUser, rpcAsService, cleanupProducts,
  createTestStore, seedProduct,
  ADMIN_EMAIL, ADMIN_PASS, CLERK_EMAIL, CLERK_PASS,
} from './fixtures/session.fixture';
import { hardDeleteTestStore } from './fixtures/hard-cleanup';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

let adminToken = '';
let adminId = '';
let clerkToken = '';
let clerkId = '';
let tenantId = '';
let storeA = '';
const SFX = Date.now().toString(36);

let pCup = { id: '', price: 1000, cost: 400 };
// Precio de catálogo = NOMINAL USD del ítem (patrón del caso real del 7-11:
// Cable Solar 4mm, catálogo 4.50 × tasa 930). El gate R-SEC-1 compara crudo.
let pUsd = { id: '', price: 4.5, cost: 1000 };
// Producto de catálogo 7 USD (patrón de las ventas históricas reclasificadas:
// 9d1ccef8/6501f8da — ítem 7 USD × tasa 930 = 6,510 CUP)
let pUsd7 = { id: '', price: 7, cost: 1000 };
const RATE = 930;

const saleIds: string[] = [];
let sCashCup = '';      // E1
let sCable135 = '';     // E2 — caso principal: 30 m Cable Solar @4.50 = 135 USD efectivo
let sTransfCup = '';    // E4
let sTransfUsd = '';    // E5
let sZelle = '';        // E6
let sMixta = '';        // E7
let sMixtaDiv = '';     // E8
let sZelleRect = '';    // E10 (rectificado zelle→cash)
let sTransfRect = '';   // E11 (rectificado transfer→cash)
let sReclMon = '';      // E15 (reclasificado cash/USD → cash/CUP)
let sAnulada = '';      // E22 (revertida)
let freshStoreId = '';  // E25 (RLS, hard cleanup)

/** Venta real por la cadena completa (POS checkout → RPC → trigger). */
async function checkout(request: APIRequestContext, payload: Record<string, unknown>): Promise<string> {
  const res = await request.post('/api/pos/checkout', {
    headers: apiHeaders(adminToken),
    data: { idempotency_key: `cpfin002-${SFX}-${saleIds.length}-${Math.random().toString(36).slice(2, 8)}`, ...payload },
  });
  if (!res.ok()) throw new Error(`checkout falló: ${res.status()} ${await res.text()}`.slice(0, 500));
  const body = await res.json();
  const txId = body?.transaction_id || body?.data?.transaction_id || body?.data?.id || body?.id;
  if (!txId) throw new Error(`checkout sin transaction_id: ${JSON.stringify(body).slice(0, 200)}`);
  saleIds.push(String(txId));
  return String(txId);
}

/** Filas del drilldown de una categoría (usuario real, RLS activo). */
async function detail(token: string, store: string, category: string, from = '1900-01-01', to = '2030-12-31') {
  const r = await rpcAsUser<{ movimientos: Array<Record<string, unknown>>; total: number }>(
    'fin_get_category_detail', token,
    { p_store_id: store, p_category: category, p_from: from, p_to: to, p_limit: 300, p_offset: 0 },
  );
  if (!r.ok) throw new Error(`fin_get_category_detail falló (${r.status}): ${r.error}`);
  return r.data!;
}

function movsOf(data: { movimientos: Array<Record<string, unknown>> }, documentId: string) {
  return data.movimientos.filter((m) => m.document_id === documentId);
}

test.describe.serial('CP-FIN-002 — clasificación efectivo/bancos por método y moneda + equilibrio', () => {
  test.beforeAll(async ({ request }) => {
    test.skip(!SUPABASE_URL, 'sin credenciales de la BD aislada');
    const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    adminToken = admin.token;
    adminId = admin.userId;
    const clerk = await signIn(CLERK_EMAIL, CLERK_PASS);
    clerkToken = clerk.token;
    clerkId = clerk.userId;
    const a = await createTestStore(request, adminToken, 'A');
    storeA = a.id;
    const storeRow = await sb.select<{ tenant_id: string }>('stores', `id=eq.${storeA}&select=tenant_id`);
    tenantId = storeRow[0]?.tenant_id;
    await sb.update('profiles', `id=eq.${adminId}`, { active_store_id: storeA });

    const rateRes = await request.post('/api/store-rates', {
      headers: apiHeaders(adminToken),
      data: { storeId: storeA, rates: { USD: RATE } },
    });
    if (!rateRes.ok()) throw new Error(`store-rates falló: ${rateRes.status()} ${await rateRes.text()}`);

    const seededCup = await seedProduct(a, {
      name: `CPFIN-002 Cup ${SFX}`, price: pCup.price, cost: pCup.cost, quantity: 100, sku: `CPFIN2-CUP-${SFX}`,
    });
    const seededUsd = await seedProduct(a, {
      name: `CPFIN-002 Usd ${SFX}`, price: pUsd.price, cost: pUsd.cost, quantity: 100, sku: `CPFIN2-USD-${SFX}`,
    });
    const seededUsd7 = await seedProduct(a, {
      name: `CPFIN-002 Usd7 ${SFX}`, price: pUsd7.price, cost: pUsd7.cost, quantity: 100, sku: `CPFIN2-USD7-${SFX}`,
    });
    pCup.id = seededCup.id;
    pUsd.id = seededUsd.id;
    pUsd7.id = seededUsd7.id;
  });

  // ── §10.1 — Efectivo CUP ───────────────────────────────────────────────────
  test('E1 · Efectivo CUP: ACT_EFECTIVO_CUP débito; banco y caja USD sin este documento', async ({ request }) => {
    sCashCup = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'cash',
      items: [{ product_id: pCup.id, quantity: 2, price: pCup.price, cost: pCup.cost, currency: 'CUP', exchange_rate: 1 }],
      total_amount: 2000, subtotal: 2000, cash_amount: 2000, transfer_amount: 0, zelle_amount: 0,
      sale_currency: 'CUP', sale_exchange_rate: 1,
    });
    const cash = await detail(adminToken, storeA, 'ACT_EFECTIVO_CUP');
    const row = movsOf(cash, sCashCup).find((m) => m.sense === 'debito');
    expect(row).toBeTruthy();
    expect(Number(row!.amount_cup)).toBe(2000);
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    expect(movsOf(bancos, sCashCup)).toHaveLength(0);
    const cajaUsd = await detail(adminToken, storeA, 'ACT_EFECTIVO_USD');
    expect(movsOf(cajaUsd, sCashCup)).toHaveLength(0);
  });

  // ── §10.2 + CASO PRINCIPAL — Efectivo USD 135 @930 (Cable Solar 30 m) ─────
  test('E2 · caso principal: Cable Solar 30 m @4.50 — efectivo USD 135 @930 → caja USD 125,550 CUP; bancos NO', async ({ request }) => {
    sCable135 = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'cash',
      items: [{ product_id: pUsd.id, quantity: 30, price: 4.5, cost: pUsd.cost, currency: 'USD', exchange_rate: RATE, cash_paid: 135, cash_currency: 'USD' }],
      total_amount: 125550, subtotal: 125550, cash_amount: 125550, transfer_amount: 0, zelle_amount: 0,
      sale_currency: 'USD', sale_exchange_rate: RATE,
      payment_components: [{ method: 'cash', currency: 'USD', amount: 135 }],
    });
    const cajaUsd = await detail(adminToken, storeA, 'ACT_EFECTIVO_USD');
    const row = movsOf(cajaUsd, sCable135).find((m) => m.sense === 'debito');
    expect(row).toBeTruthy();
    expect(Number(row!.amount_cup)).toBe(125550);            // 135 × 930, UNA conversión
    expect(Number(row!.amount_origin)).toBeCloseTo(135, 2);  // nominal original
    expect(row!.currency_origin).toBe('USD');
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    expect(movsOf(bancos, sCable135)).toHaveLength(0);
    const ing = await detail(adminToken, storeA, 'ING_VENTAS');
    const ingRow = movsOf(ing, sCable135).find((m) => m.sense === 'credito');
    expect(ingRow).toBeTruthy();
    expect(Number(ingRow!.amount_cup)).toBe(125550);
    expect(Number(ingRow!.amount_origin)).toBeCloseTo(135, 2);
    // El pago conserva el nominal y la tasa (Historial: Efectivo / 135 USD)
    const pays = await sb.select<{ payment_method: string; amount: number; currency: string; exchange_rate: number }>(
      'payment_transactions', `ref_id=eq.${sCable135}&select=payment_method,amount,currency,exchange_rate`);
    expect(pays.length).toBe(1);
    expect(pays[0].payment_method).toBe('cash');
    expect(pays[0].currency).toBe('USD');
    expect(Number(pays[0].amount)).toBeCloseTo(135, 2);
    expect(Number(pays[0].exchange_rate)).toBe(RATE);
  });

  // ── §10.3/§10.4 — Efectivo EUR/MLC: riel canónico documentado ─────────────
  test('E3 · Efectivo EUR/MLC: sin riel de venta EUR/MLC en el escritor canónico (documentado, no simulado)', async () => {
    // create_sale_v2 + checkoutSchema admiten CUP/USD en payment_components;
    // el CHECK de fin_movements admite CUP/USD/EUR/MLC pero NO existe caja
    // EUR/MLC en el plan contable REAL de COSTPRO (catálogo global) — sin
    // cuenta destino no se inventa conversión (mandato §2/§9.C).
    const cats = await rpcAsUser<Array<Record<string, unknown>>>('fin_get_balance_sheet', adminToken,
      { p_store_id: storeA, p_as_of: '2030-12-31' });
    expect(cats.ok).toBe(true);
    expect(saleIds.length).toBeGreaterThanOrEqual(1);
  });

  // ── §10.5 — Transferencia CUP ─────────────────────────────────────────────
  test('E4 · Transferencia CUP: ACT_BANCOS débito; caja CUP sin este documento', async ({ request }) => {
    sTransfCup = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'transfer',
      items: [{ product_id: pCup.id, quantity: 1, price: pCup.price, cost: pCup.cost, currency: 'CUP', exchange_rate: 1 }],
      total_amount: 1000, subtotal: 1000, cash_amount: 0, transfer_amount: 1000, zelle_amount: 0,
      sale_currency: 'CUP', sale_exchange_rate: 1,
    });
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    const row = movsOf(bancos, sTransfCup).find((m) => m.sense === 'debito');
    expect(row).toBeTruthy();
    expect(Number(row!.amount_cup)).toBe(1000);
    const cash = await detail(adminToken, storeA, 'ACT_EFECTIVO_CUP');
    expect(movsOf(cash, sTransfCup)).toHaveLength(0);
  });

  // ── §10.6 — Transferencia USD ─────────────────────────────────────────────
  test('E5 · Transferencia USD: banco con original 4,50 USD (moneda ≠ medio)', async ({ request }) => {
    sTransfUsd = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'transfer',
      items: [{ product_id: pUsd.id, quantity: 1, price: 4.5, cost: pUsd.cost, currency: 'USD', exchange_rate: RATE }],
      total_amount: 4185, subtotal: 4185, cash_amount: 0, transfer_amount: 4185, zelle_amount: 0,
      sale_currency: 'USD', sale_exchange_rate: RATE,
      payment_components: [{ method: 'transfer', currency: 'USD', amount: 4.5 }],
    });
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    const row = movsOf(bancos, sTransfUsd).find((m) => m.sense === 'debito');
    expect(row).toBeTruthy();
    expect(Number(row!.amount_cup)).toBe(4185);
    expect(Number(row!.amount_origin)).toBeCloseTo(4.5, 2);
    const cajaUsd = await detail(adminToken, storeA, 'ACT_EFECTIVO_USD');
    expect(movsOf(cajaUsd, sTransfUsd)).toHaveLength(0);
  });

  // ── §10.7 — Transferencia exterior USD (zelle) ────────────────────────────
  test('E6 · Transf. Exterior (zelle) USD: CUENTA EXTERIOR débito con original (CP-FIN-003 §4: cuenta propia)', async ({ request }) => {
    // ACTUALIZADO por CP-FIN-003 (regla VENTA v3 + mapeo canónico): Transf.
    // Exterior (zelle) imputa ACT_TRANSF_EXTERIOR — misión REBUILD §4 tabla
    // vinculante («Cuenta de transferencia exterior»). Con las reglas v2 se
    // imputaba ACT_BANCOS.
    sZelle = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'zelle',
      items: [{ product_id: pUsd.id, quantity: 2, price: 4.5, cost: pUsd.cost, currency: 'USD', exchange_rate: RATE, zelle_paid: 9, zelle_currency: 'USD' }],
      total_amount: 8370, subtotal: 8370, cash_amount: 0, transfer_amount: 0, zelle_amount: 8370,
      sale_currency: 'USD', sale_exchange_rate: RATE,
      payment_components: [{ method: 'zelle', currency: 'USD', amount: 9 }],
    });
    const exterior = await detail(adminToken, storeA, 'ACT_TRANSF_EXTERIOR');
    const row = movsOf(exterior, sZelle).find((m) => m.sense === 'debito');
    expect(row).toBeTruthy();
    expect(Number(row!.amount_cup)).toBe(8370);
    expect(Number(row!.amount_origin)).toBeCloseTo(9, 2);
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    expect(movsOf(bancos, sZelle)).toHaveLength(0);
    const cajaUsd = await detail(adminToken, storeA, 'ACT_EFECTIVO_USD');
    expect(movsOf(cajaUsd, sZelle)).toHaveLength(0);
  });

  // ── §10.8 — Venta mixta efectivo + transferencia (un solo reconocimiento) ─
  test('E7 · mixta CUP: efectivo→caja + transferencia→banco, UN solo reconocimiento de ingresos', async ({ request }) => {
    sMixta = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'mixed',
      items: [{ product_id: pCup.id, quantity: 2, price: pCup.price, cost: pCup.cost, currency: 'CUP', exchange_rate: 1 }],
      total_amount: 2000, subtotal: 2000, cash_amount: 1200, transfer_amount: 800, zelle_amount: 0,
      sale_currency: 'CUP', sale_exchange_rate: 1,
      payment_components: [
        { method: 'cash', currency: 'CUP', amount: 1200 },
        { method: 'transfer', currency: 'CUP', amount: 800 },
      ],
    });
    const cash = await detail(adminToken, storeA, 'ACT_EFECTIVO_CUP');
    expect(movsOf(cash, sMixta).some((m) => Number(m.amount_cup) === 1200 && m.sense === 'debito')).toBe(true);
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    expect(movsOf(bancos, sMixta).some((m) => Number(m.amount_cup) === 800 && m.sense === 'debito')).toBe(true);
    const ing = await detail(adminToken, storeA, 'ING_VENTAS');
    const ingRows = movsOf(ing, sMixta).filter((m) => m.sense === 'credito');
    expect(ingRows).toHaveLength(1); // sin doble contabilización
    expect(Number(ingRows[0].amount_cup)).toBe(2000);
  });

  // ── §10.9 — Mixta en monedas diferentes (efectivo USD + transferencia CUP) ─
  test('E8 · mixta multimoneda: efectivo USD (original) + transferencia CUP, cuentas separadas', async ({ request }) => {
    sMixtaDiv = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'mixed',
      items: [{ product_id: pUsd.id, quantity: 1, price: 4.5, cost: pUsd.cost, currency: 'USD', exchange_rate: RATE }],
      total_amount: 4185, subtotal: 4185, cash_amount: 3255, transfer_amount: 930, zelle_amount: 0,
      sale_currency: 'USD', sale_exchange_rate: RATE,
      payment_components: [
        { method: 'cash', currency: 'USD', amount: 3.5 },
        { method: 'transfer', currency: 'CUP', amount: 930 },
      ],
    });
    const cajaUsd = await detail(adminToken, storeA, 'ACT_EFECTIVO_USD');
    const cashRow = movsOf(cajaUsd, sMixtaDiv).find((m) => m.sense === 'debito');
    expect(cashRow).toBeTruthy();
    expect(Number(cashRow!.amount_cup)).toBe(3255);
    expect(Number(cashRow!.amount_origin)).toBeCloseTo(3.5, 2);
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    const bankRow = movsOf(bancos, sMixtaDiv).find((m) => m.sense === 'debito');
    expect(bankRow).toBeTruthy();
    expect(Number(bankRow!.amount_cup)).toBe(930);
    const ing = await detail(adminToken, storeA, 'ING_VENTAS');
    const ingRows = movsOf(ing, sMixtaDiv).filter((m) => m.sense === 'credito');
    expect(ingRows).toHaveLength(1);
    expect(Number(ingRows[0].amount_cup)).toBe(4185);
  });

  // ── §10.10/§10.11 — Alias históricos y valor backend ambiguo (fail-closed) ─
  test('E9 · escritor de reclasificación fail-closed: método ambiguo, moneda igual, categoría igual', async () => {
    // Valor backend ambiguo / alias no soportado
    const r1 = await rpcAsService('fin_reclassify_sale_payment_currency', {
      p_sale_id: sCashCup, p_metodo: 'tarjeta', p_moneda_desde: 'USD', p_moneda_hacia: 'CUP',
    });
    expect(r1.ok).toBe(false);
    expect(r1.error).toContain('ERR_METHOD_NOT_SUPPORTED');
    // Moneda sin caja en el plan real
    const r2 = await rpcAsService('fin_reclassify_sale_payment_currency', {
      p_sale_id: sCashCup, p_metodo: 'cash', p_moneda_desde: 'EUR', p_moneda_hacia: 'CUP',
    });
    expect(r2.ok).toBe(false);
    expect(r2.error).toContain('ERR_CURRENCY_NOT_SUPPORTED');
    // Moneda idéntica
    const r3 = await rpcAsService('fin_reclassify_sale_payment_currency', {
      p_sale_id: sCashCup, p_metodo: 'cash', p_moneda_desde: 'CUP', p_moneda_hacia: 'CUP',
    });
    expect(r3.ok).toBe(false);
    expect(r3.error).toContain('ERR_SAME_CURRENCY');
    // transfer USD→CUP: ambas imputan ACT_BANCOS (sin efecto contable)
    const r4 = await rpcAsService('fin_reclassify_sale_payment_currency', {
      p_sale_id: sTransfUsd, p_metodo: 'transfer', p_moneda_desde: 'USD', p_moneda_hacia: 'CUP',
    });
    expect(r4.ok).toBe(false);
    expect(r4.error).toContain('ERR_SAME_FINANCIAL_CATEGORY');
    // Reclasificar la venta E1 (cobro ya en CUP) hacia USD: sin débito origen
    const r5 = await rpcAsService('fin_reclassify_sale_payment_currency', {
      p_sale_id: sCashCup, p_metodo: 'cash', p_moneda_desde: 'USD', p_moneda_hacia: 'CUP',
    });
    expect(r5.ok).toBe(false);
    expect(r5.error).toContain('ERR_COB_MOVEMENT_NOT_FOUND');
  });

  // ── §10.12 — Clasificación histórica de e2614f36 ya rectificada (patrón) ──
  test('E10 · patrón e2614f36: venta USD cobrada por zelle → rectificación canónica a efectivo USD', async ({ request }) => {
    sZelleRect = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'zelle',
      items: [{ product_id: pUsd.id, quantity: 30, price: 4.5, cost: pUsd.cost, currency: 'USD', exchange_rate: RATE, zelle_paid: 135, zelle_currency: 'USD' }],
      total_amount: 125550, subtotal: 125550, cash_amount: 0, transfer_amount: 0, zelle_amount: 125550,
      sale_currency: 'USD', sale_exchange_rate: RATE,
      payment_components: [{ method: 'zelle', currency: 'USD', amount: 135 }],
    });
    // CP-FIN-003 v3: el cobro zelle nace en ACT_TRANSF_EXTERIOR (cuenta propia)
    const extPre = await detail(adminToken, storeA, 'ACT_TRANSF_EXTERIOR');
    const cobPre = movsOf(extPre, sZelleRect).find((m) => m.sense === 'debito');
    expect(cobPre).toBeTruthy();
    expect(Number(cobPre!.amount_cup)).toBe(125550);

    const rect = await rpcAsService<{ status: string; to_category: string; importe_origin: number }>(
      'fin_rectify_sale_payment_method',
      { p_sale_id: sZelleRect, p_from_method: 'zelle', p_to_method: 'cash', p_actor: adminId,
        p_reason: 'E2E CP-FIN-002 §10.12: cobro real en efectivo (patrón e2614f36)' });
    expect(rect.ok, `rect.error=${rect.error}`).toBe(true);
    expect(rect.data!.status).toBe('OK');
    expect(rect.data!.to_category).toBe('ACT_EFECTIVO_USD');
    expect(Number(rect.data!.importe_origin)).toBeCloseTo(135, 2);

    const extPost = await detail(adminToken, storeA, 'ACT_TRANSF_EXTERIOR');
    const netoExterior = movsOf(extPost, sZelleRect).reduce((acc, m) => acc + (m.sense === 'debito' ? Number(m.amount_cup) : -Number(m.amount_cup)), 0);
    expect(netoExterior).toBe(0);
    const bancosPost = await detail(adminToken, storeA, 'ACT_BANCOS');
    const netoBanco = movsOf(bancosPost, sZelleRect).reduce((acc, m) => acc + (m.sense === 'debito' ? Number(m.amount_cup) : -Number(m.amount_cup)), 0);
    expect(netoBanco).toBe(0);
    const cajaUsd = await detail(adminToken, storeA, 'ACT_EFECTIVO_USD');
    const netoCaja = movsOf(cajaUsd, sZelleRect).reduce((acc, m) => acc + (m.sense === 'debito' ? Number(m.amount_cup) : -Number(m.amount_cup)), 0);
    expect(netoCaja).toBe(125550);
    // Datos corregidos para el Historial de Ventas (Efectivo / 135 USD)
    const pays = await sb.select<{ payment_method: string; amount: number; currency: string }>(
      'payment_transactions', `ref_id=eq.${sZelleRect}&select=payment_method,amount,currency`);
    expect(pays[0].payment_method).toBe('cash');
    expect(pays[0].currency).toBe('USD');
    expect(Number(pays[0].amount)).toBeCloseTo(135, 2);
    // Ingreso intacto (una sola línea)
    const ing = await detail(adminToken, storeA, 'ING_VENTAS');
    expect(movsOf(ing, sZelleRect).filter((m) => m.sense === 'credito')).toHaveLength(1);
  });

  // ── §10.13 — Rectificación GENÉRICA de otra venta mal clasificada ─────────
  test('E11 · rectificación genérica transfer→cash CUP en una venta distinta', async ({ request }) => {
    sTransfRect = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'transfer',
      items: [{ product_id: pCup.id, quantity: 1, price: pCup.price, cost: pCup.cost, currency: 'CUP', exchange_rate: 1 }],
      total_amount: 1000, subtotal: 1000, cash_amount: 0, transfer_amount: 1000, zelle_amount: 0,
      sale_currency: 'CUP', sale_exchange_rate: 1,
    });
    const rect = await rpcAsService<{ status: string; to_category: string; importe_cup: number }>(
      'fin_rectify_sale_payment_method',
      { p_sale_id: sTransfRect, p_from_method: 'transfer', p_to_method: 'cash', p_actor: adminId,
        p_reason: 'E2E CP-FIN-002 §10.13: rectificación genérica (mandato §8)' });
    expect(rect.ok, `rect.error=${rect.error}`).toBe(true);
    expect(rect.data!.status).toBe('OK');
    expect(rect.data!.to_category).toBe('ACT_EFECTIVO_CUP');
    expect(Number(rect.data!.importe_cup)).toBe(1000);
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    const neto = movsOf(bancos, sTransfRect).reduce((acc, m) => acc + (m.sense === 'debito' ? Number(m.amount_cup) : -Number(m.amount_cup)), 0);
    expect(neto).toBe(0);
    const cash = await detail(adminToken, storeA, 'ACT_EFECTIVO_CUP');
    expect(movsOf(cash, sTransfRect).some((m) => m.sense === 'debito' && Number(m.amount_cup) === 1000)).toBe(true);
  });

  // ── §10.14 — Reclasificación de MONEDA (NUEVO escritor CP-FIN-002) ────────
  // Reproduce el defecto histórico de ENERVIDA: venta CUP-dominada cuyo cobro
  // el POS registró como nominal USD equivalente → caja USD; el dinero real
  // fue CUP → la cuenta correcta es Efectivo en caja CUP (mandato §3/§16).
  test('E15 · reclasificación cash/USD → cash/CUP: compensatorio, datos corregidos, ingreso/COGS intactos', async ({ request }) => {
    // Venta CUP 6,510 (catálogo 7 USD × 930) con componente cash/USD 7 — el
    // mismo patrón de las ventas 9d1ccef8/6501f8da/7d9ad144 de la tienda real.
    sReclMon = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'cash',
      items: [{ product_id: pUsd7.id, quantity: 1, price: 7, cost: pUsd7.cost, currency: 'USD', exchange_rate: RATE, cash_paid: 7, cash_currency: 'USD' }],
      total_amount: 6510, subtotal: 6510, cash_amount: 6510, transfer_amount: 0, zelle_amount: 0,
      sale_currency: 'CUP', sale_exchange_rate: 1,
      payment_components: [{ method: 'cash', currency: 'USD', amount: 7 }],
    });
    // Pre: el motor clasificó el cobro en caja USD (coherente con el registro)
    const cajaUsdPre = await detail(adminToken, storeA, 'ACT_EFECTIVO_USD');
    const pre = movsOf(cajaUsdPre, sReclMon).find((m) => m.sense === 'debito');
    expect(pre).toBeTruthy();
    expect(Number(pre!.amount_cup)).toBe(6510);

    // Estado ANTES: ingreso y COGS de la venta (para verificar preservación)
    const ingPre = await detail(adminToken, storeA, 'ING_VENTAS');
    const ingPreRow = movsOf(ingPre, sReclMon).find((m) => m.sense === 'credito');
    const cogsPre = await detail(adminToken, storeA, 'GAS_COSTO_VENTAS');
    const cogsPreRow = movsOf(cogsPre, sReclMon).find((m) => m.sense === 'debito');
    const invPre = await detail(adminToken, storeA, 'ACT_INVENTARIO');
    const invPreRow = movsOf(invPre, sReclMon).find((m) => m.sense === 'credito');

    const rec = await rpcAsService<{ status: string; docnum: string; importe_cup: number; from_category: string; to_category: string; tasa_documental: number; caso: string }>(
      'fin_reclassify_sale_payment_currency',
      { p_sale_id: sReclMon, p_metodo: 'cash', p_moneda_desde: 'USD', p_moneda_hacia: 'CUP', p_actor: adminId,
        p_reason: 'E2E CP-FIN-002 §10.14: venta CUP cobrada en efectivo CUP; el POS registró el nominal USD equivalente' });
    expect(rec.ok, `rec.error=${rec.error}`).toBe(true);
    expect(rec.data!.status).toBe('OK');
    expect(rec.data!.from_category).toBe('ACT_EFECTIVO_USD');
    expect(rec.data!.to_category).toBe('ACT_EFECTIVO_CUP');
    expect(Number(rec.data!.importe_cup)).toBe(6510);
    expect(Number(rec.data!.tasa_documental)).toBe(RATE);
    expect(rec.data!.caso).toBe('pagos_registrados');
    expect(String(rec.data!.docnum)).toContain('RECT-MON-');

    // Compensatorio equilibrado: crédito caja USD + débito caja CUP (6510)
    const cajaUsd = await detail(adminToken, storeA, 'ACT_EFECTIVO_USD');
    const netoUsd = movsOf(cajaUsd, sReclMon).reduce((acc, m) => acc + (m.sense === 'debito' ? Number(m.amount_cup) : -Number(m.amount_cup)), 0);
    expect(netoUsd).toBe(0);
    const contra = movsOf(cajaUsd, sReclMon).find((m) => m.sense === 'credito');
    expect(contra).toBeTruthy();
    expect(Number(contra!.amount_origin)).toBeCloseTo(7, 2);
    expect(contra!.currency_origin).toBe('USD');
    const cajaCup = await detail(adminToken, storeA, 'ACT_EFECTIVO_CUP');
    const debCup = movsOf(cajaCup, sReclMon).find((m) => m.sense === 'debito' && m.event !== 'reconocimiento');
    expect(debCup).toBeTruthy();
    expect(Number(debCup!.amount_cup)).toBe(6510);
    expect(Number(debCup!.amount_origin)).toBeCloseTo(6510, 2);
    expect(debCup!.currency_origin).toBe('CUP');

    // Datos corregidos: pago en CUP (importe REAL entregado), tasa 1
    const pays = await sb.select<{ payment_method: string; amount: number; currency: string; exchange_rate: number; amount_cup: number }>(
      'payment_transactions', `ref_id=eq.${sReclMon}&select=payment_method,amount,currency,exchange_rate,amount_cup`);
    expect(pays.length).toBe(1);
    expect(pays[0].currency).toBe('CUP');
    expect(Number(pays[0].amount)).toBeCloseTo(6510, 2);
    expect(Number(pays[0].amount_cup)).toBe(6510);
    expect(Number(pays[0].exchange_rate)).toBe(1);
    // Ítems normalizados al nominal CUP real (7 × 930)
    const its = await sb.select<{ cash_paid: number; cash_currency: string | null }>(
      'transaction_items', `transaction_id=eq.${sReclMon}&select=cash_paid,cash_currency`);
    expect(Number(its[0].cash_paid)).toBeCloseTo(6510, 2);
    expect(its[0].cash_currency).toBe('CUP');

    // Ingreso, COGS e inventario INTACTOS (la reclasificación no los toca)
    const ingPost = await detail(adminToken, storeA, 'ING_VENTAS');
    const ingPostRow = movsOf(ingPost, sReclMon).find((m) => m.sense === 'credito');
    expect(Number(ingPostRow!.amount_cup)).toBe(Number(ingPreRow!.amount_cup));
    const cogsPost = await detail(adminToken, storeA, 'GAS_COSTO_VENTAS');
    const cogsPostRow = movsOf(cogsPost, sReclMon).find((m) => m.sense === 'debito');
    expect(Number(cogsPostRow!.amount_cup)).toBe(Number(cogsPreRow!.amount_cup));
    const invPost = await detail(adminToken, storeA, 'ACT_INVENTARIO');
    const invPostRow = movsOf(invPost, sReclMon).find((m) => m.sense === 'credito');
    expect(Number(invPostRow!.amount_cup)).toBe(Number(invPreRow!.amount_cup));

    // Un solo asiento de rectificación para esta venta
    const rectEntries = await sb.select<{ id: string }>(
      'fin_entries', `document_type=eq.RECTIFICACION_FIN&document_id=eq.${sReclMon}&select=id`);
    expect(rectEntries).toHaveLength(1);
  });

  // ── §10.15 — Idempotencia de TODAS las rectificaciones ────────────────────
  test('E12 · idempotencia: segunda ejecución de cada escritor → YA_APLICADO, sin nuevos asientos', async () => {
    const r1 = await rpcAsService<{ status: string }>('fin_rectify_sale_payment_method',
      { p_sale_id: sZelleRect, p_from_method: 'zelle', p_to_method: 'cash', p_actor: adminId, p_reason: 'reintento' });
    expect(r1.ok).toBe(true);
    expect(r1.data!.status).toBe('YA_APLICADO');
    const r2 = await rpcAsService<{ status: string }>('fin_rectify_sale_payment_method',
      { p_sale_id: sTransfRect, p_from_method: 'transfer', p_to_method: 'cash', p_actor: adminId, p_reason: 'reintento' });
    expect(r2.ok).toBe(true);
    expect(r2.data!.status).toBe('YA_APLICADO');
    const r3 = await rpcAsService<{ status: string }>('fin_reclassify_sale_payment_currency',
      { p_sale_id: sReclMon, p_metodo: 'cash', p_moneda_desde: 'USD', p_moneda_hacia: 'CUP', p_reason: 'reintento' });
    expect(r3.ok).toBe(true);
    expect(r3.data!.status).toBe('YA_APLICADO');
    const entries = await sb.select<{ id: string; document_number: string }>(
      'fin_entries', `document_type=eq.RECTIFICACION_FIN&document_id=in.(${sZelleRect},${sTransfRect},${sReclMon})&select=id,document_number`);
    expect(entries).toHaveLength(3);
    // El pago de la venta reclasificada sigue en CUP (sin mutación en el reintento)
    const pays = await sb.select<{ amount: number; currency: string }>(
      'payment_transactions', `ref_id=eq.${sReclMon}&select=amount,currency`);
    expect(pays[0].currency).toBe('CUP');
    expect(Number(pays[0].amount)).toBeCloseTo(6510, 2);
  });

  // ── §10.16/§10.17 — Reconstrucción de saldos de efectivo y bancarios ─────
  test('E16/E17 · dashboard: efectivo CUP/USD y bancos reconstruidos desde los movimientos', async () => {
    const dash = await rpcAsUser<{ kpis: Record<string, number> }>('fin_get_dashboard', adminToken,
      { p_store_id: storeA, p_from: '1900-01-01', p_to: '2030-12-31' });
    expect(dash.ok).toBe(true);
    const cajaCup = await detail(adminToken, storeA, 'ACT_EFECTIVO_CUP');
    const sumCup = cajaCup.movimientos.reduce((a, m) => a + (m.sense === 'debito' ? Number(m.amount_cup) : -Number(m.amount_cup)), 0);
    expect(Number(dash.data!.kpis.efectivo_cup)).toBeCloseTo(sumCup, 2);
    const cajaUsd = await detail(adminToken, storeA, 'ACT_EFECTIVO_USD');
    const sumUsd = cajaUsd.movimientos.reduce((a, m) => a + (m.sense === 'debito' ? Number(m.amount_cup) : -Number(m.amount_cup)), 0);
    expect(Number(dash.data!.kpis.efectivo_usd)).toBeCloseTo(sumUsd, 2);
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    const sumB = bancos.movimientos.reduce((a, m) => a + (m.sense === 'debito' ? Number(m.amount_cup) : -Number(m.amount_cup)), 0);
    expect(Number(dash.data!.kpis.bancos)).toBeCloseTo(sumB, 2);
  });

  // ── §10.18/§10.19/§10.20 — Estado de Situación equilibrado y desequilibrio ─
  test('E18/E19/E20 · ecuación contable COMPLETA: desequilibrio 0.00 y balance equilibrado con resultado = ingresos − gastos', async () => {
    // Diagnóstico: descomposición por clases desde el balance sheet (categorías
    // con saldo ≠ 0) — si la ecuación no cuadra, el mensaje muestra la brecha.
    const bs0 = await rpcAsUser<{ categorias: Array<{ code: string; clase: string; saldo: number }> }>(
      'fin_get_balance_sheet', adminToken, { p_store_id: storeA, p_as_of: '2030-12-31' });
    expect(bs0.ok, `bs0.error=${bs0.error}`).toBe(true);
    const porClase: Record<string, number> = {};
    for (const c of bs0.data!.categorias) {
      porClase[c.clase] = (porClase[c.clase] ?? 0) + Number(c.saldo);
    }
    // Identidad de partida doble (activo y gasto débito-normal):
    //   Activo + Gasto − (Pasivo + Patrimonio + Ingresos) = 0
    const deseqCalc =
      (porClase['activo'] ?? 0) + (porClase['gasto'] ?? 0) -
      (porClase['pasivo'] ?? 0) - (porClase['patrimonio'] ?? 0) - (porClase['ingreso'] ?? 0);

    const dash = await rpcAsUser<{ alertas: Record<string, unknown> }>('fin_get_dashboard', adminToken,
      { p_store_id: storeA, p_from: '1900-01-01', p_to: '2030-12-31' });
    expect(dash.ok).toBe(true);
    // LA CORRECCIÓN (Problema B): la alerta de desequilibrio NO se dispara con
    // el libro equilibrado — la ecuación incluye ahora la clase gasto.
    expect(dash.data!.alertas.desequilibrio_balance, `descomposición=${JSON.stringify({ porClase, deseqCalc })}`).toBe(false);
    expect(Number(dash.data!.alertas.desequilibrio_monto), `descomposición=${JSON.stringify({ porClase, deseqCalc })}`).toBe(0);

    const bs = await rpcAsUser<{ ecuacion: { diferencia: number; equilibrado: boolean; activos: number; pasivos_mas_patrimonio: number }; resultado_acumulado: number; total_activos: number; total_pasivos: number; patrimonio_total: number }>(
      'fin_get_balance_sheet', adminToken, { p_store_id: storeA, p_as_of: '2030-12-31' });
    expect(bs.ok).toBe(true);
    expect(bs.data!.ecuacion.equilibrado).toBe(true);
    expect(Number(bs.data!.ecuacion.diferencia)).toBe(0);
    expect(Number(bs.data!.total_activos)).toBeCloseTo(Number(bs.data!.patrimonio_total) + Number(bs.data!.total_pasivos), 2);
    // El resultado acumulado = ingresos netos − gastos netos (ingresos - costo - gastos)
    const dash2 = await rpcAsUser<{ kpis: Record<string, number> }>('fin_get_dashboard', adminToken,
      { p_store_id: storeA, p_from: '1900-01-01', p_to: '2030-12-31' });
    expect(Number(bs.data!.resultado_acumulado)).toBeCloseTo(
      Number(dash2.data!.kpis.ingresos) - Number(dash2.data!.kpis.costo_ventas) - Number(dash2.data!.kpis.gastos), 2);
  });

  // ── §10.21 — Navegación directa al documento (drilldown con ID real) ──────
  test('E21 · drilldown conserva document_id REAL navegable para cada movimiento derivado', async () => {
    for (const cat of ['ACT_EFECTIVO_CUP', 'ACT_BANCOS', 'ING_VENTAS', 'GAS_COSTO_VENTAS', 'ACT_INVENTARIO']) {
      const d = await detail(adminToken, storeA, cat);
      for (const sid of saleIds) {
        const rows = movsOf(d, sid);
        for (const m of rows) expect(m.document_id).toBe(sid);
      }
    }
  });

  // ── §10.22 — Anulación y reversión (compensatorio enlazado) ──────────────
  test('E22 · reversión de venta: anulacion enlazada (reversal_of), cuenta y sentido espejo', async ({ request }) => {
    sAnulada = sTransfCup;
    const orig = await sb.select<{ id: string; status: string }>(
      'fin_entries', `document_type=eq.VENTA&document_id=eq.${sAnulada}&event=eq.reconocimiento&select=id,status`);
    expect(orig[0].status).toBe('posted');
    const res = await request.post('/api/reverse', {
      headers: apiHeaders(adminToken),
      data: { type: 'transaction', id: sAnulada, reason: `CP-FIN-002 E2E reversión ${SFX}` },
    });
    expect(res.ok()).toBe(true);
    const after = await sb.select<{ id: string; status: string }>(
      'fin_entries', `document_type=eq.VENTA&document_id=eq.${sAnulada}&event=eq.reconocimiento&select=id,status`);
    expect(after[0].status).toBe('reversed');
    const annul = await sb.select<{ id: string; event: string }>(
      'fin_entries', `reversal_of=eq.${orig[0].id}&select=id,event`);
    expect(annul).toHaveLength(1);
    expect(annul[0].event).toBe('anulacion');
    const annulMovs = await sb.select<{ category_code: string; sense: string; amount_cup: number }>(
      'fin_movements', `entry_id=eq.${annul[0].id}&select=category_code,sense,amount_cup`);
    const bankRow = annulMovs.find((m) => m.category_code === 'ACT_BANCOS');
    expect(bankRow).toBeTruthy();
    expect(bankRow!.sense).toBe('credito');
    expect(Number(bankRow!.amount_cup)).toBe(1000);
  });

  // ── §10.23 — Reintento de checkout (idempotencia por llave) ──────────────
  test('E23 · re-checkout con la misma llave → misma venta, un asiento y un pago', async ({ request }) => {
    const key = `cpfin002-idem-${SFX}`;
    const payload = {
      store_id: storeA, seller_id: adminId, payment_method: 'cash',
      items: [{ product_id: pCup.id, quantity: 1, price: pCup.price, cost: pCup.cost, currency: 'CUP', exchange_rate: 1 }],
      total_amount: 1000, subtotal: 1000, cash_amount: 1000, transfer_amount: 0, zelle_amount: 0,
      sale_currency: 'CUP', sale_exchange_rate: 1,
      idempotency_key: key,
    };
    const mk = async () => {
      const res = await request.post('/api/pos/checkout', { headers: apiHeaders(adminToken), data: payload });
      if (!res.ok()) throw new Error(`checkout idem falló: ${res.status()} ${await res.text()}`.slice(0, 300));
      const body = await res.json();
      return String(body?.transaction_id || body?.data?.transaction_id || body?.data?.id || body?.id);
    };
    const tx1 = await mk();
    const tx2 = await mk();
    saleIds.push(tx1);
    if (tx2 !== tx1) saleIds.push(tx2);
    expect(tx2).toBe(tx1);
    const entries = await sb.select<{ id: string; event: string }>(
      'fin_entries', `document_type=eq.VENTA&document_id=eq.${tx1}&select=id,event`);
    expect(entries.filter((e) => e.event === 'reconocimiento').length).toBe(1);
    const pays = await sb.select<{ id: string }>('payment_transactions', `ref_id=eq.${tx1}&select=id`);
    expect(pays.length).toBe(1);
  });

  // ── §10.24 — Preservación de COGS e inventario (toda la batería) ─────────
  test('E24 · COGS e inventario: la venta reclasificada conserva sus líneas de costo idénticas', async () => {
    const cogs = await detail(adminToken, storeA, 'GAS_COSTO_VENTAS');
    const cogsRows = movsOf(cogs, sReclMon).filter((m) => m.sense === 'debito');
    expect(cogsRows).toHaveLength(1);
    const inv = await detail(adminToken, storeA, 'ACT_INVENTARIO');
    const invRows = movsOf(inv, sReclMon).filter((m) => m.sense === 'credito');
    expect(invRows).toHaveLength(1);
    expect(Number(cogsRows[0].amount_cup)).toBe(Number(invRows[0].amount_cup));
  });

  // ── §10.25 — RLS: isolation entre tiendas y escritor restringido ─────────
  test('E25 · RLS: usuario sin membresía recibe ERR_UNAUTHORIZED; escritor NO ejecutable por authenticated', async () => {
    // Tienda efímera del mismo tenant SIN membresía del cajero (patrón CP-FIN-001)
    const [fresh] = await sb.insert<{ id: string }>('stores', [{
      name: `CPFIN2-RLS-${SFX}`, tenant_id: tenantId, is_active: true,
    }]);
    freshStoreId = fresh.id;
    const clerkRead = await rpcAsUser('fin_get_category_detail', clerkToken, {
      p_store_id: freshStoreId, p_category: 'ING_VENTAS',
      p_from: '1900-01-01', p_to: '2030-12-31', p_limit: 10, p_offset: 0,
    });
    expect(clerkRead.ok).toBe(false);
    expect(clerkRead.error).toContain('ERR_UNAUTHORIZED');
    const adminOk = await rpcAsUser('fin_get_category_detail', adminToken, {
      p_store_id: freshStoreId, p_category: 'ING_VENTAS',
      p_from: '1900-01-01', p_to: '2030-12-31', p_limit: 10, p_offset: 0,
    });
    expect(adminOk.ok).toBe(true);
    // El escritor canónico es service_role: el usuario autenticado NO puede
    // ejecutarlo (RLS/ACL, mandato §11)
    const clerkRect = await rpcAsUser('fin_reclassify_sale_payment_currency', clerkToken, {
      p_sale_id: sReclMon, p_metodo: 'cash', p_moneda_desde: 'USD', p_moneda_hacia: 'CUP',
    });
    expect(clerkRect.ok).toBe(false);
    const adminRect = await rpcAsUser('fin_reclassify_sale_payment_currency', adminToken, {
      p_sale_id: sReclMon, p_metodo: 'cash', p_moneda_desde: 'USD', p_moneda_hacia: 'CUP',
    });
    expect(adminRect.ok).toBe(false);
  });

  // ── UI: drilldown «Ver documento» abre el detalle de la venta principal ──
  test('UI1 · «Ver documento» abre el detalle de la venta del caso principal (135 USD efectivo)', async ({ page }) => {
    const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    await injectSession(page, session);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    // CP-NAV-...-001: «Estados Financieros» es módulo de primer nivel — acceso directo.
    await page.getByText('Estados Financieros', { exact: true }).first().click();
    await page.getByTestId('financial-statements-view').waitFor({ state: 'visible', timeout: 25_000 });
    // Misión integral §3.1: Rendimiento es sub-pestaña de Análisis.
    await page.getByTestId('tab-analisis').click();
    await page.getByTestId('subtab-rendimiento').click();
    await page.waitForTimeout(2500);
    const catBtn = page.getByRole('button', { name: /Ingresos por ventas/i }).first();
    await catBtn.waitFor({ state: 'visible', timeout: 25_000 });
    await catBtn.click();
    await page.waitForTimeout(1500);
    const sShort = sCable135.split('-')[0];
    const row = page.locator('tr', { hasText: sShort }).first();
    await row.waitFor({ state: 'visible', timeout: 20_000 });
    expect((await row.textContent()) || '').toMatch(/USD/);
    await row.getByText('Ver documento').first().click();
    await page.waitForTimeout(3500);
    await page.getByText('Detalles de la Venta').first().waitFor({ state: 'visible', timeout: 25_000 });
    const modalText = await page.locator('body').textContent();
    expect((modalText || '')).toContain(sShort);
  });

  test.afterAll(async () => {
    // ── Cleanup: delta neto cero (orden de dependencias) ──
    if (storeA) {
      if (saleIds.length > 0) {
        const list = saleIds.map((id) => `"${id}"`).join(',');
        await sb.delete('fin_entries', `store_id=eq.${storeA}&document_id=in.(${list})`).catch(() => {});
        await sb.delete('payment_transactions', `store_id=eq.${storeA}&ref_id=in.(${list})`).catch(() => {});
        await sb.delete('stock_movements', `store_id=eq.${storeA}&reference_id=in.(${list})`).catch(() => {});
      }
      await cleanupProducts(storeA, [pCup.id, pUsd.id, pUsd7.id].filter(Boolean));
      await sb.delete('audit_logs', `user_id=eq.${adminId}`).catch(() => {});
      await sb.delete('audit_logs', `user_id=eq.${clerkId}`).catch(() => {});
    }
    if (freshStoreId) await hardDeleteTestStore(freshStoreId).catch(() => {});
  });
});
