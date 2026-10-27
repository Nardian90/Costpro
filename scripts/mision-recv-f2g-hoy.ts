/**
 * MISIÓN RECEPCIONES — F2g: eventos de HOY (2026-10-27) en ENERVIDA +
 * política de fechas (validate_operation_date / get_global_max_operation_date).
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
  // 1. Eventos de HOY en ENERVIDA
  const audit = await q(`select created_at, action, table_name, record_id, left(metadata::text, 180) as meta
from audit_logs
where store_id='${EVA}' and created_at >= '2026-10-27 00:00'
order by created_at asc limit 50;`);
  console.log('== audit_logs ENERVIDA HOY (2026-10-27) ==');
  for (const a of audit) console.log(` - ${a.created_at} | ${a.action} | ${a.table_name} | ${a.record_id} | ${a.meta}`);

  // 2. validate_operation_date: firma + def resumida
  const def = await q(`select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='validate_operation_date';`);
  const lines = (def[0]?.def || '').split('\n');
  console.log('\n== validate_operation_date (líneas clave) ==');
  for (let i = 0; i < lines.length; i++) {
    if (/RAISE|IF |min|max|INTERVAL|months|ERR_/.test(lines[i])) console.log(` L${i + 1}: ${lines[i].trim().slice(0, 150)}`);
  }

  // 3. Fecha máxima de operación global de ENERVIDA
  try {
    const gmd = await q(`select public.get_global_max_operation_date('${EVA}') as maxdate;`);
    console.log('\n== get_global_max_operation_date(ENERVIDA) ==');
    console.log(JSON.stringify(gmd));
  } catch (e: any) { console.log('\nget_global_max_operation_date error:', String(e).slice(0, 250)); }

  // 4. ¿Existe FAC-0009 o similar? (siguiente número de factura)
  const refs = await q(`select reference_doc, status, created_at from receipts where store_id='${EVA}' and reference_doc ilike 'FAC%' order by reference_doc;`);
  console.log('\n== Facturas FAC-* en ENERVIDA ==');
  for (const r of refs) console.log(` - ${r.reference_doc} | ${r.status} | ${r.created_at}`);

  console.log('\nOK F2g');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
