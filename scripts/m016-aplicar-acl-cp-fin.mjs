#!/usr/bin/env node
/**
 * CP-FIN · FIX ACL FUNCIONES (2026-11-13, hallazgo del gate SQL DB Security)
 * — Aplicación CONTROLADA a PRODUCCIÓN de:
 *   supabase/migrations/20261113120700_cp_fin_fix_acl_funciones.sql
 *
 * Canal canónico (patrón m014/m015): Management API /database/query + NOTIFY
 * pgrst 'reload schema', lote único, idempotente, verificación fail-closed,
 * sin reintentos. Autorización del propietario (misión de auditoría final).
 * Validado antes en la aislada: auditoría integral re-ejecutada 34/34 PASS
 * tras aplicar el fix (el canal legítimo authenticated no se ve afectado).
 *
 * Uso: ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND bun \
 *   scripts/m016-aplicar-acl-cp-fin.mjs [--only-verify]
 */
import { readFileSync } from 'fs';
import { createHash } from 'node:crypto';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
assertNotProduction({ mode: 'write', url: SUPABASE_URL, context: 'm016-aplicar-acl-cp-fin.mjs' });
if (ref !== 'wthkddeleylijmonclxg') {
  console.error('FALLO DE GUARD: destino no es producción (wthkddeleylijmonclxg)');
  process.exit(2);
}
async function mgmt(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return { ok: res.ok, status: res.status, text: await res.text() };
}
async function q(query) {
  const r = await mgmt(query);
  if (!r.ok) { console.error('QUERY FAILED', r.status, r.text.slice(0, 400)); process.exit(4); }
  return JSON.parse(r.text);
}

const FILE = 'supabase/migrations/20261113120700_cp_fin_fix_acl_funciones.sql';
console.log(`Fix ACL funciones CP-FIN → PRODUCCIÓN (${ref})`);
console.log(`  ${FILE} · SHA-256 ${createHash('sha256').update(readFileSync(resolve(process.cwd(), FILE), 'utf8')).digest('hex')}\n`);

const onlyVerify = process.argv.includes('--only-verify');
const pre = await q(`SELECT
  (SELECT count(*)::int FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND grantee IN ('PUBLIC','anon') AND routine_name LIKE 'fin_%') AS grants_abiertos,
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'fin_%') AS fin_tables`);
console.log('PRE grants PUBLIC/anon sobre fin_*:', pre[0].grants_abiertos, '| tablas fin_*:', pre[0].fin_tables);
if (pre[0].fin_tables !== 8) { console.error('PRE-VUELO FALLÓ: base CP-FIN ausente'); process.exit(2); }
const alreadyApplied = pre[0].grants_abiertos === 0;
console.log(alreadyApplied ? '→ fix YA APLICADO (modo verificación)' : '→ fix PENDIENTE');

const COUNT_TABLES = `SELECT (SELECT count(*) FROM public.transactions) t, (SELECT count(*) FROM public.payment_transactions) pt,
  (SELECT count(*) FROM public.received_services) rs, (SELECT count(*) FROM public.receipts) r, (SELECT count(*) FROM public.products) p`;
const before = await q(COUNT_TABLES);

if (!alreadyApplied && !onlyVerify) {
  const sql = readFileSync(resolve(process.cwd(), FILE), 'utf8');
  console.log(`\nAplicando ${FILE} ...`);
  const res = await mgmt(sql);
  console.log('HTTP', res.status);
  if (!res.ok) { console.error('FALLO DE APLICACIÓN:', res.text.slice(0, 2500)); process.exit(1); }
  console.log('resultado:', (res.text || '(sin filas)').slice(0, 300));
  console.log('pgrst schema-cache reload: HTTP', (await mgmt("NOTIFY pgrst, 'reload schema'")).status);
}
if (onlyVerify && !alreadyApplied) { console.error('--only-verify pero NO aplicado: abortando.'); process.exit(3); }

console.log('\n── VERIFICACIÓN POST ──');
const post = await q(`SELECT
  (SELECT count(*)::int FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND grantee='PUBLIC' AND routine_name LIKE 'fin_%') AS public_grants,
  (SELECT count(*)::int FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND grantee='anon' AND routine_name LIKE 'fin_%') AS anon_grants,
  (SELECT count(DISTINCT routine_name)::int FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND grantee='authenticated'
       AND routine_name IN ('fin_simulate','fin_activate_rule_version','fin_deactivate_rule_version',
         'fin_apply_opening_balance','fin_backfill','fin_reprocess_posting_errors','fin_get_balance_sheet',
         'fin_get_income_statement','fin_get_dashboard','fin_get_category_detail','fin_get_document_types_status')) AS auth_rpcs,
  (SELECT count(*)::int FROM public.fin_entries) AS asientos`);
let failed = 0;
const checks = [
  ['CERO grants PUBLIC sobre funciones fin_*', post[0].public_grants === 0, `n=${post[0].public_grants}`],
  ['CERO grants anon sobre funciones fin_*', post[0].anon_grants === 0, `n=${post[0].anon_grants}`],
  ['11 RPCs públicas conservan EXECUTE para authenticated', post[0].auth_rpcs === 11, `n=${post[0].auth_rpcs}`],
  ['CERO asientos (sin backfill no autorizado)', post[0].asientos === 0, `n=${post[0].asientos}`],
];
for (const [name, ok, detail] of checks) { if (!ok) failed++; console.log(`${ok ? '✓' : '✗'} ${name} — ${detail}`); }
const after = await q(COUNT_TABLES);
const delta = {};
let deltaOk = true;
for (const k of Object.keys(before[0])) { delta[k] = after[0][k] - before[0][k]; if (delta[k] !== 0) deltaOk = false; }
console.log('delta:', JSON.stringify(delta));
if (!deltaOk) failed++;
if (failed > 0) { console.error(`VERIFICACIÓN POST FALLÓ (${failed})`); process.exit(5); }
console.log(`\n══════════ M016 OK: fix ACL funciones CP-FIN ${alreadyApplied ? 'VERIFICADO (ya aplicado)' : 'APLICADO y VERIFICADO'} en producción ${ref}`);
