// ============================================================================
// M045 — CP-FIN-VALUATION-RECTIFICATION-003 · FASE I (§3 misión):
// CONGELAR Y RECONSTRUIR EL ESTADO DE PRODUCCIÓN — SNAPSHOT REPRODUCIBLE.
// READ-ONLY ESTRICTO: solo SELECT vía Management API /database/query.
// Producir: snapshot de TODAS las filas afectadas + verificaciones aritméticas
// + hashes SHA-256 por sección. NINGUNA escritura (producción intacta).
// Uso: node scripts/m045-rect003-faseI-snapshot.mjs
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

// ── Constantes de la misión (verificables) ─────────────────────────────────
const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS
const S111 = '4afef9a7-28b7-4a5e-b134-13a9e0ffea16';
const S112 = '14aeb370-7e00-4889-b29b-ef2bc778f4c4';
const OUT_DIR = '/home/z/my-project/scripts/out';
mkdirSync(OUT_DIR, { recursive: true });

const snap = {
  mision: 'CP-FIN-VALUATION-RECTIFICATION-003',
  fase: 'I — congelar y reconstruir el estado de producción',
  extraccion: {
    fecha_utc: new Date().toISOString(),
    metodo: 'Management API /database/query — SOLO SELECT (producción intacta)',
    origen: `wthkddeleylijmonclxg (producción) · guard ref OK`,
  },
  secciones: {},
};

// ═══ 1. RECEPCIÓN ORIGINAL (cabecera con estado de liquidación) ════════════
snap.receipts_fvc = await q(
  `SELECT * FROM public.receipts WHERE id='${FVC}'`, 'receipts FVC');
const R = snap.receipts_fvc[0];

// ═══ 2. LAS 101 LÍNEAS VIGENTES ═══════════════════════════════════════════
snap.receipt_items = await q(
  `SELECT ri.id, ri.product_id, p.sku, p.name, ri.quantity, ri.unit_cost, ri.moneda_recepcion,
      ri.tasa_cambio_recepcion, ri.created_at, ri.updated_at
   FROM public.receipt_items ri LEFT JOIN public.products p ON p.id=ri.product_id
   WHERE ri.receipt_id='${FVC}' ORDER BY p.sku`, 'receipt_items (101)');

// ═══ 3. MAESTRO DE PRODUCTOS DE LAS 101 LÍNEAS ═════════════════════════════
snap.products = await q(
  `SELECT p.id, p.sku, p.name, p.price, p.cost_price, p.price_currency, p.cost_average,
      p.stock_current, p.updated_at, p.supplier
   FROM public.products p
   WHERE p.id IN (SELECT product_id FROM public.receipt_items WHERE receipt_id='${FVC}')
   ORDER BY p.sku`, 'products (101)');

// ═══ 4. KARDEX COMPLETO SKU 111/112 (TODOS los movimientos, ±) ═════════════
snap.kardex_111_112 = await q(
  `SELECT sm.id, sm.product_id, p.sku, sm.store_id, sm.movement_type, sm.quantity_change,
      sm.unit_cost, sm.cost_value_change, sm.balance_after, sm.reference_id, sm.reference_doc,
      sm.movement_date, sm.created_at, sm.unit_price, sm.notes, sm.unit_cost_derived,
      sm.unit_cost_derived_source, sm.cogs_derivation_status, sm.created_by
   FROM public.stock_movements sm LEFT JOIN public.products p ON p.id=sm.product_id
   WHERE sm.product_id IN ('${S111}','${S112}')
   ORDER BY sm.movement_date, sm.created_at`, 'kardex SKU 111/112');

// ═══ 5. WAC CHANGE LOG DE AMBOS ═══════════════════════════════════════════
snap.wac_change_log = await q(
  `SELECT * FROM public.wac_change_log WHERE product_id IN ('${S111}','${S112}')
   ORDER BY created_at`, 'wac_change_log');

// ═══ 6. ASIENTOS CP-FIN DEL DOCUMENTO + movimientos contables ═════════════
snap.fin_entries_fvc = await q(
  `SELECT * FROM public.fin_entries WHERE document_id='${FVC}' ORDER BY posted_at`, 'fin_entries FVC');
const entryIds = snap.fin_entries_fvc.map((e) => e.id).join("','");
snap.fin_movements_fvc = snap.fin_entries_fvc.length ? await q(
  `SELECT * FROM public.fin_movements WHERE entry_id IN ('${entryIds}') ORDER BY id`, 'fin_movements FVC') : [];
// Asientos que revierten al asiento de la FVC (si existen)
snap.fin_entries_reversal_of = await q(
  `SELECT * FROM public.fin_entries WHERE reversal_of IN (
     SELECT id FROM public.fin_entries WHERE document_id='${FVC}')`, 'reversal_of FVC');

// ═══ 7. VENTAS DE AMBOS SKU (transactions + sale_items + sales) ════════════
snap.sale_items_111_112 = await q(
  `SELECT si.id, si.sale_id, si.product_id, p.sku, si.quantity, si.unit_price_sold, si.cost_at_sale
   FROM public.sale_items si LEFT JOIN public.products p ON p.id=si.product_id
   WHERE si.product_id IN ('${S111}','${S112}') ORDER BY si.sale_id`, 'sale_items 111/112');
const saleIds = [...new Set(snap.sale_items_111_112.map((s) => s.sale_id))].join("','");
snap.sales_docs = saleIds ? await q(
  `SELECT * FROM public.sales WHERE id IN ('${saleIds}')`, 'sales docs') : [];
// transactions de POS v2 (referencia real de los movimientos de venta)
const txRefs = snap.kardex_111_112.filter((m) => m.movement_type === 'sale' && m.reference_id)
  .map((m) => `'${m.reference_id}'`).join(',');
snap.transactions_ventas = txRefs ? await q(
  `SELECT t.id, t.created_at, t.total_amount, t.payment_method, t.status, t.sale_currency,
      t.sale_exchange_rate, t.customer_name, t.completed_at, t.void_reason, t.reversed_at
   FROM public.transactions t WHERE t.id IN (${txRefs})`, 'transactions ventas') : [];

// ═══ 8. VALES (issue_slips) referenciados por movimientos ══════════════════
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

// ═══ 9. AJUSTES DE INVENTARIO ═════════════════════════════════════════════
// Los movimientos adjustment de la importación no tienen reference_id: se busca
// por store+producto+fecha.
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

// ═══ 10. DEVOLUCIONES DE AMBOS SKU ════════════════════════════════════════
snap.devolution_items_111_112 = await q(
  `SELECT di.id, di.devolution_id, di.product_id, p.sku, di.quantity, di.unit_price, di.total, di.reason
   FROM public.devolution_items di LEFT JOIN public.products p ON p.id=di.product_id
   WHERE di.product_id IN ('${S111}','${S112}')`, 'devolution_items 111/112');
const devIds = [...new Set(snap.devolution_items_111_112.map((d) => d.devolution_id))].join("','");
snap.devolutions = devIds ? await q(
  `SELECT id, devolution_number, reason, total_amount, status, created_at, voided_at, reversed_at
   FROM public.devolutions WHERE id IN ('${devIds}')`, 'devolutions') : [];

// ═══ 11. EXISTENCIAS ACTUALES ══════════════════════════════════════════════
snap.inventory_111_112 = await q(
  `SELECT i.product_id, p.sku, i.quantity, i.store_id, i.updated_at
   FROM public.inventory i LEFT JOIN public.products p ON p.id=i.product_id
   WHERE i.product_id IN ('${S111}','${S112}')`, 'inventory 111/112');
snap.products_111_112 = await q(
  `SELECT id, sku, name, price, cost_price, price_currency, cost_average, stock_current
   FROM public.products WHERE id IN ('${S111}','${S112}')`, 'products 111/112');

// ═══ 12. TODAS las líneas de recepción de ambos SKU (doble conversión) ═════
snap.receipt_items_todas = await q(
  `SELECT ri.id, ri.receipt_id, r.document_number, ri.product_id, p.sku, ri.quantity, ri.unit_cost,
      ri.moneda_recepcion, ri.tasa_cambio_recepcion, ri.created_at
   FROM public.receipt_items ri LEFT JOIN public.products p ON p.id=ri.product_id
   LEFT JOIN public.receipts r ON r.id=ri.receipt_id
   WHERE ri.product_id IN ('${S111}','${S112}') ORDER BY ri.created_at`, 'receipt_items todas');

// ═══ 13. LIQUIDACIÓN DEL PROVEEDOR (PAS_CXP_PROV) ═════════════════════════
// a) vista de órdenes de compra/CXP (incluye la FVC)
snap.v_purchase_orders_cxp = await q(
  `SELECT * FROM public.v_purchase_orders_cxp WHERE receipt_id='${FVC}' OR store_id='${STORE}'
   ORDER BY po_created_at DESC LIMIT 50`, 'v_purchase_orders_cxp');
// b) pagos asociados a la recepción / al proveedor Vitallcons
snap.payment_transactions_fvc = await q(
  `SELECT pt.id, pt.ref_type, pt.ref_id, pt.amount, pt.currency, pt.exchange_rate, pt.amount_cup,
      pt.payment_method, pt.payment_date, pt.reference, pt.notes, pt.direction, pt.created_at
   FROM public.payment_transactions pt
   WHERE pt.ref_id='${FVC}' OR (pt.store_id='${STORE}' AND pt.ref_type IN ('receipt','proveedor','supplier','purchase'))
   ORDER BY pt.payment_date`, 'payment_transactions FVC/proveedor');
// c) movimientos contables PAS_CXP_PROV que tocan la FVC
snap.fin_movements_cxp_fvc = await q(
  `SELECT fm.id, fm.entry_id, fe.document_type, fe.document_number, fe.event, fm.category_code,
      fm.sense, fm.amount, fm.amount_cup, fm.economic_date, fm.description, fm.traza, fe.reversal_of
   FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
   WHERE fm.category_code='PAS_CXP_PROV' AND (fm.document_number LIKE '%VITALLCONS%' OR fe.document_id='${FVC}')
   ORDER BY fm.economic_date`, 'fin_movements CXP FVC/Vitallcons');
// d) mayor PAS_CXP_PROV global (agregado)
snap.mayor_pas_cxp_prov = await q(
  `SELECT fe.document_type, fe.event, fm.sense, count(*)::int AS n_movs, sum(fm.amount_cup)::float8 AS total
   FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
   WHERE fm.category_code='PAS_CXP_PROV' GROUP BY fe.document_type, fe.event, fm.sense
   ORDER BY fe.document_type, fm.sense`, 'mayor PAS_CXP_PROV');

// ═══ 14. MAYOR ACT_INVENTARIO (agregado) ═══════════════════════════════════
snap.mayor_act_inventario = await q(
  `SELECT fe.document_type, fe.event, fm.sense, count(*)::int AS n_movs, sum(fm.amount_cup)::float8 AS total
   FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
   WHERE fm.category_code='ACT_INVENTARIO' GROUP BY fe.document_type, fe.event, fm.sense
   ORDER BY fe.document_type, fm.sense`, 'mayor ACT_INVENTARIO');
snap.fin_opening_balances = await q(
  `SELECT category_code, sum(amount_cup)::float8 AS total FROM public.fin_opening_balances
   WHERE category_code IN ('ACT_INVENTARIO','PAS_CXP_PROV') GROUP BY category_code`,
  'fin_opening_balances');
// movimientos ACT_INVENTARIO generados por documentos de los dos SKU (ventas/vales/ajustes)
snap.fin_movements_act_docs = await q(
  `SELECT fm.id, fm.entry_id, fe.document_type, fe.document_number, fe.event, fm.sense, fm.amount,
      fm.amount_cup, fm.economic_date, fm.description, fm.traza, fe.reversal_of
   FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
   WHERE fm.category_code='ACT_INVENTARIO' AND fe.document_number LIKE 'VS-%'
   ORDER BY fm.economic_date`, 'fin_movements ACT vales');

// ═══ 15. PR-2 BACKUPS (importación original) ══════════════════════════════
snap.pr2_backup = await q(
  `SELECT 'receipts' AS tabla, count(*)::int AS n FROM public.pr2_backup_receipts_20260810
   WHERE receipt_id='${FVC}'
   UNION ALL
   SELECT 'items', count(*)::int FROM public.pr2_backup_receipt_items_20260810 b
   WHERE b.product_id IN ('${S111}','${S112}')`, 'pr2_backup presencia');

// ═══ 16. AUDITORÍA GATE16 / FVC ═══════════════════════════════════════════
snap.audit_gate16 = await q(
  `SELECT a.id, a.action, a.table_name, a.record_id, a.created_at, a.trace_id,
      substring(coalesce(a.old_data::text,''),1,400) AS old_data,
      substring(coalesce(a.new_data::text,''),1,400) AS new_data,
      substring(coalesce(a.metadata::text,''),1,600) AS metadata
   FROM public.audit_logs a
   WHERE (a.record_id::text IN ('${S111}','${S112}','${FVC}'))
      OR (a.metadata::text LIKE '%fd9d6c88%')
   ORDER BY a.created_at DESC LIMIT 60`, 'audit_logs GATE16/FVC');

// ═══ 17. VERIFICACIONES ARITMÉTICAS INDEPENDIENTES ════════════════════════
const li = snap.receipt_items;
const pmap = new Map(snap.products.map((p) => [p.id, p]));
let suma = 0;
for (const l of li) {
  suma += Number(l.quantity) * Number(l.unit_cost) * Number(l.tasa_cambio_recepcion || 1);
}
let sumaCorregida = 0;
for (const l of li) {
  const sku = l.sku;
  if (sku === '111' || sku === '112') {
    sumaCorregida += Number(l.quantity) * 1; // costo real 1 CUP/u (decisión propietario)
  } else {
    sumaCorregida += Number(l.quantity) * Number(l.unit_cost) * Number(l.tasa_cambio_recepcion || 1);
  }
}
snap.verificacion_aritmetica = {
  n_lineas: li.length,
  suma_recomputada_linea_a_linea: Math.round(suma * 100) / 100,
  total_cabecera_receipts: Number(R.total_cost),
  delta_cabecera_vs_recomputo: Math.round((Number(R.total_cost) - suma) * 100) / 100,
  total_corregido_escenario_propietario: Math.round(sumaCorregida * 100) / 100,
  reduccion_total: Math.round((suma - sumaCorregida) * 100) / 100,
  correcciones_sku: li.filter((l) => l.sku === '111' || l.sku === '112').map((l) => {
    const antes = Number(l.quantity) * Number(l.unit_cost) * Number(l.tasa_cambio_recepcion || 1);
    const despues = Number(l.quantity) * 1;
    return { sku: l.sku, qty: Number(l.quantity), uc_actual: Number(l.unit_cost),
      moneda: l.moneda_recepcion, tasa: Number(l.tasa_cambio_recepcion),
      valor_antes: antes, valor_correcto: despues, delta: antes - despues };
  }),
};

// ═══ 18. KARDEX — RECONSTRUCCIÓN DE LA IGUALDAD POR SKU ════════════════════
const recon = {};
for (const sku of ['111', '112']) {
  const movs = snap.kardex_111_112.filter((m) => m.sku === sku);
  const entradas = movs.filter((m) => Number(m.quantity_change) > 0);
  const salidas = movs.filter((m) => Number(m.quantity_change) < 0);
  let bal = 0;
  const cronologia = movs.map((m) => {
    bal += Number(m.quantity_change);
    return { fecha: m.movement_date?.slice(0, 10), tipo: m.movement_type,
      q: Number(m.quantity_change), uc: Number(m.unit_cost),
      ref_doc: m.reference_doc, balance_calculado: bal,
      balance_registrado: Number(m.balance_after) };
  });
  recon[sku] = {
    n_movimientos: movs.length,
    entradas: { n: entradas.length, unidades: entradas.reduce((a, m) => a + Number(m.quantity_change), 0) },
    salidas_brutas: { n: salidas.length, unidades: -salidas.reduce((a, m) => a + Number(m.quantity_change), 0) },
    saldo_kardex_calculado: bal,
    saldo_stock_current: Number((snap.products_111_112.find((p) => p.sku === sku) || {}).stock_current),
    saldo_inventory: Number((snap.inventory_111_112.find((p) => p.sku === sku) || {}).quantity),
    cronologia,
  };
}
snap.reconstruccion_kardex = recon;

// ═══ 19. HASHES SHA-256 POR SECCIÓN ═══════════════════════════════════════
snap.hashes = {};
for (const [k, v] of Object.entries(snap)) {
  if (k === 'hashes') continue;
  snap.hashes[k] = sha256(v);
}

const OUT = resolve(OUT_DIR, 'rect003-faseI-snapshot.json');
writeFileSync(OUT, JSON.stringify(snap, null, 1));
console.log('\n═══ RESUMEN FASE I ═══');
console.log(JSON.stringify(snap.verificacion_aritmetica, null, 1));
console.log('Kardex 111:', JSON.stringify({ ...recon['111'], cronologia: `(${recon['111'].cronologia.length} filas)` }, null, 1).slice(0, 600));
console.log('Kardex 112:', JSON.stringify({ ...recon['112'], cronologia: `(${recon['112'].cronologia.length} filas)` }, null, 1).slice(0, 600));
console.log('\nGuardado en', OUT, '(' + statSync(OUT).size + ' bytes)');
