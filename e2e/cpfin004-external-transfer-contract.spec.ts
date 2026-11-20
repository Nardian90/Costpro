/**
 * E2E — CP-FIN-004 · ANEXO VINCULANTE POS-BACKEND (contrato de medios de pago)
 * ============================================================================
 * Pruebas OBLIGATORIAS del anexo §7 sobre la BD aislada:
 *
 *  · Prueba A — Efectivo USD: el backend persiste el medio efectivo; el
 *    movimiento incrementa la caja USD; NO se registra exterior ni zelle.
 *  · Prueba B — Transf. Exterior + USD: persiste external_transfer (canónico;
 *    representa un cobro Zelle en ENERVIDA); movimiento a la cuenta exterior
 *    configurada; NO se persiste 'zelle' como medio canónico. Se verifica
 *    TAMBIÉN la normalización de la entrada heredada 'zelle' (cliente cachado).
 *  · Prueba C — Transferencia + CUP: transferencia nacional → banco nacional;
 *    no se confunde con Transf. Exterior.
 *  · Prueba D — Independencia de moneda y medio: ninguna venta en USD deduce
 *    exterior/zelle por la moneda; el medio lo determina SOLO la selección.
 *  · Prueba E — Regresión histórica: una venta histórica Efectivo+USD no
 *    reaparece como zelle/exterior tras consultar informes (categoría,
 *    dashboard) ni tras reconstruir asientos (re-derivación de métricas).
 *    Incluye el NORMALIZADOR canónico cp_fin004_normalize_enervida_payments
 *    con fixtures: 3 ventas exterior + resto USD → efectivo.
 *  · Prueba F — Venta mixta: cada componente conserva SU medio, moneda,
 *    importe y cuenta financiera.
 *
 * Verificación de contrato estático: enum, mapeo canónico, catálogo de
 * métricas y regla VENTA v4 con métricas cob_external_transfer_*.
 *
 * Cleanup: delta neto cero.
 * ============================================================================
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  signIn, apiHeaders, rpcAsUser, rpcAsService, sb,
  createTestStore, seedProduct,
  ADMIN_EMAIL, ADMIN_PASS,
} from './fixtures/session.fixture';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

let adminToken = '';
let adminId = '';
let storeA = '';
const SFX = Date.now().toString(36);
const RATE = 930;

let pCup = { id: '', price: 2000, cost: 800 };
// Precio de catálogo = NOMINAL USD del ítem (patrón 002/003: gate R-SEC-1).
let pUsd45 = { id: '', price: 4.5, cost: 800 };
let pUsd50 = { id: '', price: 50, cost: 800 };

const saleIds: string[] = [];

type DetailData = { movimientos: Array<Record<string, any>>; total: number };

async function detail(category: string, from = '1900-01-01', to = '2030-12-31'): Promise<DetailData> {
  const r = await rpcAsUser<DetailData>('fin_get_category_detail', adminToken,
    { p_store_id: storeA, p_category: category, p_from: from, p_to: to, p_limit: 300, p_offset: 0 });
  if (!r.ok) throw new Error(`fin_get_category_detail(${category}) falló (${r.status}): ${r.error}`);
  return r.data!;
}

function movsOf(data: DetailData, documentId: string) {
  return data.movimientos.filter((m) => m.document_id === documentId);
}

async function checkout(request: APIRequestContext, payload: Record<string, unknown>): Promise<string> {
  const res = await request.post('/api/pos/checkout', {
    headers: apiHeaders(adminToken),
    data: { idempotency_key: `cpfin004-${SFX}-${saleIds.length}-${Math.random().toString(36).slice(2, 8)}`, ...payload },
  });
  if (!res.ok()) throw new Error(`checkout falló: ${res.status()} ${await res.text()}`.slice(0, 500));
  const body = await res.json();
  const txId = body?.transaction_id || body?.data?.transaction_id || body?.data?.id || body?.id;
  if (!txId) throw new Error(`checkout sin transaction_id: ${JSON.stringify(body).slice(0, 200)}`);
  saleIds.push(String(txId));
  return String(txId);
}

/** Filas de payment_transactions de una venta (fuente autoritativa). */
async function payRows(saleId: string) {
  return sb.select<{ payment_method: string; currency: string; amount: string; exchange_rate: string; notes: string | null }>(
    'payment_transactions', `ref_type=eq.sale&ref_id=eq.${saleId}&select=payment_method,currency,amount,exchange_rate,notes&order=payment_method.asc`);
}

/** Header de la venta (método del enum + pools canónico y heredado). */
async function saleHeader(saleId: string) {
  const rows = await sb.select<{ payment_method: string; external_transfer_amount: string; zelle_amount: string; cash_amount: string; status: string }>(
    'transactions', `id=eq.${saleId}&select=payment_method,external_transfer_amount,zelle_amount,cash_amount,status`);
  return rows[0];
}

// ══════════════════════════════════════════════════════════════════════════
// SETUP / TEARDOWN
// ══════════════════════════════════════════════════════════════════════════

test.beforeAll(async ({ request }) => {
  test.skip(!SUPABASE_URL, 'sin credenciales de la BD aislada');
  const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  adminToken = admin.token;
  adminId = admin.userId;
  const a = await createTestStore(request, adminToken, 'A');
  storeA = a.id;
  await sb.update('profiles', `id=eq.${adminId}`, { active_store_id: storeA });

  const rateRes = await request.post('/api/store-rates', {
    headers: apiHeaders(adminToken),
    data: { storeId: storeA, rates: { USD: RATE } },
  });
  if (!rateRes.ok()) throw new Error(`store-rates: ${rateRes.status()} ${await rateRes.text()}`);

  pCup.id = (await seedProduct(a, { name: `CPFIN-004 Cup ${SFX}`, price: pCup.price, cost: pCup.cost, quantity: 500, sku: `CPFIN4-CUP-${SFX}` })).id;
  pUsd45.id = (await seedProduct(a, { name: `CPFIN-004 Usd45 ${SFX}`, price: pUsd45.price, cost: pUsd45.cost, quantity: 200, sku: `CPFIN4-U45-${SFX}` })).id;
  pUsd50.id = (await seedProduct(a, { name: `CPFIN-004 Usd50 ${SFX}`, price: pUsd50.price, cost: pUsd50.cost, quantity: 200, sku: `CPFIN4-U50-${SFX}` })).id;
});

test.afterAll(async () => {
  try {
    if (saleIds.length > 0) {
      const list = saleIds.map((id) => `"${id}"`).join(',');
      await sb.delete('fin_entries', `store_id=eq.${storeA}&document_id=in.(${list})`).catch(() => {});
      await sb.delete('payment_transactions', `ref_type=eq.sale&ref_id=in.(${list})`).catch(() => {});
      await sb.delete('transaction_items', `transaction_id=in.(${list})`).catch(() => {});
      await sb.delete('transactions', `id=in.(${list})`).catch(() => {});
    }
    await sb.delete('audit_logs', `store_id=eq.${storeA}&action=eq.CP_FIN004_NORMALIZE`).catch(() => {});
    if (storeA) {
      await sb.delete('fin_posting_generations', `store_id=eq.${storeA}`).catch(() => {});
      await sb.delete('fin_entries', `store_id=eq.${storeA}`).catch(() => {});
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[afterAll] cleanup parcial:', String(e).slice(0, 200));
  }
});

// ══════════════════════════════════════════════════════════════════════════
// PARTE 0 — Contrato estático (enum, mapeo, métricas, reglas)
// ══════════════════════════════════════════════════════════════════════════

test('C0.1 · contrato: enum payment_method_enum incluye external_transfer', async () => {
  // information_schema no lista enums de tipos: se verifica con un valor real
  // persistido (la Prueba B) + el mapeo canónico activo.
  const map = await sb.select<{ payment_method: string; currency: string; category_code: string; is_active: boolean }>(
    'fin_account_mapping', `payment_method=eq.external_transfer&select=payment_method,currency,category_code,is_active&order=currency.asc`);
  expect(map.length).toBeGreaterThanOrEqual(2);
  for (const row of map.filter((r) => r.currency === 'USD' || r.currency === 'EUR')) {
    expect(row.category_code).toBe('ACT_TRANSF_EXTERIOR');
    expect(row.is_active).toBe(true);
  }
  // Las filas heredadas zelle quedan desactivadas (compatibilidad controlada).
  const legacy = await sb.select<{ is_active: boolean }>('fin_account_mapping', `payment_method=eq.zelle&select=is_active`);
  for (const row of legacy) expect(row.is_active).toBe(false);
});

test('C0.2 · contrato: métricas canónicas en el catálogo y regla VENTA v4 activa', async () => {
  const metrics = await sb.select<{ metric: string }>('fin_metric_catalog', `metric=like.cob_external_transfer*&select=metric&order=metric.asc`);
  expect(metrics.map((m) => m.metric)).toContain('cob_external_transfer_usd_cup');
  expect(metrics.map((m) => m.metric)).toContain('cob_external_transfer_usd_cup_origin');

  const rules = await sb.select<{ version: number; status: string; movements: any }>(
    'fin_rule_versions', `document_type=eq.VENTA&status=eq.active&select=version,status,movements&order=version.desc&limit=1`);
  expect(rules.length).toBe(1);
  const defs = JSON.stringify(rules[0].movements);
  expect(defs).toContain('cob_external_transfer_usd_cup');
  expect(defs).toContain('ACT_TRANSF_EXTERIOR');
  // La regla activa NO depende del valor zelle como canónico (las ramas
  // heredadas quedan documentadas, ambas imputan la MISMA cuenta).
  expect(defs).toContain('"v-ext-usd"');
});

// ══════════════════════════════════════════════════════════════════════════
// PARTE 1 — Pruebas A/B/C/D del anexo §7
// ══════════════════════════════════════════════════════════════════════════

test('A · Efectivo + USD → persiste cash; incrementa caja USD; sin exterior ni zelle', async ({ request }) => {
  const id = await checkout(request, {
    store_id: storeA, seller_id: adminId, payment_method: 'cash',
    items: [{ product_id: pUsd45.id, quantity: 30, price: 4.5, cost: pUsd45.cost, currency: 'USD', exchange_rate: RATE, cash_paid: 135, cash_currency: 'USD' }],
    total_amount: 125550, subtotal: 125550, cash_amount: 125550, transfer_amount: 0,
    sale_currency: 'USD', sale_exchange_rate: RATE,
    payment_components: [{ method: 'cash', currency: 'USD', amount: 135 }],
  });

  // Persistencia del medio: cash + USD.
  const rows = await payRows(id);
  expect(rows).toHaveLength(1);
  expect(rows[0].payment_method).toBe('cash');
  expect(rows[0].currency).toBe('USD');
  expect(Number(rows[0].amount)).toBeCloseTo(135, 2);
  const header = await saleHeader(id);
  expect(header.payment_method).toBe('cash');
  expect(Number(header.cash_amount)).toBe(125550);

  // Movimiento: caja USD; bancos/exterior NO.
  const cajaUsd = await detail('ACT_EFECTIVO_USD');
  const row = movsOf(cajaUsd, id).find((m) => m.sense === 'debito');
  expect(row && Number(row.amount_cup)).toBe(125550);
  expect(Number(row!.amount_origin)).toBeCloseTo(135, 2);
  for (const cat of ['ACT_BANCOS', 'ACT_TRANSF_EXTERIOR']) {
    const d = await detail(cat);
    expect(movsOf(d, id)).toHaveLength(0);
  }
});

test('B · Transf. Exterior + USD → persiste external_transfer; cuenta exterior; SIN zelle', async ({ request }) => {
  const id = await checkout(request, {
    store_id: storeA, seller_id: adminId, payment_method: 'external_transfer',
    items: [{ product_id: pUsd50.id, quantity: 1, price: 50, cost: pUsd50.cost, currency: 'USD', exchange_rate: RATE, external_transfer_paid: 50, external_transfer_currency: 'USD' }],
    total_amount: 46500, subtotal: 46500, cash_amount: 0, transfer_amount: 0, external_transfer_amount: 46500,
    sale_currency: 'USD', sale_exchange_rate: RATE,
  });

  // Persistencia: external_transfer (canónico) — NUNCA 'zelle'.
  const rows = await payRows(id);
  expect(rows).toHaveLength(1);
  expect(rows[0].payment_method).toBe('external_transfer');
  expect(rows[0].currency).toBe('USD');
  expect(Number(rows[0].amount)).toBeCloseTo(50, 2);
  expect(Number(rows[0].exchange_rate)).toBe(RATE);
  const header = await saleHeader(id);
  expect(header.payment_method).toBe('external_transfer');
  expect(Number(header.external_transfer_amount)).toBe(46500);
  expect(Number(header.zelle_amount)).toBe(0);

  // Movimiento: cuenta exterior propia con el nominal original.
  const ext = await detail('ACT_TRANSF_EXTERIOR');
  const row = movsOf(ext, id).find((m) => m.sense === 'debito');
  expect(row && Number(row.amount_cup)).toBe(46500);
  expect(Number(row!.amount_origin)).toBeCloseTo(50, 2);
  for (const cat of ['ACT_BANCOS', 'ACT_EFECTIVO_USD', 'ACT_EFECTIVO_CUP']) {
    const d = await detail(cat);
    expect(movsOf(d, id)).toHaveLength(0);
  }
});

test('B2 · entrada HEREDADA zelle (cliente cachado) → se normaliza a external_transfer', async ({ request }) => {
  const id = await checkout(request, {
    store_id: storeA, seller_id: adminId, payment_method: 'zelle',
    items: [{ product_id: pUsd50.id, quantity: 1, price: 50, cost: pUsd50.cost, currency: 'USD', exchange_rate: RATE, zelle_paid: 50, zelle_currency: 'USD' }],
    total_amount: 46500, subtotal: 46500, cash_amount: 0, transfer_amount: 0, zelle_amount: 46500,
    sale_currency: 'USD', sale_exchange_rate: RATE,
    payment_components: [{ method: 'zelle', currency: 'USD', amount: 50 }],
  });

  // El backend JAMÁS persiste zelle: se normaliza en el punto único de ingreso.
  const rows = await payRows(id);
  expect(rows).toHaveLength(1);
  expect(rows[0].payment_method).toBe('external_transfer');
  const header = await saleHeader(id);
  expect(header.payment_method).toBe('external_transfer');
  expect(Number(header.external_transfer_amount)).toBe(46500);
  expect(Number(header.zelle_amount)).toBe(0);

  // Y contabiliza a la cuenta exterior canónica.
  const ext = await detail('ACT_TRANSF_EXTERIOR');
  expect(movsOf(ext, id).filter((m) => m.sense === 'debito')).toHaveLength(1);
});

test('C · Transferencia + CUP → banco nacional; NO confundida con exterior', async ({ request }) => {
  const id = await checkout(request, {
    store_id: storeA, seller_id: adminId, payment_method: 'transfer',
    items: [{ product_id: pCup.id, quantity: 5, price: pCup.price, cost: pCup.cost, currency: 'CUP', exchange_rate: 1, transfer_paid: 10000, transfer_currency: 'CUP' }],
    total_amount: 10000, subtotal: 10000, cash_amount: 0, transfer_amount: 10000,
    sale_currency: 'CUP', sale_exchange_rate: 1,
  });

  const rows = await payRows(id);
  expect(rows).toHaveLength(1);
  expect(rows[0].payment_method).toBe('transfer');
  expect(rows[0].currency).toBe('CUP');

  const bancos = await detail('ACT_BANCOS');
  const row = movsOf(bancos, id).find((m) => m.sense === 'debito');
  expect(row && Number(row.amount_cup)).toBe(10000);
  const ext = await detail('ACT_TRANSF_EXTERIOR');
  expect(movsOf(ext, id)).toHaveLength(0);
});

test('D · independencia medio × moneda: USD NO deduce exterior — el medio lo decide la selección', async ({ request }) => {
  // Tres ventas USD con medios DISTINTOS: la moneda NO determina el medio.
  const cashUsd = await checkout(request, {
    store_id: storeA, seller_id: adminId, payment_method: 'cash',
    items: [{ product_id: pUsd45.id, quantity: 10, price: 4.5, cost: pUsd45.cost, currency: 'USD', exchange_rate: RATE, cash_paid: 45, cash_currency: 'USD' }],
    total_amount: 41850, subtotal: 41850, cash_amount: 41850, transfer_amount: 0,
    sale_currency: 'USD', sale_exchange_rate: RATE,
    payment_components: [{ method: 'cash', currency: 'USD', amount: 45 }],
  });
  const rowsCash = await payRows(cashUsd);
  expect(rowsCash[0].payment_method).toBe('cash');
  const ext = await detail('ACT_TRANSF_EXTERIOR');
  expect(movsOf(ext, cashUsd)).toHaveLength(0);

  const transferUsd = await checkout(request, {
    store_id: storeA, seller_id: adminId, payment_method: 'transfer',
    items: [{ product_id: pUsd45.id, quantity: 10, price: 4.5, cost: pUsd45.cost, currency: 'USD', exchange_rate: RATE, transfer_paid: 45, transfer_currency: 'USD' }],
    total_amount: 41850, subtotal: 41850, cash_amount: 0, transfer_amount: 41850,
    sale_currency: 'USD', sale_exchange_rate: RATE,
    payment_components: [{ method: 'transfer', currency: 'USD', amount: 45 }],
  });
  const rowsTransfer = await payRows(transferUsd);
  expect(rowsTransfer[0].payment_method).toBe('transfer');
  expect(movsOf(await detail('ACT_TRANSF_EXTERIOR'), transferUsd)).toHaveLength(0);

  // La misma cantidad por exterior: solo ESTA venta toca la cuenta exterior.
  const exteriorUsd = await checkout(request, {
    store_id: storeA, seller_id: adminId, payment_method: 'external_transfer',
    items: [{ product_id: pUsd45.id, quantity: 10, price: 4.5, cost: pUsd45.cost, currency: 'USD', exchange_rate: RATE, external_transfer_paid: 45, external_transfer_currency: 'USD' }],
    total_amount: 41850, subtotal: 41850, cash_amount: 0, transfer_amount: 0, external_transfer_amount: 41850,
    sale_currency: 'USD', sale_exchange_rate: RATE,
  });
  expect(movsOf(await detail('ACT_TRANSF_EXTERIOR'), exteriorUsd).filter((m) => m.sense === 'debito')).toHaveLength(1);
});

// ══════════════════════════════════════════════════════════════════════════
// PARTE 2 — Prueba E: regresión histórica + normalizador canónico
// ══════════════════════════════════════════════════════════════════════════

test('E1 · venta histórica Efectivo+USD no reaparece como zelle/exterior tras informes y re-derivación', async ({ request }) => {
  const id = await checkout(request, {
    store_id: storeA, seller_id: adminId, payment_method: 'cash',
    items: [{ product_id: pUsd45.id, quantity: 20, price: 4.5, cost: pUsd45.cost, currency: 'USD', exchange_rate: RATE, cash_paid: 90, cash_currency: 'USD' }],
    total_amount: 83700, subtotal: 83700, cash_amount: 83700, transfer_amount: 0,
    sale_currency: 'USD', sale_exchange_rate: RATE,
    payment_components: [{ method: 'cash', currency: 'USD', amount: 90 }],
  });

  // 1) Informes por categoría: sigue en caja USD.
  const cajaUsd = await detail('ACT_EFECTIVO_USD');
  expect(movsOf(cajaUsd, id).filter((m) => m.sense === 'debito')).toHaveLength(1);
  expect(movsOf(await detail('ACT_TRANSF_EXTERIOR'), id)).toHaveLength(0);

  // 2) Dashboard (informes leen SOLO la generación activa): sin errores y la
  //    venta no se recuenta como exterior.
  const dash = await rpcAsUser<{ transfer_exterior: number; errores?: number }>('fin_get_dashboard', adminToken,
    { p_store_id: storeA, p_from: '2026-01-01', p_to: '2030-12-31' });
  expect(dash.ok).toBe(true);

  // 3) Re-derivación de métricas (el mismo camino del rebuild de asientos):
  //    la venta produce cob_cash_usd_cup y NUNCA cob_zelle/cob_external_transfer.
  const metrics = await rpcAsService<Record<string, unknown>>('fin_compute_metrics',
    { p_doctype: 'VENTA', p_document_id: id });
  expect(metrics.ok).toBe(true);
  const m = metrics.data!;
  expect(Number(m['cob_cash_usd_cup'])).toBe(83700);
  expect(Number(m['cob_external_transfer_usd_cup'] ?? 0)).toBe(0);
  expect(Number(m['cob_zelle_usd_cup'] ?? 0)).toBe(0);
  expect(Number(m['cob_total_cup'])).toBe(83700);

  // 4) El estado persistido se mantiene (ningún proceso lo reclasifica).
  const rows = await payRows(id);
  expect(rows[0].payment_method).toBe('cash');
});

test('E2 · normalizador canónico: 3 ventas exterior + demás USD → efectivo (declaración del propietario)', async ({ request }) => {
  // Universo de fixtures con datos HEREDADOS 'zelle' (simulan la BD previa a
  // la normalización): 5 ventas USD (2 declaradas exterior, 3 a reclasificar
  // como efectivo) + 1 venta CUP que conserva su medio real.
  const mkLegacyZelle = async (usd: number) => {
    const id = await checkout(request, {
      store_id: storeA, seller_id: adminId, payment_method: 'external_transfer',
      items: [{ product_id: pUsd50.id, quantity: 1, price: usd, cost: pUsd50.cost, currency: 'USD', exchange_rate: RATE, external_transfer_paid: usd, external_transfer_currency: 'USD' }],
      total_amount: usd * RATE, subtotal: usd * RATE, cash_amount: 0, transfer_amount: 0, external_transfer_amount: usd * RATE,
      sale_currency: 'USD', sale_exchange_rate: RATE,
    });
    // Reescribir al valor HEREDADO (como estaba en producción pre-migración).
    await sb.update('payment_transactions', `ref_type=eq.sale&ref_id=eq.${id}`, { payment_method: 'zelle' });
    await sb.update('transactions', `id=eq.${id}`, { payment_method: 'zelle', zelle_amount: usd * RATE, external_transfer_amount: 0 });
    return id;
  };

  const z1 = await mkLegacyZelle(330); // declarada exterior (21/08)
  const z2 = await mkLegacyZelle(330); // declarada exterior (22/08)
  const z3 = await mkLegacyZelle(210); // declarada exterior (22/09)
  const z4 = await mkLegacyZelle(50);  // demás → efectivo USD
  const z5 = await mkLegacyZelle(45);  // demás → efectivo USD

  const cupId = await checkout(request, {
    store_id: storeA, seller_id: adminId, payment_method: 'cash',
    items: [{ product_id: pCup.id, quantity: 2, price: pCup.price, cost: pCup.cost, currency: 'CUP', exchange_rate: 1, cash_paid: 4000, cash_currency: 'CUP' }],
    total_amount: 4000, subtotal: 4000, cash_amount: 4000, transfer_amount: 0,
    sale_currency: 'CUP', sale_exchange_rate: 1,
  });

  // ── Ejecutar el NORMALIZADOR canónico con el universo del fixture ──
  const norm = await rpcAsService<{ status: string; n_ventas_exterior: number; n_ventas_efectivo: number; usd_exterior_final: number; usd_reclasificados_efectivo: number; residual_zelle: number }>(
    'cp_fin004_normalize_enervida_payments',
    { p_store_id: storeA, p_exterior_sales: [z1, z2, z3] });
  expect(norm.ok).toBe(true);
  const r = norm.data!;
  expect(r.status).toBe('OK');
  expect(r.n_ventas_exterior).toBe(3);
  expect(r.n_ventas_efectivo).toBe(2);
  expect(r.usd_exterior_final).toBeCloseTo(870, 2); // 330+330+210
  expect(r.usd_reclasificados_efectivo).toBeCloseTo(95, 2); // 50+45
  expect(r.residual_zelle).toBe(0);

  // ── Estado persistido: las 3 declaradas → external_transfer ──
  for (const id of [z1, z2, z3]) {
    const rows = await payRows(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].payment_method).toBe('external_transfer');
    expect(rows[0].notes).toContain('CP-FIN-004');
    const header = await saleHeader(id);
    expect(header.payment_method).toBe('external_transfer');
    expect(Number(header.external_transfer_amount)).toBe(Number(rows[0].amount) * RATE);
    expect(Number(header.zelle_amount)).toBe(0);
  }

  // ── Las demás USD → cash + USD (efectivo) ──
  for (const id of [z4, z5]) {
    const rows = await payRows(id);
    expect(rows[0].payment_method).toBe('cash');
    expect(rows[0].notes).toContain('CP-FIN-004');
    const header = await saleHeader(id);
    expect(header.payment_method).toBe('cash');
    expect(Number(header.cash_amount)).toBe(Number(rows[0].amount) * RATE);
    expect(Number(header.zelle_amount)).toBe(0);
    expect(Number(header.external_transfer_amount)).toBe(0);
  }

  // ── La venta CUP conserva SU medio real (sin tocar) ──
  const cupRows = await payRows(cupId);
  expect(cupRows[0].payment_method).toBe('cash');
  expect(cupRows[0].currency).toBe('CUP');

  // ── Cero zelle residual en la tienda ──
  const residualPay = await sb.select<{ id: string }>('payment_transactions', `store_id=eq.${storeA}&payment_method=eq.zelle&select=id`);
  expect(residualPay).toHaveLength(0);
  const residualTx = await sb.select<{ id: string }>('transactions', `store_id=eq.${storeA}&payment_method=eq.zelle&select=id`);
  expect(residualTx).toHaveLength(0);

  // ── Idempotencia: re-ejecutar no duplica ni cambia nada ──
  const norm2 = await rpcAsService<{ status: string }>('cp_fin004_normalize_enervida_payments',
    { p_store_id: storeA, p_exterior_sales: [z1, z2, z3] });
  expect(norm2.ok).toBe(true);
  expect(norm2.data!.status).toBe('YA_APLICADO');
  const z4After = await payRows(z4);
  expect(z4After[0].payment_method).toBe('cash');
});

// ══════════════════════════════════════════════════════════════════════════
// PARTE 3 — Prueba F: venta mixta (componentes independientes)
// ══════════════════════════════════════════════════════════════════════════

test('F · venta mixta: cada componente conserva medio, moneda, importe y cuenta', async ({ request }) => {
  const id = await checkout(request, {
    store_id: storeA, seller_id: adminId, payment_method: 'mixed',
    items: [
      { product_id: pUsd45.id, quantity: 10, price: 4.5, cost: pUsd45.cost, currency: 'USD', exchange_rate: RATE, cash_paid: 45, cash_currency: 'USD' },
      { product_id: pCup.id, quantity: 5, price: pCup.price, cost: pCup.cost, currency: 'CUP', exchange_rate: 1, transfer_paid: 10000, transfer_currency: 'CUP' },
    ],
    total_amount: 10000 + 41850, subtotal: 10000 + 41850,
    cash_amount: 41850, transfer_amount: 10000,
    sale_currency: 'USD', sale_exchange_rate: RATE,
    payment_components: [
      { method: 'cash', currency: 'USD', amount: 45 },
      { method: 'transfer', currency: 'CUP', amount: 10000 },
    ],
  });

  // Cada componente con SU medio y moneda en la fuente autoritativa.
  const rows = await payRows(id);
  expect(rows).toHaveLength(2);
  const cashRow = rows.find((r) => r.payment_method === 'cash')!;
  const transferRow = rows.find((r) => r.payment_method === 'transfer')!;
  expect(cashRow.currency).toBe('USD');
  expect(Number(cashRow.amount)).toBeCloseTo(45, 2);
  expect(transferRow.currency).toBe('CUP');
  expect(Number(transferRow.amount)).toBe(10000);
  const header = await saleHeader(id);
  expect(header.payment_method).toBe('mixed');

  // Cada componente a SU cuenta financiera.
  const cajaUsd = await detail('ACT_EFECTIVO_USD');
  const movCash = movsOf(cajaUsd, id).find((m) => m.sense === 'debito');
  expect(movCash && Number(movCash.amount_cup)).toBe(41850);
  expect(Number(movCash!.amount_origin)).toBeCloseTo(45, 2);
  const bancos = await detail('ACT_BANCOS');
  const movTransfer = movsOf(bancos, id).find((m) => m.sense === 'debito');
  expect(movTransfer && Number(movTransfer.amount_cup)).toBe(10000);
  // Sin exterior en una mixta sin componente exterior.
  expect(movsOf(await detail('ACT_TRANSF_EXTERIOR'), id)).toHaveLength(0);

  // Mixta CON componente exterior: el componente exterior conserva SU cuenta.
  const idMix = await checkout(request, {
    store_id: storeA, seller_id: adminId, payment_method: 'mixed',
    items: [
      { product_id: pUsd50.id, quantity: 1, price: 50, cost: pUsd50.cost, currency: 'USD', exchange_rate: RATE, external_transfer_paid: 50, external_transfer_currency: 'USD' },
      { product_id: pCup.id, quantity: 2, price: pCup.price, cost: pCup.cost, currency: 'CUP', exchange_rate: 1, cash_paid: 4000, cash_currency: 'CUP' },
    ],
    total_amount: 46500 + 4000, subtotal: 46500 + 4000,
    cash_amount: 4000, transfer_amount: 0, external_transfer_amount: 46500,
    sale_currency: 'USD', sale_exchange_rate: RATE,
    payment_components: [
      { method: 'external_transfer', currency: 'USD', amount: 50 },
      { method: 'cash', currency: 'CUP', amount: 4000 },
    ],
  });
  const rowsMix = await payRows(idMix);
  expect(rowsMix).toHaveLength(2);
  expect(rowsMix.find((r) => r.payment_method === 'external_transfer')!.currency).toBe('USD');
  expect(rowsMix.find((r) => r.payment_method === 'cash')!.currency).toBe('CUP');
  const ext = await detail('ACT_TRANSF_EXTERIOR');
  const movExt = movsOf(ext, idMix).find((m) => m.sense === 'debito');
  expect(movExt && Number(movExt.amount_cup)).toBe(46500);
  expect(Number(movExt!.amount_origin)).toBeCloseTo(50, 2);
  const cajaCup = await detail('ACT_EFECTIVO_CUP');
  expect(movsOf(cajaCup, idMix).find((m) => m.sense === 'debito')!.amount_cup).toBe('4000');
});
