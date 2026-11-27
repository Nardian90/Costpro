#!/usr/bin/env node
/**
 * cpbra-pc-apply-e2e.mjs — Aplica la migración §0.2 (pay_commission: gate
 * admin/manager/encargado) a la BD AISLADA CostproE2E
 * (Management API + guard canónico de aislamiento). --check = solo pre/post.
 *
 * MISIÓN CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 FASE 3: aislada primero, contratos
 * y replay, luego PR, fusión y aplicación productiva gobernada (§11g).
 *
 * Uso: node scripts/e2e/cpbra-pc-apply-e2e.mjs [--check]
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
  'supabase/migrations/20261127150000_cpbra_pay_commission_encargado.sql',
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
  (regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g') like '%ARRAY[''admin'', ''manager'', ''encargado'']::text[]%') as ya_tiene_encargado,
  (select coalesce(string_agg(distinct rg.grantee, ','),'') from information_schema.role_routine_grants rg
    where rg.specific_schema='public' and rg.routine_name='pay_commission') as acl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname='pay_commission'
  and pg_get_function_identity_arguments(p.oid)='p_payment_id uuid, p_payment_method text, p_reference text, p_currency text, p_exchange_rate numeric, p_paid_at timestamp with time zone, p_user_id uuid';
`;

const checkOnly = process.argv.includes('--check');

const pre = await runSql(PRE_SQL);
console.log('=== PRE estado aislada (§0.2 pay_commission) ===');
console.log(`HTTP ${pre.status}`);
console.log(pre.text.slice(0, 800));
if (!pre.ok) process.exit(1);
const preRows = JSON.parse(pre.text || '[]');
console.log('=== PRE estado aislada (§0.2 pay_commission) ===');
if (preRows[0]?.ya_tiene_encargado === true) {
  console.log('PC-APPLY: el gate admin/manager/encargado YA está presente — no se re-aplica (idempotencia de expediente).');
  process.exit(0);
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
       (regexp_replace(pg_get_functiondef(p.oid), '--[^\\n]*', '', 'g') like '%ARRAY[''admin'', ''manager'', ''encargado'']::text[]%') as gate_tres_roles,
       (regexp_replace(pg_get_functiondef(p.oid), '--[^\\n]*', '', 'g') like '%ERR_FORBIDDEN_ROLE%') as rechazo_rol,
       (regexp_replace(pg_get_functiondef(p.oid), '--[^\\n]*', '', 'g') like '%pg_advisory_xact_lock%') as advisory_cajon,
       (regexp_replace(pg_get_functiondef(p.oid), '--[^\\n]*', '', 'g') like '%ERR_INSUFFICIENT_CURRENCY%') as guard_fisico,
       (regexp_replace(pg_get_functiondef(p.oid), '--[^\\n]*', '', 'g') like '%auth.role() = ''service_role''%') as regla_actor,
       (select coalesce(string_agg(distinct rg.grantee, ','),'') from information_schema.role_routine_grants rg
         where rg.specific_schema='public' and rg.routine_name='pay_commission') as acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'pay_commission'
   and pg_get_function_identity_arguments(p.oid) = 'p_payment_id uuid, p_payment_method text, p_reference text, p_currency text, p_exchange_rate numeric, p_paid_at timestamp with time zone, p_user_id uuid';
`);
console.log('=== POST estado de pay_commission ===');
console.log(`HTTP ${post.status}`);
console.log(post.text.slice(0, 900));
let ok = false;
try {
  const rows = JSON.parse(post.text || '[]');
  const r = rows[0] || {};
  const acl = String(r.acl || '');
  ok = post.ok
    && r.gate_tres_roles === true
    && r.rechazo_rol === true
    && r.advisory_cajon === true
    && r.guard_fisico === true
    && r.regla_actor === true
    && acl.includes('service_role') && acl.includes('authenticated')
    && !acl.includes('anon');
} catch { ok = false; }
console.log(ok ? 'PC-APPLY: APLICADA — 7/7 marcas POST conformes (gate tres roles, rechazo, advisory, guard físico, actor, ACL).' : 'PC-APPLY: VERIFICAR — marcas POST incompletas.');
process.exit(ok ? 0 : 1);
