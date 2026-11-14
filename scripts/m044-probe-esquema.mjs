// M044-PRE — CP-FIN-VALUATION-RECTIFICATION-003 · PROBEO DE ESQUEMA (READ-ONLY)
// Objetivo: conocer estructura de issue_slips (vales), inventory_adjustments,
// devolutions, payment_transactions, v_purchase_orders_cxp, fin_categories,
// y la referencia real de los movimientos de vale/ajuste de SKU 111/112.
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
async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`(HTTP ${res.status}) ${text.slice(0, 300)}`);
  return JSON.parse(text || '[]');
}

const S111 = '4afef9a7-28b7-4a5e-b134-13a9e0ffea16';
const S112 = '14aeb370-7e00-4889-b29b-ef2bc778f4c4';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

// 1. Columnas de las tablas de interés
for (const t of ['issue_slips', 'issue_slip_items', 'inventory_adjustments', 'inventory_adjustment_items',
  'devolutions', 'devolution_items', 'payment_transactions', 'fin_categories', 'fin_entries', 'fin_movements',
  'sales', 'sale_items', 'receipts', 'receipt_items', 'stock_movements', 'wac_change_log']) {
  const r = await q(`SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='${t}' ORDER BY ordinal_position`);
  console.log(`\n── ${t} (${r.length} cols)`);
  console.log(r.map(c => `${c.column_name}:${c.data_type.replace('character varying','varchar').replace('timestamp with time zone','ts')}`).join(' · '));
}

// 2. Vista v_purchase_orders_cxp (definición + columnas)
const vw = await q(`SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='v_purchase_orders_cxp' ORDER BY ordinal_position`);
console.log('\n── v_purchase_orders_cxp (vista)');
console.log(vw.map(c => `${c.column_name}:${c.data_type}`).join(' · '));

// 3. Movimientos de vale/ajuste/venta de ambos SKU: referencia cruzada
const movs = await q(`SELECT sm.id, sm.movement_type, sm.movement_date, sm.quantity_change, sm.unit_cost,
    sm.reference_id, sm.reference_doc, sm.notes, sm.created_at
  FROM public.stock_movements sm
  WHERE sm.product_id IN ('${S111}','${S112}') AND sm.quantity_change < 0
  ORDER BY sm.movement_date, sm.created_at`);
console.log(`\n── ${movs.length} movimientos de SALIDA de SKU 111/112`);
for (const m of movs) {
  console.log(`${m.movement_date?.slice(0,10)} ${String(m.movement_type).padEnd(9)} q=${String(m.quantity_change).padEnd(5)} uc=${String(m.unit_cost).padEnd(9)} ref=${String(m.reference_id).slice(0,8)} rdoc=${String(m.reference_doc).padEnd(18)} ${String(m.notes || '').slice(0,30)}`);
}

// 4. ¿A qué tabla apunta reference_id de cada tipo?
const tipos = [...new Set(movs.map(m => m.movement_type))];
for (const t of tipos) {
  const ej = movs.find(m => m.movement_type === t);
  const rid = ej.reference_id;
  if (!rid) { console.log(`\ntipo ${t}: SIN reference_id`); continue; }
  const hits = [];
  for (const tbl of ['issue_slips', 'sales', 'inventory_adjustments', 'devolutions', 'receipts', 'transaction_items', 'transactions']) {
    try {
      const r = await q(`SELECT id FROM public.${tbl} WHERE id='${rid}' LIMIT 1`);
      if (r.length) hits.push(tbl);
    } catch { /* tabla sin columna id compatible */ }
  }
  console.log(`\ntipo ${t} → reference_id ${rid.slice(0,8)} presente en: ${hits.join(', ') || 'NINGUNA'}`);
}
console.log('\nOK probeo.');
