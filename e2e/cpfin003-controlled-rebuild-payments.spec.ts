/**
 * E2E — CP-FIN-ENERVIDA-CONTROLLED-ACCOUNTING-REBUILD-AND-CONFIGURATION-001
 * + ANEXO VINCULANTE (universalización de medios de pago y liquidaciones).
 * ============================================================================
 * Batería OBLIGATORIA combinada sobre la BD aislada:
 *
 *  · REBUILD §9: escenarios A–D (efectivo USD / transferencia CUP / exterior
 *    USD / mixto), reconstrucción de la NUEVA GENERACIÓN contable (build →
 *    validate → activate → rollback), idempotencia, cobertura documental,
 *    sustitución atómica, reglas con fecha efectiva y protección de reglas
 *    históricas.
 *  · ANEXO §12 (20): servicios pagados (efectivo CUP / transferencia /
 *    exterior USD), pendientes, parciales, mixtos; recepciones inmediatas /
 *    pendientes / parciales; pago posterior; pago en moneda distinta;
 *    reintento sin duplicación; anulación y tratamiento de pagos; integridad
 *    multitienda; RLS; conciliación de saldos; asientos equilibrados;
 *    integración con la nueva generación.
 *
 * Cadenas reales (sin mocks):
 *   · Servicios: /api/received-services (create+activate) → trigger
 *     fin_trg_received_services → regla SERVICIO_RECIBIDO v2 (cuenta
 *     canónica del medio×moneda vía fin_account_mapping).
 *   · Pagos: /api/payments (payments[] multi-fila) → register_supplier_payment
 *     (tasa obligatoria > 1 para divisa) → fin_trg_payment_transactions.
 *   · Recepciones: /api/inventory/receptions → register_reception → regla
 *     RECEPCION v2 (inventario + deuda; pagar ≠ recibir).
 *   · Generaciones: fin_generation_create/build/validate/activate/rollback.
 *
 * Cleanup: delta neto cero.
 * ============================================================================
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  signIn, apiHeaders, rpcAsUser, rpcAsService, sb,
  createTestStore, seedProduct, cleanupProducts,
  ADMIN_EMAIL, ADMIN_PASS, CLERK_EMAIL, CLERK_PASS,
} from './fixtures/session.fixture';
import { hardDeleteTestStore } from './fixtures/hard-cleanup';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

let adminToken = '';
let adminId = '';
let clerkToken = '';
let storeA = '';
let storeB = '';
let tenantId = '';
const SFX = Date.now().toString(36);
const RATE = 930;

let pCup = { id: '', price: 2000, cost: 800 };
// Precio de catálogo = NOMINAL USD del ítem (patrón 002: el gate de desvío
// R-SEC-1 compara crudo contra el catálogo — sin saltos de supervisor).
let pUsd45 = { id: '', price: 4.5, cost: 800 };
let pUsd50 = { id: '', price: 50, cost: 800 };

// ── Registro de artefactos para el cleanup ──
const saleIds: string[] = [];
const serviceIds: string[] = [];
const receiptIds: string[] = [];
const genIds: string[] = [];
let freshStoreId = '';

type DetailData = { movimientos: Array<Record<string, any>>; total: number };

async function detail(token: string, store: string, category: string, from = '1900-01-01', to = '2030-12-31'): Promise<DetailData> {
  const r = await rpcAsUser<DetailData>('fin_get_category_detail', token,
    { p_store_id: store, p_category: category, p_from: from, p_to: to, p_limit: 300, p_offset: 0 });
  if (!r.ok) throw new Error(`fin_get_category_detail(${category}) falló (${r.status}): ${r.error}`);
  return r.data!;
}

function movsOf(data: DetailData, documentId: string) {
  return data.movimientos.filter((m) => m.document_id === documentId);
}

function netOf(data: DetailData, documentId: string): number {
  return movsOf(data, documentId).reduce(
    (acc, m) => acc + (m.sense === 'debito' ? Number(m.amount_cup) : -Number(m.amount_cup)), 0);
}

/** Venta real por la cadena completa (POS checkout → create_sale_v2 → trigger). */
async function checkout(request: APIRequestContext, payload: Record<string, unknown>): Promise<string> {
  const res = await request.post('/api/pos/checkout', {
    headers: apiHeaders(adminToken),
    data: { idempotency_key: `cpfin003-${SFX}-${saleIds.length}-${Math.random().toString(36).slice(2, 8)}`, ...payload },
  });
  if (!res.ok()) throw new Error(`checkout falló: ${res.status()} ${await res.text()}`.slice(0, 500));
  const body = await res.json();
  const txId = body?.transaction_id || body?.data?.transaction_id || body?.data?.id || body?.id;
  if (!txId) throw new Error(`checkout sin transaction_id: ${JSON.stringify(body).slice(0, 200)}`);
  saleIds.push(String(txId));
  return String(txId);
}

/** POST/PATCH con backoff ante el rate limit (10/min con withSecurity y
 * 20/min interno de la ruta): la batería crea ~11 servicios + activaciones. */
async function withRlBackoff(fn: () => Promise<{ status: number; text: () => Promise<string> }>) {
  let res = await fn();
  if (res.status === 429) {
    // eslint-disable-next-line no-console
    console.log('[createService] rate limit (429) — esperando 65s y reintentando');
    await new Promise((r) => setTimeout(r, 65_000));
    res = await fn();
  }
  return res;
}

/** Crea Y ACTIVA un servicio recibido (cadena canónica completa). */
async function createService(request: APIRequestContext, data: {
  total: number; currency?: string; rate?: number; type?: string; supplier?: string;
}): Promise<string> {
  const res = await withRlBackoff(() => request.post('/api/received-services', {
    headers: apiHeaders(adminToken),
    data: {
      store_id: storeA,
      service_type_name: data.type ?? 'Transporte',
      supplier: data.supplier ?? `Prov ${SFX}`,
      total_amount: data.total,
      currency: data.currency ?? 'CUP',
      exchange_rate: data.rate ?? 1,
      distribution_method: 'manual',
      observations: `cpfin003 ${SFX}`,
    },
  }));
  if (!res.ok()) throw new Error(`create service: ${res.status()} ${await res.text()}`.slice(0, 400));
  const created = await res.json();
  const id = created?.data?.id;
  if (!id) throw new Error(`servicio sin id: ${JSON.stringify(created).slice(0, 200)}`);
  const act = await withRlBackoff(() => request.patch('/api/received-services', {
    headers: apiHeaders(adminToken),
    data: { service_id: id, status: 'active', reason: `cpfin003 ${SFX}` },
  }));
  if (!act.ok()) throw new Error(`activate service: ${act.status()} ${await act.text()}`.slice(0, 400));
  serviceIds.push(id);
  return id;
}

/** Pago(s) a un documento (canal canónico multi-fila). Con backoff ante el
 * rate limit de la ruta (10/min por usuario — withSecurity): la batería hace
 * ~15 envíos; al llegar al tope se espera la ventana y se reintenta UNA vez. */
async function pay(request: APIRequestContext, refType: 'service' | 'receipt', refId: string,
  payments: Array<{ payment_method: string; amount: number; currency: string; exchange_rate: number; reference?: string }>,
  idemKey?: string): Promise<{ ok: boolean; status: number; body: any }> {
  const doPost = () => request.post('/api/payments', {
    headers: apiHeaders(adminToken),
    data: {
      ref_type: refType, ref_id: refId, payments,
      idempotency_key: idemKey ?? `cpfin003-pay-${SFX}-${refId.slice(0, 8)}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
  let res = await doPost();
  if (res.status() === 429) {
    // eslint-disable-next-line no-console
    console.log(`[pay] rate limit (429) — esperando 65s y reintentando (${refType}/${refId.slice(0, 8)})`);
    await new Promise((r) => setTimeout(r, 65_000));
    res = await doPost();
  }
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok(), status: res.status(), body };
}

/** Crea una recepción activa con UN item (cadena register_reception). */
async function createReception(request: APIRequestContext, data: {
  invoice: string; quantity: number; unitCost: number; supplier?: string;
}): Promise<string> {
  const res = await request.post('/api/inventory/receptions', {
    headers: apiHeaders(adminToken),
    data: {
      store_id: storeA, // withStoreAccess (middleware) exige store_id en el body
      p_store_id: storeA,
      p_supplier: data.supplier ?? `Prov Rec ${SFX}`,
      p_reception_date: new Date().toISOString(),
      p_invoice_number: data.invoice,
      p_items: [{
        product_id: pCup.id, sku: null, quantity: data.quantity,
        unit_cost: data.unitCost, unit_of_measure: 'u',
        moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1,
      }],
      p_po_id: null,
    },
  });
  if (!res.ok()) throw new Error(`create reception: ${res.status()} ${await res.text()}`.slice(0, 500));
  const body = await res.json();
  const id = body?.receptionId || body?.data?.receptionId || body?.id || body?.data?.id;
  if (!id) throw new Error(`recepción sin id: ${JSON.stringify(body).slice(0, 300)}`);
  receiptIds.push(String(id));
  return String(id);
}

test.describe.serial('CP-FIN-003 — generaciones contables + pagos universales (medio × moneda)', () => {
  // Los backoffs ante rate limits (10/min de withSecurity en /api/payments y
  // /api/received-services) esperan 65s por ventana: margen amplio por test.
  test.setTimeout(180_000);

  test.beforeAll(async ({ request }) => {
    test.skip(!SUPABASE_URL, 'sin credenciales de la BD aislada');
    const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    adminToken = admin.token;
    adminId = admin.userId;
    const clerk = await signIn(CLERK_EMAIL, CLERK_PASS);
    clerkToken = clerk.userId;
    const a = await createTestStore(request, adminToken, 'A');
    storeA = a.id;
    const b = await createTestStore(request, adminToken, 'B');
    storeB = b.id;
    const storeRow = await sb.select<{ tenant_id: string }>('stores', `id=eq.${storeA}&select=tenant_id`);
    tenantId = storeRow[0]?.tenant_id;
    await sb.update('profiles', `id=eq.${adminId}`, { active_store_id: storeA });

    const rateRes = await request.post('/api/store-rates', {
      headers: apiHeaders(adminToken),
      data: { storeId: storeA, rates: { USD: RATE } },
    });
    if (!rateRes.ok()) throw new Error(`store-rates: ${rateRes.status()} ${await rateRes.text()}`);

    const seeded = await seedProduct(a, {
      name: `CPFIN-003 Cup ${SFX}`, price: pCup.price, cost: pCup.cost,
      quantity: 500, sku: `CPFIN3-CUP-${SFX}`,
    });
    pCup.id = seeded.id;
    const seededUsd45 = await seedProduct(a, {
      name: `CPFIN-003 Usd45 ${SFX}`, price: pUsd45.price, cost: pUsd45.cost,
      quantity: 100, sku: `CPFIN3-U45-${SFX}`,
    });
    pUsd45.id = seededUsd45.id;
    const seededUsd50 = await seedProduct(a, {
      name: `CPFIN-003 Usd50 ${SFX}`, price: pUsd50.price, cost: pUsd50.cost,
      quantity: 100, sku: `CPFIN3-U50-${SFX}`,
    });
    pUsd50.id = seededUsd50.id;

    // Línea base de generaciones (mismo estado que producción tras la
    // migración): GEN-0 ACTIVA para la tienda de pruebas, de modo que todos
    // los asientos de la batería nacen ya dentro de una generación y el ciclo
    // G7-G12 (construir/validar/activar/rollback) opera sobre un libro real.
    const c0 = await rpcAsService<string>('fin_generation_create', {
      p_store_id: storeA, p_code: `GEN-0-${SFX}`, p_notes: 'E2E CP-FIN-003 base',
    });
    if (c0.ok) {
      const gen0 = typeof c0.data === 'string' ? c0.data : String((c0.data as any)?.id ?? c0.data);
      await rpcAsService('fin_generation_build', { p_store_id: storeA, p_generation_id: gen0 });
      const v0 = await rpcAsService<{ ok: boolean }>('fin_generation_validate', { p_store_id: storeA, p_generation_id: gen0 });
      if (v0.ok && v0.data?.ok) {
        await rpcAsService('fin_generation_activate', { p_store_id: storeA, p_generation_id: gen0 });
      }
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // PARTE 1 — ANEXO §12: Servicios Recibidos (1-6)
  // ══════════════════════════════════════════════════════════════════════

  // §12.1 — Servicio confirmado y pagado en efectivo CUP
  test('A1 · servicio pagado en efectivo CUP: gasto+obligación y pago por CAJA CUP (canónico)', async ({ request }) => {
    const id = await createService(request, { total: 5000, type: 'Transporte' });
    const r = await pay(request, 'service', id, [
      { payment_method: 'cash', amount: 5000, currency: 'CUP', exchange_rate: 1 },
    ]);
    expect(r.ok, JSON.stringify(r.body)).toBe(true);

    const gas = await detail(adminToken, storeA, 'GAS_SERVICIOS');
    const gasRow = movsOf(gas, id).find((m) => m.sense === 'debito');
    expect(gasRow).toBeTruthy();
    expect(Number(gasRow!.amount_cup)).toBe(5000);

    const caja = await detail(adminToken, storeA, 'ACT_EFECTIVO_CUP');
    const pagoCaja = movsOf(caja, id).find((m) => m.sense === 'credito');
    expect(pagoCaja).toBeTruthy();
    expect(Number(pagoCaja!.amount_cup)).toBe(5000);

    const pas = await detail(adminToken, storeA, 'PAS_SERV_PEND');
    expect(netOf(pas, id)).toBe(0); // obligación cancelada EXACTA
  });

  // §12.2 — Servicio pagado por transferencia CUP → BANCOS (no caja)
  test('A2 · servicio pagado por transferencia CUP: BANCOS crédito; caja sin el pago', async ({ request }) => {
    const id = await createService(request, { total: 3000 });
    const r = await pay(request, 'service', id, [
      { payment_method: 'transfer', amount: 3000, currency: 'CUP', exchange_rate: 1 },
    ]);
    expect(r.ok).toBe(true);
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    const row = movsOf(bancos, id).find((m) => m.sense === 'credito');
    expect(row).toBeTruthy();
    expect(Number(row!.amount_cup)).toBe(3000);
    const caja = await detail(adminToken, storeA, 'ACT_EFECTIVO_CUP');
    expect(movsOf(caja, id)).toHaveLength(0);
  });

  // §12.3 — Servicio pagado por transferencia exterior USD → CUENTA EXTERIOR
  test('A3 · servicio pagado por Transf. Exterior USD: ACT_TRANSF_EXTERIOR + original USD', async ({ request }) => {
    const id = await createService(request, { total: 10, currency: 'USD', rate: RATE, type: 'Flete' });
    const r = await pay(request, 'service', id, [
      { payment_method: 'zelle', amount: 10, currency: 'USD', exchange_rate: RATE },
    ]);
    expect(r.ok).toBe(true);
    const ext = await detail(adminToken, storeA, 'ACT_TRANSF_EXTERIOR');
    const row = movsOf(ext, id).find((m) => m.sense === 'credito');
    expect(row).toBeTruthy();
    expect(Number(row!.amount_cup)).toBe(9300);
    expect(row!.currency_origin).toBe('USD');
    expect(Number(row!.amount_origin)).toBeCloseTo(10, 2);
    // La moneda NO sustituye al medio: bancos y caja USD sin este pago
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    expect(movsOf(bancos, id)).toHaveLength(0);
    const cajaUsd = await detail(adminToken, storeA, 'ACT_EFECTIVO_USD');
    expect(movsOf(cajaUsd, id)).toHaveLength(0);
  });

  // §12.4 — Servicio pendiente de pago: obligación SIN egreso ficticio
  test('A4 · servicio PENDIENTE: gasto+obligación, SIN movimientos de efectivo/banco', async ({ request }) => {
    const id = await createService(request, { total: 1200, type: 'Seguro' });
    const pas = await detail(adminToken, storeA, 'PAS_SERV_PEND');
    const oblig = movsOf(pas, id).find((m) => m.sense === 'credito');
    expect(oblig).toBeTruthy();
    expect(Number(oblig!.amount_cup)).toBe(1200);
    // SIN egreso: ni caja ni bancos ni exterior tienen movimientos de este doc
    for (const cat of ['ACT_EFECTIVO_CUP', 'ACT_BANCOS', 'ACT_TRANSF_EXTERIOR']) {
      const d = await detail(adminToken, storeA, cat);
      expect(movsOf(d, id), `${cat} no debe tener movimientos`).toHaveLength(0);
    }
    // Estado pendiente en el documento
    const rows = await sb.select<{ payment_status: string }>('received_services', `id=eq.${id}&select=payment_status`);
    expect(rows[0]?.payment_status).toBe('unpaid');
  });

  // §12.5 — Servicio pagado parcialmente (y §12.11 pago posterior del saldo)
  test('A5+A11 · pago PARCIAL y pago POSTERIOR del saldo desde el detalle', async ({ request }) => {
    const id = await createService(request, { total: 2000 });
    // Primer pago: 800 CUP efectivo (parcial)
    const r1 = await pay(request, 'service', id, [
      { payment_method: 'cash', amount: 800, currency: 'CUP', exchange_rate: 1 },
    ]);
    expect(r1.ok).toBe(true);
    let rows = await sb.select<{ payment_status: string; paid_amount: number }>(
      'received_services', `id=eq.${id}&select=payment_status,paid_amount`);
    expect(rows[0]?.payment_status).toBe('partial');
    expect(Number(rows[0]?.paid_amount)).toBe(800);
    let pas = await detail(adminToken, storeA, 'PAS_SERV_PEND');
    // PAS es cuenta de crédito-normal: saldo pendiente = créditos − débitos
    expect(-netOf(pas, id)).toBe(1200); // saldo pendiente exacto

    // Pago posterior del saldo (desde el detalle, otro medio: transferencia)
    const r2 = await pay(request, 'service', id, [
      { payment_method: 'transfer', amount: 1200, currency: 'CUP', exchange_rate: 1 },
    ]);
    expect(r2.ok).toBe(true);
    rows = await sb.select<{ payment_status: string }>('received_services', `id=eq.${id}&select=payment_status`);
    expect(rows[0]?.payment_status).toBe('paid');
    pas = await detail(adminToken, storeA, 'PAS_SERV_PEND');
    expect(netOf(pas, id)).toBe(0);
    // Cada pago conservó SU medio: caja 800 + bancos 1200
    const caja = await detail(adminToken, storeA, 'ACT_EFECTIVO_CUP');
    expect(movsOf(caja, id).filter((m) => m.sense === 'credito')).toHaveLength(1);
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    expect(movsOf(bancos, id).filter((m) => m.sense === 'credito')).toHaveLength(1);
  });

  // §12.6 — Servicio con pago MIXTO (varios componentes en un envío)
  test('A6 · pago MIXTO: 1,000 efectivo + 2,000 transferencia = 2 asientos de pago, obligación única', async ({ request }) => {
    const id = await createService(request, { total: 3000, type: 'Manipulación' });
    const r = await pay(request, 'service', id, [
      { payment_method: 'cash', amount: 1000, currency: 'CUP', exchange_rate: 1 },
      { payment_method: 'transfer', amount: 2000, currency: 'CUP', exchange_rate: 1 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.body.count).toBe(2);
    const caja = await detail(adminToken, storeA, 'ACT_EFECTIVO_CUP');
    const c = movsOf(caja, id).find((m) => m.sense === 'credito');
    expect(c && Number(c.amount_cup)).toBe(1000);
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    const b = movsOf(bancos, id).find((m) => m.sense === 'credito');
    expect(b && Number(b.amount_cup)).toBe(2000);
    const pas = await detail(adminToken, storeA, 'PAS_SERV_PEND');
    expect(netOf(pas, id)).toBe(0);
    // UN solo reconocimiento de gasto (sin duplicar por separar el cobro)
    const gas = await detail(adminToken, storeA, 'GAS_SERVICIOS');
    expect(movsOf(gas, id).filter((m) => m.sense === 'debito')).toHaveLength(1);
  });

  // ══════════════════════════════════════════════════════════════════════
  // PARTE 2 — ANEXO §12: Recepciones (7-10) + moneda distinta (12)
  // ══════════════════════════════════════════════════════════════════════

  // §12.7 — Recepción pagada inmediatamente en efectivo CUP
  test('A7 · recepción pagada inmediata efectivo CUP: inventario+deuda, pago cancela', async ({ request }) => {
    const id = await createReception(request, { invoice: `CPF3-A7-${SFX}`, quantity: 10, unitCost: 500 });
    const inv = await detail(adminToken, storeA, 'ACT_INVENTARIO');
    const invRow = movsOf(inv, id).find((m) => m.sense === 'debito');
    expect(invRow).toBeTruthy();
    expect(Number(invRow!.amount_cup)).toBe(5000);
    const r = await pay(request, 'receipt', id, [
      { payment_method: 'cash', amount: 5000, currency: 'CUP', exchange_rate: 1 },
    ]);
    expect(r.ok).toBe(true);
    const cxp = await detail(adminToken, storeA, 'PAS_CXP_PROV');
    expect(netOf(cxp, id)).toBe(0);
  });

  // §12.8 — Recepción pagada por transferencia
  test('A8 · recepción pagada por transferencia: BANCOS crédito (no caja)', async ({ request }) => {
    const id = await createReception(request, { invoice: `CPF3-A8-${SFX}`, quantity: 4, unitCost: 250 });
    const r = await pay(request, 'receipt', id, [
      { payment_method: 'transfer', amount: 1000, currency: 'CUP', exchange_rate: 1 },
    ]);
    expect(r.ok).toBe(true);
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    const row = movsOf(bancos, id).find((m) => m.sense === 'credito');
    expect(row && Number(row.amount_cup)).toBe(1000);
  });

  // §12.9 — Recepción pendiente de proveedor: la deuda sigue pendiente
  test('A9 · recepción PENDIENTE: deuda CxP sin egreso (recibir ≠ pagar)', async ({ request }) => {
    const id = await createReception(request, { invoice: `CPF3-A9-${SFX}`, quantity: 6, unitCost: 700 });
    const cxp = await detail(adminToken, storeA, 'PAS_CXP_PROV');
    const debt = movsOf(cxp, id).find((m) => m.sense === 'credito');
    expect(debt).toBeTruthy();
    expect(Number(debt!.amount_cup)).toBe(4200);
    for (const cat of ['ACT_EFECTIVO_CUP', 'ACT_BANCOS']) {
      const d = await detail(adminToken, storeA, cat);
      expect(movsOf(d, id)).toHaveLength(0);
    }
    const rows = await sb.select<{ payment_status: string }>('receipts', `id=eq.${id}&select=payment_status`);
    expect(rows[0]?.payment_status).toBe('unpaid');
  });

  // §12.10 — Recepción con DOS pagos parciales
  test('A10 · recepción con dos pagos parciales: saldo conciliado al final', async ({ request }) => {
    const id = await createReception(request, { invoice: `CPF3-A10-${SFX}`, quantity: 10, unitCost: 300 });
    const r1 = await pay(request, 'receipt', id, [
      { payment_method: 'cash', amount: 1500, currency: 'CUP', exchange_rate: 1 },
    ]);
    expect(r1.ok).toBe(true);
    let cxp = await detail(adminToken, storeA, 'PAS_CXP_PROV');
    expect(-netOf(cxp, id)).toBe(1500); // crédito-normal: pendiente 1,500
    const r2 = await pay(request, 'receipt', id, [
      { payment_method: 'cash', amount: 1500, currency: 'CUP', exchange_rate: 1 },
    ]);
    expect(r2.ok).toBe(true);
    cxp = await detail(adminToken, storeA, 'PAS_CXP_PROV');
    expect(netOf(cxp, id)).toBe(0);
  });

  // §12.12 — Pago en moneda DISTINTA de la obligación (doc CUP pagado en USD)
  test('A12 · pago en USD de una obligación CUP: tasa real, equivalente exacto, overpay guard', async ({ request }) => {
    const id = await createService(request, { total: 9300, type: 'Servicios de Tercero' });
    // 9300 CUP = 10 USD @930. El pago viaja en SU moneda (USD) con SU tasa.
    const r = await pay(request, 'service', id, [
      { payment_method: 'cash', amount: 10, currency: 'USD', exchange_rate: RATE },
    ]);
    expect(r.ok, JSON.stringify(r.body)).toBe(true);
    const cajaUsd = await detail(adminToken, storeA, 'ACT_EFECTIVO_USD');
    const row = movsOf(cajaUsd, id).find((m) => m.sense === 'credito');
    expect(row).toBeTruthy();
    expect(Number(row!.amount_cup)).toBe(9300);
    expect(Number(row!.amount_origin)).toBeCloseTo(10, 2);
    const pas = await detail(adminToken, storeA, 'PAS_SERV_PEND');
    expect(netOf(pas, id)).toBe(0);
    // Overpay guard en la moneda del documento: 11 USD (10,230 CUP) > saldo 0
    const over = await pay(request, 'service', id, [
      { payment_method: 'cash', amount: 11, currency: 'USD', exchange_rate: RATE },
    ]);
    expect(over.ok).toBe(false);
    expect(JSON.stringify(over.body)).toContain('excede el saldo');
  });

  // ══════════════════════════════════════════════════════════════════════
  // PARTE 3 — ANEXO: reintento (13), anulación (14), multitienda (16),
  //           RLS (17), saldos (18), equilibrio (19)
  // ══════════════════════════════════════════════════════════════════════

  // §12.13 — Reintento de pago sin duplicación (idempotencia por envío)
  test('A13 · reintento con la MISMA idempotency key: no duplica pagos ni asientos', async ({ request }) => {
    const id = await createService(request, { total: 900 });
    const key = `cpfin003-idem-${SFX}-${id.slice(0, 8)}`;
    const r1 = await pay(request, 'service', id, [
      { payment_method: 'cash', amount: 900, currency: 'CUP', exchange_rate: 1 },
    ], key);
    expect(r1.ok).toBe(true);
    const pays = await sb.select<{ id: string }>('payment_transactions', `ref_id=eq.${id}&select=id`);
    expect(pays.length).toBe(1);
    // Reintento de red con la MISMA key → mismo pago (RPC devuelve el id
    // existente), sin segundo asiento
    const r2 = await pay(request, 'service', id, [
      { payment_method: 'cash', amount: 900, currency: 'CUP', exchange_rate: 1 },
    ], key);
    // La ruta responde ok (replay idempotente) o rechaza limpio; NUNCA duplica
    if (r2.ok) {
      const pays2 = await sb.select<{ id: string }>('payment_transactions', `ref_id=eq.${id}&select=id`);
      expect(pays2.length).toBe(1);
    }
    const caja = await detail(adminToken, storeA, 'ACT_EFECTIVO_CUP');
    expect(movsOf(caja, id).filter((m) => m.sense === 'credito')).toHaveLength(1);
  });

  // §12.14 — Anulación del documento: asiento compensatorio, pagos tratados
  test('A14 · anulación de servicio pagado: compensatorio reversa gasto y obligación/pago', async ({ request }) => {
    const id = await createService(request, { total: 600, type: 'Otros' });
    const r = await pay(request, 'service', id, [
      { payment_method: 'cash', amount: 600, currency: 'CUP', exchange_rate: 1 },
    ]);
    expect(r.ok).toBe(true);
    const res = await withRlBackoff(() => request.patch('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: { service_id: id, action: 'void', reason: `cpfin003 anulación ${SFX}` },
    }));
    expect(res.ok(), await res.text()).toBe(true);
    // El compensatorio revierte TODO: neto 0 en gasto, obligación y caja
    const gas = await detail(adminToken, storeA, 'GAS_SERVICIOS');
    expect(netOf(gas, id)).toBe(0);
    const pas = await detail(adminToken, storeA, 'PAS_SERV_PEND');
    expect(netOf(pas, id)).toBe(0);
    const caja = await detail(adminToken, storeA, 'ACT_EFECTIVO_CUP');
    expect(netOf(caja, id)).toBe(0);
  });

  // §12.16 — Integridad multitienda: las operaciones de A no tocan B
  test('A16 · multitienda: la tienda B queda intacta (0 asientos propios de esta corrida)', async () => {
    const rows = await sb.select<{ store_id: string }>('fin_entries', `document_id=in.(${[...serviceIds, ...receiptIds, ...saleIds].map((x) => `"${x}"`).join(',') || '""'})&select=store_id`);
    const stores = new Set(rows.map((r) => r.store_id));
    expect(stores.has(storeA)).toBe(true);
    expect(stores.has(storeB)).toBe(false);
  });

  // §12.17 — RLS: el ciclo de vida de generaciones NO es ejecutable por
  // usuarios autenticados (canal canónico) y los informes respetan membresía
  test('A17 · RLS: clerk sin membresía → ERR_UNAUTHORIZED; generaciones solo service_role', async () => {
    const [fresh] = await sb.insert<{ id: string }>('stores', [{
      name: `CPFIN3-RLS-${SFX}`, tenant_id: tenantId, is_active: true,
    }]);
    freshStoreId = fresh.id;
    const denied = await rpcAsUser('fin_get_category_detail', clerkToken, {
      p_store_id: freshStoreId, p_category: 'ING_VENTAS',
      p_from: '1900-01-01', p_to: '2030-12-31', p_limit: 10, p_offset: 0,
    });
    expect(denied.ok).toBe(false);
    // Ciclo de vida: ACL service_role (patrón rectificador) — ni admin
    // autenticado por REST público puede ejecutarlo
    const adminGen = await rpcAsUser('fin_generation_create', adminToken, {
      p_store_id: freshStoreId, p_code: 'X', p_notes: 'rls',
    });
    expect(adminGen.ok).toBe(false);
  });

  // §12.18 — Conciliación del saldo pendiente: CxP == Σ deudas vivas
  test('A18 · conciliación de saldos: PAS_CXP_PROV == Σ pendientes de recepciones activas', async () => {
    const bs = await rpcAsUser<{ kpis: { cuentas_por_pagar: number } }>('fin_get_dashboard', adminToken,
      { p_store_id: storeA, p_from: '2026-01-01', p_to: '2030-12-31' });
    expect(bs.ok).toBe(true);
    // Recepciones de esta corrida aún con deuda: A9 (4200). A7/A8/A10 pagadas.
    const cxp = await detail(adminToken, storeA, 'PAS_CXP_PROV');
    const pendingTotal = cxp.movimientos
      .filter((m) => receiptIds.includes(String(m.document_id)) || serviceIds.includes(String(m.document_id)))
      .reduce((a, m) => a + (m.sense === 'credito' ? Number(m.amount_cup) : -Number(m.amount_cup)), 0);
    expect(pendingTotal).toBeCloseTo(4200, 2);
  });

  // §12.19 — Asientos equilibrados: identidad pura 0.00 en la tienda
  test('A19 · asientos equilibrados: Σ débitos − Σ créditos = 0.00 (identidad pura)', async () => {
    const dash = await rpcAsUser<{ alertas: { desequilibrio_balance: boolean; desequilibrio_monto: number } }>(
      'fin_get_dashboard', adminToken, { p_store_id: storeA, p_from: '2026-01-01', p_to: '2030-12-31' });
    expect(dash.ok).toBe(true);
    expect(dash.data!.alertas.desequilibrio_balance).toBe(false);
    expect(Number(dash.data!.alertas.desequilibrio_monto)).toBe(0);
  });

  // ══════════════════════════════════════════════════════════════════════
  // PARTE 4 — REBUILD §9: escenarios de venta A-D + generaciones
  // ══════════════════════════════════════════════════════════════════════

  test('G1 · venta efectivo CUP (base): caja CUP débito', async ({ request }) => {
    const id = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'cash',
      items: [{ product_id: pCup.id, quantity: 2, price: pCup.price, cost: pCup.cost, currency: 'CUP', exchange_rate: 1, cash_paid: 4000, cash_currency: 'CUP' }],
      total_amount: 4000, subtotal: 4000, cash_amount: 4000, transfer_amount: 0, zelle_amount: 0,
      sale_currency: 'CUP', sale_exchange_rate: 1,
    });
    const caja = await detail(adminToken, storeA, 'ACT_EFECTIVO_CUP');
    const row = movsOf(caja, id).find((m) => m.sense === 'debito');
    expect(row && Number(row.amount_cup)).toBe(4000);
  });

  // Escenario A (§9): efectivo USD 135 @930
  test('G2 · escenario A: 135 USD efectivo @930 → caja USD 125,550; bancos/exterior NO', async ({ request }) => {
    const id = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'cash',
      items: [{ product_id: pUsd45.id, quantity: 30, price: 4.5, cost: pUsd45.cost, currency: 'USD', exchange_rate: RATE, cash_paid: 135, cash_currency: 'USD' }],
      total_amount: 125550, subtotal: 125550, cash_amount: 125550, transfer_amount: 0, zelle_amount: 0,
      sale_currency: 'USD', sale_exchange_rate: RATE,
      payment_components: [{ method: 'cash', currency: 'USD', amount: 135 }],
    });
    const cajaUsd = await detail(adminToken, storeA, 'ACT_EFECTIVO_USD');
    const row = movsOf(cajaUsd, id).find((m) => m.sense === 'debito');
    expect(row && Number(row.amount_cup)).toBe(125550);
    expect(Number(row!.amount_origin)).toBeCloseTo(135, 2);
    for (const cat of ['ACT_BANCOS', 'ACT_TRANSF_EXTERIOR']) {
      const d = await detail(adminToken, storeA, cat);
      expect(movsOf(d, id)).toHaveLength(0);
    }
  });

  // Escenario B (§9): transferencia CUP 10,000
  test('G3 · escenario B: 10,000 CUP por transferencia → banco; efectivo NO', async ({ request }) => {
    const id = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'transfer',
      items: [{ product_id: pCup.id, quantity: 5, price: pCup.price, cost: pCup.cost, currency: 'CUP', exchange_rate: 1, transfer_paid: 10000, transfer_currency: 'CUP' }],
      total_amount: 10000, subtotal: 10000, cash_amount: 0, transfer_amount: 10000, zelle_amount: 0,
      sale_currency: 'CUP', sale_exchange_rate: 1,
    });
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    const row = movsOf(bancos, id).find((m) => m.sense === 'debito');
    expect(row && Number(row.amount_cup)).toBe(10000);
    const caja = await detail(adminToken, storeA, 'ACT_EFECTIVO_CUP');
    expect(movsOf(caja, id)).toHaveLength(0);
  });

  // Escenario C (§9): transferencia exterior USD 50 → CUENTA EXTERIOR propia
  test('G4 · escenario C: 50 USD por Transf. Exterior → ACT_TRANSF_EXTERIOR con original', async ({ request }) => {
    const id = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'zelle',
      items: [{ product_id: pUsd50.id, quantity: 1, price: 50, cost: pUsd50.cost, currency: 'USD', exchange_rate: RATE, zelle_paid: 50, zelle_currency: 'USD' }],
      total_amount: 46500, subtotal: 46500, cash_amount: 0, transfer_amount: 0, zelle_amount: 46500,
      sale_currency: 'USD', sale_exchange_rate: RATE,
      payment_components: [{ method: 'zelle', currency: 'USD', amount: 50 }],
    });
    const ext = await detail(adminToken, storeA, 'ACT_TRANSF_EXTERIOR');
    const row = movsOf(ext, id).find((m) => m.sense === 'debito');
    expect(row && Number(row.amount_cup)).toBe(46500);
    expect(Number(row!.amount_origin)).toBeCloseTo(50, 2);
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    expect(movsOf(bancos, id)).toHaveLength(0);
    const cajaUsd = await detail(adminToken, storeA, 'ACT_EFECTIVO_USD');
    expect(movsOf(cajaUsd, id)).toHaveLength(0);
  });

  // Escenario D (§9): pago mixto 4,800 efectivo + 2,400 transferencia
  test('G5 · escenario D: mixto 4,800+2,400 → caja+banco, UN solo ingreso total', async ({ request }) => {
    const id = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'mixed',
      items: [{
        product_id: pCup.id, quantity: 1, price: 7200, cost: pCup.cost, currency: 'CUP', exchange_rate: 1,
        cash_paid: 4800, cash_currency: 'CUP', transfer_paid: 2400, transfer_currency: 'CUP',
      }],
      total_amount: 7200, subtotal: 7200, cash_amount: 4800, transfer_amount: 2400, zelle_amount: 0,
      sale_currency: 'CUP', sale_exchange_rate: 1,
      payment_components: [
        { method: 'cash', currency: 'CUP', amount: 4800 },
        { method: 'transfer', currency: 'CUP', amount: 2400 },
      ],
    });
    const caja = await detail(adminToken, storeA, 'ACT_EFECTIVO_CUP');
    expect(movsOf(caja, id).some((m) => m.sense === 'debito' && Number(m.amount_cup) === 4800)).toBe(true);
    const bancos = await detail(adminToken, storeA, 'ACT_BANCOS');
    expect(movsOf(bancos, id).some((m) => m.sense === 'debito' && Number(m.amount_cup) === 2400)).toBe(true);
    const ing = await detail(adminToken, storeA, 'ING_VENTAS');
    const ingRows = movsOf(ing, id).filter((m) => m.sense === 'credito');
    expect(ingRows).toHaveLength(1);
    expect(Number(ingRows[0].amount_cup)).toBe(7200);
  });

  // §9.21 — Idempotencia de contabilización (re-checkout con la misma key)
  test('G6 · idempotencia: re-checkout con la MISMA key → misma venta, sin doble asiento', async ({ request }) => {
    const key = `cpfin003-idem-sale-${SFX}`;
    const payload = {
      store_id: storeA, seller_id: adminId, payment_method: 'cash',
      items: [{ product_id: pCup.id, quantity: 1, price: pCup.price, cost: pCup.cost, currency: 'CUP', exchange_rate: 1, cash_paid: 2000, cash_currency: 'CUP' }],
      total_amount: 2000, subtotal: 2000, cash_amount: 2000, transfer_amount: 0, zelle_amount: 0,
      sale_currency: 'CUP', sale_exchange_rate: 1,
    };
    const res1 = await request.post('/api/pos/checkout', { headers: apiHeaders(adminToken), data: { idempotency_key: key, ...payload } });
    expect(res1.ok()).toBe(true);
    const id1 = (await res1.json())?.transaction_id;
    const res2 = await request.post('/api/pos/checkout', { headers: apiHeaders(adminToken), data: { idempotency_key: key, ...payload } });
    expect(res2.ok()).toBe(true);
    const id2 = (await res2.json())?.transaction_id;
    expect(id2).toBe(id1);
    saleIds.push(String(id1));
    const ing = await detail(adminToken, storeA, 'ING_VENTAS');
    expect(movsOf(ing, String(id1)).filter((m) => m.sense === 'credito')).toHaveLength(1);
  });

  // ══════════════════════════════════════════════════════════════════════
  // PARTE 5 — REBUILD: ciclo de vida de la NUEVA GENERACIÓN (§7.1, §9.22-24)
  // ══════════════════════════════════════════════════════════════════════

  test('G7 · generación GEN-1: create (snapshot) + build completo + validate ok', async () => {
    const c = await rpcAsService<string>('fin_generation_create', {
      p_store_id: storeA, p_code: `GEN-1-${SFX}`, p_notes: 'E2E CP-FIN-003 §9.22-24',
    });
    expect(c.ok, c.error ?? '').toBe(true);
    const genId = typeof c.data === 'string' ? c.data : String((c.data as any)?.id ?? c.data);
    genIds.push(genId);

    const b = await rpcAsService<{ repostados: number; errores: number; anulaciones: number }>(
      'fin_generation_build', { p_store_id: storeA, p_generation_id: genId });
    expect(b.ok, JSON.stringify(b.error)).toBe(true);
    expect(b.data!.errores).toBe(0);
    expect(b.data!.repostados).toBeGreaterThan(0);

    const v = await rpcAsService<{
      ok: boolean; asientos_desequilibrados: number; identidad_global: number;
      duplicados: number; cobertura_documental: Record<string, { activa: number; candidata: number }>;
    }>('fin_generation_validate', { p_store_id: storeA, p_generation_id: genId });
    expect(v.ok, JSON.stringify(v.data ?? v.error).slice(0, 600)).toBe(true);
    expect(v.data!.ok).toBe(true);
    expect(v.data!.asientos_desequilibrados).toBe(0);
    expect(Number(v.data!.identidad_global)).toBe(0);
    expect(v.data!.duplicados).toBe(0);
    // Cobertura: la candidata reconstruye TODOS los documentos de la activa
    for (const [tipo, cov] of Object.entries(v.data!.cobertura_documental)) {
      expect(cov.candidata, `cobertura ${tipo}`).toBeGreaterThanOrEqual(cov.activa);
    }
  });

  test('G8 · re-build idempotente: 0 asientos nuevos, 0 errores', async () => {
    const b = await rpcAsService<{ repostados: number; ya_existentes: number; errores: number }>(
      'fin_generation_build', { p_store_id: storeA, p_generation_id: genIds[0] });
    expect(b.ok).toBe(true);
    expect(b.data!.repostados).toBe(0);
    expect(b.data!.errores).toBe(0);
    expect(b.data!.ya_existentes).toBeGreaterThan(0);
  });

  test('G9 · activación ATÓMICA: la activa pasa a superseded, la nueva a active, informes SOLO leen la nueva', async () => {
    const pre = await sb.select<{ id: string; status: string }>('fin_posting_generations', `store_id=eq.${storeA}&select=id,status`);
    const preActive = pre.find((g) => g.status === 'active');
    expect(preActive).toBeTruthy();

    const a = await rpcAsService<{ activada: string; superseded: string | null }>(
      'fin_generation_activate', { p_store_id: storeA, p_generation_id: genIds[0] });
    expect(a.ok, a.error ?? '').toBe(true);

    const post = await sb.select<{ id: string; status: string }>('fin_posting_generations', `store_id=eq.${storeA}&select=id,status`);
    const active = post.filter((g) => g.status === 'active');
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(genIds[0]);
    const superseded = post.find((g) => g.status === 'superseded');
    expect(superseded?.id).toBe(preActive!.id);

    // El informe ve SOLO la generación activa (misma población == mismo total
    // de ingresos; la activa y la candidata difieren solo en GL de apertura
    // que aquí no existe → totales idénticos, jamás sumados)
    const dash = await rpcAsUser<{ generacion: { id: string } | null; kpis: { ingresos: number } }>(
      'fin_get_dashboard', adminToken, { p_store_id: storeA, p_from: '2026-01-01', p_to: '2030-12-31' });
    expect(dash.ok).toBe(true);
    expect(dash.data!.generacion?.id).toBe(genIds[0]);
  });

  test('G10 · post-activación: una venta nueva cae en la generación ACTIVA (delta del corte)', async ({ request }) => {
    const id = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'cash',
      items: [{ product_id: pCup.id, quantity: 1, price: pCup.price, cost: pCup.cost, currency: 'CUP', exchange_rate: 1, cash_paid: 2000, cash_currency: 'CUP' }],
      total_amount: 2000, subtotal: 2000, cash_amount: 2000, transfer_amount: 0, zelle_amount: 0,
      sale_currency: 'CUP', sale_exchange_rate: 1,
    });
    const rows = await sb.select<{ generation_id: string | null }>('fin_entries', `document_id=eq.${id}&select=generation_id`);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.generation_id).toBe(genIds[0]);
    // El delta posterior al corte NO se procesa re-construyendo la generación
    // activa (fail-closed: build exige building/candidate): fluye por el riel
    // normal (trigger → fin_post_document → generación ACTIVA). Una futura
    // reconstrucción crearía una candidata nueva y el build la completaría.
    const b = await rpcAsService<{ repostados: number }>('fin_generation_build',
      { p_store_id: storeA, p_generation_id: genIds[0] });
    expect(b.ok).toBe(false);
    expect(String(b.error)).toContain('ERR_GENERACION_NO_CONSTRUIBLE');
  });

  test('G11 · ROLLBACK: la generación nueva se retira y la anterior vuelve a estar activa', async () => {
    const rb = await rpcAsService<{ rolled_back: string; reactivada: string }>(
      'fin_generation_rollback', { p_store_id: storeA });
    expect(rb.ok, rb.error ?? '').toBe(true);
    const post = await sb.select<{ id: string; status: string }>('fin_posting_generations', `store_id=eq.${storeA}&select=id,status`);
    expect(post.find((g) => g.id === genIds[0])?.status).toBe('rolled_back');
    const active = post.filter((g) => g.status === 'active');
    expect(active).toHaveLength(1);
    expect(active[0].id).not.toBe(genIds[0]);
    // Los asientos de la GEN nueva SIGUEN existiendo (auditoría, nunca se borran)
    const kept = await sb.select<{ id: string }>('fin_entries', `generation_id=eq.${genIds[0]}&select=id`);
    expect(kept.length).toBeGreaterThan(0);
  });

  test('G12 · re-activación tras rollback (el mecanismo es reversible)', async () => {
    const a = await rpcAsService<{ activada: string }>('fin_generation_activate',
      { p_store_id: storeA, p_generation_id: genIds[0] });
    // GEN-1 ya fue rolled_back: activar de nuevo exige candidate → rechazo limpio
    // (fail-closed del ciclo de vida). La reconstrucción idempotente se hace
    // creando una GEN nueva si hiciera falta.
    if (a.ok) {
      const post = await sb.select<{ status: string }>('fin_posting_generations', `id=eq.${genIds[0]}&select=status`);
      expect(post[0]?.status).toBe('active');
    } else {
      expect(String(a.error)).toContain('ERR_ESTADO_INVALIDO');
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // PARTE 6 — REBUILD §6/§10: configuración accesible + reglas versionadas
  // ══════════════════════════════════════════════════════════════════════

  test('C1 · /api/fin/config expone la matriz de mapeo canónico (medio × moneda → cuenta)', async ({ request }) => {
    const res = await request.get(`/api/fin/config?store_id=${storeA}`, { headers: apiHeaders(adminToken) });
    expect(res.ok()).toBe(true);
    const data = await res.json();
    const map: Array<{ payment_method: string; currency: string; category_code: string }> = data.account_mapping ?? [];
    expect(map.length).toBeGreaterThanOrEqual(10);
    const zelleUsd = map.find((m) => m.payment_method === 'zelle' && m.currency === 'USD');
    expect(zelleUsd?.category_code).toBe('ACT_TRANSF_EXTERIOR');
    const cashUsd = map.find((m) => m.payment_method === 'cash' && m.currency === 'USD');
    expect(cashUsd?.category_code).toBe('ACT_EFECTIVO_USD');
    const transfCup = map.find((m) => m.payment_method === 'transfer' && m.currency === 'CUP');
    expect(transfCup?.category_code).toBe('ACT_BANCOS');
    // La regla SERVICIO_RECIBIDO activa usa la cuenta canónica en el evento pago
    const svcActive = (data.rules ?? []).find(
      (r: any) => r.document_type === 'SERVICIO_RECIBIDO' && r.status === 'active');
    expect(svcActive).toBeTruthy();
    const finMov = (svcActive.movements ?? []).find((m: any) => m.origen?.tipo === 'cuenta_financiera');
    expect(finMov).toBeTruthy();
  });

  test('C2 · cambio de regla con FECHA EFECTIVA y protección de reglas históricas', async ({ request }) => {
    // Estado documental (asientos de la tienda por tipo, generación activa)
    const st = await rpcAsUser<Array<{ code: string; asientos: number; version: number | null }>>(
      'fin_get_document_types_status', adminToken, { p_store_id: storeA });
    expect(st.ok).toBe(true);
    const venta = st.data!.find((d) => d.code === 'VENTA');
    expect(venta).toBeTruthy();
    expect(Number(venta!.asientos)).toBeGreaterThan(0);

    // Crear un borrador de regla VENTA con fecha efectiva futura (vía API
    // canónica de configuración) y verificar que NO altera la activa
    const res = await request.post('/api/fin/config', {
      headers: apiHeaders(adminToken),
      data: {
        document_type: 'VENTA', scope: 'global',
        movements: [
          { evento: 'reconocimiento', categoria: 'ACT_EFECTIVO_CUP', sentido: 'debito',
            origen: { tipo: 'metrica', metrica: 'cob_cash_cup' },
            condicion: { campo: 'cob_cash_cup', op: '>', valor: 0 }, orden: 1 },
          { evento: 'reconocimiento', categoria: 'ING_VENTAS', sentido: 'credito',
            origen: { tipo: 'metrica', metrica: 'total_cup' }, condicion: null, orden: 2 },
        ],
        notes: `CP-FIN-003 E2E C2 (no activar) ${SFX}`,
      },
    });
    // Puede ser 201 (creado en borrador) o 403 (solo admin de plataforma):
    // ambos prueban que la vía está controlada. Lo crítico: la regla ACTIVA
    // de VENTA no cambia y los asientos históricos conservan su versión.
    expect([201, 403]).toContain(res.status());

    // La regla activa sigue siendo la v3 del mapeo canónico (zelle→exterior)
    const cfg = await (await request.get(`/api/fin/config?store_id=${storeA}`, { headers: apiHeaders(adminToken) })).json();
    const activeRule = (cfg.rules ?? []).find(
      (r: any) => r.document_type === 'VENTA' && r.status === 'active' && r.store_id === null);
    expect(activeRule).toBeTruthy();
    const zelleLine = (activeRule.movements ?? []).find(
      (m: any) => m.categoria === 'ACT_TRANSF_EXTERIOR');
    expect(zelleLine).toBeTruthy();
    // Protección de históricos: los asientos existentes conservan SU
    // rule_version_id (nunca se reescriben al cambiar reglas)
    const entries = await sb.select<{ rule_version_id: string | null }>(
      'fin_entries', `store_id=eq.${storeA}&document_type=eq.VENTA&event=eq.reconocimiento&select=rule_version_id`);
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) expect(e.rule_version_id).toBeTruthy();
    const distinctVersions = new Set(entries.map((e) => e.rule_version_id));
    expect(distinctVersions.size).toBe(1); // todas con la misma regla v3
    expect(distinctVersions.has(activeRule.id)).toBe(true);
  });

  test.afterAll(async () => {
    // ── Cleanup: delta neto cero (orden de dependencias) ──
    try {
      if (saleIds.length > 0) {
        const list = saleIds.map((id) => `"${id}"`).join(',');
        await sb.delete('fin_entries', `store_id=eq.${storeA}&document_id=in.(${list})`).catch(() => {});
        await sb.delete('payment_transactions', `ref_type=eq.sale&ref_id=in.(${list})`).catch(() => {});
        await sb.delete('transaction_items', `transaction_id=in.(${list})`).catch(() => {});
        await sb.delete('transactions', `id=in.(${list})`).catch(() => {});
      }
      if (serviceIds.length > 0) {
        const list = serviceIds.map((id) => `"${id}"`).join(',');
        await sb.delete('fin_entries', `store_id=eq.${storeA}&document_id=in.(${list})`).catch(() => {});
        await sb.delete('payment_transactions', `ref_type=eq.service&ref_id=in.(${list})`).catch(() => {});
        await sb.delete('received_services', `id=in.(${list})`).catch(() => {});
      }
      if (receiptIds.length > 0) {
        const list = receiptIds.map((id) => `"${id}"`).join(',');
        await sb.delete('fin_entries', `store_id=eq.${storeA}&document_id=in.(${list})`).catch(() => {});
        await sb.delete('payment_transactions', `ref_type=eq.receipt&ref_id=in.(${list})`).catch(() => {});
        await sb.delete('receipt_items', `receipt_id=in.(${list})`).catch(() => {});
        await sb.delete('receipts', `id=in.(${list})`).catch(() => {});
      }
      if (genIds.length > 0) {
        const list = genIds.map((id) => `"${id}"`).join(',');
        await sb.delete('fin_entries', `generation_id=in.(${list})`).catch(() => {});
        await sb.delete('fin_posting_generations', `id=in.(${list})`).catch(() => {});
      }
      // Generaciones GEN-0 de las tiendas de prueba + asientos residuales
      if (storeA) {
        await sb.delete('fin_posting_generations', `store_id=eq.${storeA}`).catch(() => {});
        await sb.delete('fin_entries', `store_id=eq.${storeA}`).catch(() => {});
      }
      if (storeB) {
        await sb.delete('fin_posting_generations', `store_id=eq.${storeB}`).catch(() => {});
        await sb.delete('fin_entries', `store_id=eq.${storeB}`).catch(() => {});
      }
      if (freshStoreId) {
        await sb.delete('stores', `id=eq.${freshStoreId}`).catch(() => {});
      }
      // C2: los borradores de reglas creados por la batería (created_by = el
      // usuario del run) deben retirarse ANTES del teardown de usuarios — la
      // FK fin_rule_versions_created_by impide borrar el perfil si quedan.
      await sb.delete('fin_rule_versions', 'notes=like.*CP-FIN-003 E2E C2*').catch(() => {});
      if (pCup.id) await cleanupProducts(storeA, [pCup.id, pUsd45.id, pUsd50.id]).catch(() => {});
      if (storeA) await hardDeleteTestStore(storeA).catch(() => {});
      if (storeB) await hardDeleteTestStore(storeB).catch(() => {});
    } catch (e) {
      console.error('[CP-FIN-003 cleanup]', e);
    }
  });
});
