#!/usr/bin/env node
/**
 * m009-inspeccion-live-prod.mjs — ADN-SERVICES-RECEIVED-POSTMERGE-HARDENING-009.
 * Inspección READ-ONLY del estado REAL de producción (CostproBD, wthkddeleylijmonclxg)
 * vía Management API (POST /database/query — solo SELECT/consulta de catálogos).
 *
 * Re-ejecutable (protocolo 11d). Requisitos:
 *   ALLOW_PROD=read-only SUPABASE_ACCESS_TOKEN=... node scripts/m009-inspeccion-live-prod.mjs
 * Guard CP-INFRA-019: assertNotProduction({mode:'read', projectRef}).
 *
 * Responde (misión 009 §2):
 *   A) ACL real (proacl) de las 6 funciones críticas.
 *   B) Contrato de medios del batch y del motor (prosrc — presencia de
 *      external_transfer / zelle / FOR UPDATE / has_store_access_as).
 *   C) Stream de migraciones: cola 202611* con version y applied_at
 *      (discrepancia de fechas de 20261121120000).
 *   D) Índice único de creation_key en audit_logs (¿existe?).
 *   E) fil_account_mapping external_transfer (filas canónicas live).
 *   F) Conteos de contexto (borradores, pagos, external_transfer en pagos).
 */
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD_REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido'); process.exit(2); }

assertNotProduction({ mode: 'read', projectRef: PROD_REF, context: 'm009-inspeccion-live-prod.mjs' });

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

const q = {
  acl: `SELECT p.proname,
        array_to_string(p.proacl::text[], ', ') AS proacl_text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN (
        'register_supplier_payment','register_supplier_payment_batch',
        'create_received_service_draft','update_received_service_draft',
        'set_received_service_status','fin_resolve_financial_account')
      ORDER BY p.proname;`,
  bodies: `SELECT p.proname,
        length(p.prosrc) AS src_len,
        (p.prosrc LIKE '%external_transfer%') AS has_external_transfer,
        (p.prosrc LIKE '%zelle%') AS has_zelle,
        (p.prosrc LIKE '%FOR UPDATE%') AS has_for_update,
        (p.prosrc LIKE '%has_store_access_as%') AS has_store_access_check,
        (p.prosrc LIKE '%can_manage%') AS has_manage_check,
        (p.prosrc LIKE '%creation_key%') AS has_creation_key,
        (p.prosrc LIKE '%advisory%') AS has_advisory
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname IN (
        'register_supplier_payment','register_supplier_payment_batch',
        'create_received_service_draft','update_received_service_draft',
        'set_received_service_status')
      ORDER BY p.proname;`,
  batch_whitelist: `SELECT p.proname, substring(p.prosrc from position('NOT IN (' in p.prosrc) for 120) AS whitelist_snippet
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='register_supplier_payment_batch';`,
  engine_whitelist: `SELECT p.proname, substring(p.prosrc from position('p_payment_method NOT IN' in p.prosrc) for 120) AS engine_check
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='register_supplier_payment';`,
  migrations: `SELECT version, name, applied_at, (applied_at::date - to_timestamp(version,'YYYYMMDDHH24MISS')::date) AS lag_days
      FROM supabase_migrations.schema_migrations
      WHERE version LIKE '202611%' ORDER BY version DESC LIMIT 12;`,
  creation_key_index: `SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname='public' AND tablename='audit_logs'
        AND indexdef LIKE '%creation_key%';`,
  mapping: `SELECT payment_method, currency, category_code, is_active
      FROM public.fin_account_mapping
      WHERE payment_method IN ('external_transfer','zelle') ORDER BY payment_method, currency;`,
  counts: `SELECT
      (SELECT count(*) FROM public.received_services WHERE status='draft') AS drafts,
      (SELECT count(*) FROM public.received_services) AS services_total,
      (SELECT count(*) FROM public.payment_transactions WHERE ref_type='service') AS service_payments,
      (SELECT count(*) FROM public.payment_transactions WHERE payment_method='external_transfer') AS ext_transfer_payments,
      (SELECT count(*) FROM public.payment_transactions WHERE payment_method='zelle') AS zelle_payments;`,
};

const out = {};
for (const [k, sql] of Object.entries(q)) {
  try { out[k] = await runSql(sql); }
  catch (e) { out[k] = [{ error: e.message }]; }
}
console.log(JSON.stringify(out, null, 2));
