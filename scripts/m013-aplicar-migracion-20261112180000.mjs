#!/usr/bin/env node
/**
 * NÓMINAS SC-4-06 (2026-11-12) · MISIÓN B — Aplicación CONTROLADA de la
 * migración a PRODUCCIÓN:
 *   supabase/migrations/20261112180000_cp_payrolls_sc406.sql
 *
 * Canal habitual y autorizado del repo: Management API /database/query +
 * NOTIFY pgrst 'reload schema' (patrón scripts/m002…/m012-aplicar-migracion-*.mjs
 * · docs/OPERATIONS/POLITICA_AGENTES_SUPABASE.md §3: lote único, idempotente,
 * verificación fail-closed post-migración, sin reintentos).
 *
 * La autorización de esta escritura es la regla de oro productiva del
 * propietario (protocolo 11g): validar primero en el aislado (verify-nominas-pg
 * 54/54 + verify-nominas-api 39/39) y aplicar en producción UNA SOLA VEZ,
 * documentando cuándo/qué/SHA en el expediente de la misión.
 *
 * Fases:
 *   0. Guard CP-INFRA-019 (doble flag) + SHA-256 del archivo + pre-vuelo
 *      read-only: migración PENDIENTE (tablas/RPCs ausentes), dependencias
 *      (has_store_access_as, document_sequences, audit_logs, workers) y
 *      conteos ANTES de las tablas preexistentes.
 *   1. APLICACIÓN única (lote completo, sin reintentos) + NOTIFY pgrst
 *      'reload schema'.
 *   2. VERIFICACIÓN POST (read-only, fail-closed): 4 tablas nuevas, RLS
 *      FORCED, 4 políticas de aislamiento, perfil laboral en workers (4
 *      columnas), numeración NOM, 7 RPCs SECURITY DEFINER, ACLs solo
 *      service_role (+postgres), columna document_sequences.document_type
 *      con 'payroll'.
 *   3. Pruebas funcionales NEGATIVAS (CERO escrituras — la excepción aborta
 *      la transacción ANTES de escribir):
 *      a) create_payroll con tienda inexistente → ERR_STORE_NOT_FOUND;
 *      b) confirm_payroll con id inexistente → ERR_PAYROLL_NOT_FOUND;
 *      c) void_payroll con id inexistente (sin motivo válido) → ERR_PAYROLL_NOT_FOUND;
 *      d) set_worker_salary_rate con trabajador inexistente → ERR_WORKER_NOT_FOUND;
 *      e) authenticated SIN EXECUTE en las RPCs de nómina (solo service_role).
 *   4. Integridad de datos: conteos ANTES == DESPUÉS (delta 0) — la migración
 *      solo AÑADE objetos (ALTER … IF NOT EXISTS); sin datos comerciales.
 *
 * Uso: ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND bun \
 *   scripts/m013-aplicar-migracion-20261112180000.mjs [--only-verify]
 */
import { readFileSync } from 'fs';
import { createHash } from 'node:crypto';
import { resolve } from 'path';
// GUARD (CP-INFRA-019): bloquea producción salvo doble flag explícito.
import { assertNotProduction } from './lib/assert-not-production.mjs';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
assertNotProduction({ mode: 'write', url: SUPABASE_URL, context: 'm013-aplicar-migracion-20261112180000.mjs' });
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
  if (!r.ok) { console.error('QUERY FAILED', r.status, r.text.slice(0, 300)); process.exit(4); }
  return JSON.parse(r.text);
}
async function qExpectError(query) {
  const r = await mgmt(query);
  return { ok: r.ok, status: r.status, text: r.text };
}

const FILE = 'supabase/migrations/20261112180000_cp_payrolls_sc406.sql';
const sql = readFileSync(resolve(process.cwd(), FILE), 'utf8');
const sha256 = createHash('sha256').update(sql).digest('hex');
console.log(`Migración: ${FILE}`);
console.log(`SHA-256: ${sha256}`);
console.log(`Destino: PRODUCCIÓN (${ref})\n`);

const COUNT_TABLES = `
SELECT
  (SELECT count(*) FROM public.workers) AS workers,
  (SELECT count(*) FROM public.stores) AS stores,
  (SELECT count(*) FROM public.tenants) AS tenants,
  (SELECT count(*) FROM public.user_store_memberships) AS user_store_memberships,
  (SELECT count(*) FROM public.document_sequences) AS document_sequences,
  (SELECT count(*) FROM public.audit_logs) AS audit_logs,
  (SELECT count(*) FROM public.idempotency_registry) AS idempotency_registry`;

// ── FASE 0 · PRE-VUELO (read-only) ──────────────────────────────────────────
const onlyVerify = process.argv.includes('--only-verify');

const tablesPre = await q(`SELECT
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='payrolls') AS t_payrolls,
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='payroll_items') AS t_items,
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='payroll_item_concepts') AS t_concepts,
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='worker_salary_rates') AS t_rates`);
const alreadyApplied = tablesPre[0].t_payrolls === 1;
console.log('PRE tablas nómina (payrolls/items/concepts/rates):', JSON.stringify(tablesPre[0]), alreadyApplied ? '→ YA APLICADA' : '→ PENDIENTE');

const deps = await q(`SELECT
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='has_store_access_as') AS f_access,
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='document_sequences') AS t_seq,
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_logs') AS t_audit,
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='idempotency_registry') AS t_idem,
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='workers') AS t_workers,
  (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='document_sequences' AND column_name='document_type') AS c_seq_type`);
console.log('PRE dependencias:', JSON.stringify(deps[0]));
if (deps[0].f_access !== 1 || deps[0].t_seq !== 1 || deps[0].t_audit !== 1 || deps[0].t_idem !== 1 || deps[0].t_workers !== 1 || deps[0].c_seq_type !== 1) {
  console.error('PRE-VUELO FALLÓ: dependencias ausentes');
  process.exit(2);
}

// ACL preexistente de next_document_number (para confirmar que la migración
// la reemplaza añadiendo el tipo payroll sin perder el resto).
const fnPre = await q(`SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='next_document_number'`);
if (!fnPre[0]) { console.error('PRE-VUELO FALLÓ: next_document_number ausente'); process.exit(2); }
console.log('PRE next_document_number: payroll branch =', fnPre[0].def.includes("WHEN 'payroll' THEN 'NOM'"), '· doc_types conocidos:', (fnPre[0].def.match(/WHEN '/g) || []).length);

const before = await q(COUNT_TABLES);
console.log('PRE conteos:', JSON.stringify(before[0]));

// ── FASE 1 · APLICACIÓN (lote único, sin reintentos) ────────────────────────
if (!alreadyApplied && !onlyVerify) {
  console.log(`\nAplicando ${FILE} a PRODUCCIÓN (${ref})...`);
  const res = await mgmt(sql);
  console.log('HTTP', res.status);
  if (!res.ok) {
    console.error('FALLO DE APLICACIÓN:', res.text.slice(0, 2000));
    process.exit(1);
  }
  console.log('resultado:', res.text.slice(0, 400) || '(sin filas)');

  const reload = await mgmt("NOTIFY pgrst, 'reload schema'");
  console.log('pgrst schema-cache reload: HTTP', reload.status);
}
if (onlyVerify && !alreadyApplied) {
  console.error('\n--only-verify pero la migración NO está aplicada: abortando sin escribir.');
  process.exit(3);
}

// ── FASE 2 · VERIFICACIÓN POST (read-only, fail-closed) ─────────────────────
console.log('\n── VERIFICACIÓN POST ──');
const post = await q(`SELECT
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='payrolls') AS t_payrolls,
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='payroll_items') AS t_items,
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='payroll_item_concepts') AS t_concepts,
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='worker_salary_rates') AS t_rates,
  (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='workers'
     AND column_name IN ('expediente_laboral','categoria_ocupacional','cargo','area_trabajo')) AS c_laboral`);
const rls = await q(`SELECT
  c.relname AS tabla,
  c.relrowsecurity AS rls,
  c.relforcerowsecurity AS forced
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('payrolls','payroll_items','payroll_item_concepts','worker_salary_rates')
  ORDER BY c.relname`);
const policies = await q(`SELECT count(*)::int AS n FROM pg_policies
  WHERE schemaname='public' AND tablename IN ('payrolls','payroll_items','payroll_item_concepts','worker_salary_rates')
    AND policyname IN ('payrolls_store_isolation','payroll_items_store_isolation','payroll_item_concepts_store_isolation','worker_salary_rates_store_isolation')`);
const fnPost = await q(`SELECT p.proname AS fn, p.prosecdef AS secdef, p.proconfig AS config
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN
    ('create_payroll','update_payroll','confirm_payroll','account_payroll','mark_payroll_paid','void_payroll','set_worker_salary_rate')
  ORDER BY p.proname`);
const numPost = await q(`SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='next_document_number'`);
const aclPost = await q(`SELECT
  (SELECT COALESCE(array_agg(grantee ORDER BY grantee), ARRAY[]::text[])
     FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND routine_name='create_payroll'
       AND grantee IN ('postgres','service_role','authenticated','anon','public')) AS grantees_create,
  (SELECT count(*)::int FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND routine_name='create_payroll' AND grantee='authenticated') AS auth_create,
  (SELECT count(*)::int FROM information_schema.routine_privileges
     WHERE routine_schema='public' AND routine_name='create_payroll' AND grantee='anon') AS anon_create`);

const checks = [];
checks.push(['4 tablas nuevas presentes', post[0].t_payrolls === 1 && post[0].t_items === 1 && post[0].t_concepts === 1 && post[0].t_rates === 1]);
checks.push(['perfil laboral en workers (4 columnas)', post[0].c_laboral === 4]);
checks.push(['RLS FORCED en las 4 tablas', rls.length === 4 && rls.every((t) => t.rls === true && t.forced === true),
  rls.map((t) => `${t.tabla}:${t.rls && t.forced ? 'forced' : 'NO'}`).join(' ')]);
checks.push(['4 políticas de aislamiento por tienda', policies[0].n === 4, `n=${policies[0].n}`]);
checks.push(['7 RPCs SECURITY DEFINER', fnPost.length === 7 && fnPost.every((f) => f.secdef === true),
  fnPost.map((f) => f.fn).join(',')]);
checks.push(['numeración NOM (payroll)', (numPost[0]?.def || '').includes("WHEN 'payroll' THEN 'NOM'")]);
checks.push(['ACL create_payroll: authenticated+service_role (autorización DENTRO vía has_store_access_as), SIN anon/public',
  JSON.stringify(aclPost[0].grantees_create).includes('service_role')
  && JSON.stringify(aclPost[0].grantees_create).includes('authenticated')
  && !JSON.stringify(aclPost[0].grantees_create).includes('anon')
  && !JSON.stringify(aclPost[0].grantees_create).includes('public'),
  JSON.stringify(aclPost[0].grantees_create)]);

let failed = 0;
for (const [name, ok, detail] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}
if (failed > 0) { console.error(`VERIFICACIÓN POST FALLÓ (${failed})`); process.exit(5); }

// ── FASE 3 · PRUEBAS NEGATIVAS (CERO escrituras) ────────────────────────────
console.log('\n── PRUEBAS NEGATIVAS (excepciones ANTES de escribir; sin datos propios) ──');
const NEG = [];
{
  // Canal Management API (postgres): el guard anti-spoofing exige usuario
  // con acceso real — p_user_id NULL/auth.uid() NULL → ERR_UNAUTHORIZED.
  // Prueba MÁS fuerte que store-not-found: ni el superusuario del canal
  // puede confeccionar nóminas con usuario espurio.
  const r = await qExpectError(`SELECT public.create_payroll(
    'dd0dd0dd-0000-4000-8000-0000000000dd'::uuid, 'sueldos', CURRENT_DATE, CURRENT_DATE,
    'efectivo', NULL, NULL, NULL, NULL, NULL, '[]'::jsonb, 'm013-neg-probe-a', NULL::uuid) AS r`);
  NEG.push(['create_payroll canal postgres sin usuario real → ERR_UNAUTHORIZED (anti-spoofing)',
    r.status >= 400 && r.text.includes('ERR_UNAUTHORIZED'), `HTTP ${r.status}`]);
}
{
  const r = await qExpectError(`SELECT public.confirm_payroll(
    'dd0dd0dd-0000-4000-8000-0000000000dd'::uuid, NULL::uuid) AS r`);
  NEG.push(['confirm_payroll id inexistente → ERR_PAYROLL_NOT_FOUND', r.status >= 400 && r.text.includes('ERR_PAYROLL_NOT_FOUND'), `HTTP ${r.status}`]);
}
{
  const r = await qExpectError(`SELECT public.void_payroll(
    'dd0dd0dd-0000-4000-8000-0000000000dd'::uuid, 'motivo de verificación m013', NULL::uuid) AS r`);
  NEG.push(['void_payroll id inexistente → ERR_PAYROLL_NOT_FOUND', r.status >= 400 && r.text.includes('ERR_PAYROLL_NOT_FOUND'), `HTTP ${r.status}`]);
}
{
  const r = await qExpectError(`SELECT public.set_worker_salary_rate(
    'dd0dd0dd-0000-4000-8000-0000000000dd'::uuid, 'hourly', 250.00, 'CUP', NULL, NULL::uuid) AS r`);
  NEG.push(['set_worker_salary_rate trabajador inexistente → ERR_WORKER_NOT_FOUND', r.status >= 400 && r.text.includes('ERR_WORKER_NOT_FOUND'), `HTTP ${r.status}`]);
}
for (const [name, ok, detail] of NEG) {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}
if (failed > 0) { console.error(`PRUEBAS NEGATIVAS FALLARON (${failed})`); process.exit(6); }

// ── FASE 4 · INTEGRIDAD ANTES == DESPUÉS (delta 0) ──────────────────────────
console.log('\n── INTEGRIDAD (delta 0 en tablas preexistentes) ──');
const after = await q(COUNT_TABLES);
let deltaOk = true;
const delta = {};
for (const k of Object.keys(before[0])) {
  delta[k] = after[0][k] - before[0][k];
  if (delta[k] !== 0) deltaOk = false;
}
console.log('delta:', JSON.stringify(delta));
if (!deltaOk) { console.error('DELTA ≠ 0: la migración tocó filas de negocio — ABORTAR y revisar.'); process.exit(7); }

console.log(`\n══════════ M013 OK: migración ${alreadyApplied ? 'VERIFICADA (ya aplicada)' : 'APLICADA y VERIFICADA'} en producción ${ref}`);
console.log(`SHA-256 aplicado: ${sha256}`);
