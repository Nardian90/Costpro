#!/usr/bin/env node
// ============================================================================
// M070 — CP-FIN-RECEIPT-FULL-VALUATION-010 · EXTRACCIÓN INTEGRAL READ-ONLY
// Conciliación de las 101 líneas de FAC-VITALLCONS-001
//   (receipt_id fd9d6c88-5db8-49ea-b185-8bc96cc93e63, tienda ENERVIDA).
// READ-ONLY ESTRICTO sobre producción: Management API /database/query, SELECT.
// Producción INTACTA — ninguna escritura. Re-ejecutable (idempotente RO).
// Uso: node scripts/m070-receipt-full-valuation-extract.mjs
// ============================================================================
import { readFileSync, writeFileSync } from 'fs';
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
// Guard anti-escritura: rechazar cualquier SQL que no empiece por SELECT/WITH
function qs(sql, label) {
  const head = sql.trim().slice(0, 40).toUpperCase();
  if (!head.startsWith('SELECT') && !head.startsWith('WITH')) {
    throw new Error(`GUARD RO: consulta no-SELECT rechazada en ${label}`);
  }
  return q(sql, label);
}

const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS

const snap = {
  mision: 'CP-FIN-RECEIPT-FULL-VALUATION-010',
  extraccion: {
    fecha_utc: new Date().toISOString(),
    metodo: 'Management API /database/query — SOLO SELECT (producción intacta)',
    origen: 'wthkddeleylijmonclxg (producción) · guard ref OK',
    alcance: 'exclusivamente receipt_id=' + FVC + ' y sus 101 productos',
  },
};

// ═══ 1. CABECERA DE LA RECEPCIÓN ═══════════════════════════════════════════
snap.receipt = (await qs(`SELECT * FROM public.receipts WHERE id='${FVC}'`, 'receipt'))[0] || null;

// ═══ 2. LAS 101 LÍNEAS + MAESTRO DE PRODUCTO (post-RECT-1) ═════════════════
snap.receipt_items = await qs(
  `SELECT ri.id AS line_id, ri.product_id, p.sku, p.name, ri.quantity, ri.unit_cost,
      ri.moneda_recepcion, ri.tasa_cambio_recepcion, ri.created_at, ri.updated_at,
      p.is_service, p.price AS precio_venta, p.price_currency, p.cost_price AS cost_price_maestro,
      p.cost_average AS wac_actual, p.stock_current, p.store_id, p.operational_class,
      p.master_product_id, p.is_active
   FROM public.receipt_items ri JOIN public.products p ON p.id = ri.product_id
   WHERE ri.receipt_id='${FVC}'
   ORDER BY p.sku::bigint`, 'receipt_items 101');

const PIDS = snap.receipt_items.map((r) => `'${r.product_id}'`).join(',');
const PIDS_U = [...new Set(snap.receipt_items.map((r) => r.product_id))].map((i) => `'${i}'`).join(',');
snap.control_alcance = {
  lineas_bd: snap.receipt_items.length,
  skus_distintos: new Set(snap.receipt_items.map((r) => r.sku)).size,
  productos_distintos: new Set(snap.receipt_items.map((r) => r.product_id)).size,
  monedas: [...new Set(snap.receipt_items.map((r) => r.moneda_recepcion))],
};

// ═══ 3. CAPAS DE COMPRA GENERADAS POR ESTA RECEPCIÓN ═══════════════════════
snap.layers_fvc = await qs(
  `SELECT sm.id, sm.store_id, sm.product_id, p.sku, sm.movement_type, sm.quantity_change,
      sm.unit_cost, sm.cost_value_change, sm.balance_after, sm.reference_id, sm.reference_doc,
      sm.movement_date, sm.created_at, sm.notes
   FROM public.stock_movements sm JOIN public.products p ON p.id=sm.product_id
   WHERE sm.reference_id='${FVC}' AND sm.movement_type='purchase'
   ORDER BY p.sku::bigint`, 'capas purchase FVC');

// ═══ 4. KARDEX COMPLETO DE LOS 101 PRODUCTOS (salidas/ajustes/transfers) ═══
snap.kardex_101 = await qs(
  `SELECT sm.id, sm.store_id, sm.product_id, p.sku, sm.movement_type, sm.quantity_change,
      sm.unit_cost, sm.unit_price, sm.cost_value_change, sm.balance_after, sm.reference_id,
      sm.reference_doc, sm.movement_date, sm.created_at, sm.notes,
      sm.unit_cost_derived, sm.unit_cost_derived_source, sm.cogs_derivation_status
   FROM public.stock_movements sm JOIN public.products p ON p.id=sm.product_id
   WHERE sm.product_id IN (${PIDS_U})
   ORDER BY p.sku::bigint, sm.movement_date, sm.created_at`, 'kardex 101 productos');

// ═══ 5. WAC_CHANGE_LOG DE LOS 101 PRODUCTOS ════════════════════════════════
snap.wac_change_log = await qs(
  `SELECT w.id, w.store_id, w.product_id, p.sku, w.wac_before, w.wac_after, w.event,
      w.qty_in, w.uc_in, w.source_ref, w.created_at
   FROM public.wac_change_log w JOIN public.products p ON p.id=w.product_id
   WHERE w.product_id IN (${PIDS_U})
   ORDER BY p.sku::bigint, w.created_at`, 'wac_change_log 101');

// ═══ 6. VENTAS DE LOS 101 PRODUCTOS (COGS asociado) ════════════════════════
snap.sale_items_101 = await qs(
  `SELECT si.id, si.sale_id, si.product_id, p.sku, si.quantity, si.unit_price_sold, si.cost_at_sale,
      s.created_at AS sale_created_at
   FROM public.sale_items si JOIN public.products p ON p.id=si.product_id
   LEFT JOIN public.sales s ON s.id=si.sale_id
   WHERE si.product_id IN (${PIDS_U})
   ORDER BY p.sku::bigint, s.created_at`, 'sale_items 101');

snap.sales_docs = await qs(
  `SELECT s.id, s.created_at, s.payment_method, s.total_amount, s.status,
      t.status AS tx_status, t.sale_currency, t.sale_exchange_rate, t.completed_at, t.void_reason, t.reversed_at
   FROM public.sales s LEFT JOIN public.transactions t ON t.id = s.id
   WHERE s.id IN (SELECT DISTINCT sale_id FROM public.sale_items WHERE product_id IN (${PIDS_U}))
   ORDER BY s.created_at`, 'sales/transactions de los 101');

// ═══ 7. VALES (issue_slips) DE LOS 101 PRODUCTOS ═══════════════════════════
snap.issue_slip_items_101 = await qs(
  `SELECT i.id, i.slip_id, i.product_id, p.sku, i.quantity, i.unit_cost, i.total_cost, i.created_at,
      s.slip_number, s.status, s.total_cost AS slip_total, s.voided_at
   FROM public.issue_slip_items i JOIN public.products p ON p.id=i.product_id
   LEFT JOIN public.issue_slips s ON s.id=i.slip_id
   WHERE i.product_id IN (${PIDS_U})
   ORDER BY p.sku::bigint, i.created_at`, 'issue_slip_items 101');

// ═══ 8. CONTABILIDAD: ASIENTOS DE LA RECEPCIÓN + RECT-1/RECT-2 + COGS/VALES ═
snap.fin_entries_fvc = await qs(
  `SELECT fe.id, fe.document_type, fe.document_id, fe.document_number, fe.event, fe.status,
      fe.economic_date, fe.posted_at, fe.reversal_of, fe.description, fe.store_id
   FROM public.fin_entries fe
   WHERE fe.document_id='${FVC}' OR fe.reversal_of IN (SELECT id FROM public.fin_entries WHERE document_id='${FVC}')
   ORDER BY fe.posted_at`, 'fin_entries FVC + reversiones');
const EIDS = snap.fin_entries_fvc.map((e) => `'${e.id}'`).join(',');
snap.fin_movements_fvc = EIDS ? await qs(
  `SELECT fm.id, fm.entry_id, fm.category_code, fm.sense, fm.amount, fm.amount_cup,
      fm.document_number, fm.economic_date, fm.description
   FROM public.fin_movements fm WHERE fm.entry_id IN (${EIDS}) ORDER BY fm.id`, 'fin_movements FVC+RECT') : [];
snap.fin_movements_cogs_101 = await qs(
  `SELECT fm.id, fm.entry_id, fe.document_type, fe.document_id, fe.document_number, fe.event,
      fm.category_code, fm.sense, fm.amount, fm.amount_cup, fm.economic_date, fm.description
   FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
   WHERE fm.category_code='GAS_COSTO_VENTAS'
     AND fe.document_id IN (SELECT DISTINCT reference_id::uuid FROM public.stock_movements
         WHERE product_id IN (${PIDS_U}) AND movement_type='sale'
           AND reference_id ~ '^[0-9a-f-]{36}$')
   ORDER BY fm.economic_date`, 'fin_movements COGS ventas 101');

// ═══ 6b. VENTAS POS (transaction_items) DE LOS 101 PRODUCTOS ═══════════════
snap.transaction_items_101 = await qs(
  `SELECT ti.id, ti.transaction_id, ti.product_id, p.sku, ti.quantity, ti.price_at_sale,
      ti.price_at_sale_cup, ti.cost_at_sale, ti.currency, ti.exchange_rate,
      t.status AS tx_status, t.sale_currency, t.sale_exchange_rate, t.created_at AS tx_created_at,
      t.completed_at, t.void_reason, t.reversed_at
   FROM public.transaction_items ti JOIN public.products p ON p.id=ti.product_id
   LEFT JOIN public.transactions t ON t.id=ti.transaction_id
   WHERE ti.product_id IN (${PIDS_U})
   ORDER BY p.sku::bigint, t.created_at`, 'transaction_items 101');
snap.transaction_item_lots_101 = await qs(
  `SELECT tl.id, tl.transaction_item_id, tl.lot_id, tl.quantity, tl.created_at, ti.product_id, p.sku
   FROM public.transaction_item_lots tl
   JOIN public.transaction_items ti ON ti.id=tl.transaction_item_id
   JOIN public.products p ON p.id=ti.product_id
   WHERE ti.product_id IN (${PIDS_U})
   ORDER BY p.sku::bigint`, 'transaction_item_lots 101');
snap.kardex_tipos = await qs(
  `SELECT movement_type, count(*)::int AS n FROM public.stock_movements
   WHERE product_id IN (${PIDS_U}) GROUP BY movement_type ORDER BY n DESC`, 'kardex tipos (101 productos)');
snap.fin_movements_gas_vales_101 = await qs(
  `SELECT fm.id, fm.entry_id, fe.document_type, fe.document_id, fe.document_number, fe.event,
      fm.category_code, fm.sense, fm.amount, fm.amount_cup, fm.economic_date, fm.description
   FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
   WHERE fm.category_code='GAS_VALES'
     AND (fe.document_id IN (SELECT DISTINCT slip_id FROM public.issue_slip_items WHERE product_id IN (${PIDS_U}))
          OR fm.document_number IN (SELECT DISTINCT s.slip_number::text FROM public.issue_slip_items i
              JOIN public.issue_slips s ON s.id=i.slip_id WHERE i.product_id IN (${PIDS_U})))
   ORDER BY fm.economic_date`, 'fin_movements GAS_VALES vales 101');

// ═══ 9. CXP Y PAGOS DEL PROVEEDOR ══════════════════════════════════════════
snap.payments_fvc = await qs(
  `SELECT pt.id, pt.ref_type, pt.ref_id, pt.amount, pt.currency, pt.exchange_rate, pt.amount_cup,
      pt.payment_method, pt.payment_date, pt.reference, pt.notes, pt.direction
   FROM public.payment_transactions pt
   WHERE pt.ref_id='${FVC}' OR pt.reference ILIKE '%FAC-VITALLCONS%' OR pt.notes ILIKE '%FAC-VITALLCONS%'
   ORDER BY pt.payment_date`, 'payments FVC');
snap.cxp_fvc = await qs(
  `SELECT * FROM public.v_cxp_proveedor WHERE receipt_id='${FVC}'`, 'v_cxp_proveedor FVC').catch(() => []);
if (!snap.cxp_fvc.length) {
  snap.cxp_fvc = await qs(
    `SELECT * FROM public.v_purchase_orders_cxp WHERE receipt_id='${FVC}'`, 'v_purchase_orders_cxp FVC').catch(() => []);
}

// ═══ 10. MONEDA Y TASAS (evidencia 680) ════════════════════════════════════
snap.exchange_rates_usd = await qs(
  `SELECT rate_date, currency, rate, source, segment, capture_method
   FROM public.exchange_rates WHERE currency='USD'
     AND rate_date BETWEEN '2026-06-25' AND '2026-07-06'
   ORDER BY rate_date`, 'exchange_rates USD julio-2026');
snap.exchange_rates_latest = await qs(
  `SELECT rate_date, currency, rate, source FROM public.exchange_rates
   WHERE currency='USD' ORDER BY rate_date DESC LIMIT 3`, 'exchange_rates USD últimas');

// ═══ 11. SKU999 SERVICIO: VERIFICACIÓN ESPECÍFICA ══════════════════════════
const sku999 = snap.receipt_items.find((r) => String(r.sku) === '999') || null;
snap.sku999 = sku999 ? {
  line_id: sku999.line_id, product_id: sku999.product_id, is_service: sku999.is_service,
  operational_class: sku999.operational_class, wac_actual: sku999.wac_actual,
  stock_current: sku999.stock_current,
  movimientos_inventario: await qs(
    `SELECT count(*)::int AS n, coalesce(sum(quantity_change),0)::float8 AS qty
     FROM public.stock_movements WHERE product_id='${sku999.product_id}'`, 'kardex SKU999'),
  capas_fvc: await qs(
    `SELECT count(*)::int AS n FROM public.stock_movements
     WHERE product_id='${sku999.product_id}' AND reference_id='${FVC}'`, 'capas SKU999'),
  ventas: await qs(
    `SELECT count(*)::int AS n FROM public.sale_items WHERE product_id='${sku999.product_id}'`, 'ventas SKU999'),
} : null;

// ═══ 12. SKU111/112: VERIFICACIÓN RECT-1 (§8 misión) ═══════════════════════
snap.rect1_verificacion = await qs(
  `SELECT p.sku, p.name, p.price, p.price_currency, p.cost_price, p.cost_average, p.stock_current, p.updated_at,
      (SELECT sm.unit_cost FROM public.stock_movements sm
        WHERE sm.product_id=p.id AND sm.reference_id='${FVC}' AND sm.movement_type='purchase' LIMIT 1) AS capa_uc,
      (SELECT sm.quantity_change FROM public.stock_movements sm
        WHERE sm.product_id=p.id AND sm.reference_id='${FVC}' AND sm.movement_type='purchase' LIMIT 1) AS capa_qty
   FROM public.products p WHERE p.sku IN ('111','112') AND p.store_id='${STORE}'
   ORDER BY p.sku::bigint`, 'SKU111/112 post-RECT-1');
snap.rect1_asientos = await qs(
  `SELECT fe.id, fe.document_type, fe.document_id, fe.event, fe.status, fe.economic_date, fe.posted_at,
      fe.reversal_of, fe.description,
      (SELECT json_agg(json_build_object('cat', fm.category_code, 'sense', fm.sense,
              'amount_cup', fm.amount_cup)) FROM public.fin_movements fm WHERE fm.entry_id=fe.id) AS movimientos
   FROM public.fin_entries fe
   WHERE fe.description ILIKE '%RECT-1%' OR fe.reversal_of IN (SELECT id FROM public.fin_entries WHERE document_id='${FVC}')
   ORDER BY fe.posted_at`, 'asientos RECT-1');

// ═══ 13. CONTROLES DE SEGURIDAD (T12, errores financieros, idempotencia) ═══
snap.t12_trigger = await qs(
  `SELECT tgname, tgenabled FROM pg_trigger WHERE tgname LIKE '%t12%' OR tgname LIKE '%annulment%'`, 'T12 triggers');
snap.fin_posting_errors_recientes = await qs(
  `SELECT count(*)::int AS n FROM public.fin_posting_errors WHERE created_at > '2026-11-16T16:08:00Z'`, 'fin_posting_errors post-RECT-2');
snap.capas_duplicadas = await qs(
  `SELECT product_id, count(*)::int AS n FROM public.stock_movements
   WHERE reference_id='${FVC}' AND movement_type='purchase'
   GROUP BY product_id HAVING count(*) > 1`, 'capas duplicadas (idempotencia)');
snap.asientos_anulacion_fvc = await qs(
  `SELECT count(*)::int AS n FROM public.fin_entries
   WHERE event='anulacion' AND (document_id='${FVC}' OR reversal_of IN (SELECT id FROM public.fin_entries WHERE document_id='${FVC}'))`,
  'anulaciones FVC');

// ═══ GUARDAR ═══════════════════════════════════════════════════════════════
writeFileSync('scripts/out/m070-receipt-valuation-extract.json', JSON.stringify(snap, null, 2));
console.log('Extracción m070 OK → scripts/out/m070-receipt-valuation-extract.json');
console.log('Control de alcance:', JSON.stringify(snap.control_alcance));
