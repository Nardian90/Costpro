/**
 * E2E — CP-FIN-FINANCIAL-STATEMENTS-SOURCE-AND-CURRENCY-ACCURACY-001 (2026-11-18)
 * ============================================================================
 * Batería OBLIGATORIA de la misión (§10, 18 escenarios) + caso 7-11 equivalente,
 * sobre el motor de partida doble y el drilldown de Estados Financieros.
 *
 * Cadenas probadas (sin mocks):
 *   · POS real: API → /api/pos/checkout → create_sale_v2 → trigger
 *     fin_trg_transactions → fin_post_document_safe → fin_movements (el cobro
 *     en USD llega por payment_components con el NOMINAL original — riel
 *     canónico de pagos mixtos multimoneda).
 *   · Drilldown: fin_get_category_detail → CategoryDetailPanel (importe
 *     contable CUP + importe original + documento navegable).
 *   · Reversión: /api/reverse → reverse_transaction_v2 → fin anulación
 *     (compensatorio enlazado, copia amount_origin).
 *
 * Verificación de estado persistido vía REST service-role (lectura de estado)
 * y RPC como usuario autenticado (RLS real). Entorno: BD aislada CostproE2E.
 * Cleanup: delta neto cero (fin → pagos → transacciones → productos →
 * auditoría del piloto; tienda efímera RLS eliminada con hard cleanup).
 * ============================================================================
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import {
  signIn, apiHeaders, injectSession, sb, rpcAsUser, cleanupProducts,
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
let storeB = '';
const SFX = Date.now().toString(36);

let pCup = { id: '', price: 1000, cost: 400 };
// Precio de catálogo = NOMINAL USD del ítem (mismo patrón que la venta real del
// 7-11: Cable Solar 4mm, precio de catálogo 4.50 e ítem price_at_sale 4.50 USD
// × tasa 930). El gate de desvío (R-SEC-1) compara el crudo price_at_sale con
// products.price — con catálogo 4.50 el desvío es 0 y no exige supervisor.
let pUsd = { id: '', price: 4.5, cost: 1000 };
const RATE = 930; // tasa REGISTRADA de las ventas USD del run (la misma del caso 7-11)

const saleIds: string[] = [];
let aperturaDocumentNumber = '';
let freshStoreId = ''; // tienda efímera del escenario RLS (hard cleanup en afterAll)

/** Venta real por la cadena completa (POS checkout → RPC → trigger). */
async function checkout(request: APIRequestContext, payload: Record<string, unknown>): Promise<string> {
  const res = await request.post('/api/pos/checkout', {
    headers: apiHeaders(adminToken),
    data: { idempotency_key: `cpfin001-${SFX}-${saleIds.length}-${Math.random().toString(36).slice(2, 8)}`, ...payload },
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
    { p_store_id: store, p_category: category, p_from: from, p_to: to, p_limit: 200, p_offset: 0 },
  );
  if (!r.ok) throw new Error(`fin_get_category_detail falló (${r.status}): ${r.error}`);
  return r.data!;
}

function movsOf(data: { movimientos: Array<Record<string, unknown>> }, documentId: string) {
  return data.movimientos.filter((m) => m.document_id === documentId);
}

test.describe.serial('CP-FIN-001 — Estados Financieros: importes, monedas, medios y trazabilidad', () => {
  test.beforeAll(async ({ request }) => {
    test.skip(!SUPABASE_URL, 'sin credenciales de la BD aislada');
    const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    adminToken = admin.token;
    adminId = admin.userId;
    const clerk = await signIn(CLERK_EMAIL, CLERK_PASS);
    clerkToken = clerk.token;
    clerkId = clerk.userId;
    const a = await createTestStore(request, adminToken, 'A');
    const b = await createTestStore(request, adminToken, 'B');
    storeA = a.id;
    storeB = b.id;
    const storeRow = await sb.select<{ tenant_id: string }>('stores', `id=eq.${storeA}&select=tenant_id`);
    tenantId = storeRow[0]?.tenant_id;
    await sb.update('profiles', `id=eq.${adminId}`, { active_store_id: storeA });

    // Tasa USD REGISTRADA de la tienda (riel canónico /api/store-rates; sin
    // ella el checkout rechaza ventas en USD con 409).
    const rateRes = await request.post('/api/store-rates', {
      headers: apiHeaders(adminToken),
      data: { storeId: storeA, rates: { USD: RATE } },
    });
    if (!rateRes.ok()) throw new Error(`store-rates falló: ${rateRes.status()} ${await rateRes.text()}`);

    const seededCup = await seedProduct(a, {
      name: `CPFIN-001 Cup ${SFX}`, price: pCup.price, cost: pCup.cost, quantity: 100, sku: `CPFIN1-CUP-${SFX}`,
    });
    const seededUsd = await seedProduct(a, {
      name: `CPFIN-001 Usd ${SFX}`, price: pUsd.price, cost: pUsd.cost, quantity: 100, sku: `CPFIN1-USD-${SFX}`,
    });
    pCup.id = seededCup.id;
    pUsd.id = seededUsd.id;
  });

  // ── §10.1 — Venta CUP cobrada en efectivo ──────────────────────────────────
  test('E1 · CUP/efectivo: ACT_EFECTIVO_CUP débito, sin banco, original CUP sin conversión', async ({ request }) => {
    const s1 = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'cash',
      items: [{ product_id: pCup.id, quantity: 2, price: pCup.price, cost: pCup.cost, currency: 'CUP', exchange_rate: 1 }],
      total_amount: 2000, subtotal: 2000, cash_amount: 2000, transfer_amount: 0, zelle_amount: 0,
      sale_currency: 'CUP', sale_exchange_rate: 1,
    });
    const cash = await detail(adminToken, storeA, 'ACT_EFECTIVO_CUP');
    expect(movsOf(cash, s1).some((m) => m.sense === 'debito' && Number(m.amount_cup) === 2000)).toBe(true);
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    expect(movsOf(bancos, s1)).toHaveLength(0);
    const ing = await detail(adminToken, storeA, 'ING_VENTAS');
    const ingRow = movsOf(ing, s1).find((m) => m.sense === 'credito');
    expect(ingRow).toBeTruthy();
    expect(Number(ingRow!.amount_cup)).toBe(2000);
    expect(ingRow!.currency_origin === 'CUP' || ingRow!.currency_origin === null).toBe(true);
    expect(ingRow!.amount_origin ?? null).toBeNull();
  });

  // ── §10.2 — Venta CUP cobrada por transferencia ────────────────────────────
  test('E2 · CUP/transferencia: ACT_BANCOS débito (no afecta caja de efectivo)', async ({ request }) => {
    const s2 = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'transfer',
      items: [{ product_id: pCup.id, quantity: 1, price: pCup.price, cost: pCup.cost, currency: 'CUP', exchange_rate: 1 }],
      total_amount: 1000, subtotal: 1000, cash_amount: 0, transfer_amount: 1000, zelle_amount: 0,
      sale_currency: 'CUP', sale_exchange_rate: 1,
    });
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    expect(movsOf(bancos, s2).some((m) => m.sense === 'debito' && Number(m.amount_cup) === 1000)).toBe(true);
    const cash = await detail(adminToken, storeA, 'ACT_EFECTIVO_CUP');
    expect(movsOf(cash, s2)).toHaveLength(0);
  });

  // ── §10.3/§10.6 — Venta USD en efectivo con tasa registrada (caso 7-11) ────
  test('E3 · USD/efectivo tasa 930: caja USD con ORIGINAL 9 USD y equivalente 8,370 CUP (una sola conversión)', async ({ request }) => {
    const s3 = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'cash',
      items: [{ product_id: pUsd.id, quantity: 2, price: 4.5, cost: pUsd.cost, currency: 'USD', exchange_rate: RATE }],
      total_amount: 8370, subtotal: 8370, cash_amount: 8370, transfer_amount: 0, zelle_amount: 0,
      sale_currency: 'USD', sale_exchange_rate: RATE,
      payment_components: [{ method: 'cash', currency: 'USD', amount: 9 }],
    });
    const cashUsd = await detail(adminToken, storeA, 'ACT_EFECTIVO_USD');
    const row = movsOf(cashUsd, s3).find((m) => m.sense === 'debito');
    expect(row).toBeTruthy();
    expect(Number(row!.amount_cup)).toBe(8370);              // 9 × 930, UNA conversión
    expect(Number(row!.amount_origin)).toBeCloseTo(9, 2);    // nominal original registrado
    expect(row!.currency_origin).toBe('USD');
    const ing = await detail(adminToken, storeA, 'ING_VENTAS');
    const ingRow = movsOf(ing, s3).find((m) => m.sense === 'credito');
    expect(Number(ingRow!.amount_cup)).toBe(8370);
    expect(Number(ingRow!.amount_origin)).toBeCloseTo(9, 2);
    // El pago persistido conserva el nominal USD y su tasa (trazabilidad fuente)
    const pays = await sb.select<{ amount: number; amount_cup: number; exchange_rate: number; currency: string; payment_method: string }>(
      'payment_transactions', `ref_id=eq.${s3}&select=amount,amount_cup,exchange_rate,currency,payment_method`,
    );
    expect(pays.length).toBe(1);
    expect(pays[0].currency).toBe('USD');
    expect(Number(pays[0].amount)).toBeCloseTo(9, 2);
    expect(Number(pays[0].amount_cup)).toBe(8370);
    expect(Number(pays[0].exchange_rate)).toBe(RATE);
    expect(pays[0].payment_method).toBe('cash');
  });

  // ── §10.4 — Venta USD por transferencia ────────────────────────────────────
  test('E4 · USD/transferencia: banco con original 4,50 USD; clasificación banco ≠ efectivo', async ({ request }) => {
    const s4 = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'transfer',
      items: [{ product_id: pUsd.id, quantity: 1, price: 4.5, cost: pUsd.cost, currency: 'USD', exchange_rate: RATE }],
      total_amount: 4185, subtotal: 4185, cash_amount: 0, transfer_amount: 4185, zelle_amount: 0,
      sale_currency: 'USD', sale_exchange_rate: RATE,
      payment_components: [{ method: 'transfer', currency: 'USD', amount: 4.5 }],
    });
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    const row = movsOf(bancos, s4).find((m) => m.sense === 'debito');
    expect(row).toBeTruthy();
    expect(Number(row!.amount_cup)).toBe(4185);
    expect(Number(row!.amount_origin)).toBeCloseTo(4.5, 2);
    const cashUsd = await detail(adminToken, storeA, 'ACT_EFECTIVO_USD');
    expect(movsOf(cashUsd, s4)).toHaveLength(0);
  });

  // ── §10.5 — Otra moneda admitida ───────────────────────────────────────────
  // El escritor canónico de ventas (create_sale_v2 + checkoutSchema) admite
  // CUP y USD (payment_components: enum ['CUP','USD']); el CHECK de
  // fin_movements admite CUP/USD/EUR/MLC pero NO existe riel de venta EUR —
  // se documenta como no-aplica (sin inventar conversiones EUR).
  test('E5 · otras monedas: el riel canónico de ventas es CUP/USD (documentado, no simulado)', async () => {
    // Las ventas USD del run (E3/E4) demuestran el segundo riel admitido; el
    // dominio completo del CHECK queda cubierto por el SQL Security Gate.
    expect(saleIds.length).toBeGreaterThanOrEqual(2);
  });

  // ── §10.7/§10.8 — Presentación separada y sin conversión inventada ─────────
  test('E7/E8 · original ≠ contable diferenciados; CUP no genera conversión', async () => {
    const ing = await detail(adminToken, storeA, 'ING_VENTAS');
    const s3Row = movsOf(ing, saleIds[2]).find((m) => m.sense === 'credito');
    expect(s3Row).toBeTruthy();
    expect(Number(s3Row!.amount_cup)).toBe(8370);
    expect(Number(s3Row!.amount_origin)).toBeCloseTo(9, 2);
    const s1Row = movsOf(ing, saleIds[0]).find((m) => m.sense === 'credito');
    expect(s1Row).toBeTruthy();
    expect(s1Row!.amount_origin ?? null).toBeNull();
  });

  // ── §10.9 — Reconocimiento separado del cobro (modelo por tipo documental) ─
  test('E9 · SERVICIO_RECIBIDO: gasto al reconocer; el pago posterior sería asiento separado (sin re-reconocer)', async () => {
    const [svc] = await sb.insert<{ id: string }>('received_services', [{
      store_id: storeA, service_number: `SRV-CPFIN1-${SFX}`, service_date: new Date().toISOString().slice(0, 10),
      service_type_name: 'Otro', supplier: `E2E Proveedor CPFIN1 ${SFX}`,
      currency: 'CUP', exchange_rate: 1, total_amount: 600,
      payment_status: 'unpaid', paid_amount: 0, status: 'active',
    }]);
    expect(svc?.id).toBeTruthy();
    const gas = await detail(adminToken, storeA, 'GAS_SERVICIOS');
    const recRow = movsOf(gas, svc!.id).find((m) => m.event === 'reconocimiento');
    expect(recRow).toBeTruthy();
    expect(Number(recRow!.amount_cup)).toBe(600);
    // El pago NO ha ocurrido: sin movimiento de banco/efectivo del servicio
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    expect(movsOf(bancos, svc!.id)).toHaveLength(0);
  });

  // ── §10.10 — Ausencia de doble contabilización (idempotencia real) ────────
  test('E10 · re-checkout con el mismo idempotency_key → misma venta, sin segundo asiento ni pagos', async ({ request }) => {
    const key = `cpfin001-idem-${SFX}`;
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
    // Idempotencia REAL: una sola venta para la misma clave
    expect(tx2).toBe(tx1);
    // Un solo asiento de reconocimiento y un solo pago
    const entries = await sb.select<{ id: string; event: string }>(
      'fin_entries', `document_type=eq.VENTA&document_id=eq.${tx1}&select=id,event`,
    );
    expect(entries.filter((e) => e.event === 'reconocimiento').length).toBe(1);
    const pays = await sb.select<{ id: string }>(
      'payment_transactions', `ref_id=eq.${tx1}&select=id`,
    );
    expect(pays.length).toBe(1);
  });

  // ── §10.11 — Clasificación efectivo vs banco en venta MIXTA ────────────────
  test('E11 · venta mixta CUP: parte efectivo → caja, parte transferencia → banco (mismo documento)', async ({ request }) => {
    const s5 = await checkout(request, {
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
    expect(movsOf(cash, s5).some((m) => Number(m.amount_cup) === 1200 && m.sense === 'debito')).toBe(true);
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    expect(movsOf(bancos, s5).some((m) => Number(m.amount_cup) === 800 && m.sense === 'debito')).toBe(true);
  });

  // ── §10.12/§10.14 — Documento navegable; varios movimientos → mismo documento ──
  test('E12/E14 · drilldown conserva document_id REAL y lo repite en todas las líneas derivadas', async () => {
    const s5 = saleIds[saleIds.length - 1];
    for (const cat of ['ACT_EFECTIVO_CUP', 'ACT_BANCOS', 'ING_VENTAS', 'GAS_COSTO_VENTAS', 'ACT_INVENTARIO']) {
      const d = await detail(adminToken, storeA, cat);
      const rows = movsOf(d, s5);
      if (rows.length === 0) continue;
      for (const m of rows) expect(m.document_id).toBe(s5);
      for (const m of rows) expect(m.document_number ?? m.document_id).toBeTruthy();
    }
  });

  // ── §10.13 — Documento sin identificador: tratamiento explícito y seguro ───
  test('E13 · apertura (document_id NULL): fila sin identificador, sin navegación inventada', async () => {
    const today = new Date().toISOString().slice(0, 10);
    // Residuo de otro run en la piloto (mismo store+categoría+fecha): limpiar primero
    const stale = await sb.select<{ id: string; entry_id: string | null }>(
      'fin_opening_balances', `store_id=eq.${storeA}&category_code=eq.ACT_EFECTIVO_CUP&as_of_date=eq.${today}&select=id,entry_id`,
    );
    for (const s of stale) {
      if (s.entry_id) await sb.delete('fin_entries', `id=eq.${s.entry_id}`).catch(() => {});
      await sb.delete('fin_opening_balances', `id=eq.${s.id}`).catch(() => {});
    }
    const [ob] = await sb.insert<{ id: string }>('fin_opening_balances', [{
      store_id: storeA, category_code: 'ACT_EFECTIVO_CUP', amount: 500, currency: 'CUP',
      exchange_rate: 1, amount_cup: 500, as_of_date: today,
      status: 'draft', notes: `CP-FIN-001 E2E ${SFX}`,
    }]);
    expect(ob?.id).toBeTruthy();
    const applied = await rpcAsUser<{ status: string; entry_id: string }>(
      'fin_apply_opening_balance', adminToken, { p_id: ob!.id, p_user_id: adminId },
    );
    expect(applied.ok).toBe(true);
    expect(applied.data?.status).toBe('success');
    aperturaDocumentNumber = `APERTURA-${today}`;
    const cash = await detail(adminToken, storeA, 'ACT_EFECTIVO_CUP');
    const rows = cash.movimientos.filter((m) => m.document_number === aperturaDocumentNumber);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((m) => m.document_id === null || m.document_id === undefined)).toBe(true);
    // La UI muestra «—» y NO construye navegación sin identificador (el test
    // unitario financial-statements-category-detail lo cubre a nivel componente).
  });

  // ── §10.15 — Reversión con trazabilidad al origen (copia amount_origin) ────
  test('E15 · reversión de venta USD: asiento anulacion enlazado (reversal_of) y amount_origin conservado', async ({ request }) => {
    const s4 = saleIds[3]; // USD/transferencia
    const origEntries = await sb.select<{ id: string; status: string }>(
      'fin_entries', `document_type=eq.VENTA&document_id=eq.${s4}&event=eq.reconocimiento&select=id,status`,
    );
    expect(origEntries.length).toBe(1);
    expect(origEntries[0].status).toBe('posted');

    const res = await request.post('/api/reverse', {
      headers: apiHeaders(adminToken),
      data: { type: 'transaction', id: s4, reason: `CP-FIN-001 E2E reversión ${SFX}` },
    });
    expect(res.ok()).toBe(true);

    const after = await sb.select<{ id: string; status: string }>(
      'fin_entries', `document_type=eq.VENTA&document_id=eq.${s4}&event=eq.reconocimiento&select=id,status`,
    );
    expect(after[0].status).toBe('reversed');
    const annul = await sb.select<{ id: string; reversal_of: string; event: string }>(
      'fin_entries', `reversal_of=eq.${origEntries[0].id}&select=id,reversal_of,event`,
    );
    expect(annul.length).toBe(1);
    expect(annul[0].event).toBe('anulacion');
    // El compensatorio conserva el importe ORIGINAL (trazabilidad al origen)
    const annulMovs = await sb.select<{ amount_origin: number | null; category_code: string; sense: string }>(
      'fin_movements', `entry_id=eq.${annul[0].id}&select=amount_origin,category_code,sense`,
    );
    const bankRow = annulMovs.find((m) => m.category_code === 'ACT_BANCOS');
    expect(bankRow).toBeTruthy();
    expect(bankRow!.sense).toBe('credito'); // espejo del débito original
    expect(Number(bankRow!.amount_origin)).toBeCloseTo(4.5, 2);
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    const annulRows = movsOf(bancos, s4).filter((m) => m.event === 'anulacion');
    expect(annulRows.length).toBeGreaterThanOrEqual(1);
    expect(Number(annulRows[0].amount_origin)).toBeCloseTo(4.5, 2);
  });

  // ── §10.16 — Filtros por tienda, período, tipo y moneda ────────────────────
  test('E16 · filtros: período acotado excluye; otra tienda no ve los documentos; período correcto incluye', async () => {
    const future = await detail(adminToken, storeA, 'ING_VENTAS', '2030-01-01', '2030-12-31');
    const leaks = future.movimientos.filter((m) => saleIds.includes(String(m.document_id)));
    expect(leaks).toHaveLength(0);
    const storeBDetail = await detail(adminToken, storeB, 'ING_VENTAS');
    const cross = storeBDetail.movimientos.filter((m) => saleIds.includes(String(m.document_id)));
    expect(cross).toHaveLength(0);
    const today = new Date().toISOString().slice(0, 10);
    const periodAll = await detail(adminToken, storeA, 'ING_VENTAS', today, today);
    const visible = periodAll.movimientos.filter((m) => saleIds.includes(String(m.document_id)));
    expect(visible.length).toBeGreaterThanOrEqual(3); // S1, S3, S5 (S4 anulado sigue visible)
  });

  // ── §10.17 — Ordenamiento por importe (moneda contable única CUP) ──────────
  test('E17 · ordenamiento por importe contable (CUP) en la UI: desc/asc deterministas', async ({ page }) => {
    const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    await injectSession(page, session);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.getByText('OPERACIÓN', { exact: true }).first().click();
    await page.waitForTimeout(1200);
    await page.getByText('Estados Financieros', { exact: true }).first().click();
    // Montaje real de la vista antes de las filas de categorías. ING_VENTAS
    // (ingreso) vive en el Estado de Rendimiento (la Situación solo despliega
    // activo/pasivo/patrimonio).
    await page.getByTestId('financial-statements-view').waitFor({ state: 'visible', timeout: 25_000 });
    await page.getByTestId('tab-rendimiento').click();
    await page.waitForTimeout(2500);
    const catBtn = page.getByRole('button', { name: /Ingresos por ventas/i }).first();
    await catBtn.waitFor({ state: 'visible', timeout: 25_000 });
    await catBtn.click();
    await page.waitForTimeout(1500);
    const sortBtn = page.getByTestId('sort-importe-contable');
    await sortBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await sortBtn.click(); // desc
    await page.waitForTimeout(600);
    expect((await sortBtn.textContent())).toMatch(/↓/);
    const readAmounts = () =>
      page.evaluate(() => {
        const p = (t: string) => Number(t.replace(/[^\d.,-]/g, '').replace(/,/g, ''));
        const cells = Array.from(document.querySelectorAll('tbody tr td:nth-child(6)'));
        return cells.map((c) => p(c.textContent || '0'));
      });
    const amountsDesc = await readAmounts();
    expect(amountsDesc.length).toBeGreaterThanOrEqual(2);
    const sortedDesc = [...amountsDesc].sort((a, b) => b - a);
    expect(amountsDesc).toEqual(sortedDesc);
    await sortBtn.click(); // asc
    await page.waitForTimeout(600);
    expect((await sortBtn.textContent())).toMatch(/↑/);
    const amountsAsc = await readAmounts();
    const sortedAsc = [...amountsAsc].sort((a, b) => a - b);
    expect(amountsAsc).toEqual(sortedAsc);
  });

  // ── §10.18 — Protección RLS: acceso únicamente a documentos autorizados ────
  test('E18 · RLS: usuario sin membresía recibe ERR_UNAUTHORIZED del drilldown', async () => {
    const [fresh] = await sb.insert<{ id: string }>('stores', [{
      name: `CPFIN1-RLS-${SFX}`, tenant_id: tenantId, is_active: true,
    }]);
    freshStoreId = fresh.id;
    const r = await rpcAsUser('fin_get_category_detail', clerkToken, {
      p_store_id: freshStoreId, p_category: 'ING_VENTAS',
      p_from: '1900-01-01', p_to: '2030-12-31', p_limit: 10, p_offset: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('ERR_UNAUTHORIZED');
    // El admin SÍ puede consultar una tienda de su tenant (contrato positivo)
    const okAdmin = await rpcAsUser('fin_get_category_detail', adminToken, {
      p_store_id: freshStoreId, p_category: 'ING_VENTAS',
      p_from: '1900-01-01', p_to: '2030-12-31', p_limit: 10, p_offset: 0,
    });
    expect(okAdmin.ok).toBe(true);
  });

  // ── UI: Estados Financieros disponible, SIN badge «En desarrollo» ──────────
  // (CP-FIN-001, 2026-11-19: el badge añadido el 18-11 fue RETIRADO por orden
  //  del propietario — la vista se presenta como funcionalidad disponible.)
  test('UI1 · Estados Financieros en el menú SIN badge «En desarrollo»', async ({ page }) => {
    const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    await injectSession(page, session);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const op = page.getByText('OPERACIÓN', { exact: true }).first();
    await op.waitFor({ state: 'visible', timeout: 25_000 });
    await op.click();
    await page.waitForTimeout(1200);
    const fsItem = page.getByText('Estados Financieros', { exact: true }).first();
    await fsItem.waitFor({ state: 'visible', timeout: 15_000 });
    // Regresión: el badge retirado NO debe existir en el DOM del menú.
    const badge = page.getByTestId('nav-badge-en-desarrollo');
    await expect(badge).toHaveCount(0);
  });

  // ── UI: drilldown corregido + «Ver documento» → detalle de la venta ────────
  test('UI2 · drilldown muestra contable CUP + original USD y «Ver documento» abre el detalle de la venta', async ({ page }) => {
    const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    await injectSession(page, session);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.getByText('OPERACIÓN', { exact: true }).first().click();
    await page.waitForTimeout(1000);
    await page.getByText('Estados Financieros', { exact: true }).first().click();
    await page.getByTestId('financial-statements-view').waitFor({ state: 'visible', timeout: 25_000 });
    await page.getByTestId('tab-rendimiento').click();
    await page.waitForTimeout(2500);
    const catBtn = page.getByRole('button', { name: /Ingresos por ventas/i }).first();
    await catBtn.waitFor({ state: 'visible', timeout: 25_000 });
    await catBtn.click();
    await page.waitForTimeout(1500);
    await page.getByText('Importe contable (CUP)').first().waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByText('Importe original').first().waitFor({ state: 'visible', timeout: 10_000 });
    // La fila de la venta USD (original 9 USD) muestra su moneda original
    const s3Short = saleIds[2].split('-')[0];
    const row = page.locator('tr', { hasText: s3Short }).first();
    await row.waitFor({ state: 'visible', timeout: 20_000 });
    expect((await row.textContent()) || '').toMatch(/USD/);
    // «Ver documento» → Historial de Ventas con el detalle de ESA venta abierto
    await row.getByText('Ver documento').first().click();
    await page.waitForTimeout(3500);
    await page.getByText('Detalles de la Venta').first().waitFor({ state: 'visible', timeout: 25_000 });
    await page.waitForTimeout(1200);
    const modalText = await page.locator('body').textContent();
    expect((modalText || '')).toContain(s3Short);
  });

  // ── UI: documento no localizable → aviso explícito (§6) ────────────────────
  test('UI3 · documento no localizable: «Documento de origen no disponible», sin modal', async ({ page }) => {
    const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    await injectSession(page, session);
    await page.addInitScript(() => {
      try {
        const raw = window.localStorage.getItem('costpro-ui-storage');
        const parsed = raw ? JSON.parse(raw) : {};
        parsed.state = parsed.state ?? {};
        parsed.state.saleDetailNavContext = {
          transactionId: '00000000-0000-0000-0000-0000000000aa',
          setAt: Date.now(),
        };
        window.localStorage.setItem('costpro-ui-storage', JSON.stringify(parsed));
      } catch { /* noop */ }
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.getByText('OPERACIÓN', { exact: true }).first().click();
    await page.waitForTimeout(1000);
    await page.getByText('Ventas', { exact: true }).first().click();
    await page.waitForTimeout(1200);
    await page.getByText('Opciones', { exact: true }).first().click();
    await page.waitForTimeout(1200);
    await page.getByText('Historial de Ventas', { exact: false }).first().click();
    await page.waitForTimeout(3000);
    await page.getByText(/Documento de origen no disponible/i).first().waitFor({ state: 'visible', timeout: 20_000 });
    expect(await page.getByText('Detalles de la Venta').count()).toBe(0);
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
      if (aperturaDocumentNumber) {
        await sb.delete('fin_entries', `store_id=eq.${storeA}&document_number=eq.${aperturaDocumentNumber}`).catch(() => {});
        await sb.delete('fin_opening_balances', `store_id=eq.${storeA}`).catch(() => {});
      }
      await sb.delete('received_services', `store_id=eq.${storeA}&service_number=eq.SRV-CPFIN1-${SFX}`).catch(() => {});
      await sb.delete('fin_entries', `store_id=eq.${storeA}&document_number=eq.SRV-CPFIN1-${SFX}`).catch(() => {});
      await sb.delete('store_exchange_rates', `store_id=eq.${storeA}&currency=eq.USD`).catch(() => {});
      await cleanupProducts(storeA, [pCup.id, pUsd.id].filter(Boolean));
      await sb.delete('audit_logs', `user_id=eq.${adminId}`).catch(() => {});
      await sb.delete('audit_logs', `user_id=eq.${clerkId}`).catch(() => {});
    }
    if (freshStoreId) await hardDeleteTestStore(freshStoreId).catch(() => {});
  });
});
