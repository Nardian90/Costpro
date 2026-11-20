#!/usr/bin/env node
/**
 * m009-apply-migration-e2e.mjs — ADN-SERVICES-RECEIVED-POSTMERGE-HARDENING-009.
 * Aplica la migración correctiva 20261121190000_adn009_sr_postmerge_hardening.sql
 * a la BD AISLADA CostproE2E (Management API, lote único, idempotente).
 * Re-ejecutable: [--check] solo verifica marcas (sin aplicar).
 *
 * FIX Codex P1 (PR #1670, comentario L26): el guard valida el DESTINO REAL de
 * la escritura — no solo la config del entorno. assertNotProduction se invoca
 * con projectRef: E2E_REF (el ref que se pasa a la Management API); para un
 * ref E2E conocido pasa libremente, y si el ref algún día dejara de serlo,
 * el guard lo bloquea fail-closed.
 *
 * Uso: node scripts/m009-apply-migration-e2e.mjs [--check]
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const E2E_REF = 'lguovmvrozxgssupkwpf';
const SUPA_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');

if (!SUPA_TOKEN) {
  console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido.');
  process.exit(2);
}

// GUARD CP-INFRA-019 sobre el DESTINO REAL de la escritura (Management API).
assertNotProduction({ mode: 'write', projectRef: E2E_REF, context: 'm009-apply-migration-e2e.mjs' });

// Doble barrera de aislamiento (centinela en la BD destino).
const { assertIsolatedDb } = await import(join(REPO, 'e2e', 'fixtures', 'assert-isolated-db.cjs'));
await assertIsolatedDb();

const MIGRATION = 'supabase/migrations/20261121190000_adn009_sr_postmerge_hardening.sql';

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${E2E_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 600)}`);
  return JSON.parse(body);
}

// Marcas re-ejecutables (--check): firmas, contratos y ACL objetivo.
const MARKS = {
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
  console.log(`[m009] Aplicando ${MIGRATION} a BD aislada ${E2E_REF} (lote único, idempotente)...`);
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
  console.error(`[m009] ${failed} marca(s) en FALLO — migración NO vigente.`);
  process.exit(1);
}
console.log(`[m009] ${Object.keys(MARKS).length}/${Object.keys(MARKS).length} marcas OK${CHECK_ONLY ? ' (check)' : ' — aplicada y verificada'}.`);
