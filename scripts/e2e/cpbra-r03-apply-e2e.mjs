#!/usr/bin/env node
/**
 * cpbra-r03-apply-e2e.mjs — Aplica la migración R-03 (lote atómico por orden
 * para pagos de OT: register_ot_payment_batch) a la BD AISLADA CostproE2E
 * (Management API + guard canónico de aislamiento). --check = solo pre/post.
 *
 * MISIÓN CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 §3: aislada primero, contratos y
 * replay, luego PR, fusión y aplicación productiva gobernada (§11g).
 *
 * Uso: node scripts/e2e/cpbra-r03-apply-e2e.mjs [--check]
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_REF = 'lguovmvrozxgssupkwpf';
const SUPA_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');

if (!SUPA_TOKEN) {
  console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido (almacén autorizado).');
  process.exit(2);
}

const { assertIsolatedDb } = await import(join(REPO, 'e2e', 'fixtures', 'assert-isolated-db.cjs'));
await assertIsolatedDb();

const MIGRATIONS = [
  'supabase/migrations/20261127140000_cpbra_r03_ot_payment_batch.sql',
];

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${E2E_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

const PRE_SQL = `
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='register_ot_payment_batch') as ya_existe,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='register_supplier_payment'
      and pg_get_function_identity_arguments(p.oid)='p_store_id uuid, p_ref_type text, p_ref_id uuid, p_amount numeric, p_payment_method text, p_paid_by uuid, p_currency text, p_exchange_rate numeric, p_reference text, p_notes text, p_idempotency_key text, p_payment_date timestamp with time zone') as motor_certificado;
`;

const checkOnly = process.argv.includes('--check');

const pre = await runSql(PRE_SQL);
console.log('=== PRE estado aislada (R-03) ===');
console.log(`HTTP ${pre.status}`);
console.log(pre.text.slice(0, 800));
if (!pre.ok) process.exit(1);
const preRows = JSON.parse(pre.text || '[]');
if (preRows[0]?.ya_existe > 0) {
  console.log('R03-APPLY: register_ot_payment_batch YA existe en la aislada — no se re-aplica (idempotencia de expediente).');
  process.exit(0);
}
if (preRows[0]?.motor_certificado !== 1) {
  console.error('R03-GUARD: el motor single certificado no tiene la firma esperada — abortando.');
  process.exit(1);
}

if (!checkOnly) {
  for (const m of MIGRATIONS) {
    const sql = readFileSync(join(REPO, m), 'utf8');
    console.log(`\n=== Aplicando ${m} ===`);
    const r = await runSql(sql);
    console.log(`HTTP ${r.status}`);
    if (!r.ok) {
      console.error('APLICACIÓN FALLIDA:', r.text.slice(0, 2000));
      process.exit(1);
    }
    if (r.text && r.text !== '[]' && r.text !== 'null') console.log(r.text.slice(0, 1200));
  }
  // Refresco del cache de PostgREST (mecanismo canónico) — lección R-26:
  // sin NOTIFY, las firmas nuevas no se resuelven en el schema cache REST.
  await runSql("NOTIFY pgrst, 'reload schema';");
  console.log("NOTIFY pgrst 'reload schema' enviado.");
  await new Promise((r) => setTimeout(r, 1500));
}

const post = await runSql(`
select p.proname,
       md5(pg_get_functiondef(p.oid)) as body_hash,
       (regexp_replace(pg_get_functiondef(p.oid), '--[^\\n]*', '', 'g') like '%ERR_REF_TYPE_INVALID%') as gate_ot_exclusivo,
       (regexp_replace(pg_get_functiondef(p.oid), '--[^\\n]*', '', 'g') like '%production_orders WHERE id = p_ref_id FOR UPDATE%') as lock_ot,
       (regexp_replace(pg_get_functiondef(p.oid), '--[^\\n]*', '', 'g') like '%CASE WHEN COALESCE(pt.direction, ''in'') = ''reversal'' THEN%') as netea_contrafilas,
       (regexp_replace(pg_get_functiondef(p.oid), '--[^\\n]*', '', 'g') like '%public.register_supplier_payment(%') as via_motor_single,
       (select coalesce(string_agg(distinct rg.grantee, ','),'') from information_schema.role_routine_grants rg
         where rg.specific_schema='public' and rg.routine_name='register_ot_payment_batch') as acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'register_ot_payment_batch'
   and pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_ref_type text, p_ref_id uuid, p_payments jsonb, p_paid_by uuid, p_payment_date timestamp with time zone, p_idempotency_key text';
`);
console.log('=== POST estado de register_ot_payment_batch ===');
console.log(`HTTP ${post.status}`);
console.log(post.text.slice(0, 900));
let ok = false;
try {
  const rows = JSON.parse(post.text || '[]');
  const r = rows[0] || {};
  ok = post.ok
    && r.gate_ot_exclusivo === true
    && r.lock_ot === true
    && r.netea_contrafilas === true
    && r.via_motor_single === true
    && String(r.acl || '').includes('service_role')
    && !String(r.acl || '').includes('authenticated')
    && !String(r.acl || '').includes('anon');
} catch { ok = false; }
console.log(ok ? 'R03-APPLY: APLICADA — 5/5 marcas POST conformes (gate OT, lock, neteo, motor single, ACL service_role exclusiva).' : 'R03-APPLY: VERIFICAR — marcas POST incompletas.');
process.exit(ok ? 0 : 1);
