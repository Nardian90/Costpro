/**
 * MISIÓN RECEPCIONES — F2f: timeline real del usuario en ENERVIDA (audit_logs),
 * grants de RPCs de recepción, y política de fechas para 2026-10-26.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = readFileSync(resolve(__dirname, '../.env'), 'utf8');
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const ref = URL_.match(/https:\/\/(.*?)\.supabase\.co/)![1];
const EVA = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

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
  // 1. Timeline real de hoy (audit_logs ENERVIDA, hora real)
  const audit = await q(`select created_at, action, table_name, record_id, left(metadata::text, 150) as meta
from audit_logs
where store_id='${EVA}' and created_at > '2026-10-26 00:00'
order by created_at asc limit 60;`);
  console.log('== audit_logs ENERVIDA desde 2026-10-26 ==');
  for (const a of audit) console.log(` - ${a.created_at} | ${a.action} | ${a.table_name} | ${a.record_id} | ${a.meta}`);

  // 2. Grants de RPCs de recepción
  const grants = await q(`select p.proname, p.proacl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in ('register_reception','void_pending_reception','confirm_pending_reception','reverse_receipt_v2');`);
  console.log('\n== ACLs de RPCs ==');
  for (const g of grants) console.log(` - ${g.proname}: ${JSON.stringify(g.proacl)}`);

  // 3. ¿validate_operation_date permite 2026-10-26? (global max/min por tienda)
  const dates = await q(`select store_id, max(operation_date) as max_op from (
  select store_id, reception_date::timestamptz as operation_date from receipts where store_id='${EVA}'
  union all
  select store_id, movement_date from stock_movements where store_id='${EVA}'
) t group by store_id;`).catch(() => null);
  console.log('\n== Fechas máximas por fuente (ENERVIDA) ==');
  console.log(JSON.stringify(dates, null, 1).slice(0, 400));

  // 4. global operation date (get_global_max_operation_date)
  try {
    const gmd = await q(`select public.get_global_max_operation_date('${EVA}');`);
    console.log('\n== get_global_max_operation_date(ENERVIDA) ==');
    console.log(JSON.stringify(gmd).slice(0, 300));
  } catch (e: any) { console.log('get_global_max_operation_date error:', String(e).slice(0, 200)); }

  // 5. validate_operation_date firma
  const sig = await q(`select pg_get_function_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='validate_operation_date';`);
  console.log('\n== validate_operation_date firma ==');
  console.log(JSON.stringify(sig));

  console.log('\nOK F2f');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
