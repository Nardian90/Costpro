#!/usr/bin/env node
/**
 * CP-FIN · CORRECCIONES DE LA AUDITORÍA INTEGRAL (2026-11-13) — Aplicación
 * CONTROLADA a PRODUCCIÓN de las 4 migraciones de corrección:
 *   supabase/migrations/20261113120300_cp_fin_triggers_diferidos.sql
 *   supabase/migrations/20261113120400_cp_fin_fix_metricas_nomina_flujo.sql
 *   supabase/migrations/20261113120500_cp_fin_fix_sentidos_pago.sql
 *   supabase/migrations/20261113120600_cp_fin_fix_audit_logs_check.sql
 *
 * Canal habitual y autorizado del repo: Management API /database/query +
 * NOTIFY pgrst 'reload schema' (patrón m002…/m014 · docs/OPERATIONS/
 * POLITICA_AGENTES_SUPABASE.md §3: lote único, idempotente, verificación
 * fail-closed post-migración, sin reintentos).
 *
 * Autorización: instrucción explícita del propietario en la misión de
 * auditoría final del 2026-11-13 («primero aplica la migración»), bajo la
 * regla de oro productiva 11g: validar primero en el aislado (auditoría
 * integral 34/34 PASS, higiene net delta 0, suite FIN 33/33) y aplicar en
 * producción UNA SOLA VEZ, documentando cuándo/qué/SHA en el expediente.
 *
 * Fases:
 *   0. Guard CP-INFRA-019 (doble flag) + SHA-256 de los 4 archivos +
 *      pre-vuelo read-only: m014 aplicado (8 tablas fin_*), defectos aún
 *      presentes (0 triggers diferidos), conteos ANTES de tablas de negocio.
 *   1. APLICACIÓN (un lote por archivo, sin reintentos) + NOTIFY pgrst.
 *   2. VERIFICACIÓN POST (read-only, fail-closed): 3 constraint triggers
 *      diferidos + trigger de pagos inmediato, métricas con variables
 *      tipadas (v_txt), sentidos de pago corregidos (D pasivo / C activo,
 *      cero invertidos), whitelist audit_logs con fin_rule_versions (sin
 *      perder master_products/master_parties), RLS FORCED intacto, CERO
 *      asientos (sin backfill no autorizado).
 *   3. Integridad de datos: conteos ANTES == DESPUÉS (delta 0).
 *
 * Uso: ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND bun \
 *   scripts/m015-aplicar-fixes-cp-fin.mjs [--only-verify]
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
assertNotProduction({ mode: 'write', url: SUPABASE_URL, context: 'm015-aplicar-fixes-cp-fin.mjs' });
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
  'supabase/migrations/20261113120300_cp_fin_triggers_diferidos.sql',
  'supabase/migrations/20261113120400_cp_fin_fix_metricas_nomina_flujo.sql',
  'supabase/migrations/20261113120500_cp_fin_fix_sentidos_pago.sql',
  'supabase/migrations/20261113120600_cp_fin_fix_audit_logs_check.sql',
];
console.log('Fixes CP-FIN (auditoría integral) → PRODUCCIÓN (' + ref + ')');
for (const f of FILES) {
  const sql = readFileSync(resolve(process.cwd(), f), 'utf8');
  console.log(`  ${f} · SHA-256 ${createHash('sha256').update(sql).digest('hex')}`);
}
console.log('');

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

const pre = await q(`SELECT
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'fin_%') AS fin_tables,
  (SELECT count(*)::int FROM pg_constraint c WHERE c.contype='t'
     AND c.conrelid IN ('public.transactions'::regclass,'public.devolutions'::regclass,'public.receipts'::regclass)
     AND c.conname LIKE 'fin_trg_%') AS triggers_diferidos,
  (SELECT count(*)::int FROM public.fin_entries) AS asientos,
  (SELECT count(*)::int FROM public.fin_movements) AS movimientos`);
console.log('PRE tablas fin_*:', pre[0].fin_tables, '| triggers diferidos:', pre[0].triggers_diferidos,
  '| asientos:', pre[0].asientos, '| movimientos:', pre[0].movimientos);
if (pre[0].fin_tables !== 8) {
  console.error('PRE-VUELO FALLÓ: m014 (base CP-FIN) no está aplicado — aplicar primero m014.');
  process.exit(2);
}
const alreadyApplied = pre[0].triggers_diferidos === 3;
console.log(alreadyApplied ? '→ fixes YA APLICADOS (modo verificación)' : '→ fixes PENDIENTES');

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
  console.error('\n--only-verify pero los fixes NO están aplicados: abortando sin escribir.');
  process.exit(3);
}

// ── FASE 2 · VERIFICACIÓN POST (read-only, fail-closed) ─────────────────────
console.log('\n── VERIFICACIÓN POST ─');
const checks = [];
{
  const post = await q(`SELECT
    (SELECT count(*)::int FROM pg_constraint c WHERE c.contype='t'
       AND c.conrelid IN ('public.transactions'::regclass,'public.devolutions'::regclass,'public.receipts'::regclass)
       AND c.conname LIKE 'fin_trg_%') AS diferidos,
    (SELECT count(*)::int FROM pg_trigger t
       WHERE t.tgrelid='public.payment_transactions'::regclass
         AND t.tgname='fin_trg_payment_transactions' AND t.tgisinternal=false) AS pago_inmediato,
    (SELECT position('v_txt' in pg_get_functiondef('public.fin_compute_metrics(text,uuid,text,uuid)'::regprocedure)) > 0) AS metricas_fix,
    (SELECT count(*)::int FROM public.fin_entries) AS asientos,
    (SELECT count(*)::int FROM public.fin_movements) AS movimientos`);
  checks.push(['3 CONSTRAINT TRIGGERS diferidos (transactions, devolutions, receipts)',
    post[0].diferidos === 3, `n=${post[0].diferidos}`]);
  checks.push(['trigger de pagos sigue INMEDIATO (métrica autocontenida)',
    post[0].pago_inmediato === 1, `n=${post[0].pago_inmediato}`]);
  checks.push(['fin_compute_metrics con variables tipadas (fix nómina/flujo/caja/cobros/recepción)',
    post[0].metricas_fix === true, `fix=${post[0].metricas_fix}`]);
  checks.push(['CERO asientos/movimientos (sin backfill no autorizado)',
    post[0].asientos === 0 && post[0].movimientos === 0, `e=${post[0].asientos} m=${post[0].movimientos}`]);
}
{
  const sentidos = await q(`SELECT
    (SELECT count(*)::int FROM public.fin_rule_versions rv, jsonb_array_elements(rv.movements) m
       WHERE rv.document_type='RECEPCION' AND rv.store_id IS NULL AND rv.version=1
         AND m->>'id'='r-pay-cxp' AND m->>'sentido'='debito') AS rec_ok,
    (SELECT count(*)::int FROM public.fin_rule_versions rv, jsonb_array_elements(rv.movements) m
       WHERE rv.document_type='SERVICIO_RECIBIDO' AND rv.store_id IS NULL AND rv.version=1
         AND m->>'id'='sp-cxp-c' AND m->>'sentido'='debito') AS srv_ok,
    (SELECT count(*)::int FROM public.fin_rule_versions rv, jsonb_array_elements(rv.movements) m
       WHERE rv.document_type IN ('RECEPCION','SERVICIO_RECIBIDO') AND rv.store_id IS NULL AND rv.version=1
         AND m->>'evento'='pago'
         AND ((m->>'sentido'='debito' AND (m->>'categoria') LIKE 'ACT_%')
           OR (m->>'sentido'='credito' AND (m->>'categoria') LIKE 'PAS_%'))) AS invertidos`);
  checks.push(['sentidos de pago: D PAS_CXP_PROV en recepción (r-pay-cxp)',
    sentidos[0].rec_ok === 1, `n=${sentidos[0].rec_ok}`]);
  checks.push(['sentidos de pago: D PAS_SERV_PEND en servicio (sp-cxp-c)',
    sentidos[0].srv_ok === 1, `n=${sentidos[0].srv_ok}`]);
  checks.push(['CERO movimientos de pago con sentidos invertidos (ACT débito / PAS crédito)',
    sentidos[0].invertidos === 0, `n=${sentidos[0].invertidos}`]);
}
{
  const audit = await q(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conname='audit_logs_store_id_check' AND conrelid='public.audit_logs'::regclass`);
  const def = audit[0]?.def || '';
  checks.push(['whitelist audit_logs tolera fin_rule_versions (reglas globales)',
    def.includes('fin_rule_versions'), def ? 'OK' : 'CONSTRAINT AUSENTE']);
  checks.push(['whitelist audit_logs conserva master_products y master_parties (sin regresión)',
    def.includes('master_products') && def.includes('master_parties'), 'OK']);
}
{
  const rls = await q(`SELECT c.relname AS tabla, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname LIKE 'fin_%'`);
  checks.push(['RLS FORCED intacto en las 8 tablas fin_* (m014)',
    rls.length === 8 && rls.every((t) => t.rls === true && t.forced === true),
    rls.map((t) => `${t.tabla.replace('fin_','')}:${t.rls && t.forced ? 'F' : 'NO'}`).join(' ')]);
}

let failed = 0;
for (const [name, ok, detail] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}
if (failed > 0) { console.error(`VERIFICACIÓN POST FALLÓ (${failed})`); process.exit(5); }

// ── FASE 3 · INTEGRIDAD ANTES == DESPUÉS (delta 0) ──────────────────────────
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

console.log(`\n══════════ M015 OK: fixes CP-FIN ${alreadyApplied ? 'VERIFICADOS (ya aplicados)' : 'APLICADOS y VERIFICADOS'} en producción ${ref}`);
for (const f of FILES) {
  const sql = readFileSync(resolve(process.cwd(), f), 'utf8');
  console.log(`  ${f} · SHA-256 ${createHash('sha256').update(sql).digest('hex')}`);
}
