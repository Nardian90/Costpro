#!/usr/bin/env node
// M027b — desambiguación de los 8 MATCH_AMBIGUO con fecha/secuencia. READ-ONLY.
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
const movIds = ['1ce0cbf5','eeaa5d72','fc12af63','79547a44','a140c422','fefe9fd1','472a14c1','83949840'];
const movs = await q(`SELECT sm.id::text, sm.movement_date::text, sm.created_at::text, sm.quantity_change::float8,
  sm.unit_cost::float8, sm.product_id::text, p.sku
  FROM public.stock_movements sm LEFT JOIN public.products p ON p.id=sm.product_id
  WHERE sm.id::text LIKE ANY(ARRAY[${movIds.map(x=>`'${x}%'`).join(',')}])`);
const lineIds = ['800dca84','6f8fa1bb','21274f5a','f7ee2773','4c7508f1','c2fcbb90','ddba4f96','35df3de2'];
const lins = await q(`SELECT ri.id::text, ri.receipt_id::text, r.reception_date::text, r.created_at::text AS rec_created,
  r.confirmed_at::text, r.status, r.reference_doc AS rec_ref, ri.quantity::float8, ri.unit_cost::float8
  FROM public.receipt_items ri JOIN public.receipts r ON r.id=ri.receipt_id
  WHERE ri.id::text LIKE ANY(ARRAY[${lineIds.map(x=>`'${x}%'`).join(',')}])`);
console.log('MOVIMIENTOS:');
for (const m of movs) console.log(`  ${m.id.slice(0,8)} fecha=${m.movement_date.slice(0,10)} creado=${m.created_at.slice(0,16)} cant=${m.quantity_change} uc=${m.unit_cost} sku=${m.sku}`);
console.log('LÍNEAS (+ su recepción):');
for (const l of lins) console.log(`  ${l.id.slice(0,8)} rec=${l.receipt_id.slice(0,8)} recFecha=${l.reception_date.slice(0,10)} recCreada=${l.rec_created.slice(0,16)} conf=${(l.confirmed_at||'-').slice(0,16)} status=${l.status} ref="${l.rec_ref}" cant=${l.quantity} uc=${l.unit_cost}`);
// Las recepciones completas de esas líneas
const recIds = [...new Set(lins.map(l => l.receipt_id))];
const recs = await q(`SELECT id::text, document_number, reference_doc, reception_date::text, created_at::text, confirmed_at::text, status, total_cost::float8,
  (SELECT count(*) FROM public.receipt_items WHERE receipt_id=r.id)::int AS n_lineas
  FROM public.receipts r WHERE id::text = ANY(ARRAY[${recIds.map(x=>`'${x}'`).join(',')}])`);
console.log('RECEPCIONES IMPLICADAS:');
for (const r of recs) console.log(`  ${r.id.slice(0,8)} doc=${r.document_number} ref="${r.reference_doc}" fecha=${r.reception_date.slice(0,10)} creada=${r.created_at.slice(0,16)} status=${r.status} total=${r.total_cost} lineas=${r.n_lineas}`);
// movs de compra de esas recepciones y su fecha
const movsRec = await q(`SELECT sm.id::text, sm.reference_id::text, sm.movement_date::text, sm.created_at::text,
  sm.product_id::text, sm.quantity_change::float8, sm.unit_cost::float8
  FROM public.stock_movements sm WHERE sm.movement_type='purchase'
  AND sm.product_id IN (SELECT product_id FROM public.receipt_items WHERE receipt_id::text = ANY(ARRAY[${recIds.map(x=>`'${x}'`).join(',')}]))
  AND sm.movement_date::date BETWEEN '2026-09-01' AND '2026-10-31' ORDER BY sm.movement_date, sm.id`);
console.log(`movs de compra de esos productos sep-oct: ${movsRec.length}`);
for (const m of movsRec.slice(0, 40)) console.log(`  ${m.id.slice(0,8)} ref=${m.reference_id||'NULL'} fecha=${m.movement_date.slice(0,10)} creado=${m.created_at.slice(0,16)} prod=${m.product_id.slice(0,8)} cant=${m.quantity_change} uc=${m.unit_cost}`);
