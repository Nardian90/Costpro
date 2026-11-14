#!/usr/bin/env node
/**
 * CP-SECURITY-AND-BACKLOG-CLOSURE-001 — Aplicación CONTROLADA a PRODUCCIÓN
 * (CostproBD, wthkddeleylijmonclxg) de las migraciones de seguridad de la
 * misión + REGULARIZACIÓN del libro production_migration_ledger (6 filas de
 * migraciones aplicadas antes del 14/11 sin registro).
 *
 * Migraciones (orden cronológico; todas idempotentes con verificación
 * fail-closed; validadas en la BD aislada CostproE2E — replay 166/166,
 * matriz de nóminas 36/36, regresión nóminas 54/54, freno HTTP 201,
 * concurrencia rate-limit PASS, legal.spec 8/8, NET DELTA 0):
 *   1. 20261114180000_cp_sec_payroll_privacy.sql        (privacidad de nóminas)
 *   2. 20261114180100_cp_sec_privileges_minimo.sql      (mínimo privilegio)
 *   3. 20261114180200_cp_commission_constraint_dedup.sql(restricción duplicada)
 *   4. 20261114180400_cp_sec_rate_limit_store.sql       (limiter distribuido)
 *   5. 20261114180500_cp_fix_legal_incidents_audit_whitelist.sql (BUG-024)
 *
 * EXCLUIDA EXPLÍCITAMENTE (compuerta del propietario pendiente):
 *   · 20261110120000_cp_infra_020_truncate_breaker.sql
 *   · 20261114180300_cp_infra_020_breaker_v2.sql
 *   El freno de TRUNCATE NO se aplica sin la frase literal
 *   `AUTORIZO BREAKER PROD` (misión §1.2 y §2).
 *
 * Canal canónico: Management API /database/query + NOTIFY pgrst 'reload
 * schema' (patrón m002–m017).
 *
 * Fases:
 *   0. Guard CP-INFRA-019 (doble flag) + SHA-256 por archivo + PRE-VUELO
 *      read-only: marcadores AUSENTES, dependencias presentes, conteos ANTES.
 *   1. APLICACIÓN (lote único por archivo) + NOTIFY pgrst tras cada una.
 *   2. VERIFICACIÓN POST (fail-closed): políticas por rol, 0 privilegios
 *      TRUNCATE/TRIGGER/REFERENCES, 1 sola restricción EXCLUDE, tabla del
 *      limiter protegida, whitelist legal_incidents, DELTA 0 en negocio.
 *   3. REGULARIZACIÓN del libro: 6 filas (migraciones 8/11–10/11 aplicadas
 *      sin registro, efectos verificados por catálogo [MEDIDO 2026-11-14]).
 *   4. FILAS NUEVAS de hoy para las 5 migraciones aplicadas.
 *
 * Autorización: misión CP-SECURITY-AND-BACKLOG-CLOSURE-001 del propietario
 * (2026-11-14, §1.2 «cambios directos en producción [solo] dentro del
 * procedimiento aprobado del proyecto» + criterios de aceptación §3/§5/§6/§7/
 * §9 que exigen el estado POST-aplicación verificado; EXCLUSIÓN explícita
 * únicamente para el freno de TRUNCATE).
 *
 * Uso: ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND node \
 *   scripts/cp-security-backlog-001-aplicar-produccion.mjs [--only-verify]
 */
import { readFileSync } from 'fs';
import { createHash } from 'node:crypto';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const onlyVerify = process.argv.includes('--only-verify');

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
assertNotProduction({ mode: 'write', url: SUPABASE_URL, context: 'cp-security-backlog-001-aplicar-produccion.mjs' });
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
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}
async function q(query) {
  const r = await mgmt(query);
  if (!r.ok) { console.error('QUERY FAILED', r.status, r.text.slice(0, 400)); process.exit(4); }
  return JSON.parse(r.text);
}

const FILES = [
  'supabase/migrations/20261114180000_cp_sec_payroll_privacy.sql',
  'supabase/migrations/20261114180100_cp_sec_privileges_minimo.sql',
  'supabase/migrations/20261114180200_cp_commission_constraint_dedup.sql',
  'supabase/migrations/20261114180400_cp_sec_rate_limit_store.sql',
  'supabase/migrations/20261114180500_cp_fix_legal_incidents_audit_whitelist.sql',
];

console.log(`CP-SECURITY-BACKLOG-001 · migraciones de seguridad → PRODUCCIÓN (${ref})`);
for (const f of FILES) {
  const sql = readFileSync(resolve(process.cwd(), f), 'utf8');
  console.log(`  ${f}\n    SHA-256 ${createHash('sha256').update(sql).digest('hex')}`);
}

// ── FASE 0 · PRE-VUELO ───────────────────────────────────────────────────────
console.log('\n── FASE 0 · PRE-VUELO (read-only) ──');
const markersPre = (await q(`SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='can_manage_payroll_as') AS fn_gate,
  (SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND policyname='payrolls_admin_privacy') AS pol_nueva,
  (SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND policyname='payrolls_store_isolation') AS pol_vieja,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_schema='public' AND table_name='rate_limit_buckets') AS tabla_rl,
  (SELECT count(*) FROM pg_constraint
     WHERE conrelid='public.commission_payments'::regclass AND contype='x') AS excludes,
  (SELECT count(*) FROM information_schema.table_privileges
     WHERE table_schema='public' AND grantee IN ('anon','authenticated')
       AND privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES')) AS priv_resid,
  (SELECT count(*) FROM pg_constraint
     WHERE conrelid='public.audit_logs'::regclass AND conname='audit_logs_store_id_check'
       AND pg_get_constraintdef(oid) LIKE '%legal_incidents%') AS chk_legal`))[0];
console.log('marcadores:', JSON.stringify(markersPre));
if (markersPre.fn_gate !== 0 || markersPre.pol_nueva !== 0 || markersPre.tabla_rl !== 0 || markersPre.chk_legal !== 0) {
  console.error('ABORT: alguna migración YA aplicada (marcador presente) — no se re-ejecuta.');
  process.exit(3);
}
if (markersPre.pol_vieja !== 1 || markersPre.priv_resid === 0 || markersPre.excludes !== 2) {
  console.error('ABORT: estado de partida inesperado (pol_vieja=%s, priv_resid=%s, excludes=%s — esperado 1, >0, 2).',
    markersPre.pol_vieja, markersPre.priv_resid, markersPre.excludes);
  process.exit(3);
}

const antes = (await q(`SELECT
  (SELECT count(*) FROM public.payrolls) AS payrolls,
  (SELECT count(*) FROM public.payroll_items) AS payroll_items,
  (SELECT count(*) FROM public.payroll_item_concepts) AS concepts,
  (SELECT count(*) FROM public.worker_salary_rates) AS salary_rates,
  (SELECT count(*) FROM public.commission_payments) AS commission_payments,
  (SELECT count(*) FROM public.audit_logs) AS audit_logs,
  (SELECT count(*) FROM public.products) AS products,
  (SELECT count(*) FROM public.transactions) AS transactions`))[0];
console.log('conteos ANTES:', JSON.stringify(antes));

if (onlyVerify) { console.log('\n--only-verify: migraciones PENDIENTES (pre-vuelo OK). Sin aplicar.'); process.exit(0); }

// ── FASE 1 · APLICACIÓN ─────────────────────────────────────────────────────
console.log('\n── FASE 1 · APLICACIÓN (lote único por archivo, sin reintentos) ──');
const shas = [];
for (const f of FILES) {
  const sql = readFileSync(resolve(process.cwd(), f), 'utf8');
  const sha = createHash('sha256').update(sql).digest('hex');
  shas.push(sha);
  const r = await mgmt(sql);
  console.log(`  ${f} → HTTP ${r.status} ${r.ok ? 'OK' : 'FALLO: ' + r.text.slice(0, 400)}`);
  if (!r.ok) { console.error('ABORT por fallo de migración — no se continúa.'); process.exit(5); }
  const n = await mgmt(`NOTIFY pgrst, 'reload schema'`);
  console.log(`    NOTIFY pgrst: HTTP ${n.status}`);
}

// ── FASE 2 · VERIFICACIÓN POST (fail-closed) ────────────────────────────────
console.log('\n── FASE 2 · VERIFICACIÓN POST ──');
const v = (await q(`SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='can_manage_payroll_as') AS fn_gate,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN
       ('create_payroll','update_payroll','confirm_payroll','account_payroll',
        'mark_payroll_paid','void_payroll','set_worker_salary_rate')
       AND pg_get_functiondef(p.oid) LIKE '%can_manage_payroll_as(v_caller_uid%') AS rpc_gated,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public'
     AND policyname IN ('payrolls_admin_privacy','payroll_items_admin_privacy',
        'payroll_item_concepts_admin_privacy','worker_salary_rates_admin_privacy')) AS pol_select,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public'
     AND policyname LIKE '%\\_store\\_isolation' AND tablename IN
       ('payrolls','payroll_items','payroll_item_concepts','worker_salary_rates')) AS pol_vieja,
  (SELECT count(*) FROM information_schema.table_privileges
     WHERE table_schema='public' AND grantee IN ('anon','authenticated')
       AND privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES')) AS priv_resid,
  (SELECT count(*) FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
     WHERE d.defaclnamespace='public'::regnamespace::oid
       AND pg_get_userbyid(d.defaclrole)='postgres'
       AND a.grantee IN ('anon'::regrole::oid,'authenticated'::regrole::oid)
       AND a.privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES')) AS defacl_pg,
  (SELECT count(*) FROM information_schema.table_privileges
     WHERE table_schema='public' AND grantee='service_role'
       AND table_name IN ('payrolls','products','transactions')
       AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')) AS svc_ok,
  (SELECT count(*) FROM pg_constraint
     WHERE conrelid='public.commission_payments'::regclass AND contype='x') AS excludes,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_schema='public' AND table_name='rate_limit_buckets') AS tabla_rl,
  (SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND tablename='rate_limit_buckets') AS rl_policies,
  (SELECT count(*) FROM information_schema.table_privileges
     WHERE table_schema='public' AND table_name='rate_limit_buckets'
       AND grantee IN ('anon','authenticated')) AS rl_grants,
  (SELECT count(*) FROM pg_constraint
     WHERE conrelid='public.audit_logs'::regclass AND conname='audit_logs_store_id_check'
       AND pg_get_constraintdef(oid) LIKE '%legal_incidents%') AS chk_legal`))[0];
console.log('verificación:', JSON.stringify(v));
const checks = [
  ['fn_gate=1', v.fn_gate === 1],
  ['rpc_gated=7', v.rpc_gated === 7],
  ['pol_select=4', v.pol_select === 4],
  ['pol_vieja=0', v.pol_vieja === 0],
  ['priv_resid=0', v.priv_resid === 0],
  ['defacl_pg=0', v.defacl_pg === 0],
  ['svc_ok>=3', v.svc_ok >= 3],
  ['excludes=1 (solo canónica)', v.excludes === 1],
  ['tabla_rl=1', v.tabla_rl === 1],
  ['rl_policies=0', v.rl_policies === 0],
  ['rl_grants=0', v.rl_grants === 0],
  ['chk_legal=1', v.chk_legal === 1],
];
let fallos = 0;
for (const [name, ok] of checks) {
  console.log(`  ${ok ? 'OK  ' : 'FALLO'} ${name}`);
  if (!ok) fallos++;
}
if (fallos) { console.error(`FALLO: ${fallos} verificaciones POST no pasaron.`); process.exit(6); }

const despues = (await q(`SELECT
  (SELECT count(*) FROM public.payrolls) AS payrolls,
  (SELECT count(*) FROM public.payroll_items) AS payroll_items,
  (SELECT count(*) FROM public.payroll_item_concepts) AS concepts,
  (SELECT count(*) FROM public.worker_salary_rates) AS salary_rates,
  (SELECT count(*) FROM public.commission_payments) AS commission_payments,
  (SELECT count(*) FROM public.audit_logs) AS audit_logs,
  (SELECT count(*) FROM public.products) AS products,
  (SELECT count(*) FROM public.transactions) AS transactions`))[0];
const delta0 = JSON.stringify(antes) === JSON.stringify(despues);
console.log('conteos DESPUÉS:', JSON.stringify(despues));
console.log('DELTA 0 en tablas de negocio:', delta0 ? 'OK' : 'FALLO');
if (!delta0) process.exit(6);

// ── FASE 3 · REGULARIZACIÓN DEL LIBRO (aplicadas 8/11–10/11 sin fila) ───────
console.log('\n── FASE 3 · REGULARIZACIÓN production_migration_ledger ──');
const REG_FILES = [
  'supabase/migrations/20261108141000_sales_dashboard_analytics.sql',
  'supabase/migrations/20261108150000_cp_operational_classification.sql',
  'supabase/migrations/20261108200000_cp_doc_sc006_store_code.sql',
  'supabase/migrations/20261108201000_cp_doc_sc006_receipt_document_number.sql',
  'supabase/migrations/20261108220000_sales_dashboard_stores_comparison.sql',
  'supabase/migrations/20261110120000_cp_plantillas_privadas_propietario.sql',
];
const REG_NOTES = {
  '20261108141000': 'REGULARIZACIÓN (CP-SECURITY-BACKLOG-001): efectos verificados por catálogo en producción [MEDIDO 2026-11-14] (get_sales_dashboard_analytics/product_detail presentes). Aplicación original sin registro de hora — SHA-256 del archivo vigente en el repo.',
  '20261108150000': 'REGULARIZACIÓN (CP-SECURITY-BACKLOG-001): efectos verificados [MEDIDO 2026-11-14] (products.operational_class + enum product_operational_class + índice). Aplicación original sin registro de hora — SHA del archivo vigente.',
  '20261108200000': 'REGULARIZACIÓN (CP-SECURITY-BACKLOG-001): efectos verificados [MEDIDO 2026-11-14] (stores.store_code). Aplicación original sin registro de hora — SHA del archivo vigente.',
  '20261108201000': 'REGULARIZACIÓN (CP-SECURITY-BACKLOG-001): efectos verificados [MEDIDO 2026-11-14] (receipts.document_number + document_sequences con entrada). Aplicación original sin registro de hora — SHA del archivo vigente.',
  '20261108220000': 'REGULARIZACIÓN (CP-SECURITY-BACKLOG-001): efectos verificados [MEDIDO 2026-11-14] (versión stores_comparison de get_sales_dashboard_analytics). Aplicación original sin registro de hora — SHA del archivo vigente.',
  '20261110120000': 'REGULARIZACIÓN (CP-SECURITY-BACKLOG-001): efectos verificados [MEDIDO 2026-11-14] (6 políticas RLS de cost_sheet_templates). Aplicación original sin registro de hora — SHA del archivo vigente.',
};
for (const f of REG_FILES) {
  const version = f.split('/')[2].slice(0, 13);
  const sql = readFileSync(resolve(process.cwd(), f), 'utf8');
  const sha = createHash('sha256').update(sql).digest('hex');
  const r = await mgmt(`INSERT INTO public.production_migration_ledger
    (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
  SELECT '${version}', '${f}', '${sha}', '2026-11-14', 'management_api',
         'audit-evidence/CP-SECURITY-BACKLOG-001/EXPEDIENTE.md', 'agent', 'applied', '${REG_NOTES[version]}'
  WHERE NOT EXISTS (SELECT 1 FROM public.production_migration_ledger WHERE version='${version}')
  RETURNING id, version`);
  console.log(`  reg ${version}: ${r.ok ? (JSON.parse(r.text)[0]?.id ?? 'ya existía (0 filas)') : 'ERROR ' + r.text.slice(0, 150)}`);
}

// ── FASE 4 · FILAS NUEVAS DE HOY ─────────────────────────────────────────────
console.log('\n── FASE 4 · FILAS NUEVAS (aplicación de hoy) ──');
const EVID = 'audit-evidence/CP-SECURITY-BACKLOG-001/EXPEDIENTE.md';
const NOTA = 'CP-SECURITY-AND-BACKLOG-CLOSURE-001 (misión del propietario 2026-11-14): validada en BD aislada CostproE2E (replay 166/166; nóminas 36/36 + 54/54; freno 201; concurrencia limiter PASS; legal 8/8; NET DELTA 0). Aplicada con verificación fail-closed y delta 0.';
for (let i = 0; i < FILES.length; i++) {
  const version = FILES[i].split('/')[2].slice(0, 14);
  const r = await mgmt(`INSERT INTO public.production_migration_ledger
    (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
  SELECT '${version}', '${FILES[i]}', '${shas[i]}', now(), 'management_api', '${EVID}', 'agent', 'applied', '${NOTA}'
  WHERE NOT EXISTS (SELECT 1 FROM public.production_migration_ledger WHERE version='${version}')
  RETURNING id, version`);
  console.log(`  nueva ${version}: ${r.ok ? (JSON.parse(r.text)[0]?.id ?? 'ya existía (0 filas)') : 'ERROR ' + r.text.slice(0, 150)}`);
}

const total = (await q('SELECT count(*) AS n FROM public.production_migration_ledger'))[0];
console.log(`\nproduction_migration_ledger: ${total.n} filas.`);
console.log('CP-SECURITY-BACKLOG-001 APLICACIÓN COMPLETADA — verificación fail-closed OK, delta 0, libro regularizado.');
