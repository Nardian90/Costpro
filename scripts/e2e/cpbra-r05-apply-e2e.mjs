#!/usr/bin/env node
/**
 * cpbra-r05-apply-e2e.mjs — Aplica la migración R-05 (INV-005) de la misión
 * CP-BRA-INV005-FIN011-CLOSURE-001 a la BD AISLADA CostproE2E
 * (Management API + guard canónico de aislamiento). --check = solo pre/post.
 *
 * MISIÓN §0: esta migración NO se aplica a producción. Solo instancia aislada.
 *
 * Uso: node scripts/e2e/cpbra-r05-apply-e2e.mjs [--check]
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
  'supabase/migrations/20261126170000_cpbra_r05_adjustment_confirmation_role_guard.sql',
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
       (pg_get_functiondef(p.oid) like '%has_store_access_as%') as usa_hueco_previo,
       (pg_get_functiondef(p.oid) like '%has_store_role_as%') as usa_guard_r05
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'confirm_inventory_adjustment';
`);
console.log('=== PRE estado de confirm_inventory_adjustment ===');
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
}

const post = await runSql(`
select p.proname,
       md5(pg_get_functiondef(p.oid)) as body_hash,
       (regexp_replace(pg_get_functiondef(p.oid), '--[^\\n]*', '', 'g') like '%has_store_access_as%') as usa_hueco_previo_codigo,
       (pg_get_functiondef(p.oid) like '%ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED%') as guard_r05,
       (pg_get_functiondef(p.oid) like '%ADJUSTMENT_CONFIRMED%') as auditoria_r05,
       (select coalesce(string_agg(distinct rg.grantee, ','),'') from information_schema.role_routine_grants rg
         where rg.specific_schema='public' and rg.routine_name='confirm_inventory_adjustment') as acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'confirm_inventory_adjustment';
`);
console.log(`\n=== POST (${checkOnly ? 'simulado — NO aplicado' : 'aplicado'}) ===`);
console.log(`HTTP ${post.status}`);
console.log(post.text.slice(0, 1200));

const postJson = JSON.parse(post.text);
const row = postJson[0] || {};
const exitOk = row.guard_r05 === true && row.auditoria_r05 === true && row.usa_hueco_previo_codigo === false;
console.log(`\n${exitOk ? '✓ R-05: guard de rol + auditoría presentes, hueco cerrado' : '✗ R-05: estado POST inesperado'}`);
process.exit(exitOk ? 0 : 1);
