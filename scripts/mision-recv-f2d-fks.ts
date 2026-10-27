/**
 * MISIÓN RECEPCIONES — F2d: FKs y cascadas de receipts/receipt_items/stock_movements.
 * ¿Qué pasa con un DELETE de receipts? ¿Hay huérfanos posibles?
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
  console.log('== FKs sobre receipts ==');
  const fks1 = await q(`select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid='receipts'::regclass and contype='f';`);
  for (const f of fks1) console.log(` - ${f.conname}: ${f.def}`);

  console.log('\n== FKs sobre receipt_items ==');
  const fks2 = await q(`select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid='receipt_items'::regclass and contype='f';`);
  for (const f of fks2) console.log(` - ${f.conname}: ${f.def}`);

  console.log('\n== Tablas que referencian receipts (FKs entrantes) ==');
  const refs = await q(`select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def from pg_constraint where contype='f' and confrelid='receipts'::regclass;`);
  for (const r of refs) console.log(` - ${r.tbl} | ${r.conname}: ${r.def}`);

  console.log('\n== receipt_items: políticas RLS ==');
  const pol = await q(`select policyname, cmd from pg_policies where schemaname='public' and tablename='receipt_items' order by policyname;`);
  for (const p of pol) console.log(` - [${p.cmd}] ${p.policyname}`);

  console.log('\n== ¿stock_movements referencia receipts? ==');
  const smrefs = await q(`select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def from pg_constraint where contype='f' and confrelid='receipts'::regclass and conrelid::regclass::text in ('stock_movements','kardex_entries','audit_logs','payment_transactions');`);
  for (const r of smrefs) console.log(` - ${r.tbl} | ${r.conname}: ${r.def}`);

  console.log('\n== void_pending_reception (definición resumida) ==');
  const def = await q(`select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='void_pending_reception';`);
  const lines = (def[0]?.def || '').split('\n');
  console.log(` (líneas: ${lines.length})`);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/RAISE|status|DELETE|INSERT|UPDATE|FOR UPDATE|payment|audit/i.test(l)) console.log(` L${i + 1}: ${l.trim().slice(0, 150)}`);
  }

  console.log('\nOK F2d');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
