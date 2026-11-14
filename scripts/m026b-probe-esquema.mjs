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
// Columnas receipts / receipt_items / products
for (const t of ['receipts','receipt_items','products']) {
  const cols = await q(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='${t}' ORDER BY ordinal_position`);
  console.log(`\n== ${t} ==`);
  console.log(cols.map(c => c.column_name).join(', '));
}
// Estados de recepciones y conteo de líneas
const est = await q(`SELECT r.status, count(*)::int AS n FROM public.receipts r GROUP BY r.status ORDER BY n DESC`);
console.log('\nestados receipts:', JSON.stringify(est));
// Por tienda: recepciones y líneas
const porTienda = await q(`SELECT r.store_id, s.name, count(*)::int AS recepciones,
  (SELECT count(*) FROM public.receipt_items ri WHERE ri.receipt_id IN (SELECT id FROM public.receipts x WHERE x.store_id=r.store_id))::int AS lineas
  FROM public.receipts r LEFT JOIN public.stores s ON s.id=r.store_id GROUP BY r.store_id, s.name ORDER BY recepciones DESC`);
console.log('por tienda:', JSON.stringify(porTienda));
// 208 movs: tipos de reference_doc textuales
const rdoc = await q(`SELECT reference_doc, count(*)::int AS n FROM public.stock_movements WHERE movement_type='purchase' AND reference_id IS NULL GROUP BY reference_doc ORDER BY n DESC`);
console.log('reference_doc de los 208:', JSON.stringify(rdoc));
// ¿Existen movs de compra con ref a otras recepciones (cualquier tipo)?
const porRef = await q(`SELECT reference_id::text, count(*)::int AS n FROM public.stock_movements WHERE movement_type='purchase' GROUP BY reference_id ORDER BY n DESC LIMIT 10`);
console.log('purchase por reference_id:', JSON.stringify(porRef));
// product: sku col name check + example
const ex = await q(`SELECT id::text, name, sku, unit FROM public.products LIMIT 3`);
console.log('products ejemplo:', JSON.stringify(ex));
// movement types beyond purchase
const mts = await q(`SELECT movement_type, count(*)::int AS n FROM public.stock_movements GROUP BY movement_type ORDER BY n DESC`);
console.log('todos los tipos:', JSON.stringify(mts));
