#!/usr/bin/env node
/**
 * cpbra-r26-apply-prod.mjs — CP-BRA-R05-APPROVAL-AND-R25-R26-REMEDIATION-001.
 * ───────────────────────────────────────────────────────────────────────────
 * Aplica a PRODUCCIÓN (CostproBD, wthkddeleylijmonclxg) la migración R-26
 * 20261127120000_cpbra_r26_batch_reversal_netting.sql UNA SOLA VEZ (§11g),
 * por el canal gobernado (patrón cpbra-r05-apply-prod.mjs):
 *   · guard scripts/lib/assert-not-production.mjs con doble flag explícito;
 *   · verificación PREVIA de marcas (si están, se SALTA — idempotente);
 *   · NOTIFY pgrst 'reload schema' tras aplicar (mecanismo canónico);
 *   · verificación post-aplicación re-ejecutable (--check).
 *
 *   Check producción: node scripts/cpbra-r26-apply-prod.mjs --check
 *   Aplicación:       ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND \
 *                     node scripts/cpbra-r26-apply-prod.mjs
 * Expediente: docs/audits/CP-BRA-R05-APPROVAL-AND-R25-R26-REMEDIATION-001/
 * ───────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD_REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const MIG_FILE = 'supabase/migrations/20261127120000_cpbra_r26_batch_reversal_netting.sql';

if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido.'); process.exit(2); }

const checkOnly = process.argv.includes('--check');
assertNotProduction({ mode: checkOnly ? 'read' : 'write', projectRef: PROD_REF, context: 'cpbra-r26-apply-prod.mjs' });

const apiBase = `https://api.supabase.com/v1/projects/${PROD_REF}/database/query`;
async function runSql(query) {
  const res = await fetch(apiBase, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

const sqlPath = join(REPO, MIG_FILE);
const fileSha = createHash('sha256').update(readFileSync(sqlPath)).digest('hex');
console.log(`[sha256] ${MIG_FILE}\n  ${fileSha}`);

const pre = await runSql(`
  SELECT
    md5(pg_get_functiondef(p.oid)) AS body_hash_prev,
    p.prosecdef AS security_definer,
    (regexp_replace(pg_get_functiondef(p.oid), '--[^\\n]*', '', 'g') LIKE '%CASE WHEN COALESCE(pt.direction, ''in'') = ''reversal'' THEN%') AS ya_netea,
    pg_get_function_identity_arguments(p.oid) AS firma,
    (SELECT coalesce(string_agg(distinct rg.grantee, ','), '')
       FROM information_schema.role_routine_grants rg
      WHERE rg.specific_schema = 'public' AND rg.routine_name = 'register_supplier_payment_batch'
        AND rg.privilege_type = 'EXECUTE') AS acl_execute
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'register_supplier_payment_batch'
    AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_ref_type text, p_ref_id uuid, p_payments jsonb, p_paid_by uuid, p_payment_date timestamp with time zone, p_idempotency_key text';
`);
console.log('\n=== PRE (evidencia del estado previo) ===');
console.log(JSON.stringify(pre, null, 1));
if (pre.length !== 1) { console.error('FALLO: firma certificada del batch no encontrada — drift inesperado. ABORTAR.'); process.exit(1); }
const prev = pre[0];
if (prev.ya_netea === true) { console.log('\n→ R-26 YA APLICADA en producción (neteo presente). Nada que hacer.'); process.exit(0); }

const MARKS = {
  firma_preservada: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='register_supplier_payment_batch'
        AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_ref_type text, p_ref_id uuid, p_payments jsonb, p_paid_by uuid, p_payment_date timestamp with time zone, p_idempotency_key text')`,
  neteo_contrafilas_en_codigo: `regexp_replace(pg_get_functiondef('public.register_supplier_payment_batch(uuid,text,uuid,jsonb,uuid,timestamptz,text)'::regprocedure), '--[^\\n]*', '', 'g') LIKE '%CASE WHEN COALESCE(pt.direction, ''in'') = ''reversal'' THEN%'`,
  overpay_intacto: `pg_get_functiondef('public.register_supplier_payment_batch(uuid,text,uuid,jsonb,uuid,timestamptz,text)'::regprocedure) LIKE '%ERR_BATCH_OVERPAY%'`,
  replay_fast_path_intacto: `pg_get_functiondef('public.register_supplier_payment_batch(uuid,text,uuid,jsonb,uuid,timestamptz,text)'::regprocedure) LIKE '%replayed%'`,
  acl_service_role_exclusiva: `(SELECT string_agg(distinct rg.grantee, ',') LIKE '%service_role%' AND string_agg(distinct rg.grantee, ',') NOT LIKE '%authenticated%' AND string_agg(distinct rg.grantee, ',') NOT LIKE '%anon%'
       FROM information_schema.role_routine_grants rg
      WHERE rg.specific_schema='public' AND rg.routine_name='register_supplier_payment_batch' AND rg.privilege_type='EXECUTE')`,
  security_definer: `(SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='register_supplier_payment_batch'
        AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_ref_type text, p_ref_id uuid, p_payments jsonb, p_paid_by uuid, p_payment_date timestamp with time zone, p_idempotency_key text')`,
};

async function checkMarks() {
  let allOk = true;
  for (const [k, q] of Object.entries(MARKS)) {
    const rows = await runSql(`SELECT (${q}) AS ok`);
    const ok = rows[0]?.ok === true;
    if (!ok) allOk = false;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${k}`);
  }
  return allOk;
}

console.log('\nDestino: wthkddeleylijmonclxg (PRODUCCIÓN CostproBD)');

if (checkOnly) {
  console.log('\n== --check (no escribe) ==');
  const ok = await checkMarks();
  console.log(ok ? '\nCHECK OK — R-26 presente en producción.' : '\nCHECK: marcas ausentes (migración NO aplicada).');
  process.exit(ok ? 0 : 1);
}

console.log('\n== Aplicando (UNA SOLA VEZ) ==');
try {
  await runSql(readFileSync(sqlPath, 'utf8'));
  console.log('SQL ejecutado sin error.');
} catch (e) {
  console.error(`FALLO al aplicar: ${String(e.message).slice(0, 400)}`);
  process.exit(1);
}

console.log('\n== Recarga PostgREST (mecanismo canónico) ==');
await runSql("NOTIFY pgrst, 'reload schema';");
console.log("NOTIFY pgrst 'reload schema' enviado.");

console.log('\n== POST: verificación de marcas ==');
const okNow = await checkMarks();
if (!okNow) { console.error('FALLO: marcas ausentes tras aplicar. DETENER y diagnosticar.'); process.exit(1); }

const post = await runSql(`
  SELECT md5(pg_get_functiondef(p.oid)) AS body_hash_post
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='register_supplier_payment_batch'
    AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_ref_type text, p_ref_id uuid, p_payments jsonb, p_paid_by uuid, p_payment_date timestamp with time zone, p_idempotency_key text';`);
console.log(`\nbody_hash prev (defecto F011-002): ${prev.body_hash_prev}`);
console.log(`body_hash post (neteo R-26):      ${post[0]?.body_hash_post}`);
console.log('\n→ R-26 aplicada y verificada en producción.');
