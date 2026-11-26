#!/usr/bin/env node
/**
 * cpbra-r26-apply-e2e.mjs — Aplica la migración R-26 (F011-002: neteo de
 * contra-filas en el pre-check del batch) a la BD AISLADA CostproE2E
 * (Management API + guard canónico de aislamiento). --check = solo pre/post.
 *
 * MISIÓN CP-BRA-R05-APPROVAL-AND-R25-R26-REMEDIATION-001 §4: aislada primero,
 * contratos y replay, luego PR, fusión y aplicación productiva gobernada.
 *
 * Uso: node scripts/e2e/cpbra-r26-apply-e2e.mjs [--check]
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
  'supabase/migrations/20261127120000_cpbra_r26_batch_reversal_netting.sql',
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

const checkOnly = process.argv.includes('--check');

const pre = await runSql(`
select p.proname,
       md5(pg_get_functiondef(p.oid)) as body_hash,
       (regexp_replace(pg_get_functiondef(p.oid), '--[^\\n]*', '', 'g') like '%CASE WHEN COALESCE(pt.direction, ''in'') = ''reversal'' THEN%') as ya_netea,
       (pg_get_functiondef(p.oid) like '%ERR_BATCH_OVERPAY%') as overpay_gate,
       (select coalesce(string_agg(distinct rg.grantee, ','),'') from information_schema.role_routine_grants rg
         where rg.specific_schema='public' and rg.routine_name='register_supplier_payment_batch') as acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'register_supplier_payment_batch'
   and pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_ref_type text, p_ref_id uuid, p_payments jsonb, p_paid_by uuid, p_payment_date timestamp with time zone, p_idempotency_key text';
`);
console.log('=== PRE estado de register_supplier_payment_batch ===');
console.log(`HTTP ${pre.status}`);
console.log(pre.text.slice(0, 800));
if (!pre.ok) process.exit(1);

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
  // Refresco del cache de PostgREST (mecanismo canónico) — el SDK/REST resuelve
  // las firmas desde la cache; sin NOTIFY, las firmas re-emitidas pueden no
  // resolverse ("Could not find the function ... in the schema cache").
  await runSql("NOTIFY pgrst, 'reload schema';");
  console.log("NOTIFY pgrst 'reload schema' enviado.");
  await new Promise((r) => setTimeout(r, 1500));
}

const post = await runSql(`
select p.proname,
       md5(pg_get_functiondef(p.oid)) as body_hash,
       (regexp_replace(pg_get_functiondef(p.oid), '--[^\\n]*', '', 'g') like '%CASE WHEN COALESCE(pt.direction, ''in'') = ''reversal'' THEN%') as netea_contrafilas,
       (pg_get_functiondef(p.oid) like '%ERR_BATCH_OVERPAY%') as overpay_gate,
       (select coalesce(string_agg(distinct rg.grantee, ','),'') from information_schema.role_routine_grants rg
         where rg.specific_schema='public' and rg.routine_name='register_supplier_payment_batch') as acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'register_supplier_payment_batch'
   and pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_ref_type text, p_ref_id uuid, p_payments jsonb, p_paid_by uuid, p_payment_date timestamp with time zone, p_idempotency_key text';
`);
console.log(`\n=== POST (${checkOnly ? 'simulado — NO aplicado' : 'aplicado'}) ===`);
console.log(`HTTP ${post.status}`);
console.log(post.text.slice(0, 1200));

const postJson = JSON.parse(post.text);
const row = postJson[0] || {};
const exitOk = row.netea_contrafilas === true && row.overpay_gate === true && (row.acl || '').includes('service_role') && !(row.acl || '').includes('authenticated');
console.log(`\n${exitOk ? '✓ R-26: neteo de contra-filas presente, overpay intacto, ACL service_role exclusiva' : '✗ R-26: estado POST inesperado'}`);
process.exit(exitOk ? 0 : 1);
