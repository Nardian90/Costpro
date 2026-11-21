#!/usr/bin/env node
/**
 * m110-apply-migration-e2e.mjs — CP-FIN-AUDITORÍA-FORENSE-ENERVIDA-110.
 * Aplica la migración 20261122120000_cp_fin110_enervida_reconciliation_fix.sql
 * a la BD AISLADA CostproE2E (Management API + guard canónico de aislamiento,
 * destino certificado). Idempotente → re-ejecutable sin daño.
 *
 * Uso: SUPABASE_ACCESS_TOKEN=... node scripts/m110-apply-migration-e2e.mjs [--check]
 *   --check: solo verifica que funciones/reglas/trigger/marcas existen (sin aplicar).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_REF = 'lguovmvrozxgssupkwpf';
const SUPA_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const OUT = '/home/z/my-project/scripts/out/m110-audit';

if (!SUPA_TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido.'); process.exit(2); }

const { assertIsolatedDb } = await import(join(REPO, 'e2e', 'fixtures', 'assert-isolated-db.cjs'));
await assertIsolatedDb();

const MIGRATION = 'supabase/migrations/20261122120000_cp_fin110_enervida_reconciliation_fix.sql';

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${E2E_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 800)}`);
  return JSON.parse(body);
}

async function main() {
  if (process.argv.includes('--check')) {
    const checks = await runSql(`
      SELECT
        (SELECT prosrc LIKE '%ORDEN_TRABAJO%' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='fin_compute_metrics') AS metrica_orden,
        (SELECT count(*) FROM public.fin_rule_versions rv
          WHERE rv.document_type='ORDEN_TRABAJO' AND rv.store_id IS NULL AND rv.version=1 AND rv.status='active') AS regla_orden,
        (SELECT pg_get_triggerdef(oid) LIKE '%fin_trg_production_orders%' FROM pg_trigger
          WHERE tgname='fin_trg_production_orders') AS trigger_orden,
        (SELECT prosrc LIKE '%production_order%' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='fin_trg_payment_transactions') AS trigger_pt_orden,
        (SELECT prosrc LIKE '%%v2%' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='fin_get_reconciliation') AS recon_v2,
        (SELECT prosrc LIKE '%ORDEN_TRABAJO%' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='fin_generation_build') AS build_orden,
        (SELECT count(*) FROM public.fin_metric_catalog mc
          WHERE mc.document_type='ORDEN_TRABAJO' AND mc.metric='importe_pago_cup') AS metricas_orden,
        (SELECT trigger_status='completed' FROM public.fin_document_types WHERE code='ORDEN_TRABAJO') AS doctype_status`);
    console.log('CHECK E2E:', JSON.stringify(checks[0], null, 1));
    const allOk = Object.values(checks[0]).every(v => v === true || v >= 1);
    console.log(allOk ? 'MIGRACIÓN PRESENTE (8/8 marcas)' : 'MIGRACIÓN INCOMPLETA');
    process.exit(allOk ? 0 : 1);
  }

  const sql = readFileSync(join(REPO, MIGRATION), 'utf8');
  console.log(`Aplicando ${MIGRATION} (${sql.length} bytes) a BD aislada ${E2E_REF}...`);
  await runSql(sql);
  console.log('APLICADA. Verificando marcas...');
  const checks = await runSql(`
    SELECT
      (SELECT prosrc LIKE '%ORDEN_TRABAJO%' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='fin_compute_metrics') AS metrica_orden,
      (SELECT count(*) FROM public.fin_rule_versions rv
        WHERE rv.document_type='ORDEN_TRABAJO' AND rv.store_id IS NULL AND rv.version=1 AND rv.status='active') AS regla_orden,
      (SELECT count(*) FROM pg_trigger WHERE tgname='fin_trg_production_orders') AS trigger_orden,
      (SELECT count(*) FROM pg_trigger WHERE tgname='fin_trg_payment_transactions'
         AND tgrelid='public.payment_transactions'::regclass) AS trigger_pt,
      (SELECT count(*) FROM public.fin_metric_catalog mc
        WHERE mc.document_type='ORDEN_TRABAJO') AS metricas_orden,
      (SELECT trigger_status FROM public.fin_document_types WHERE code='ORDEN_TRABAJO') AS doctype_status,
      (SELECT (prosrc LIKE '%cob_cash_eur_cup%') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='fin_compute_metrics') AS fallback_cond_nueva`);
  writeFileSync(`${OUT}/m110-apply-e2e.json`, JSON.stringify(checks, null, 1));
  console.log('MARCAS:', JSON.stringify(checks[0], null, 1));
}

main().catch(err => { console.error('FALLO:', err.message); process.exit(1); });
