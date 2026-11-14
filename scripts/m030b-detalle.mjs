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
// entradas completas por tipo/evento
const porDoc = await q(`SELECT document_type, event, count(*)::int AS n FROM public.fin_entries GROUP BY document_type, event ORDER BY document_type, event`);
console.log('fin_entries por document_type/event:');
for (const r of porDoc) console.log(`  ${r.document_type} / ${r.event}: ${r.n}`);
// ACT_INVENTARIO: dimensión producto
const inv = await q(`SELECT count(*)::int AS n, count(*) FILTER (WHERE product_id IS NOT NULL)::int AS con_prod,
  count(*) FILTER (WHERE product_id IS NULL)::int AS sin_prod
  FROM public.fin_movements WHERE category_code='ACT_INVENTARIO'`);
console.log('\nACT_INVENTARIO movs:', JSON.stringify(inv[0]));
// ACT_INVENTARIO por document_type del entry + sense
const porTipo = await q(`SELECT fe.document_type, fe.event, fm.sense, count(*)::int AS n, sum(fm.amount_cup)::float8 AS total
  FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id = fm.entry_id
  WHERE fm.category_code='ACT_INVENTARIO'
  GROUP BY fe.document_type, fe.event, fm.sense ORDER BY fe.document_type, fm.sense`);
console.log('\nACT_INVENTARIO por document_type/event/sense:');
for (const r of porTipo) console.log(`  ${r.document_type}/${r.event} ${r.sense}: n=${r.n} Σ=${r.total}`);
// opening balances
const obN = await q(`SELECT count(*)::int AS n FROM public.fin_opening_balances`);
console.log('\nfin_opening_balances:', obN[0].n, 'filas');
if (obN[0].n > 0) {
  const obs = await q(`SELECT * FROM public.fin_opening_balances LIMIT 15`);
  for (const o of obs) console.log('  ', JSON.stringify(o).slice(0, 250));
}
// por tienda saldo ACT_INVENTARIO
const saldos = await q(`SELECT fm.store_id, s.name, sum(CASE WHEN fm.sense='debito' THEN fm.amount_cup ELSE -fm.amount_cup END)::float8 AS saldo,
    sum(CASE WHEN fm.sense='debito' THEN fm.amount_cup ELSE 0 END)::float8 AS debitos,
    sum(CASE WHEN fm.sense='credito' THEN fm.amount_cup ELSE 0 END)::float8 AS creditos,
    count(*)::int AS n
  FROM public.fin_movements fm LEFT JOIN public.stores s ON s.id=fm.store_id
  WHERE fm.category_code='ACT_INVENTARIO' GROUP BY fm.store_id, s.name ORDER BY saldo DESC`);
console.log('\nACT_INVENTARIO saldo por tienda:');
for (const r of saldos) console.log(`  ${r.name}: débitos=${r.debitos} créditos=${r.creditos} saldo=${r.saldo} (n=${r.n})`);
// periodos
const per = await q(`SELECT date_trunc('month', economic_date)::date AS mes, sense, sum(amount_cup)::float8 AS total
  FROM public.fin_movements WHERE category_code='ACT_INVENTARIO' GROUP BY 1,2 ORDER BY 1`);
console.log('\nACT_INVENTARIO por mes/sense:');
for (const r of per) console.log(`  ${r.mes} ${r.sense}: ${r.total}`);
// monedas
const mon = await q(`SELECT currency, count(*)::int AS n, sum(amount_cup)::float8 AS total FROM public.fin_movements
  WHERE category_code='ACT_INVENTARIO' GROUP BY currency`);
console.log('\nACT_INVENTARIO por moneda:', JSON.stringify(mon));
// 2 créditos GAS_COSTO_VENTAS (las reversas?)
const gc = await q(`SELECT fe.document_type, fe.event, fe.document_number, fm.amount_cup, fm.sense, fe.document_id::text
  FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
  WHERE fm.category_code='GAS_COSTO_VENTAS' AND fm.sense='credito'`);
console.log('\nGAS_COSTO_VENTAS créditos (reversas):', JSON.stringify(gc));
