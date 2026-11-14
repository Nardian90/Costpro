// ============================================================================
// M050b — CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004 · FASE DP:
// SNAPSHOT NUEVO + VERIFICACIÓN EXHAUSTIVA (DP-1, DP-2, DP-3, §8-§11 misión).
// READ-ONLY ESTRICTO sobre producción (Management API /database/query, SELECT).
//   DP-1: costo real SKU 111/112 separado del precio de venta.
//   DP-2: contrapartida 151.299.851 — deuda proveedor, documento por documento.
//   DP-3: 24 CUP de salidas sin asiento, desglosadas por documento.
//   §8: reingreso + identidad 119 salidas re-verificada.
//   §9: conciliación costo/inventario/COGS.
//   §10: protección 75 líneas (71 no verificables + 4 moneda) vs matriz m048.
//   §11: snapshot nuevo vs m045 (actividad comercial posterior).
// Producción INTACTA — ninguna escritura.
// Uso: node scripts/m050b-rect004-faseDP-snapshot.mjs
// ============================================================================
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { resolve } from 'path';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: no es producción'); process.exit(2); }
async function q(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] (HTTP ${res.status}) ${text.slice(0, 400)}`);
  const rows = JSON.parse(text || '[]');
  console.log(`[OK] ${label} → ${rows.length} filas`);
  return rows;
}
const sha256 = (s) => createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex');

const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS
const S111 = '4afef9a7-28b7-4a5e-b134-13a9e0ffea16';
const S112 = '14aeb370-7e00-4889-b29b-ef2bc778f4c4';
const SNAPSHOT_003 = '2026-11-14T18:58:17.447Z'; // corte m045 (misión 003)
const OUT_DIR = '/home/z/my-project/scripts/out';
mkdirSync(OUT_DIR, { recursive: true });

const snap = {
  mision: 'CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004',
  fase: 'DP — verificación exhaustiva + snapshot nuevo',
  extraccion: {
    fecha_utc: new Date().toISOString(),
    metodo: 'Management API /database/query — SOLO SELECT (producción intacta)',
    origen: `wthkddeleylijmonclxg (producción) · guard ref OK`,
    corte_anterior_mision_003: SNAPSHOT_003,
  },
};

// ═══ DP-1: RECEPCIÓN + LÍNEAS 111/112 + MAESTRO ════════════════════════════
snap.receipts_fvc = await q(`SELECT * FROM public.receipts WHERE id='${FVC}'`, 'receipts FVC');
const R = snap.receipts_fvc[0];
snap.receipt_items_111_112 = await q(
  `SELECT ri.id, ri.product_id, p.sku, p.name, ri.quantity, ri.unit_cost, ri.moneda_recepcion,
      ri.tasa_cambio_recepcion, ri.created_at, ri.updated_at
   FROM public.receipt_items ri LEFT JOIN public.products p ON p.id=ri.product_id
   WHERE ri.receipt_id='${FVC}' AND ri.product_id IN ('${S111}','${S112}')`, 'receipt_items 111/112');
snap.products_111_112 = await q(
  `SELECT id, sku, name, price, price_currency, cost_price, cost_average, stock_current,
      updated_at, supplier
   FROM public.products WHERE id IN ('${S111}','${S112}')`, 'products 111/112');

// ═══ DP-2: CONTRAPARTIDA — DEUDA PROVEEDOR, DOCUMENTO POR DOCUMENTO ════════
// a) todas las recepciones del mismo proveedor Vitallcons (duplicados del doc)
snap.receipts_proveedor = await q(
  `SELECT id, document_number, reference_doc, status, total_cost, reception_date,
      payment_status, paid_amount, paid_at, due_date, reversed_at, reversal_reason, notes
   FROM public.receipts
   WHERE supplier ILIKE '%vitallcons%' OR reference_doc ILIKE '%vitallcons%'
     OR document_number ILIKE '%vitallcons%' OR notes ILIKE '%vitallcons%'
   ORDER BY reception_date`, 'receipts proveedor Vitallcons (todas)');
// b) payment_transactions de la tienda — TODAS (ref_type any), + las que mencionan FVC/Vitallcons
snap.payment_transactions_store = await q(
  `SELECT pt.id, pt.ref_type, pt.ref_id, pt.amount, pt.currency, pt.exchange_rate, pt.amount_cup,
      pt.payment_method, pt.payment_date, pt.reference, pt.notes, pt.direction, pt.idempotency_key,
      pt.transaction_id, pt.created_at, pt.updated_at
   FROM public.payment_transactions pt
   WHERE pt.store_id='${STORE}'
   ORDER BY pt.payment_date DESC LIMIT 200`, 'payment_transactions ENERVIDA (todas)');
snap.payment_transactions_fvc_proveedor = await q(
  `SELECT pt.id, pt.ref_type, pt.ref_id, pt.amount, pt.currency, pt.amount_cup, pt.payment_method,
      pt.payment_date, pt.reference, pt.notes, pt.direction, pt.created_at
   FROM public.payment_transactions pt
   WHERE pt.ref_id='${FVC}'
      OR pt.reference ILIKE '%vitallcons%' OR pt.notes ILIKE '%vitallcons%'
      OR pt.reference ILIKE '%FAC-VITALLCONS%' OR pt.notes ILIKE '%FAC-VITALLCONS%'
   ORDER BY pt.payment_date`, 'payment_transactions FVC/Vitallcons');
// c) purga archive (tabla de archivo de pagos 2026-10-26)
snap.payment_transactions_purga_vitallcons = await q(
  `SELECT count(*)::int AS n, coalesce(sum(amount_cup),0)::float8 AS total
   FROM public.payment_transactions_purga_20261026_archive
   WHERE ref_id='${FVC}' OR reference ILIKE '%vitallcons%' OR notes ILIKE '%vitallcons%'`,
  'payment_transactions purga (Vitallcons)');
// d) mayor PAS_CXP_PROV global + entradas con reversal_of (¿anulaciones?)
snap.mayor_pas_cxp_prov = await q(
  `SELECT fe.document_type, fe.event, fm.sense, count(*)::int AS n_movs, sum(fm.amount_cup)::float8 AS total
   FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
   WHERE fm.category_code='PAS_CXP_PROV' GROUP BY fe.document_type, fe.event, fm.sense
   ORDER BY fe.document_type, fm.sense`, 'mayor PAS_CXP_PROV');
snap.fin_entries_anulacion_global = await q(
  `SELECT document_type, count(*)::int AS n FROM public.fin_entries
   WHERE event='anulacion' GROUP BY document_type`, 'fin_entries anulacion (global)');
snap.fin_entries_fvc = await q(
  `SELECT * FROM public.fin_entries WHERE document_id='${FVC}' ORDER BY posted_at`, 'fin_entries FVC');
const entryIds = snap.fin_entries_fvc.map((e) => e.id).join("','");
snap.fin_movements_fvc = snap.fin_entries_fvc.length ? await q(
  `SELECT * FROM public.fin_movements WHERE entry_id IN ('${entryIds}') ORDER BY id`, 'fin_movements FVC') : [];
snap.fin_entries_reversal_of = await q(
  `SELECT * FROM public.fin_entries WHERE reversal_of IN (
     SELECT id FROM public.fin_entries WHERE document_id='${FVC}')`, 'reversal_of FVC');
// e) vista v_purchase_orders_cxp de la tienda
snap.v_purchase_orders_cxp = await q(
  `SELECT * FROM public.v_purchase_orders_cxp WHERE receipt_id='${FVC}' OR store_id='${STORE}'
   ORDER BY po_created_at DESC LIMIT 50`, 'v_purchase_orders_cxp');
// f) store_credit_ledger — ¿menciona al proveedor? (normalmente crédito de cliente)
snap.store_credit_ledger_proveedor = await q(
  `SELECT count(*)::int AS n, coalesce(sum(amount),0)::float8 AS total
   FROM public.store_credit_ledger
   WHERE store_id='${STORE}' AND origin_transaction_id::text IN (
     SELECT id::text FROM public.transactions WHERE store_id='${STORE}' AND status IN ('voided','reversed'))`,
  'store_credit_ledger (reversas de venta ENERVIDA)');
// g) movimientos PAS_CXP_PROV que tocan documentos Vitallcons o la FVC
snap.fin_movements_cxp_fvc = await q(
  `SELECT fm.id, fm.entry_id, fe.document_type, fe.document_number, fe.event, fm.category_code,
      fm.sense, fm.amount, fm.amount_cup, fm.economic_date, fm.description, fm.traza, fe.reversal_of
   FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
   WHERE fm.category_code='PAS_CXP_PROV' AND (fm.document_number LIKE '%VITALLCONS%' OR fe.document_id='${FVC}')
   ORDER BY fm.economic_date`, 'fin_movements CXP FVC/Vitallcons');
// h) anticipos / compensaciones: payment_transactions direction='out' de la tienda
snap.payment_transactions_out = await q(
  `SELECT pt.id, pt.ref_type, pt.ref_id, pt.amount, pt.currency, pt.amount_cup, pt.direction,
      pt.payment_date, pt.reference, pt.notes
   FROM public.payment_transactions pt
   WHERE pt.store_id='${STORE}' AND coalesce(pt.direction,'in')='out'
   ORDER BY pt.payment_date DESC LIMIT 100`, 'payment_transactions OUT (anticipos/compensaciones)');

// ═══ DP-3: 24 CUP — SALIDAS SIN ASIENTO, DOCUMENTO POR DOCUMENTO ═══════════
// kardex completo (idéntico al m045 para comparación byte a byte)
snap.kardex_111_112 = await q(
  `SELECT sm.id, sm.product_id, p.sku, sm.store_id, sm.movement_type, sm.quantity_change,
      sm.unit_cost, sm.cost_value_change, sm.balance_after, sm.reference_id, sm.reference_doc,
      sm.movement_date, sm.created_at, sm.unit_price, sm.notes, sm.unit_cost_derived,
      sm.unit_cost_derived_source, sm.cogs_derivation_status, sm.created_by
   FROM public.stock_movements sm LEFT JOIN public.products p ON p.id=sm.product_id
   WHERE sm.product_id IN ('${S111}','${S112}')
   ORDER BY sm.movement_date, sm.created_at`, 'kardex SKU 111/112');
// vales referenciados (los 10 + estados)
const slipRefs = snap.kardex_111_112.filter((m) => m.movement_type === 'issue_slip_out' && m.reference_id)
  .map((m) => `'${m.reference_id}'`);
const slipRefsU = [...new Set(slipRefs)].join(',');
snap.issue_slips = slipRefsU ? await q(
  `SELECT s.id, s.slip_number, s.status, s.notes, s.total_cost, s.created_at, s.confirmed_at,
      s.voided_at, s.void_reason, s.created_by
   FROM public.issue_slips s WHERE s.id IN (${slipRefsU}) ORDER BY s.created_at`, 'issue_slips') : [];
snap.issue_slip_items = slipRefsU ? await q(
  `SELECT i.id, i.slip_id, i.product_id, p.sku, i.quantity, i.unit_cost, i.total_cost, i.created_at
   FROM public.issue_slip_items i LEFT JOIN public.products p ON p.id=i.product_id
   WHERE i.slip_id IN (${slipRefsU}) AND i.product_id IN ('${S111}','${S112}')
   ORDER BY i.slip_id, i.created_at`, 'issue_slip_items 111/112') : [];
// asientos VALE_SALIDA existentes para esos vales (los 6 con asiento + los 3 sin)
snap.fin_entries_vales_sku = slipRefsU ? await q(
  `SELECT fe.id, fe.document_type, fe.document_id, fe.document_number, fe.event, fe.status,
      fe.economic_date, fe.reversal_of, fe.description
   FROM public.fin_entries fe WHERE fe.document_id IN (${slipRefsU})
   ORDER BY fe.posted_at`, 'fin_entries vales SKU') : [];
// asientos VALE_SALIDA por document_number (por si document_id difiere)
const slipNums = snap.issue_slips.map((s) => `'${s.slip_number}'`).join(',');
snap.fin_entries_vales_num = slipNums ? await q(
  `SELECT fe.id, fe.document_type, fe.document_id, fe.document_number, fe.event, fe.status,
      fe.economic_date, fe.reversal_of, fe.description
   FROM public.fin_entries fe WHERE fe.document_number IN (${slipNums})
   ORDER BY fe.posted_at`, 'fin_entries vales por número') : [];
// movimientos GAS_VALES de estos vales
snap.fin_movements_gas_vales = slipNums ? await q(
  `SELECT fm.id, fm.entry_id, fm.category_code, fm.sense, fm.amount, fm.amount_cup,
      fm.document_number, fm.economic_date, fm.description
   FROM public.fin_movements fm
   WHERE fm.category_code='GAS_VALES' AND fm.document_number IN (${slipNums})
   ORDER BY fm.economic_date`, 'fin_movements GAS_VALES vales') : [];
// ajustes: documentos inventory_adjustments de la tienda
snap.inventory_adjustments = await q(
  `SELECT a.id, a.status, a.reason, a.notes, a.created_at, a.confirmed_at, a.reversed_at, a.currency
   FROM public.inventory_adjustments a
   WHERE a.id IN (SELECT reference_id::uuid FROM public.stock_movements
                   WHERE product_id IN ('${S111}','${S112}') AND movement_type='adjustment'
                     AND reference_id ~ '^[0-9a-f-]{36}$')
      OR (a.store_id='${STORE}' AND a.created_at::date='2026-08-18')
   ORDER BY a.created_at`, 'inventory_adjustments');
snap.inventory_adjustment_items = await q(
  `SELECT i.id, i.adjustment_id, i.product_id, p.sku, i.expected_quantity, i.counted_quantity, i.difference
   FROM public.inventory_adjustment_items i LEFT JOIN public.products p ON p.id=i.product_id
   WHERE i.product_id IN ('${S111}','${S112}')
     AND i.adjustment_id IN (SELECT id FROM public.inventory_adjustments
                              WHERE store_id='${STORE}' OR id IN (
                                SELECT reference_id::uuid FROM public.stock_movements
                                WHERE product_id IN ('${S111}','${S112}') AND movement_type='adjustment'
                                  AND reference_id ~ '^[0-9a-f-]{36}$'))
   ORDER BY i.adjustment_id`, 'inventory_adjustment_items');
// asientos AJUSTE_INVENTARIO de la tienda (¿existen para los 2 ajustes de cuadre?)
snap.fin_entries_ajuste_inv = await q(
  `SELECT fe.id, fe.document_type, fe.document_id, fe.document_number, fe.event, fe.status,
      fe.economic_date, fe.description
   FROM public.fin_entries fe
   WHERE fe.document_type='AJUSTE_INVENTARIO' AND fe.store_id='${STORE}'
   ORDER BY fe.posted_at`, 'fin_entries AJUSTE_INVENTARIO ENERVIDA');

// ═══ §8: REINGRESO + 119 SALIDAS + COGS ════════════════════════════════════
snap.sale_items_111_112 = await q(
  `SELECT si.id, si.sale_id, si.product_id, p.sku, si.quantity, si.unit_price_sold, si.cost_at_sale
   FROM public.sale_items si LEFT JOIN public.products p ON p.id=si.product_id
   WHERE si.product_id IN ('${S111}','${S112}') ORDER BY si.sale_id`, 'sale_items 111/112');
const saleIds = [...new Set(snap.sale_items_111_112.map((s) => s.sale_id))].join("','");
snap.sales_docs = saleIds ? await q(
  `SELECT * FROM public.sales WHERE id IN ('${saleIds}')`, 'sales docs') : [];
const txRefs = snap.kardex_111_112.filter((m) => m.movement_type === 'sale' && m.reference_id)
  .map((m) => `'${m.reference_id}'`).join(',');
snap.transactions_ventas = txRefs ? await q(
  `SELECT t.id, t.created_at, t.total_amount, t.payment_method, t.status, t.sale_currency,
      t.sale_exchange_rate, t.customer_name, t.completed_at, t.void_reason, t.reversed_at
   FROM public.transactions t WHERE t.id IN (${txRefs})`, 'transactions ventas') : [];
// asientos de COGS de las 5 ventas (GAS_COSTO_VENTAS)
const txUuids = txRefs ? txRefs : "''";
snap.fin_movements_cogs_ventas = await q(
  `SELECT fm.id, fm.entry_id, fe.document_type, fe.document_id, fe.document_number, fe.event,
      fm.category_code, fm.sense, fm.amount, fm.amount_cup, fm.economic_date, fm.description
   FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
   WHERE fm.category_code='GAS_COSTO_VENTAS' AND fe.document_id IN (${txUuids})
   ORDER BY fm.economic_date`, 'fin_movements COGS ventas SKU');
snap.fin_movements_act_ventas = await q(
  `SELECT fm.id, fm.entry_id, fe.document_type, fe.document_id, fe.document_number, fe.event,
      fm.category_code, fm.sense, fm.amount, fm.amount_cup, fm.economic_date, fm.description
   FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
   WHERE fm.category_code='ACT_INVENTARIO' AND fe.document_id IN (${txUuids})
   ORDER BY fm.economic_date`, 'fin_movements ACT ventas SKU');
// existencias actuales
snap.inventory_111_112 = await q(
  `SELECT i.product_id, p.sku, i.quantity, i.store_id, i.updated_at
   FROM public.inventory i LEFT JOIN public.products p ON p.id=i.product_id
   WHERE i.product_id IN ('${S111}','${S112}')`, 'inventory 111/112');
// wac_change_log
snap.wac_change_log = await q(
  `SELECT * FROM public.wac_change_log WHERE product_id IN ('${S111}','${S112}') ORDER BY created_at`,
  'wac_change_log');

// ═══ §10: PROTECCIÓN 75 LÍNEAS — TODAS las 101 líneas actuales ═════════════
snap.receipt_items = await q(
  `SELECT ri.id, ri.product_id, p.sku, p.name, ri.quantity, ri.unit_cost, ri.moneda_recepcion,
      ri.tasa_cambio_recepcion, ri.created_at, ri.updated_at
   FROM public.receipt_items ri LEFT JOIN public.products p ON p.id=ri.product_id
   WHERE ri.receipt_id='${FVC}' ORDER BY p.sku`, 'receipt_items (101)');

// ═══ §11: ACTIVIDAD POSTERIOR AL CORTE m045 ════════════════════════════════
snap.post_snapshot = {};
snap.post_snapshot.kardex_111_112_nuevos = await q(
  `SELECT sm.id, p.sku, sm.movement_type, sm.quantity_change, sm.unit_cost, sm.reference_id,
      sm.reference_doc, sm.movement_date, sm.created_at
   FROM public.stock_movements sm LEFT JOIN public.products p ON p.id=sm.product_id
   WHERE sm.product_id IN ('${S111}','${S112}') AND sm.created_at > '${SNAPSHOT_003}'
   ORDER BY sm.created_at`, 'kardex 111/112 NUEVOS post-corte');
snap.post_snapshot.fin_entries_nuevos_tienda = await q(
  `SELECT fe.id, fe.document_type, fe.document_number, fe.event, fe.status, fe.economic_date,
      fe.posted_at, fe.description
   FROM public.fin_entries fe
   WHERE fe.store_id='${STORE}' AND fe.posted_at > '${SNAPSHOT_003}'
   ORDER BY fe.posted_at`, 'fin_entries NUEVOS ENERVIDA post-corte');
snap.post_snapshot.transactions_nuevas_tienda = await q(
  `SELECT t.id, t.created_at, t.total_amount, t.status, t.sale_currency, t.completed_at, t.void_reason, t.reversed_at
   FROM public.transactions t
   WHERE t.store_id='${STORE}' AND t.created_at > '${SNAPSHOT_003}'
   ORDER BY t.created_at`, 'transactions NUEVAS ENERVIDA post-corte');
snap.post_snapshot.payment_transactions_nuevos = await q(
  `SELECT pt.id, pt.ref_type, pt.ref_id, pt.amount, pt.currency, pt.amount_cup, pt.direction,
      pt.payment_date, pt.created_at
   FROM public.payment_transactions pt
   WHERE pt.store_id='${STORE}' AND pt.created_at > '${SNAPSHOT_003}'
   ORDER BY pt.created_at`, 'payment_transactions NUEVOS post-corte');
snap.post_snapshot.receipts_nuevos_proveedor = await q(
  `SELECT id, document_number, status, total_cost, reception_date, payment_status
   FROM public.receipts
   WHERE (supplier ILIKE '%vitallcons%' OR reference_doc ILIKE '%vitallcons%')
     AND created_at > '${SNAPSHOT_003}'`, 'receipts NUEVOS Vitallcons post-corte');
// mayores globales actuales (para comparar con m045)
snap.mayor_act_inventario = await q(
  `SELECT fe.document_type, fe.event, fm.sense, count(*)::int AS n_movs, sum(fm.amount_cup)::float8 AS total
   FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
   WHERE fm.category_code='ACT_INVENTARIO' GROUP BY fe.document_type, fe.event, fm.sense
   ORDER BY fe.document_type, fm.sense`, 'mayor ACT_INVENTARIO');
snap.fin_opening_balances = await q(
  `SELECT category_code, sum(amount_cup)::float8 AS total FROM public.fin_opening_balances
   WHERE category_code IN ('ACT_INVENTARIO','PAS_CXP_PROV') GROUP BY category_code`, 'fin_opening_balances');

// ═══ VERIFICACIONES ARITMÉTICAS E IDENTIDADES ══════════════════════════════
const li = snap.receipt_items;
let suma = 0, sumaCorregida = 0;
for (const l of li) {
  suma += Number(l.quantity) * Number(l.unit_cost) * Number(l.tasa_cambio_recepcion || 1);
  if (l.sku === '111' || l.sku === '112') sumaCorregida += Number(l.quantity) * 1;
  else sumaCorregida += Number(l.quantity) * Number(l.unit_cost) * Number(l.tasa_cambio_recepcion || 1);
}
snap.verificacion_aritmetica = {
  n_lineas: li.length,
  suma_recomputada: Math.round(suma * 100) / 100,
  total_cabecera: Number(R.total_cost),
  delta_cabecera_vs_recomputo: Math.round((Number(R.total_cost) - suma) * 100) / 100,
  total_corregido_escenario_propietario: Math.round(sumaCorregida * 100) / 100,
  reduccion_total: Math.round((suma - sumaCorregida) * 100) / 100,
};

// Identidad kardex por SKU + distribución de salidas por tipo
const recon = {};
for (const sku of ['111', '112']) {
  const movs = snap.kardex_111_112.filter((m) => m.sku === sku);
  const entradas = movs.filter((m) => Number(m.quantity_change) > 0);
  const salidas = movs.filter((m) => Number(m.quantity_change) < 0);
  let bal = 0;
  const cronologia = movs.map((m) => {
    bal += Number(m.quantity_change);
    return { fecha: m.movement_date?.slice(0, 10), tipo: m.movement_type, q: Number(m.quantity_change),
      uc: Number(m.unit_cost), ref_doc: m.reference_doc, bal };
  });
  const porTipo = {};
  for (const m of movs) {
    porTipo[m.movement_type] = porTipo[m.movement_type] || { n: 0, unidades: 0, uc0: 0 };
    porTipo[m.movement_type].n++;
    porTipo[m.movement_type].unidades += Number(m.quantity_change);
    if (Number(m.quantity_change) < 0 && Number(m.unit_cost) === 0) porTipo[m.movement_type].uc0 += -Number(m.quantity_change);
  }
  recon[sku] = {
    n_movimientos: movs.length,
    entradas: { n: entradas.length, unidades: entradas.reduce((a, m) => a + Number(m.quantity_change), 0) },
    salidas_brutas: { n: salidas.length, unidades: -salidas.reduce((a, m) => a + Number(m.quantity_change), 0) },
    saldo_kardex_calculado: bal,
    saldo_stock_current: Number((snap.products_111_112.find((p) => p.sku === sku) || {}).stock_current),
    saldo_inventory: Number((snap.inventory_111_112.find((p) => p.sku === sku) || {}).quantity),
    por_tipo: porTipo, cronologia_resumen: cronologia.map((c) => `${c.fecha} ${c.tipo} ${c.q}@${c.uc} →${c.bal}`),
  };
}
snap.reconstruccion_kardex = recon;

// Salidas uc=0 (las 26 unidades subvaluadas)
snap.salidas_uc0 = snap.kardex_111_112
  .filter((m) => Number(m.quantity_change) < 0 && Number(m.unit_cost) === 0)
  .map((m) => ({ sku: m.sku, fecha: m.movement_date?.slice(0, 10), tipo: m.movement_type,
    q: -Number(m.quantity_change), ref_doc: m.reference_doc, id: m.id }));

// DP-3 síntesis: vales sin asiento y ajustes sin asiento (calculado, no asumido)
const asientoValeIds = new Set(snap.fin_entries_vales_sku.map((e) => e.document_id));
const valesSinAsiento = snap.issue_slips.filter((s) => !asientoValeIds.has(s.id));
const udsValeSinAsiento = snap.issue_slip_items
  .filter((i) => valesSinAsiento.some((v) => v.id === i.slip_id))
  .reduce((a, i) => a + Number(i.quantity), 0);
const ajustesSinAsiento = snap.kardex_111_112.filter(
  (m) => m.movement_type === 'adjustment' && Number(m.quantity_change) < 0);
snap.dp3_sintesis = {
  vales_con_asiento: snap.issue_slips.filter((s) => asientoValeIds.has(s.id)).map((s) => s.slip_number),
  vales_sin_asiento: valesSinAsiento.map((s) => ({ slip: s.slip_number, status: s.status })),
  unidades_vales_sin_asiento: udsValeSinAsiento,
  ajustes_cuadre_sin_asiento: ajustesSinAsiento.map((m) => ({ sku: m.sku, q: -Number(m.quantity_change),
    fecha: m.movement_date?.slice(0, 10), notas: m.notes })),
  asientos_ajuste_inventario_tienda: snap.fin_entries_ajuste_inv.length,
};

// COGS de las 5 ventas (esperado: 7 CUP)
snap.cogs_ventas = {
  asientos: snap.fin_movements_cogs_ventas.map((m) => ({ doc: m.document_number ?? m.document_id,
    monto: Number(m.amount), sentido: m.sense })),
  total_gas_costo_ventas: snap.fin_movements_cogs_ventas
    .filter((m) => m.sense === 'debito').reduce((a, m) => a + Number(m.amount), 0),
};

// ═══ HASHES POR SECCIÓN ═════════════════════════════════════════════════════
snap.hashes = {};
for (const [k, v] of Object.entries(snap)) {
  if (k === 'hashes') continue;
  snap.hashes[k] = sha256(v);
}

const OUT = resolve(OUT_DIR, 'rect004-faseDP-snapshot.json');
writeFileSync(OUT, JSON.stringify(snap, null, 1));
console.log('\n═══ RESUMEN DP ═══');
console.log('Aritmética:', JSON.stringify(snap.verificacion_aritmetica));
console.log('DP-2 pago FVC/proveedor:', JSON.stringify({
  receipts_proveedor: snap.receipts_proveedor.length,
  payment_transactions_fvc: snap.payment_transactions_fvc_proveedor.length,
  payment_transactions_store: snap.payment_transactions_store.length,
  payment_out: snap.payment_transactions_out.length,
  purga: snap.payment_transactions_purga_vitallcons,
  anulaciones_global: snap.fin_entries_anulacion_global,
  reversal_of_fvc: snap.fin_entries_reversal_of.length,
  credit_ledger_prov: snap.store_credit_ledger_proveedor[0]?.n,
}));
console.log('DP-3:', JSON.stringify(snap.dp3_sintesis));
console.log('COGS:', JSON.stringify(snap.cogs_ventas));
console.log('Salidas uc0:', JSON.stringify(snap.salidas_uc0));
console.log('Kardex 111:', JSON.stringify({ n: recon['111'].n_movimientos, ent: recon['111'].entradas, sal: recon['111'].salidas_brutas, bal: recon['111'].saldo_kardex_calculado, stock: recon['111'].saldo_stock_current }));
console.log('Kardex 112:', JSON.stringify({ n: recon['112'].n_movimientos, ent: recon['112'].entradas, sal: recon['112'].salidas_brutas, bal: recon['112'].saldo_kardex_calculado, stock: recon['112'].saldo_stock_current }));
console.log('Post-corte nuevos:', JSON.stringify({
  kardex: snap.post_snapshot.kardex_111_112_nuevos.length,
  fin_entries: snap.post_snapshot.fin_entries_nuevos_tienda.length,
  transactions: snap.post_snapshot.transactions_nuevas_tienda.length,
  payments: snap.post_snapshot.payment_transactions_nuevos.length,
  receipts_prov: snap.post_snapshot.receipts_nuevos_proveedor.length,
}));
console.log('Guardado en', OUT, '(' + statSync(OUT).size + ' bytes)');
