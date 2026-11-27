#!/usr/bin/env node
/**
 * cpbra-pc-apply-prod.mjs — CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 (§0.2).
 * ───────────────────────────────────────────────────────────────────────────
 * Aplica a PRODUCCIÓN (CostproBD, wthkddeleylijmonclxg) la migración §0.2
 * 20261127150000_cpbra_pay_commission_encargado.sql UNA SOLA VEZ (§11g),
 * por el canal gobernado (patrón cpbra-r26-apply-prod.mjs):
 *   · guard scripts/lib/assert-not-production.mjs con doble flag explícito;
 *   · verificación PREVIA de marcas (si están, se SALTA — idempotente);
 *   · NOTIFY pgrst 'reload schema' tras aplicar (mecanismo canónico);
 *   · verificación post-aplicación re-ejecutable (--check).
 *
 *   Check producción: node scripts/cpbra-pc-apply-prod.mjs --check
 *   Aplicación:       ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND \
 *                     node scripts/cpbra-pc-apply-prod.mjs
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
const MIG_FILE = 'supabase/migrations/20261127150000_cpbra_pay_commission_encargado.sql';
const FIRMA = 'p_payment_id uuid, p_payment_method text, p_reference text, p_currency text, p_exchange_rate numeric, p_paid_at timestamp with time zone, p_user_id uuid';

if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido.'); process.exit(2); }

const checkOnly = process.argv.includes('--check');
assertNotProduction({ mode: checkOnly ? 'read' : 'write', projectRef: PROD_REF, context: 'cpbra-pc-apply-prod.mjs' });

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
    (regexp_replace(pg_get_functiondef(p.oid), '--[^\\n]*', '', 'g') LIKE '%ARRAY[''admin'', ''manager'', ''encargado'']::text[]%') AS ya_gate_tres_roles,
    pg_get_function_identity_arguments(p.oid) AS firma,
    (SELECT coalesce(string_agg(distinct rg.grantee, ','), '')
       FROM information_schema.role_routine_grants rg
      WHERE rg.specific_schema = 'public' AND rg.routine_name = 'pay_commission'
        AND rg.privilege_type = 'EXECUTE') AS acl_execute
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'pay_commission'
    AND pg_get_function_identity_arguments(p.oid) = '${FIRMA}';
`);
console.log('\n=== PRE (evidencia del estado previo) ===');
console.log(JSON.stringify(pre, null, 1));
if (pre.length !== 1) { console.error('FALLO: firma certificada de pay_commission no encontrada — drift inesperado. ABORTAR.'); process.exit(1); }
const prev = pre[0];
if (prev.ya_gate_tres_roles === true) { console.log('\n→ §0.2 YA APLICADA en producción (gate tres roles presente). Nada que hacer.'); process.exit(0); }

const MARKS = {
  firma_preservada: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='pay_commission'
        AND pg_get_function_identity_arguments(p.oid) = '${FIRMA}')`,
  gate_tres_roles_en_codigo: `regexp_replace(pg_get_functiondef('public.pay_commission(uuid,text,text,text,numeric,timestamptz,uuid)'::regprocedure), '--[^\\n]*', '', 'g') LIKE '%ARRAY[''admin'', ''manager'', ''encargado'']::text[]%'`,
  rechazo_rol_intacto: `pg_get_functiondef('public.pay_commission(uuid,text,text,text,numeric,timestamptz,uuid)'::regprocedure) LIKE '%ERR_FORBIDDEN_ROLE%'`,
  advisory_cajon_intacto: `regexp_replace(pg_get_functiondef('public.pay_commission(uuid,text,text,text,numeric,timestamptz,uuid)'::regprocedure), '--[^\\n]*', '', 'g') LIKE '%pg_advisory_xact_lock%'`,
  guard_fisico_intacto: `regexp_replace(pg_get_functiondef('public.pay_commission(uuid,text,text,text,numeric,timestamptz,uuid)'::regprocedure), '--[^\\n]*', '', 'g') LIKE '%ERR_INSUFFICIENT_CURRENCY%'`,
  regla_actor_intacta: `regexp_replace(pg_get_functiondef('public.pay_commission(uuid,text,text,text,numeric,timestamptz,uuid)'::regprocedure), '--[^\\n]*', '', 'g') LIKE '%auth.role() = ''service_role''%'`,
  acl_invariante: `(SELECT string_agg(distinct rg.grantee, ',') LIKE '%service_role%' AND string_agg(distinct rg.grantee, ',') LIKE '%authenticated%' AND string_agg(distinct rg.grantee, ',') NOT LIKE '%anon%'
       FROM information_schema.role_routine_grants rg
      WHERE rg.specific_schema='public' AND rg.routine_name='pay_commission' AND rg.privilege_type='EXECUTE')`,
  security_definer: `(SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='pay_commission'
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

const post = await runSql(`
  SELECT md5(pg_get_functiondef(p.oid)) AS body_hash_post
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='pay_commission'
    AND pg_get_function_identity_arguments(p.oid) = '${FIRMA}';`);
console.log(`\nbody_hash prev (gate admin|manager): ${prev.body_hash_prev}`);
console.log(`body_hash post (gate tres roles §0.2): ${post[0]?.body_hash_post}`);
console.log('\n→ §0.2 pay_commission aplicada y verificada en producción.');
