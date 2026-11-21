#!/usr/bin/env node
/**
 * m110-apply-migration-prod.mjs — CP-FIN-AUDITORÍA-FORENSE-ENERVIDA-110.
 * Aplica la migración 20261122120000_cp_fin110_enervida_reconciliation_fix.sql
 * a PRODUCCIÓN (wthkddeleylijmonclxg) por el canal gobernado (Management API),
 * UNA SOLA VEZ (§11g), con doble flag CP-INFRA-019 + guard projectRef.
 * Idempotente (CREATE OR REPLACE / WHERE NOT EXISTS) → re-ejecutable sin daño.
 *
 * Uso: ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND SUPABASE_ACCESS_TOKEN=... \
 *        node scripts/m110-apply-migration-prod.mjs [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD_REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = '/home/z/my-project/scripts/out/m110-audit';
if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido'); process.exit(2); }

const MIGRATION = 'supabase/migrations/20261122120000_cp_fin110_enervida_reconciliation_fix.sql';

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 800)}`);
  return JSON.parse(text);
}

const MARKS = {
  metrica_orden: `SELECT (prosrc LIKE '%ORDEN_TRABAJO%') AS ok FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='fin_compute_metrics'`,
  riel_primacia: `SELECT (prosrc LIKE '%cob_cash_eur_cup%') AS ok FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='fin_compute_metrics'`,
  regla_orden: `SELECT (count(*) = 1) AS ok FROM public.fin_rule_versions rv
    WHERE rv.document_type='ORDEN_TRABAJO' AND rv.store_id IS NULL AND rv.version=1 AND rv.status='active'`,
  trigger_orden: `SELECT (count(*) = 1) AS ok FROM pg_trigger WHERE tgname='fin_trg_production_orders'`,
  trigger_pt: `SELECT (prosrc LIKE '%production_order%') AS ok FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='fin_trg_payment_transactions'`,
  build_orden: `SELECT (prosrc LIKE '%ORDEN_TRABAJO%') AS ok FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='fin_generation_build'`,
  recon_v2: `SELECT (prosrc LIKE '%CP-FIN-REC-001/v2%') AS ok FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='fin_get_reconciliation'`,
  doctype: `SELECT (trigger_status = 'completed') AS ok FROM public.fin_document_types WHERE code='ORDEN_TRABAJO'`,
};

async function main() {
  const mode = process.argv.includes('--check') ? 'read' : 'write';
  assertNotProduction({ mode, projectRef: PROD_REF, context: 'm110-apply-migration-prod.mjs' });

  if (mode === 'write') {
    const sql = readFileSync(join(REPO, MIGRATION), 'utf8');
    console.log(`Aplicando ${MIGRATION} (${sql.length} bytes) a PRODUCCIÓN...`);
    await runSql(sql);
    console.log('APLICADA.');
  }

  const results = {};
  for (const [k, q] of Object.entries(MARKS)) {
    const r = await runSql(q);
    results[k] = r[0].ok;
  }
  writeFileSync(`${OUT}/m110-apply-prod-marcas.json`, JSON.stringify(results, null, 1));
  console.log('MARCAS 8/8:', JSON.stringify(results, null, 1));
  const ok = Object.values(results).every(Boolean);
  console.log(ok ? 'APLICACIÓN VERIFICADA (re-ejecutable con --check)' : 'INCOMPLETA');
  process.exit(ok ? 0 : 1);
}

main().catch(err => { console.error('FALLO:', err.message); process.exit(1); });
