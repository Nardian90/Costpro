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
// los 6 productos dominantes
const tops = [111, 112, 86, 117, 88, 85];
for (const sku of tops) {
  const p = await q(`SELECT id::text, name, stock_current::float8, cost_average::float8 FROM public.products WHERE sku='${sku}' AND store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38'`);
  if (!p.length) { console.log(`sku ${sku}: no encontrado`); continue; }
  const pid = p[0].id;
  const movs = await q(`SELECT movement_type, quantity_change::float8, unit_cost::float8, movement_date::text, reference_id::text, reference_doc
    FROM public.stock_movements WHERE product_id='${pid}' AND store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38'
    ORDER BY movement_date, id`);
  const fvcLine = await q(`SELECT quantity::float8, unit_cost::float8, moneda_recepcion, tasa_cambio_recepcion::float8
    FROM public.receipt_items WHERE receipt_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63' AND product_id='${pid}'`);
  console.log(`\n══ sku=${sku} "${p[0].name}" stock=${p[0].stock_current} wac=${p[0].cost_average} | FVC línea: q=${fvcLine[0]?.quantity} uc=${fvcLine[0]?.unit_cost} ${fvcLine[0]?.moneda_recepcion}@${fvcLine[0]?.tasa_cambio_recepcion}`);
  let neto = 0;
  for (const m of movs) { neto += m.quantity_change;
    console.log(`   ${m.movement_type} q=${m.quantity_change} uc=${m.unit_cost} ${m.movement_date?.slice(0,10)} ref=${(m.reference_id||m.reference_doc||'').toString().slice(0,30)} "${(m.reference_doc||'').slice(0,35)}"`);
  }
  console.log(`   → neto kardex=${neto.toFixed(2)} vs stock_current=${p[0].stock_current}`);
}
