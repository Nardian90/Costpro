#!/usr/bin/env node
/**
 * M031c — FASE IV (profundización 2): NATURALEZA DEL GAP DE COGS.
 * Por transacción con asiento: COGS del asiento vs Σ(|q|×unit_cost) de sus
 * movimientos de venta; con detalle de productos y costos. READ-ONLY.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD'); process.exit(2); }
async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`(HTTP ${res.status}) ${text.slice(0, 300)}`);
  return JSON.parse(text || '[]');
}

// ── 1. Ventas sin asiento: naturaleza por referencia y fecha ──────────────────
console.log('── 1. Ventas SIN asiento: naturaleza ──');
const sinEntry = await q(`SELECT sm.reference_doc, count(DISTINCT sm.reference_id)::int AS tx, count(*)::int AS movs,
    min(sm.movement_date)::text AS desde, max(sm.movement_date)::text AS hasta,
    sum(abs(sm.quantity_change) * sm.unit_cost)::float8 AS valor
  FROM public.stock_movements sm WHERE sm.movement_type='sale'
    AND NOT EXISTS (SELECT 1 FROM public.fin_entries fe WHERE fe.document_type='VENTA' AND fe.document_id = sm.reference_id::uuid)
  GROUP BY 1 ORDER BY valor DESC`);
for (const r of sinEntry) console.log(`  ${r.reference_doc}: tx=${r.tx} movs=${r.movs} ${r.desde?.slice(0,10)}→${r.hasta?.slice(0,10)} valor=${r.valor.toFixed(2)}`);
// ¿estado de esas transacciones?
const sinEntryTx = await q(`SELECT t.status, count(*)::int AS n FROM public.transactions t
  WHERE NOT EXISTS (SELECT 1 FROM public.fin_entries fe WHERE fe.document_type='VENTA' AND fe.document_id = t.id)
    AND EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.movement_type='sale' AND sm.reference_id = t.id::text)
  GROUP BY 1`);
console.log('  estado de transacciones sin asiento:', JSON.stringify(sinEntryTx));
// ¿columna transaction_items?
const tiCols = await q(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='transaction_items' ORDER BY ordinal_position`);
console.log('  transaction_items columnas:', tiCols.map(c => c.column_name).join(', '));
const nTi = await q(`SELECT count(*)::int AS n FROM public.transaction_items`);
console.log('  transaction_items filas:', nTi[0].n);

// ── 2. Top discrepancias COGS (movs vs asiento) con productos ─────────────────
console.log('\n── 2. Top 15 transacciones por |dif| COGS ──');
const difs = await q(`WITH movs AS (
    SELECT reference_id::text AS tx, sum(abs(quantity_change) * unit_cost)::float8 AS vmovs
    FROM public.stock_movements WHERE movement_type='sale' AND reference_id IS NOT NULL GROUP BY 1),
  entries AS (
    SELECT fe.document_id::text AS tx, sum(fm.amount_cup)::float8 AS cogs
    FROM public.fin_entries fe JOIN public.fin_movements fm ON fm.entry_id=fe.id
    WHERE fe.document_type='VENTA' AND fm.category_code='GAS_COSTO_VENTAS' AND fm.sense='debito'
    GROUP BY 1)
  SELECT m.tx, m.vmovs, e.cogs, (e.cogs - m.vmovs)::float8 AS dif, t.created_at::text, s.name AS tienda
  FROM movs m JOIN entries e ON e.tx = m.tx
  LEFT JOIN public.transactions t ON t.id::text = m.tx
  LEFT JOIN public.stores s ON s.id = t.store_id
  ORDER BY abs(e.cogs - m.vmovs) DESC LIMIT 15`);
for (const d of difs) console.log(`  tx=${d.tx.slice(0,8)} ${d.tienda} ${d.created_at?.slice(0,10)}: movs=${d.vmovs.toFixed(2)} cogs=${d.cogs.toFixed(2)} dif=${d.dif.toFixed(2)}`);

// ── 3. Detalle por producto de las 3 peores ─────────────────────────────────
const top3 = difs.slice(0, 3).map(d => d.tx);
if (top3.length) {
  console.log('\n── 3. Detalle por producto de las 3 peores ──');
  const det = await q(`SELECT sm.reference_id::text AS tx, sm.product_id::text, p.sku, p.name AS producto,
      abs(sm.quantity_change)::float8 AS q, sm.unit_cost::float8 AS uc_mov, sm.movement_date::text
    FROM public.stock_movements sm LEFT JOIN public.products p ON p.id=sm.product_id
    WHERE sm.movement_type='sale' AND sm.reference_id::text = ANY(ARRAY[${top3.map(x=>`'${x}'`).join(',')}])
    ORDER BY abs(sm.quantity_change * sm.unit_cost) DESC`);
  for (const d of det) console.log(`  tx=${d.tx.slice(0,8)} sku=${d.sku} "${(d.producto||'').slice(0,30)}" q=${d.q} uc_mov=${d.uc_mov} fecha=${d.movement_date?.slice(0,10)}`);
  // transaction_items de esas tx (cost_at_sale)
  const titems = await q(`SELECT ti.transaction_id::text AS tx, ti.product_id::text, p.sku,
      ti.quantity::float8, ti.unit_price::float8, ti.total::float8
    FROM public.transaction_items ti LEFT JOIN public.products p ON p.id=ti.product_id
    WHERE ti.transaction_id::text = ANY(ARRAY[${top3.map(x=>`'${x}'`).join(',')}])
    ORDER BY ti.total DESC NULLS LAST`);
  console.log('  transaction_items de esas tx:');
  for (const t of titems.slice(0, 20)) console.log(`    tx=${t.tx.slice(0,8)} sku=${t.sku} q=${t.quantity} precio=${t.unit_price} total=${t.total}`);
}

// ── 4. ¿De dónde sale el COGS del motor? cost_average vs cost_at_sale ────────
console.log('\n── 4. Base de costo del motor ──');
// prueba: para los productos de la top-1, cost_average actual vs costos
if (top3.length) {
  const prods = await q(`SELECT DISTINCT product_id::text AS p FROM public.stock_movements
    WHERE movement_type='sale' AND reference_id::text='${top3[0]}'`);
  const ids = prods.map(p => `'${p.p}'`).join(',');
  if (ids) {
    const wac = await q(`SELECT id::text, sku, cost_average::float8, cost_price::float8, stock_current::float8
      FROM public.products WHERE id::text IN (${ids})`);
    for (const w of wac) console.log(`  sku=${w.sku}: cost_average=${w.cost_average} cost_price=${w.cost_price} stock=${w.stock_current}`);
  }
}
// snapshot de la top-1: ver la traza completa del asiento
if (top3.length) {
  const snap = await q(`SELECT movements_snapshot FROM public.fin_entries WHERE document_type='VENTA' AND document_id='${top3[0]}'`);
  console.log('  snapshot del asiento top-1:', JSON.stringify(snap[0]?.movements_snapshot).slice(0, 500));
}

// ── 5. Evidencia ─────────────────────────────────────────────────────────────
writeFileSync(resolve('docs/audits/inventory-traceability-20261115/m031c-fase4-cogs-gap.json'), JSON.stringify({
  generado: new Date().toISOString(), mision: 'CP-INVENTORY-TRACEABILITY-RECONCILIATION-001',
  fase: 'IV-c — naturaleza del gap de COGS', ventas_sin_asiento: sinEntry,
  estado_sin_asiento: sinEntryTx, top_difs: difs, transaction_items_cols: tiCols.map(c=>c.column_name),
}, null, 2));
console.log('\nevidencia → docs/audits/inventory-traceability-20261115/m031c-fase4-cogs-gap.json');
