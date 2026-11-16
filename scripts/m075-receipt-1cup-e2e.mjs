#!/usr/bin/env node
// ============================================================================
// M075 — CP-FIN-RECEIPT-UNIT-COST-1-CUP-011 · E2E EN BD AISLADA (CostproE2E)
// Reproduce la ejecución completa de los lotes m011 contra un fixture realista
// en la BD aislada lguovmvrozxgssupkwpf (NUNCA producción):
//   --setup     crea fixture: tienda + 5 productos + recepción (pending→active,
//               el motor contabiliza el reconocimiento) + capas + salidas
//               (venta/vale/ajuste/reversas casadas) — réplica del patrón FVC.
//   --extract   extrae el fixture al formato m070 → e2e-extract.json
//   --genconfig genera config-e2e.json (orig_entry del estado del setup)
//   --execute   ejecuta los lotes A–D (scripts/out/m011/sql-e2e/*.sql)
//   --verify    verificación post + REEJECUCIÓN de los 4 lotes (idempotencia:
//               cero cambios) + capas ajenas intactas + precios intactos
//   --cleanup   borra el fixture completo y certifica net delta = 0
// El canal es la Management API (1 llamada = 1 transacción atómica, patrón
// m061 --probe ya validado). Guard assert-not-production: E2E pasa libre.
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const MODE = process.argv[2] || '';
const BASE = 'scripts/out/m011';
const E2E = 'lguovmvrozxgssupkwpf';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;

// IDs deterministas del fixture (prefijo 0e11)
const F = {
  store: '0e11a000-0000-4000-8000-000000000001',
  receipt: '0e11b000-0000-4000-8000-000000000001',
  otherRef: '0e11b000-0000-4000-8000-000000000002', // 2ª compra ajena (P5)
  origEntryFallback: '0e11d000-0000-4000-8000-000000000001',
  P: [1, 2, 3, 4, 5].map((i) => `0e11c000-0000-4000-8000-00000000000${i}`),
  L: [1, 2, 3, 4, 5].map((i) => `0e11f000-0000-4000-8000-00000000000${i}`),
  M: (n) => `0e115000-0000-4000-8000-${String(n).padStart(12, '0')}`,
};

async function qE2E(sql, label) {
  assertNotProduction({ mode: 'write', projectRef: E2E, context: `m075-${MODE || 'run'}${label ? ':' + label : ''}` });
  const res = await fetch(`https://api.supabase.com/v1/projects/${E2E}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] HTTP ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text || '[]');
}
const state = () => (existsSync(resolve(BASE, 'e2e-state.json')) ? JSON.parse(readFileSync(resolve(BASE, 'e2e-state.json'), 'utf8')) : null);
const saveState = (s) => writeFileSync(resolve(BASE, 'e2e-state.json'), JSON.stringify(s, null, 2));

const TABLAS_NETZERO = ['stores', 'products', 'receipts', 'receipt_items', 'stock_movements', 'fin_entries', 'fin_movements', 'audit_logs', 'wac_change_log', 'fin_posting_errors', 'audit_events'];
async function contar() {
  const rows = await qE2E(`SELECT ${TABLAS_NETZERO.map((t) => `(SELECT count(*) FROM public.${t}) AS ${t}`).join(', ')}`, 'conteo');
  return rows[0];
}

// ════════════════════════════════ --setup ═══════════════════════════════════
if (MODE === '--setup') {
  const previo = await qE2E(`SELECT id FROM public.receipts WHERE id='${F.receipt}'`, 'fixture-previo');
  if (previo.length) { console.log('Fixture ya presente — setup idempotente OK (nada que hacer)'); process.exit(0); }
  const base = (await qE2E(`SELECT (SELECT id FROM public.tenants ORDER BY created_at LIMIT 1) AS tenant,
    (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1) AS profile,
    (SELECT id FROM public.stores ORDER BY created_at LIMIT 1) AS store`, 'ids-base'))[0];
  const conteo0 = await contar();
  const T = base.tenant, U = base.profile;
  const S = base.store; // tienda EXISTENTE del E2E: el fixture no crea/destruye tiendas
  // El fixture previo (si quedó una tienda propia de una versión anterior) se limpia en modo réplica
  await qE2E(`BEGIN; SET LOCAL session_replication_role = replica; DELETE FROM public.stores WHERE id='${F.store}'; COMMIT;`, 'tienda-huérfana-previa');

  const prods = [
    //  sku    name                       price  ccy   cost  wac    stock svc
    ['9001', 'Producto prueba 9001', 1000, 'CUP', 400, 400, 0, false],
    ['9002', 'Producto prueba 9002', 3000, 'CUP', 100, 68000, 0, false],
    ['9003', 'Producto prueba 9003', 50, 'CUP', 1, 1, 0, false],
    ['9004', 'Servicio prueba 9004', 1, 'CUP', 1, 1, 0, true],
    ['9005', 'Producto prueba 9005', 500, 'CUP', 100, 55, 0, false],
  ];
  await qE2E(`INSERT INTO public.products (id, store_id, tenant_id, sku, name, price, price_currency, cost_price, cost_average, stock_current, is_service, is_active)
    VALUES ${prods.map((p, i) => `('${F.P[i]}','${S}','${T}','${p[0]}','${p[1]}',${p[2]},'${p[3]}',${p[4]},${p[5]},${p[6]},${p[7]},true)`).join(', ')}`, 'productos');

  await qE2E(`INSERT INTO public.receipts (id, store_id, tenant_id, user_id, status, total_cost, payment_status, paid_amount,
      supplier, reception_date, reference_doc, notes)
    VALUES ('${F.receipt}','${S}','${T}','${U}','pending',0,'unpaid',0,'TestProveedor','2026-07-01','TEST-FAC-011','fixture m011')`, 'recepción pending');

  const lineas = [
    // product, qty, uc, moneda, tasa
    [F.P[0], 10, 400, 'CUP', 1],
    [F.P[1], 3, 100, 'USD', 680],
    [F.P[2], 5, 1, 'CUP', 1],
    [F.P[3], 4, 1, 'CUP', 1],
    [F.P[4], 5, 100, 'CUP', 1],
  ];
  await qE2E(`INSERT INTO public.receipt_items (id, receipt_id, product_id, quantity, unit_cost, moneda_recepcion, tasa_cambio_recepcion)
    VALUES ${lineas.map((l, i) => `('${F.L[i]}','${F.receipt}','${l[0]}',${l[1]},${l[2]},'${l[3]}',${l[4]})`).join(', ')}`, 'líneas');

  const movs = [
    // n, product, tipo, qc, uc, ref, doc, fecha
    [1, F.P[0], 'purchase', 10, 400, F.receipt, 'Confirmacion recepción', '2026-07-01 12:00'],
    [2, F.P[1], 'purchase', 3, 68000, F.receipt, 'Confirmacion recepción', '2026-07-01 12:00'],
    [3, F.P[2], 'purchase', 5, 1, F.receipt, 'Confirmacion recepción', '2026-07-01 12:00'],
    [4, F.P[3], 'purchase', 4, 1, F.receipt, 'Confirmacion recepción', '2026-07-01 12:00'],
    [5, F.P[4], 'purchase', 5, 100, F.receipt, 'Confirmacion recepción', '2026-07-01 12:00'],
    [6, F.P[4], 'purchase', 5, 10, F.otherRef, 'Confirmacion recepción ajena', '2026-07-02 12:00'],
    [7, F.P[0], 'sale', -5, 0, '0e11f100-0000-4000-8000-000000000001', 'Venta POS v2', '2026-08-01 12:00'],
    [8, F.P[1], 'sale', -2, 0, '0e11f100-0000-4000-8000-000000000002', 'Venta POS v2', '2026-08-10 12:00'],
    [9, F.P[0], 'issue_slip_out', -2, 400, '0e11f100-0000-4000-8000-000000000003', 'Vale de Salida VS-T1', '2026-08-15 12:00'],
    [10, F.P[0], 'adjustment', -1, 0, null, 'Cuadre prueba', '2026-09-01 12:00'],
    [11, F.P[0], 'sale_reverse', 2, 399, '0e11f100-0000-4000-8000-000000000001', 'Reverso de venta', '2026-09-15 12:00'],
    [12, F.P[0], 'issue_slip_reverse', 1, 400, '0e11f100-0000-4000-8000-000000000003', 'Reversion Vale VS-T1', '2026-09-20 12:00'],
    [13, F.P[4], 'sale', -7, 0, '0e11f100-0000-4000-8000-000000000004', 'Venta POS v2', '2026-10-01 12:00'],
  ];
  for (const m of movs) {
    await qE2E(`INSERT INTO public.stock_movements (id, store_id, product_id, movement_type, quantity_change, unit_cost, reference_id, reference_doc, movement_date)
      VALUES ('${F.M(m[0])}','${S}','${m[1]}','${m[2]}',${m[3]},${m[4]},${m[5] ? `'${m[5]}'` : 'NULL'},'${m[6]}','${m[7]}')`, `mov ${m[0]} ${m[2]}`);
  }

  // Activación → el motor contabiliza el reconocimiento (como en producción)
  await qE2E(`UPDATE public.receipts SET status='active', total_cost=208509.00 WHERE id='${F.receipt}'`, 'activación');
  let entradas = await qE2E(`SELECT id, event, status FROM public.fin_entries WHERE document_id='${F.receipt}' ORDER BY posted_at`, 'entradas');
  let enginePosted = entradas.length > 0;
  if (!enginePosted) {
    await qE2E(`INSERT INTO public.fin_entries (id, store_id, document_type, document_id, event, economic_date, posted_at, status, description)
      VALUES ('${F.origEntryFallback}','${S}','RECEPCION','${F.receipt}','reconocimiento','2026-07-01',now(),'posted','Entrada de almacén (fixture m011)')`, 'asiento original manual');
    await qE2E(`INSERT INTO public.fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, description)
      VALUES ('0e11e000-0000-4000-8000-000000000001','${F.origEntryFallback}','${S}','ACT_INVENTARIO','debito',208509.00,'CUP',1,'2026-07-01','fixture'),
             ('0e11e000-0000-4000-8000-000000000002','${F.origEntryFallback}','${S}','PAS_CXP_PROV','credito',208509.00,'CUP',1,'2026-07-01','fixture')`, 'movimientos originales');
    entradas = await qE2E(`SELECT id, event, status FROM public.fin_entries WHERE document_id='${F.receipt}'`, 'entradas2');
  }
  const stocks = await qE2E(`SELECT sku, stock_current, cost_average FROM public.products WHERE id IN (${F.P.map((p) => `'${p}'`).join(',')}) ORDER BY sku`, 'stocks');
  console.log('Fixture creado. Asientos:', JSON.stringify(entradas), '· stocks:', JSON.stringify(stocks));
  saveState({ fecha: new Date().toISOString(), tenant: T, profile: U, store: S, receipt: F.receipt,
    products: F.P, lineas: F.L, movs: movs.map((m) => F.M(m[0])), otherRef: F.otherRef,
    origEntry: entradas[0].id, enginePosted, conteo0 });
  process.exit(0);
}

// ════════════════════════════════ --extract ═════════════════════════════════
if (MODE === '--extract') {
  const st = state();
  const R = st.receipt;
  const PIDS = st.products.map((p) => `'${p}'`).join(',');
  const snap = { mision: 'CP-FIN-RECEIPT-UNIT-COST-1-CUP-011 (E2E)', fixture: true };
  snap.receipt = (await qE2E(`SELECT * FROM public.receipts WHERE id='${R}'`, 'receipt'))[0];
  snap.receipt_items = await qE2E(`SELECT ri.id AS line_id, ri.product_id, p.sku, p.name, ri.quantity, ri.unit_cost,
      ri.moneda_recepcion, ri.tasa_cambio_recepcion, p.is_service, p.price AS precio_venta, p.price_currency,
      p.cost_price AS cost_price_maestro, p.cost_average AS wac_actual, p.stock_current, p.store_id
    FROM public.receipt_items ri JOIN public.products p ON p.id=ri.product_id WHERE ri.receipt_id='${R}' ORDER BY p.sku`, 'items');
  snap.layers_fvc = await qE2E(`SELECT sm.id, sm.store_id, sm.product_id, p.sku, sm.movement_type, sm.quantity_change, sm.unit_cost,
      sm.cost_value_change, sm.balance_after, sm.reference_id, sm.reference_doc, sm.movement_date, sm.created_at
    FROM public.stock_movements sm JOIN public.products p ON p.id=sm.product_id
    WHERE sm.reference_id='${R}' AND sm.movement_type='purchase' ORDER BY p.sku`, 'capas');
  snap.kardex_101 = await qE2E(`SELECT sm.id, sm.store_id, sm.product_id, p.sku, sm.movement_type, sm.quantity_change, sm.unit_cost,
      sm.unit_price, sm.cost_value_change, sm.balance_after, sm.reference_id, sm.reference_doc, sm.movement_date, sm.created_at, sm.notes
    FROM public.stock_movements sm JOIN public.products p ON p.id=sm.product_id
    WHERE sm.product_id IN (${PIDS}) ORDER BY sm.movement_date, sm.created_at`, 'kardex');
  snap.fin_entries_fvc = await qE2E(`SELECT * FROM public.fin_entries WHERE document_id='${R}' ORDER BY posted_at`, 'asientos');
  const eids = snap.fin_entries_fvc.map((e) => `'${e.id}'`).join(',');
  snap.fin_movements_fvc = eids ? await qE2E(`SELECT id, entry_id, category_code, sense, amount, amount_cup, document_number, economic_date, description
    FROM public.fin_movements WHERE entry_id IN (${eids})`, 'movimientos') : [];
  writeFileSync(resolve(BASE, 'e2e-extract.json'), JSON.stringify(snap, null, 1));
  console.log(`extract OK → ${BASE}/e2e-extract.json (líneas=${snap.receipt_items.length}, capas=${snap.layers_fvc.length}, kardex=${snap.kardex_101.length}, asientos=${snap.fin_entries_fvc.length})`);
  process.exit(0);
}

// ═══════════════════════════════ --genconfig ════════════════════════════════
if (MODE === '--genconfig') {
  const st = state();
  const cfg = {
    receipt_id: st.receipt, store_id: st.store, orig_entry_id: st.origEntry,
    segment: '7ec9000c-0000-4000-8000',
    entry_suffix: 'd11300000001',
    fm_cxp: 'f11300000001', fm_inv: 'f11300000002', fm_cogs: 'f11300000003',
    fm_vales: 'f11300000004', fm_perd: 'f11300000005',
    aud_total: 'e11300000001', aud_entry: 'e11300000002',
    trace: 'RECT011-E2E', mision: 'CP-FIN-RECEIPT-UNIT-COST-1-CUP-011',
    entry_document_type: 'AJUSTE_INVENTARIO', entry_event: 'reconocimiento',
    economic_date: '2026-07-01', doc_number: 'TEST-FAC-011-VAL1CUP',
  };
  writeFileSync(resolve(BASE, 'config-e2e.json'), JSON.stringify(cfg, null, 2));
  console.log('config OK →', resolve(BASE, 'config-e2e.json'), '· orig_entry:', st.origEntry);
  process.exit(0);
}

// ════════════════════════════════ --execute ═════════════════════════════════
if (MODE === '--execute') {
  const orden = ['loteA_lineas.sql', 'loteB_capas.sql', 'loteC_wac.sql', 'loteD_asiento.sql'];
  const evid = { modo: '--execute', bd: `${E2E} (E2E AISLADA)`, fecha: new Date().toISOString(), lotes: [] };
  for (const f of orden) {
    const sql = readFileSync(resolve(BASE, 'sql-e2e', f), 'utf8');
    const t0 = Date.now();
    const rows = await qE2E(sql, f);
    evid.lotes.push({ lote: f, ms: Date.now() - t0, filas: rows });
    console.log(`LOTE ${f} OK (${Date.now() - t0} ms):`, JSON.stringify(rows));
  }
  writeFileSync(resolve(BASE, 'e2e-ejecucion.json'), JSON.stringify(evid, null, 2));
  process.exit(0);
}

// ════════════════════════════════ --verify ══════════════════════════════════
if (MODE === '--verify') {
  const st = state();
  const R = st.receipt, S = st.store;
  const E011 = '7ec9000c-0000-4000-8000-d11300000001';
  const checks = [];
  const chk = (id, cond, detalle) => { checks.push({ id, resultado: cond ? 'PASS' : 'FAIL', detalle: String(detalle).slice(0, 300) }); console.log(`${cond ? 'PASS' : 'FAIL'} — ${id}: ${String(detalle).slice(0, 150)}`); };

  const lin = await qE2E(`SELECT count(*)::int AS n, count(*) FILTER (WHERE unit_cost=1 AND moneda_recepcion='CUP' AND tasa_cambio_recepcion=1)::int AS ok,
      coalesce(sum(unit_cost*tasa_cambio_recepcion*quantity),0) AS total FROM public.receipt_items WHERE receipt_id='${R}'`, 'líneas');
  chk('V1_101_lineas_1cup', lin[0].n === 5 && lin[0].ok === 5 && Number(lin[0].total) === 27, JSON.stringify(lin[0]));
  const hdr = await qE2E(`SELECT total_cost, payment_status FROM public.receipts WHERE id='${R}'`, 'cabecera');
  chk('V2_cabecera_27_unpaid', Number(hdr[0].total_cost) === 27 && hdr[0].payment_status === 'unpaid', JSON.stringify(hdr[0]));
  const cap = await qE2E(`SELECT count(*)::int AS n, count(*) FILTER (WHERE unit_cost<>1)::int AS sucias,
      coalesce(sum(quantity_change*unit_cost),0) AS total FROM public.stock_movements WHERE reference_id='${R}' AND movement_type='purchase'`, 'capas');
  chk('V3_capas_a_1', cap[0].n === 5 && cap[0].sucias === 0 && Number(cap[0].total) === 27, JSON.stringify(cap[0]));
  const otra = await qE2E(`SELECT unit_cost, quantity_change FROM public.stock_movements WHERE id='${F.M(6)}'`, 'capa_ajena');
  chk('V4_capa_ajena_intacta', Number(otra[0].unit_cost) === 10 && Number(otra[0].quantity_change) === 5, JSON.stringify(otra[0]));
  const wac = await qE2E(`SELECT sku, cost_average, price, stock_current FROM public.products WHERE id IN (${st.products.map((p) => `'${p}'`).join(',')}) ORDER BY sku`, 'wac');
  const wacMap = Object.fromEntries(wac.map((w) => [w.sku, w]));
  chk('V5_wac', Number(wacMap['9001'].cost_average) === 1 && Number(wacMap['9002'].cost_average) === 1 &&
    Number(wacMap['9003'].cost_average) === 1 && Number(wacMap['9004'].cost_average) === 1 && Number(wacMap['9005'].cost_average) === 55,
    JSON.stringify(wac.map((w) => `${w.sku}:${w.cost_average}`)));
  chk('V6_precios_intactos', Number(wacMap['9001'].price) === 1000 && Number(wacMap['9002'].price) === 3000 &&
    Number(wacMap['9005'].price) === 500, JSON.stringify(wac.map((w) => `${w.sku}:${w.price}`)));
  const ent = await qE2E(`SELECT count(*)::int AS n FROM public.fin_entries WHERE id='${E011}'`, 'asiento');
  const bal = await qE2E(`SELECT coalesce(sum(CASE WHEN sense='debito' THEN amount ELSE -amount END),0) AS d FROM public.fin_movements WHERE entry_id='${E011}'`, 'balance');
  const movs = await qE2E(`SELECT category_code, sense, amount FROM public.fin_movements WHERE entry_id='${E011}' ORDER BY category_code`, 'movs');
  const cxp = await qE2E(`SELECT coalesce(sum(CASE WHEN fm.sense='credito' THEN fm.amount ELSE -fm.amount END),0) AS neta
    FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id WHERE fe.document_id='${R}' AND fm.category_code='PAS_CXP_PROV'`, 'cxp');
  chk('V7_asiento_balanceado', ent[0].n === 1 && Number(bal[0].d) === 0, `entry=${ent[0].n} balance=${bal[0].d}`);
  chk('V8_cxp_27', Number(cxp[0].neta) === 27, `cxp_neta=${cxp[0].neta}`);
  const porCat = Object.fromEntries(movs.map((m) => [m.category_code, Number(m.amount)]));
  chk('V9_split_exacto', porCat.PAS_CXP_PROV === 208482 && porCat.ACT_INVENTARIO === 69994 && porCat.GAS_COSTO_VENTAS === 137690 &&
    porCat.GAS_VALES === 399 && porCat.GAS_PERDIDA_INV === 399, JSON.stringify(porCat));
  const orig = await qE2E(`SELECT count(*)::int AS n, coalesce(sum(CASE WHEN sense='debito' THEN amount ELSE -amount END),0) AS d
    FROM public.fin_movements WHERE entry_id='${st.origEntry}'`, 'original');
  chk('V10_original_intacto', orig[0].n === 2 && Number(orig[0].d) === 0, JSON.stringify(orig[0]));

  // ── IDEMPOTENCIA: reejecutar los 4 lotes debe producir CERO cambios ──
  const audAntes = (await qE2E(`SELECT count(*)::int AS n FROM public.audit_logs WHERE id::text LIKE '7ec9000c-%' OR trace_id='RECT011-E2E'`, 'aud-antes'))[0].n;
  const wclAntes = (await qE2E(`SELECT count(*)::int AS n FROM public.wac_change_log WHERE id::text LIKE '7ec9000c-%'`, 'wcl-antes'))[0].n;
  const linAntes = (await qE2E(`SELECT count(*)::int AS n FROM public.receipt_items WHERE receipt_id='${R}' AND (unit_cost<>1 OR moneda_recepcion<>'CUP' OR tasa_cambio_recepcion<>1)`, 'lin-antes'))[0].n;
  for (const f of ['loteA_lineas.sql', 'loteB_capas.sql', 'loteC_wac.sql', 'loteD_asiento.sql']) {
    const sql = readFileSync(resolve(BASE, 'sql-e2e', f), 'utf8');
    await qE2E(sql, `reRun ${f}`);
  }
  const linDesp = (await qE2E(`SELECT count(*)::int AS n FROM public.receipt_items WHERE receipt_id='${R}' AND (unit_cost<>1 OR moneda_recepcion<>'CUP' OR tasa_cambio_recepcion<>1)`, 'lin-desp'))[0].n;
  const audDesp = (await qE2E(`SELECT count(*)::int AS n FROM public.audit_logs WHERE id::text LIKE '7ec9000c-%' OR trace_id='RECT011-E2E'`, 'aud-desp'))[0].n;
  const wclDesp = (await qE2E(`SELECT count(*)::int AS n FROM public.wac_change_log WHERE id::text LIKE '7ec9000c-%'`, 'wcl-desp'))[0].n;
  const entDesp = (await qE2E(`SELECT count(*)::int AS n FROM public.fin_entries WHERE document_id='${R}'`, 'ent-desp'))[0].n;
  const cxpDesp = (await qE2E(`SELECT coalesce(sum(CASE WHEN fm.sense='credito' THEN fm.amount ELSE -fm.amount END),0) AS neta
    FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id WHERE fe.document_id='${R}' AND fm.category_code='PAS_CXP_PROV'`, 'cxp-desp'))[0].neta;
  chk('V11_reejecucion_cero_cambios', linDesp === 0 && audDesp === audAntes && wclDesp === wclAntes && entDesp === 2 && Number(cxpDesp) === 27,
    `sucias=${linDesp} aud=${audAntes}→${audDesp} wcl=${wclAntes}→${wclDesp} asientos=${entDesp} cxp=${cxpDesp}`);

  const fails = checks.filter((c) => c.resultado === 'FAIL');
  writeFileSync(resolve(BASE, 'e2e-verificacion.json'), JSON.stringify({ fecha: new Date().toISOString(), checks,
    veredicto: fails.length === 0 ? 'E2E APROBADO — lotes válidos para producción' : `E2E CON ${fails.length} FALLO(S)` }, null, 2));
  console.log(`\n${fails.length === 0 ? 'E2E APROBADO' : 'E2E RECHAZADO: ' + fails.map((f) => f.id).join(', ')}`);
  process.exit(fails.length ? 1 : 0);
}

// ════════════════════════════════ --cleanup ═════════════════════════════════
if (MODE === '--cleanup') {
  const st = state();
  const R = st.receipt, S = st.store;
  const E011 = '7ec9000c-0000-4000-8000-d11300000001';
  const entradas = (await qE2E(`SELECT id FROM public.fin_entries WHERE document_id='${R}'`, 'entradas')).map((e) => `'${e.id}'`).join(',');
  const paso = async (sql, label) => { const r = await qE2E(sql, label); console.log(`cleanup ${label} OK`); return r; };
  if (entradas) await paso(`DELETE FROM public.fin_movements WHERE entry_id IN (${entradas})`, 'fin_movements');
  await paso(`DELETE FROM public.fin_entries WHERE document_id='${R}'`, 'fin_entries');
  await paso(`DELETE FROM public.audit_logs WHERE id::text LIKE '7ec9000c-%' OR trace_id='RECT011-E2E' OR record_id IN ('${R}','${E011}',
    ${st.products.map((p) => `'${p}'`).join(',')}, ${st.lineas.map((l) => `'${l}'`).join(',')}, ${st.movs.map((m) => `'${m}'`).join(',')})`, 'audit_logs');
  await paso(`DELETE FROM public.wac_change_log WHERE id::text LIKE '7ec9000c-%'`, 'wac_change_log');
  await paso(`DELETE FROM public.fin_posting_errors WHERE document_id='${R}'`, 'fin_posting_errors');
  await paso(`DELETE FROM public.stock_movements WHERE id IN (${st.movs.map((m) => `'${m}'`).join(',')}) OR reference_id='${R}'`, 'stock_movements');
  await paso(`DELETE FROM public.receipt_items WHERE receipt_id='${R}'`, 'receipt_items');
  await paso(`DELETE FROM public.receipts WHERE id='${R}'`, 'receipts');
  await paso(`DELETE FROM public.products WHERE id IN (${st.products.map((p) => `'${p}'`).join(',')})`, 'products');
  const conteo1 = await contar();
  const iguales = TABLAS_NETZERO.every((t) => conteo1[t] === st.conteo0[t]);
  const detalle = Object.fromEntries(TABLAS_NETZERO.map((t) => [t, `${st.conteo0[t]}→${conteo1[t]}`]));
  console.log(iguales ? 'NET DELTA = 0 — BD aislada restaurada' : `DELTA ≠ 0: ${JSON.stringify(detalle)}`);
  writeFileSync(resolve(BASE, 'e2e-cleanup.json'), JSON.stringify({ fecha: new Date().toISOString(), net_delta_cero: iguales, detalle }, null, 2));
  process.exit(iguales ? 0 : 1);
}

if (!MODE) { console.error('Usa: --setup | --extract | --genconfig | --execute | --verify | --cleanup'); process.exit(2); }
