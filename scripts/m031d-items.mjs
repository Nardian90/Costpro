#!/usr/bin/env node
import { readFileSync } from 'fs';
import { resolve } from 'path';
const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`(HTTP ${res.status}) ${text.slice(0, 300)}`);
  return JSON.parse(text || '[]');
}
// ¿COGS del asiento = Σ(cost_at_sale × qty) de transaction_items?
const prueba = await q(`WITH entries AS (
    SELECT fe.document_id::text AS tx, sum(fm.amount_cup)::float8 AS cogs
    FROM public.fin_entries fe JOIN public.fin_movements fm ON fm.entry_id=fe.id
    WHERE fe.document_type='VENTA' AND fm.category_code='GAS_COSTO_VENTAS' AND fm.sense='debito'
    GROUP BY 1),
  items AS (SELECT transaction_id::text AS tx, sum(quantity * cost_at_sale)::float8 AS v
    FROM public.transaction_items GROUP BY 1)
  SELECT e.tx, e.cogs, i.v, (e.cogs - i.v)::float8 AS dif
  FROM entries e LEFT JOIN items i ON i.tx=e.tx
  ORDER BY abs(e.cogs - coalesce(i.v,0)) DESC LIMIT 10`);
console.log('COGS asiento vs Σ(q×cost_at_sale):');
for (const p of prueba) console.log(`  tx=${p.tx.slice(0,8)}: cogs=${p.cogs} items=${p.v} dif=${p.dif}`);
// ¿cuántos dif≈0?
const exactos = await q(`WITH entries AS (
    SELECT fe.document_id::text AS tx, sum(fm.amount_cup)::float8 AS cogs
    FROM public.fin_entries fe JOIN public.fin_movements fm ON fm.entry_id=fe.id
    WHERE fe.document_type='VENTA' AND fm.category_code='GAS_COSTO_VENTAS' AND fm.sense='debito'
    GROUP BY 1),
  items AS (SELECT transaction_id::text AS tx, sum(quantity * cost_at_sale)::float8 AS v
    FROM public.transaction_items GROUP BY 1)
  SELECT count(*)::int AS n, sum(CASE WHEN abs(e.cogs - coalesce(i.v,0)) <= 0.01 THEN 1 ELSE 0 END)::int AS exactos
  FROM entries e LEFT JOIN items i ON i.tx=e.tx`);
console.log(`entradas VENTA: ${exactos[0].n} | COGS == Σ(q×cost_at_sale) exacto: ${exactos[0].exactos}`);
// movement unit_cost=0 en ventas: cuántas y valor
const uc0 = await q(`SELECT count(*)::int AS n, count(DISTINCT reference_id)::int AS tx,
    sum(abs(quantity_change))::float8 AS unidades
  FROM public.stock_movements WHERE movement_type='sale' AND (unit_cost = 0 OR unit_cost IS NULL)`);
console.log('\nmovimientos de venta con unit_cost=0/NULL:', JSON.stringify(uc0[0]));
// de las que tienen asiento: ¿la base del motor es cost_at_sale?
const conAsiento = await q(`SELECT count(DISTINCT sm.reference_id)::int AS tx
  FROM public.stock_movements sm WHERE sm.movement_type='sale' AND (sm.unit_cost=0 OR sm.unit_cost IS NULL)
  AND EXISTS (SELECT 1 FROM public.fin_entries fe WHERE fe.document_type='VENTA' AND fe.document_id=sm.reference_id::uuid)`);
console.log('tx con movs uc=0 que SÍ tienen asiento:', conAsiento[0].tx);
// ¿cost_at_sale=0 en items?
const cas0 = await q(`SELECT count(*)::int AS n, sum(quantity * cost_at_sale)::float8 AS v FROM public.transaction_items WHERE cost_at_sale=0 OR cost_at_sale IS NULL`);
console.log('transaction_items con cost_at_sale=0/NULL:', JSON.stringify(cas0[0]));
// Venta v1 (POS) sin asiento: detalle
const v1 = await q(`SELECT sm.reference_id::text AS tx, sm.reference_doc, sm.product_id::text, p.sku,
    abs(sm.quantity_change)::float8 AS q, sm.unit_cost::float8 AS uc, sm.movement_date::text
  FROM public.stock_movements sm LEFT JOIN public.products p ON p.id=sm.product_id
  WHERE sm.movement_type='sale' AND sm.reference_doc='Venta POS'
  ORDER BY sm.movement_date`);
console.log('\nVentas v1 (POS) totales:');
for (const v of v1) console.log(`  tx=${v.tx?.slice(0,8)} sku=${v.sku} q=${v.q} uc=${v.uc} ${v.movement_date?.slice(0,10)}`);
