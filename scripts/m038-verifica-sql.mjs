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
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json`' === 'x' ? '' : 'application/json' },
    body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`(HTTP ${res.status}) ${text.slice(0, 200)}`);
  return JSON.parse(text || '[]');
}
// F1
console.log('F1:', JSON.stringify(await q(`SELECT sm.store_id, count(*) AS n FROM public.stock_movements sm WHERE sm.movement_type='purchase' AND sm.reference_id IS NULL GROUP BY 1`)));
// F2
console.log('F2:', JSON.stringify(await q(`SELECT count(*) AS total_backfill FROM public.audit_logs WHERE action='TRACEABILITY_BACKFILL'`)));
// F5
console.log('F5:', JSON.stringify(await q(`SELECT s.name AS tienda, sum(CASE WHEN fm.sense='debito' THEN fm.amount_cup ELSE -fm.amount_cup END) AS saldo_cup FROM public.fin_movements fm LEFT JOIN public.stores s ON s.id=fm.store_id WHERE fm.category_code='ACT_INVENTARIO' GROUP BY 1 ORDER BY 2 DESC`)));
// F16
console.log('F16:', JSON.stringify(await q(`SELECT s.name AS tienda, sum(p.stock_current * p.cost_average) AS valor_cup, sum(p.stock_current) AS unidades FROM public.products p LEFT JOIN public.stores s ON s.id=p.store_id GROUP BY 1 ORDER BY 2 DESC`)));
// F19
console.log('F19:', JSON.stringify(await q(`WITH mayor AS (SELECT sum(CASE WHEN fm.sense='debito' THEN fm.amount_cup ELSE -fm.amount_cup END) AS saldo FROM public.fin_movements fm WHERE fm.category_code='ACT_INVENTARIO' AND fm.store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38'), vigente AS (SELECT sum(p.stock_current * p.cost_average) AS valor FROM public.products p WHERE p.store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38') SELECT (SELECT saldo FROM mayor) AS saldo_contable, (SELECT valor FROM vigente) AS valor_costos_vigentes, (SELECT saldo FROM mayor) - (SELECT valor FROM vigente) AS diferencia_total`)));
// F20
console.log('F20:', JSON.stringify(await q(`WITH fvc AS (SELECT DISTINCT ri.product_id FROM public.receipt_items ri WHERE ri.receipt_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63') SELECT count(*) FILTER (WHERE p.stock_current > 0) AS con_existencia, count(*) FILTER (WHERE p.stock_current = 0) AS sin_existencia, sum(p.stock_current * p.cost_average) AS valor_vigente_fvc FROM public.products p JOIN fvc ON fvc.product_id = p.id WHERE p.store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38'`)));
// F17
console.log('F17:', JSON.stringify(await q(`SELECT (SELECT count(*) FROM public.physical_counts) AS physical_counts, (SELECT count(*) FROM public.physical_inventories WHERE status <> 'voided') AS inventarios_validos`)));
