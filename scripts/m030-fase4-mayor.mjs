#!/usr/bin/env node
// M030a-probe — categorías CP-FIN y estructura del mayor. READ-ONLY.
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
const cats = await q(`SELECT * FROM public.fin_categories ORDER BY code LIMIT 40`);
console.log('fin_categories:');
for (const c of cats) console.log(`  ${c.code} | ${c.name} | tipo=${c.type||c.kind||'?'} | ${JSON.stringify(Object.keys(c).join(','))}`);
// movimientos por category_code y sense
const porCat = await q(`SELECT category_code, sense, count(*)::int AS n, sum(amount_cup)::float8 AS total
  FROM public.fin_movements GROUP BY category_code, sense ORDER BY category_code, sense`);
console.log('\nfin_movements por category_code/sense:');
for (const r of porCat) console.log(`  ${r.category_code} ${r.sense}: n=${r.n} Σ=${r.total}`);
// document types en entries
const porDoc = await q(`SELECT document_type, event, count(*)::int AS n FROM public.fin_entries GROUP BY document_type, event ORDER BY document_type`);
console.log('\nfin_entries por document_type/event:');
for (const r of porDoc) console.log(`  ${r.document_type} / ${r.event}: ${r.n}`);
// opening balances
const ob = await q(`SELECT count(*)::int AS n FROM public.fin_opening_balances`);
console.log('\nfin_opening_balances filas:', ob[0].n);
const obD = ob[0].n > 0 ? await q(`SELECT * FROM public.fin_opening_balances LIMIT 10`) : [];
for (const o of obD) console.log('  ', JSON.stringify(o).slice(0, 200));
// ACT_INVENTARIO: tiene product_id?
const inv = await q(`SELECT count(*)::int AS n, count(*) FILTER (WHERE product_id IS NOT NULL)::int AS con_prod
  FROM public.fin_movements WHERE category_code='ACT_INVENTARIO'`);
console.log('\nACT_INVENTARIO movs:', JSON.stringify(inv[0]));
// saldo global por tienda
const saldos = await q(`SELECT store_id, sense, sum(amount_cup)::float8 AS total FROM public.fin_movements
  WHERE category_code='ACT_INVENTARIO' GROUP BY store_id, sense ORDER BY store_id`);
console.log('ACT_INVENTARIO por tienda/sense:');
for (const s of saldos) console.log(`  ${s.store_id.slice(0,8)} ${s.sense}: ${s.total}`);
