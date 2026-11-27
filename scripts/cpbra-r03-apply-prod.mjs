#!/usr/bin/env node
/**
 * cpbra-r03-apply-prod.mjs — CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 (R-03).
 * ───────────────────────────────────────────────────────────────────────────
 * Aplica a PRODUCCIÓN (CostproBD, wthkddeleylijmonclxg) la migración R-03
 * 20261127140000_cpbra_r03_ot_payment_batch.sql UNA SOLA VEZ (§11g),
 * por el canal gobernado (patrón cpbra-r26-apply-prod.mjs):
 *   · guard scripts/lib/assert-not-production.mjs con doble flag explícito;
 *   · verificación PREVIA de marcas (si están, se SALTA — idempotente);
 *   · NOTIFY pgrst 'reload schema' tras aplicar (mecanismo canónico);
 *   · verificación post-aplicación re-ejecutable (--check).
 *
 *   Check producción: node scripts/cpbra-r03-apply-prod.mjs --check
 *   Aplicación:       ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND \
 *                     node scripts/cpbra-r03-apply-prod.mjs
 * Expediente: docs/audits/CP-BRA-FINAL-COMPLIANCE-CLOSURE-001/
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
const MIG_FILE = 'supabase/migrations/20261127140000_cpbra_r03_ot_payment_batch.sql';
const FIRMA = 'p_store_id uuid, p_ref_type text, p_ref_id uuid, p_payments jsonb, p_paid_by uuid, p_payment_date timestamp with time zone, p_idempotency_key text';
const FIRMA_MOTOR = 'p_store_id uuid, p_ref_type text, p_ref_id uuid, p_amount numeric, p_payment_method text, p_paid_by uuid, p_currency text, p_exchange_rate numeric, p_reference text, p_notes text, p_idempotency_key text, p_payment_date timestamp with time zone';

if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido.'); process.exit(2); }

const checkOnly = process.argv.includes('--check');
assertNotProduction({ mode: checkOnly ? 'read' : 'write', projectRef: PROD_REF, context: 'cpbra-r03-apply-prod.mjs' });

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
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'register_ot_payment_batch') AS ya_existe,
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'register_supplier_payment'
        AND pg_get_function_identity_arguments(p.oid) = '${FIRMA_MOTOR}') AS motor_certificado;
`);
console.log('\n=== PRE (evidencia del estado previo) ===');
console.log(JSON.stringify(pre, null, 1));
if (pre[0]?.ya_existe > 0) { console.log('\n→ R-03 YA APLICADA en producción (register_ot_payment_batch existe). Nada que hacer.'); process.exit(0); }
if (pre[0]?.motor_certificado !== 1) { console.error('FALLO: el motor single certificado no tiene la firma esperada — drift inesperado. ABORTAR.'); process.exit(1); }

const MARKS = {
  firma_nueva: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='register_ot_payment_batch'
        AND pg_get_function_identity_arguments(p.oid) = '${FIRMA}')`,
  gate_ot_exclusivo: `regexp_replace(pg_get_functiondef('public.register_ot_payment_batch(uuid,text,uuid,jsonb,uuid,timestamptz,text)'::regprocedure), '--[^\\n]*', '', 'g') LIKE '%ERR_REF_TYPE_INVALID%'`,
  lock_ot: `regexp_replace(pg_get_functiondef('public.register_ot_payment_batch(uuid,text,uuid,jsonb,uuid,timestamptz,text)'::regprocedure), '--[^\\n]*', '', 'g') LIKE '%production_orders WHERE id = p_ref_id FOR UPDATE%'`,
  neteo_contrafilas: `regexp_replace(pg_get_functiondef('public.register_ot_payment_batch(uuid,text,uuid,jsonb,uuid,timestamptz,text)'::regprocedure), '--[^\\n]*', '', 'g') LIKE '%CASE WHEN COALESCE(pt.direction, ''in'') = ''reversal'' THEN%'`,
  via_motor_single: `regexp_replace(pg_get_functiondef('public.register_ot_payment_batch(uuid,text,uuid,jsonb,uuid,timestamptz,text)'::regprocedure), '--[^\\n]*', '', 'g') LIKE '%public.register_supplier_payment(%'`,
  acl_service_role_exclusiva: `(SELECT string_agg(distinct rg.grantee, ',') LIKE '%service_role%' AND string_agg(distinct rg.grantee, ',') NOT LIKE '%authenticated%' AND string_agg(distinct rg.grantee, ',') NOT LIKE '%anon%'
       FROM information_schema.role_routine_grants rg
      WHERE rg.specific_schema='public' AND rg.routine_name='register_ot_payment_batch' AND rg.privilege_type='EXECUTE')`,
  security_definer: `(SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='register_ot_payment_batch'
        AND pg_get_function_identity_arguments(p.oid) = '${FIRMA}')`,
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
  console.log(ok ? '\nCHECK OK — gate §0.2 presente en producción.' : '\nCHECK: marcas ausentes (migración NO aplicada).');
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

console.log('\n== Verificación PRE guard: el motor single permanece intacto ==');
const motorPost = await runSql(`
  SELECT count(*) AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='register_supplier_payment'
    AND pg_get_function_identity_arguments(p.oid) = '${FIRMA_MOTOR}';`);
if (motorPost[0]?.n !== 1) { console.error('FALLO: el motor single se alteró — DETENER.'); process.exit(1); }
console.log('  OK  motor_single_intacto');

console.log('\n→ R-03 register_ot_payment_batch aplicada y verificada en producción.');
