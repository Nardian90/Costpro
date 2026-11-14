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
// snapshot de la FVC
const fvcE = await q(`SELECT id::text, movements_snapshot FROM public.fin_entries
  WHERE document_type='RECEPCION' AND document_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63'`);
console.log('FVC entry snapshot (primeros 800 chars):');
console.log(JSON.stringify(fvcE[0]?.movements_snapshot).slice(0, 800));
// snapshot de una venta cualquiera
const vta = await q(`SELECT fe.id::text, fe.document_id::text, fe.movements_snapshot
  FROM public.fin_entries fe WHERE fe.document_type='VENTA' LIMIT 1`);
console.log('\nVENTA entry snapshot (primeros 600 chars):');
console.log(JSON.stringify(vta[0]?.movements_snapshot).slice(0, 600));
// snapshot de un vale
const vs = await q(`SELECT fe.id::text, fe.document_id::text, fe.movements_snapshot
  FROM public.fin_entries fe WHERE fe.document_type='VALE_SALIDA' LIMIT 1`);
console.log('\nVALE_SALIDA entry snapshot (primeros 600 chars):');
console.log(JSON.stringify(vs[0]?.movements_snapshot).slice(0, 600));
// ¿cuántas VENTA entries hay vs sales? y document_id referencia sales?
const vsales = await q(`SELECT count(*)::int AS n FROM public.fin_entries WHERE document_type='VENTA'`);
const sales = await q(`SELECT count(*)::int AS n FROM public.sales`).catch(()=>q(`SELECT count(*)::int AS n FROM public.pos_sales`));
console.log('\nVENTA entries:', vsales[0].n, '| tabla sales:', JSON.stringify(sales));
