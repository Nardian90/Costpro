/**
 * MISIÓN RECEPCIONES — F2: Inspección de solo lectura del esquema de recepciones.
 * - Tabla receipts: columnas, estados (CHECK), índices, RLS
 * - RPCs relacionadas: register_reception, confirm_pending_reception, void_pending_reception, reverse_receipt_v2
 * - receipt_items: columnas y claves
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = readFileSync(resolve(__dirname, '../.env'), 'utf8');
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const ref = URL_.match(/https:\/\/(.*?)\.supabase\.co/)![1];

async function q(sql: string): Promise<any> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  console.log('== receipts: columnas ==');
  const cols = await q(`select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name='receipts' order by ordinal_position;`);
  console.log(cols.map((c: any) => `${c.column_name}:${c.data_type}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}`).join('\n'));

  console.log('\n== receipts: CHECK de status ==');
  const chk = await q(`select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid='receipts'::regclass and contype='c';`);
  for (const c of chk) console.log(` - ${c.conname}: ${c.def}`);

  console.log('\n== receipts: índices ==');
  const idx = await q(`select indexname, indexdef from pg_indexes where schemaname='public' and tablename='receipts';`);
  for (const i of idx) console.log(` - ${i.indexname}: ${i.indexdef}`);

  console.log('\n== receipts: políticas RLS ==');
  const pol = await q(`select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' and tablename='receipts' order by policyname;`);
  for (const p of pol) console.log(` - [${p.cmd}] ${p.policyname} (roles: ${p.roles})\n     USING: ${String(p.qual).slice(0, 200)}\n     CHECK: ${String(p.with_check).slice(0, 200)}`);

  console.log('\n== receipt_items: columnas ==');
  const cols2 = await q(`select column_name, data_type from information_schema.columns where table_schema='public' and table_name='receipt_items' order by ordinal_position;`);
  console.log(cols2.map((c: any) => `${c.column_name}:${c.data_type}`).join(', '));

  console.log('\n== receipt_items: FKs e índices ==');
  const idx2 = await q(`select indexname, indexdef from pg_indexes where schemaname='public' and tablename='receipt_items';`);
  for (const i of idx2) console.log(` - ${i.indexname}: ${i.indexdef}`);

  console.log('\n== RPCs de recepción vivas ==');
  const rpcs = await q(`select p.proname, pg_get_function_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in ('register_reception','confirm_pending_reception','void_pending_reception','reverse_receipt_v2','void_reception_with_reversal')
order by p.proname;`);
  for (const r of rpcs) console.log(` - ${r.proname}(${r.args})`);

  console.log('\n== products: índice único SKU ==');
  const pidx = await q(`select indexname, indexdef from pg_indexes where schemaname='public' and tablename='products' and indexdef like '%sku%';`);
  for (const i of pidx) console.log(` - ${i.indexname}: ${i.indexdef}`);

  console.log('\nOK F2-esquema');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
