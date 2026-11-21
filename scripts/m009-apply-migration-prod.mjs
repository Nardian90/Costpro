#!/usr/bin/env node
/**
 * m009-apply-migration-prod.mjs — ADN-SERVICES-RECEIVED-POSTMERGE-HARDENING-009.
 * Aplica la migración correctiva 20261121190000_adn009_sr_postmerge_hardening.sql
 * a PRODUCCIÓN (CostproBD, wthkddeleylijmonclxg) UNA SOLA VEZ (§11g regla de oro),
 * por el canal gobernado:
 *   · guard scripts/lib/assert-not-production.mjs (CP-INFRA-019) con el
 *     doble flag explícito del operador;
 *   · guard de DESTINO REAL (fix del hallazgo Codex P1 del PR #1670: el ref
 *     que se pasa a la Management API es el que se certifica);
 *   · verificación post-aplicación con marcas re-ejecutables (--check);
 *   · idempotente (CREATE OR REPLACE / DROP IF EXISTS / IF NOT EXISTS).
 * Requisitos de invocación:
 *   ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND \
 *   SUPABASE_ACCESS_TOKEN=... node scripts/m009-apply-migration-prod.mjs [--check]
 * Expediente: docs/audits/ADN-SR-POSTMERGE-HARDENING-009_2026-11-21.md.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD_REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');

if (!TOKEN) {
  console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido.');
  process.exit(2);
}

// GUARD CP-INFRA-019 — destino REAL (producción) + doble flag del operador.
const prodUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || `https://${PROD_REF}.supabase.co`;
assertNotProduction({ mode: 'write', url: prodUrl, context: 'm009-apply-migration-prod.mjs' });
// Certificación EXPLÍCITA del ref de la Management API (hallazgo Codex P1).
assertNotProduction({ mode: 'write', projectRef: PROD_REF, context: 'm009-apply-migration-prod.mjs' });

const MIGRATION = 'supabase/migrations/20261121190000_adn009_sr_postmerge_hardening.sql';

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 600)}`);
  return JSON.parse(text);
}

const MARKS = {
  supplier_master_column: `(SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='suppliers' AND column_name='master_party_id'))`,
  supplier_master_fk: `(SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.suppliers'::regclass AND conname='suppliers_master_party_id_fkey'))`,
  helper: `(SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='can_manage_store_as'
      AND p.prosrc LIKE '%encargado%'))`,
  engine_lock: `(SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='register_supplier_payment'
      AND position('FOR UPDATE' in p.prosrc) < position('Idempotencia' in p.prosrc)
      AND p.prosrc LIKE '%ERR_SERVICE_NOT_ACTIVE%'
      AND p.prosrc LIKE '%ERR_COMBINACION_NO_SOPORTADA%'))`,
  batch_contract: `(SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='register_supplier_payment_batch'
      AND p.prosrc LIKE '%external_transfer%'
      AND p.prosrc LIKE '%FOR UPDATE%'
      AND p.prosrc LIKE '%lower(v_method) = ''zelle''%'
      AND p.prosrc NOT LIKE '%''cash'', ''transfer'', ''zelle''%'))`,
  batch_acl_service_role_only: `(SELECT NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
      unnest(coalesce(p.proacl, acldefault('f', p.proowner))) a
    WHERE n.nspname='public' AND p.proname='register_supplier_payment_batch'
      AND a = 'authenticated=X/postgres'))`,
  drafts_mgmt_gate: `(SELECT (
    SELECT count(*) = 2 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('create_received_service_draft','update_received_service_draft')
      AND p.prosrc LIKE '%can_manage_store_as%'))`,
  patch_signature: `(SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='update_received_service_draft'
      AND array_length(proargnames, 1) = 3
      AND proargnames[3] = 'p_patch'
      AND p.prosrc LIKE '%AT TIME ZONE ''America/Havana''%'))`,
  old_signature_gone: `(SELECT NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace, unnest(p.proargtypes) t
    WHERE n.nspname='public' AND p.proname='update_received_service_draft'
    GROUP BY p.oid HAVING count(t) = 15))`,
  unique_index: `(SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='uq_audit_service_draft_creation_key'))`,
};

const CHECK_ONLY = process.argv.includes('--check');

if (!CHECK_ONLY) {
  const sql = readFileSync(join(REPO, MIGRATION), 'utf8');
  console.log(`[m009] Aplicando ${MIGRATION} a PRODUCCIÓN ${PROD_REF} (UNA vez, guard doble flag)...`);
  await runSql(sql);
  console.log('[m009] Lote aplicado sin error.');
}

let failed = 0;
for (const [name, q] of Object.entries(MARKS)) {
  const rows = await runSql(`SELECT (${q}) AS ok`);
  const ok = rows?.[0]?.ok === true;
  console.log(`  ${ok ? 'OK ' : 'FALLO'} — ${name}`);
  if (!ok) failed++;
}
if (failed > 0) {
  console.error(`[m009] ${failed} marca(s) en FALLO en PRODUCCIÓN — migración NO vigente.`);
  process.exit(1);
}
console.log(`[m009] ${Object.keys(MARKS).length}/${Object.keys(MARKS).length} marcas OK${CHECK_ONLY ? ' (check)' : ' — aplicada y verificada en producción'}.`);
