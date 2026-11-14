// ============================================================================
// M046 — CP-FIN-VALUATION-RECTIFICATION-003 · FASE I (complemento):
// Asientos CP-FIN de ventas/vales de SKU 111/112, transaction_items,
// receipt_tasa_audit y recepciones del proveedor Vitallcons. READ-ONLY.
// Uso: node scripts/m046-rect003-faseI-complemento.mjs
// ============================================================================
import { createHash } from 'node:crypto';
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
const sha256 = (s) => createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex');

const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const S111 = '4afef9a7-28b7-4a5e-b134-13a9e0ffea16';
const S112 = '14aeb370-7e00-4889-b29b-ef2bc778f4c4';

const snap = JSON.parse(readFileSync('/home/z/my-project/scripts/out/rect003-faseI-snapshot.json', 'utf8'));
const comp = { mision: 'CP-FIN-VALUATION-RECTIFICATION-003', fase: 'I-complemento', secciones: {} };

// ── 1. transaction_items de las 5 ventas de SKU 111/112 ────────────────────
const txIds = snap.transactions_ventas.map((t) => `'${t.id}'`).join(',');
comp.transaction_items = await q(
  `SELECT ti.id, ti.transaction_id, ti.product_id, p.sku, ti.quantity, ti.price_at_sale,
      ti.price_at_sale_cup, ti.cost_at_sale, ti.price_currency, ti.exchange_rate
   FROM public.transaction_items ti LEFT JOIN public.products p ON p.id=ti.product_id
   WHERE ti.transaction_id IN (${txIds}) AND ti.product_id IN ('${S111}','${S112}')
   ORDER BY ti.transaction_id, ti.created_at`, 'transaction_items ventas 111/112');
// todos los items de esas transacciones (contexto del carrito)
comp.transaction_items_todos = await q(
  `SELECT ti.transaction_id, count(*)::int AS items, sum(ti.quantity)::float8 AS unidades
   FROM public.transaction_items ti WHERE ti.transaction_id IN (${txIds})
   GROUP BY ti.transaction_id`, 'contexto carritos');

// ── 2. Asientos CP-FIN de las 5 VENTAS ──────────────────────────────────────
comp.fin_entries_ventas = await q(
  `SELECT fe.id, fe.document_type, fe.document_id, fe.document_number, fe.event, fe.economic_date,
      fe.posted_at, fe.status, fe.description, fe.reversal_of
   FROM public.fin_entries fe WHERE fe.document_id::text IN (${txIds}) ORDER BY fe.economic_date`,
  'fin_entries ventas');
const entV = comp.fin_entries_ventas.map((e) => `'${e.id}'`).join(',');
comp.fin_movements_ventas = entV ? await q(
  `SELECT fm.id, fm.entry_id, fm.category_code, fm.sense, fm.amount, fm.amount_cup, fm.economic_date,
      fm.description, fm.traza
   FROM public.fin_movements fm WHERE fm.entry_id IN (${entV}) ORDER BY fm.entry_id, fm.id`,
  'fin_movements ventas') : [];

// ── 3. Asientos CP-FIN de los VALES de SKU 111/112 ──────────────────────────
// (los 11 vales: VS-37/138/139/148/157/158/165/208/223/225)
const valeNums = snap.kardex_111_112.filter((m) => m.movement_type === 'issue_slip_out')
  .map((m) => (m.reference_doc.match(/VS-\d{6}/) || [])[0]).filter(Boolean);
const valeNumsU = [...new Set(valeNums)];
comp.vale_numbers = valeNumsU;
const valeLike = valeNumsU.map((v) => `fe.document_number LIKE '%${v}%'`).join(' OR ');
comp.fin_entries_vales = await q(
  `SELECT fe.id, fe.document_type, fe.document_id, fe.document_number, fe.event, fe.economic_date,
      fe.posted_at, fe.status, fe.description, fe.reversal_of
   FROM public.fin_entries fe WHERE ${valeLike} ORDER BY fe.economic_date`, 'fin_entries vales');
const entSlip = comp.fin_entries_vales.map((e) => `'${e.id}'`).join(',');
comp.fin_movements_vales = entSlip ? await q(
  `SELECT fm.id, fm.entry_id, fe.document_number, fm.category_code, fm.sense, fm.amount, fm.amount_cup,
      fm.economic_date, fm.description, fm.traza
   FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
   WHERE fm.entry_id IN (${entSlip}) ORDER BY fm.entry_id, fm.id`, 'fin_movements vales') : [];

// ── 4. receipt_tasa_audit de la FVC ─────────────────────────────────────────
comp.receipt_tasa_audit = await q(
  `SELECT a.*, ri.product_id, p.sku FROM public.receipt_tasa_audit a
   JOIN public.receipt_items ri ON ri.id = a.receipt_item_id
   JOIN public.products p ON p.id = ri.product_id
   WHERE ri.receipt_id='${FVC}' ORDER BY a.modificado_at LIMIT 60`, 'receipt_tasa_audit FVC');

// ── 5. Recepciones del proveedor Vitallcons (liquidación global) ────────────
comp.receipts_vitallcons = await q(
  `SELECT id, reference_doc, supplier, status, total_cost, reception_date, payment_status, paid_amount,
      due_date, paid_at, created_at
   FROM public.receipts WHERE supplier ILIKE '%vitallcons%' OR supplier ILIKE '%vital%'
   ORDER BY reception_date`, 'receipts Vitallcons');
comp.receipts_store_enervida = await q(
  `SELECT id, reference_doc, supplier, status, total_cost, reception_date, payment_status, paid_amount
   FROM public.receipts WHERE store_id='${STORE}' ORDER BY reception_date`, 'receipts ENERVIDA');

// ── 6. IDs exactos de movimientos kardex de las salidas (para fase V/VII) ────
comp.kardex_salidas_ids = snap.kardex_111_112.filter((m) => Number(m.quantity_change) < 0)
  .map((m) => ({ id: m.id, sku: m.sku, fecha: m.movement_date.slice(0, 10), tipo: m.movement_type,
    q: Number(m.quantity_change), uc: Number(m.unit_cost), ref: m.reference_id,
    doc: m.reference_doc }));

// ── 7. product_lots / batches de ambos SKU (capas de inventario) ────────────
comp.inventory_batches = await q(
  `SELECT * FROM public.inventory_batches WHERE product_id IN ('${S111}','${S112}') LIMIT 20`,
  'inventory_batches 111/112');
comp.product_lots = await q(
  `SELECT * FROM public.product_lots WHERE product_id IN ('${S111}','${S112}') LIMIT 20`,
  'product_lots 111/112');

// ── 8. Hashes ──────────────────────────────────────────────────────────────
comp.hashes = {};
for (const [k, v] of Object.entries(comp)) {
  if (k === 'hashes') continue;
  comp.hashes[k] = sha256(v);
}
const OUT = '/home/z/my-project/scripts/out/rect003-faseI-complemento.json';
writeFileSync(OUT, JSON.stringify(comp, null, 1));

console.log('\n═══ RESUMEN COMPLEMENTO ═══');
console.log('transaction_items 111/112:', JSON.stringify(comp.transaction_items, null, 1));
console.log('fin_entries_ventas:', comp.fin_entries_ventas.map((e) => `${e.document_number || e.document_id} ${e.event}`).join(' · '));
console.log('vales:', valeNumsU.join(' '));
console.log('receipts Vitallcons:', comp.receipts_vitallcons.map((r) => `${r.reference_doc} ${r.total_cost} ${r.payment_status}`).join(' | '));
console.log('Guardado en', OUT);
