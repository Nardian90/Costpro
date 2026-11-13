#!/usr/bin/env node
/**
 * CP-FIN · PARTIDA DOBLE (2026-11-13) — Aplicación CONTROLADA de las
 * migraciones a PRODUCCIÓN:
 *   supabase/migrations/20261113120000_cp_fin_partida_doble_base.sql
 *   supabase/migrations/20261113120100_cp_fin_partida_doble_motor.sql
 *
 * Canal habitual y autorizado del repo: Management API /database/query +
 * NOTIFY pgrst 'reload schema' (patrón m002…/m013 · docs/OPERATIONS/
 * POLITICA_AGENTES_SUPABASE.md §3: lote único, idempotente, verificación
 * fail-closed post-migración, sin reintentos).
 *
 * Autorización: instrucción explícita del propietario en la misión de
 * auditoría final del 2026-11-13 («primero aplica la migración»), bajo la
 * regla de oro productiva 11g: validar primero en el aislado (smoke TODO OK,
 * signos OK, suite 33/33, higiene net delta 0) y aplicar en producción UNA
 * SOLA VEZ, documentando cuándo/qué/SHA en el expediente.
 *
 * Fases:
 *   0. Guard CP-INFRA-019 (doble flag) + SHA-256 de ambos archivos +
 *      pre-vuelo read-only: migraciones PENDIENTES (fin_categories ausente),
 *      dependencias (19 tablas fuente + 3 funciones de acceso) y conteos
 *      ANTES de las tablas de negocio preexistentes.
 *   1. APLICACIÓN (un lote por archivo, sin reintentos) + NOTIFY pgrst.
 *   2. VERIFICACIÓN POST (read-only, fail-closed): 8 tablas fin_*, RLS
 *      FORCED ×8, 16 políticas, semillas (≥38 categorías, ≥14 doctypes,
 *      ≥10 reglas activas, ≥30 métricas), ≥10 triggers fin_trg_%, 11 RPCs
 *      públicas SECURITY DEFINER, ACLs (internas sin EXECUTE para
 *      authenticated/anon; fin_entries/fin_movements SELECT-only).
 *   3. Pruebas NEGATIVAS (CERO escrituras — el gate aborta ANTES de tocar
 *      datos): fin_simulate con documento inexistente → ERR_DOC_NOT_FOUND;
 *      fin_activate_rule_version inexistente → ERR_RULE_NOT_FOUND;
 *      fin_backfill canal postgres sin usuario real → ERR_UNAUTHORIZED
 *      (anti-spoofing: la Management API no puede suplantar usuario).
 *   4. Integridad de datos: conteos ANTES == DESPUÉS (delta 0) — las
 *      migraciones solo AÑADEN objetos y semillas en tablas NUEVAS.
 *
 * Uso: ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND bun \
 *   scripts/m014-aplicar-migraciones-cp-fin.mjs [--only-verify]
 */
import { readFileSync } from 'fs';
import { createHash } from 'node:crypto';
import { resolve } from 'path';
// GUARD (CP-INFRA-019): bloquea producción salvo doble flag explícito.
import { assertNotProduction } from './lib/assert-not-production.mjs';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
assertNotProduction({ mode: 'write', url: SUPABASE_URL, context: 'm014-aplicar-migraciones-cp-fin.mjs' });
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
async function qExpectError(query) {
  const r = await mgmt(query);
  return { ok: r.ok, status: r.status, text: r.text };
}

const FILES = [
  'supabase/migrations/20261113120000_cp_fin_partida_doble_base.sql',
  'supabase/migrations/20261113120100_cp_fin_partida_doble_motor.sql',
  'supabase/migrations/20261113120200_cp_fin_endurecimiento_rls.sql',
];
console.log('Migraciones CP-FIN → PRODUCCIÓN (' + ref + ')');
for (const f of FILES) {
  const sql = readFileSync(resolve(process.cwd(), f), 'utf8');
  console.log(`  ${f} · SHA-256 ${createHash('sha256').update(sql).digest('hex')}`);
}
console.log('');

const FIN_TABLES = ['fin_categories','fin_document_types','fin_rule_versions','fin_entries',
  'fin_movements','fin_opening_balances','fin_posting_errors','fin_metric_catalog'];

// Tablas de negocio preexistentes que el motor LEE (delta 0 al aplicar)
const COUNT_TABLES = `
SELECT
  (SELECT count(*) FROM public.transactions) AS transactions,
  (SELECT count(*) FROM public.devolutions) AS devolutions,
  (SELECT count(*) FROM public.receipts) AS receipts,
  (SELECT count(*) FROM public.received_services) AS received_services,
  (SELECT count(*) FROM public.issue_slips) AS issue_slips,
  (SELECT count(*) FROM public.inventory_adjustments) AS inventory_adjustments,
  (SELECT count(*) FROM public.commission_payments) AS commission_payments,
  (SELECT count(*) FROM public.payrolls) AS payrolls,
  (SELECT count(*) FROM public.cash_flow_documents) AS cash_flow_documents,
  (SELECT count(*) FROM public.payment_transactions) AS payment_transactions,
  (SELECT count(*) FROM public.stock_movements) AS stock_movements,
  (SELECT count(*) FROM public.products) AS products`;

// ── FASE 0 · PRE-VUELO (read-only) ──────────────────────────────────────────
const onlyVerify = process.argv.includes('--only-verify');

const tablesPre = await q(`SELECT count(*)::int AS fin_tables
  FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'fin_%'`);
const alreadyApplied = tablesPre[0].fin_tables >= 8;
console.log('PRE tablas fin_*:', tablesPre[0].fin_tables, alreadyApplied ? '→ YA APLICADA' : '→ PENDIENTE');

const deps = await q(`SELECT
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name IN
    ('transactions','transaction_items','devolutions','devolution_items','receipts','receipt_items',
     'received_services','issue_slips','inventory_adjustments','inventory_adjustment_items',
     'commission_payments','payrolls','cash_flow_documents','payment_transactions','products',
     'profiles','store_credit_ledger','wac_change_log','user_store_memberships')) AS t_fuentes,
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN
    ('is_admin_check','has_store_access_as','has_store_role_as')) AS f_acceso`);
console.log('PRE dependencias:', JSON.stringify(deps[0]));
if (deps[0].t_fuentes !== 19 || deps[0].f_acceso !== 3) {
  console.error('PRE-VUELO FALLÓ: dependencias ausentes');
  process.exit(2);
}

const before = await q(COUNT_TABLES);
console.log('PRE conteos negocio:', JSON.stringify(before[0]));

// ── FASE 1 · APLICACIÓN (un lote por archivo, sin reintentos) ───────────────
if (!alreadyApplied && !onlyVerify) {
  for (const f of FILES) {
    const sql = readFileSync(resolve(process.cwd(), f), 'utf8');
    console.log(`\nAplicando ${f} ...`);
    const res = await mgmt(sql);
    console.log('HTTP', res.status);
    if (!res.ok) {
      console.error('FALLO DE APLICACIÓN:', res.text.slice(0, 2500));
      process.exit(1);
    }
    console.log('resultado:', (res.text || '(sin filas)').slice(0, 300));
  }
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
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'fin_%') AS t_fin,
  (SELECT count(*)::int FROM public.fin_categories) AS categorias,
  (SELECT count(*)::int FROM public.fin_document_types) AS doctypes,
  (SELECT count(*)::int FROM public.fin_rule_versions WHERE status='active') AS reglas_activas,
  (SELECT count(*)::int FROM public.fin_metric_catalog) AS metricas,
  (SELECT count(*)::int FROM public.fin_entries) AS asientos,
  (SELECT count(*)::int FROM public.fin_movements) AS movimientos,
  (SELECT count(*)::int FROM information_schema.triggers WHERE trigger_schema='public' AND trigger_name LIKE 'fin_trg_%') AS triggers`);
const rls = await q(`SELECT c.relname AS tabla, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname LIKE 'fin_%' ORDER BY c.relname`);
const policies = await q(`SELECT count(*)::int AS n FROM pg_policies
  WHERE schemaname='public' AND tablename LIKE 'fin_%'`);
const fnPost = await q(`SELECT p.proname AS fn, p.prosecdef AS secdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN
    ('fin_simulate','fin_activate_rule_version','fin_deactivate_rule_version','fin_apply_opening_balance',
     'fin_backfill','fin_reprocess_posting_errors','fin_get_balance_sheet','fin_get_income_statement',
     'fin_get_dashboard','fin_get_category_detail','fin_get_document_types_status')
  ORDER BY p.proname`);
const aclInternal = await q(`SELECT count(*)::int AS n FROM information_schema.routine_privileges
  WHERE routine_schema='public' AND specific_name LIKE 'fin_%'
    AND grantee IN ('authenticated','anon','public')
    AND routine_name IN ('fin_resolve_rule','fin_eval_condition','fin_compute_metrics','fin_apply_templates',
        'fin_post_document','fin_post_document_safe','fin_post_document_annulment','fin_post_annulment_safe',
        'fin_validate_rule_movements')`);
const aclPublic = await q(`SELECT count(DISTINCT routine_name)::int AS n
  FROM information_schema.routine_privileges
  WHERE routine_schema='public' AND grantee='authenticated' AND routine_name IN
    ('fin_simulate','fin_activate_rule_version','fin_deactivate_rule_version','fin_apply_opening_balance',
     'fin_backfill','fin_reprocess_posting_errors','fin_get_balance_sheet','fin_get_income_statement',
     'fin_get_dashboard','fin_get_category_detail','fin_get_document_types_status')`);
const tblPriv = await q(`SELECT
  (SELECT count(*)::int FROM information_schema.table_privileges
     WHERE table_schema='public' AND table_name IN ('fin_entries','fin_movements')
       AND grantee='authenticated' AND privilege_type='SELECT') AS sel,
  (SELECT count(*)::int FROM information_schema.table_privileges
     WHERE table_schema='public' AND table_name IN ('fin_entries','fin_movements')
       AND grantee='authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')) AS escr,
  (SELECT count(*)::int FROM information_schema.table_privileges
     WHERE table_schema='public' AND table_name LIKE 'fin_%' AND grantee='anon') AS anon`);

const checks = [];
checks.push(['8 tablas fin_* presentes', post[0].t_fin === 8, `t=${post[0].t_fin}`]);
checks.push(['RLS FORCED en las 8 tablas (estándar payrolls, endurecimiento 20261113120200)',
  rls.length === 8 && rls.every((t) => t.rls === true && t.forced === true),
  rls.map((t) => `${t.tabla.replace('fin_','')}:${t.rls && t.forced ? 'F' : 'NO'}`).join(' ')]);
checks.push(['políticas RLS fin_* (≥16)', policies[0].n >= 16, `n=${policies[0].n}`]);
checks.push(['semillas: ≥38 categorías / ≥14 doctypes / ≥10 reglas activas / ≥30 métricas',
  post[0].categorias >= 38 && post[0].doctypes >= 14 && post[0].reglas_activas >= 10 && post[0].metricas >= 30,
  `cat=${post[0].categorias} dt=${post[0].doctypes} reglas=${post[0].reglas_activas} met=${post[0].metricas}`]);
checks.push(['≥10 triggers de contabilización fin_trg_%', post[0].triggers >= 10, `n=${post[0].triggers}`]);
checks.push(['11 RPCs públicas SECURITY DEFINER', fnPost.length === 11 && fnPost.every((f) => f.secdef === true),
  `n=${fnPost.length}`]);
checks.push(['ACL: 9 RPCs internas SIN EXECUTE para authenticated/anon/public', aclInternal[0].n === 0, `n=${aclInternal[0].n}`]);
checks.push(['ACL: 11 RPCs públicas CON EXECUTE para authenticated', aclPublic[0].n === 11, `n=${aclPublic[0].n}`]);
checks.push(['fin_entries/fin_movements: SELECT-only para authenticated (escritura denegada)',
  tblPriv[0].sel === 2 && tblPriv[0].escr === 0, `sel=${tblPriv[0].sel} escr=${tblPriv[0].escr}`]);
checks.push(['CERO privilegios anon en tablas fin_* (endurecimiento)', tblPriv[0].anon === 0, `n=${tblPriv[0].anon}`]);
checks.push(['CERO asientos/movimientos tras la migración (sin backfill histórico)',
  post[0].asientos === 0 && post[0].movimientos === 0, `e=${post[0].asientos} m=${post[0].movimientos}`]);

let failed = 0;
for (const [name, ok, detail] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}
if (failed > 0) { console.error(`VERIFICACIÓN POST FALLÓ (${failed})`); process.exit(5); }

// ── FASE 3 · PRUEBAS NEGATIVAS (CERO escrituras) ────────────────────────────
console.log('\n── PRUEBAS NEGATIVAS (gates abortan ANTES de escribir) ──');
const NEG = [];
{
  const r = await qExpectError(`SELECT public.fin_simulate('VENTA', 'dd0dd0dd-0000-4000-8000-0000000000dd'::uuid) AS r`);
  NEG.push(['fin_simulate con documento inexistente → ERR_DOC_NOT_FOUND',
    r.status >= 400 && r.text.includes('ERR_DOC_NOT_FOUND'), `HTTP ${r.status}`]);
}
{
  const r = await qExpectError(`SELECT public.fin_activate_rule_version('dd0dd0dd-0000-4000-8000-0000000000dd'::uuid, NULL) AS r`);
  NEG.push(['fin_activate_rule_version id inexistente → ERR_RULE_NOT_FOUND',
    r.status >= 400 && r.text.includes('ERR_RULE_NOT_FOUND'), `HTTP ${r.status}`]);
}
{
  // Canal Management API (postgres): auth.uid() NULL → ni el canal puede
  // lanzar un backfill sin usuario real (anti-spoofing, patrón m013).
  const r = await qExpectError(`SELECT public.fin_backfill(
    'dd0dd0dd-0000-4000-8000-0000000000dd'::uuid, '2026-01-01'::date, '2026-12-31'::date, true, NULL) AS r`);
  NEG.push(['fin_backfill canal postgres sin usuario real → ERR_UNAUTHORIZED (anti-spoofing)',
    r.status >= 400 && r.text.includes('ERR_UNAUTHORIZED'), `HTTP ${r.status}`]);
}
for (const [name, ok, detail] of NEG) {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}
if (failed > 0) { console.error(`PRUEBAS NEGATIVAS FALLARON (${failed})`); process.exit(6); }

// ── FASE 4 · INTEGRIDAD ANTES == DESPUÉS (delta 0) ──────────────────────────
console.log('\n── INTEGRIDAD (delta 0 en tablas de negocio) ──');
const after = await q(COUNT_TABLES);
let deltaOk = true;
const delta = {};
for (const k of Object.keys(before[0])) {
  delta[k] = after[0][k] - before[0][k];
  if (delta[k] !== 0) deltaOk = false;
}
console.log('delta:', JSON.stringify(delta));
if (!deltaOk) { console.error('DELTA ≠ 0: la migración tocó filas de negocio — ABORTAR y revisar.'); process.exit(7); }

console.log(`\n══════════ M014 OK: migraciones CP-FIN ${alreadyApplied ? 'VERIFICADAS (ya aplicadas)' : 'APLICADAS y VERIFICADAS'} en producción ${ref}`);
for (const f of FILES) {
  const sql = readFileSync(resolve(process.cwd(), f), 'utf8');
  console.log(`  ${f} · SHA-256 ${createHash('sha256').update(sql).digest('hex')}`);
}
