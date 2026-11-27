#!/usr/bin/env node
/**
 * cpbra-r05-apply-prod.mjs — CP-BRA-R05-APPROVAL-AND-R25-R26-REMEDIATION-001.
 * ───────────────────────────────────────────────────────────────────────────
 * Aplica a PRODUCCIÓN (CostproBD, wthkddeleylijmonclxg) la migración R-05
 * 20261126170000_cpbra_r05_adjustment_confirmation_role_guard.sql UNA SOLA
 * VEZ (regla de oro §11g), por el canal gobernado:
 *   · guard scripts/lib/assert-not-production.mjs (CP-INFRA-019) con el
 *     doble flag explícito del operador;
 *   · verificación PREVIA de marcas (si están, se SALTA — idempotente);
 *   · SHA256 del archivo versionado registrado en el expediente;
 *   · NOTIFY pgrst 'reload schema' tras aplicar (mecanismo canónico);
 *   · verificación post-aplicación re-ejecutable (--check).
 *
 * Pre-validado en la BD aislada CostproE2E (cpbra-r05-apply-e2e.mjs,
 * batería de autorización 16/16 — misión anterior).
 *
 *   Check producción: node scripts/cpbra-r05-apply-prod.mjs --check
 *   Aplicación:       ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND \
 *                     node scripts/cpbra-r05-apply-prod.mjs
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
const MIG_FILE = 'supabase/migrations/20261126170000_cpbra_r05_adjustment_confirmation_role_guard.sql';

if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido.'); process.exit(2); }

const checkOnly = process.argv.includes('--check');
assertNotProduction({ mode: checkOnly ? 'read' : 'write', projectRef: PROD_REF, context: 'cpbra-r05-apply-prod.mjs' });

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

// SHA256 del archivo versionado (debe coincidir con e2e-migrations-manifest.json)
const sqlPath = join(REPO, MIG_FILE);
const fileSha = createHash('sha256').update(readFileSync(sqlPath)).digest('hex');
console.log(`[sha256] ${MIG_FILE}\n  ${fileSha}`);
console.log(`  esperado (manifest INFRA-011): 5f5fe8a87ab0ea7e9e46b99dc093e3c44b7b31dd5fe127ea71664b0bef56e37a`);

/* ── PRE: evidencia del estado previo + drift inesperado ─────────────────── */
const pre = await runSql(`
  SELECT
    md5(pg_get_functiondef(p.oid)) AS body_hash_prev,
    p.prosecdef AS security_definer,
    (p.proconfig IS NOT NULL AND array_to_string(p.proconfig, ',') LIKE '%search_path%') AS search_path_fijo,
    pg_get_function_identity_arguments(p.oid) AS firma,
    (pg_get_functiondef(p.oid) LIKE '%ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED%') AS guard_r05_ya,
    (regexp_replace(pg_get_functiondef(p.oid), '--[^\\n]*', '', 'g') LIKE '%has_store_access_as%') AS hueco_vigente,
    (SELECT coalesce(string_agg(distinct rg.grantee, ',' ORDER BY rg.grantee), '')
       FROM information_schema.role_routine_grants rg
      WHERE rg.specific_schema = 'public' AND rg.routine_name = 'confirm_inventory_adjustment'
        AND rg.privilege_type = 'EXECUTE') AS acl_execute,
    (SELECT count(*) FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
      WHERE n2.nspname = 'public' AND p2.proname = 'has_store_role_as'
        AND pg_get_function_identity_arguments(p2.oid) = 'p_user_id uuid, p_store_id uuid, p_roles text[]') AS helper_ok
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'confirm_inventory_adjustment'
    AND pg_get_function_identity_arguments(p.oid) = 'p_adjustment_id uuid, p_user_id uuid';
`);
console.log('\n=== PRE (evidencia del estado previo) ===');
console.log(JSON.stringify(pre, null, 1));
if (pre.length !== 1) { console.error('FALLO: firma certificada no encontrada — drift inesperado. ABORTAR.'); process.exit(1); }
const prev = pre[0];
if (prev.helper_ok !== 1) { console.error('FALLO: has_store_role_as(uuid,uuid,text[]) no existe — abortando.'); process.exit(1); }
if (prev.guard_r05_ya === true) { console.log('\n→ R-05 YA APLICADA en producción (guard presente). Nada que hacer.'); process.exit(0); }

/* ── Marcas re-ejecutables ───────────────────────────────────────────────── */
const MARKS = {
  firma_preservada: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='confirm_inventory_adjustment'
        AND pg_get_function_identity_arguments(p.oid) = 'p_adjustment_id uuid, p_user_id uuid')`,
  guard_rol_en_codigo: `regexp_replace(pg_get_functiondef('public.confirm_inventory_adjustment(uuid,uuid)'::regprocedure), '--[^\\n]*', '', 'g') LIKE '%has_store_role_as%'`,
  err_not_allowed: `pg_get_functiondef('public.confirm_inventory_adjustment(uuid,uuid)'::regprocedure) LIKE '%ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED%'`,
  auditoria_transaccional: `pg_get_functiondef('public.confirm_inventory_adjustment(uuid,uuid)'::regprocedure) LIKE '%ADJUSTMENT_CONFIRMED%'`,
  hueco_eliminado: `NOT (regexp_replace(pg_get_functiondef('public.confirm_inventory_adjustment(uuid,uuid)'::regprocedure), '--[^\\n]*', '', 'g') LIKE '%has_store_access_as%')`,
  maquina_estados: `(pg_get_functiondef('public.confirm_inventory_adjustment(uuid,uuid)'::regprocedure) LIKE '%ERR_ADJUSTMENT_NOT_FOUND%'
      AND pg_get_functiondef('public.confirm_inventory_adjustment(uuid,uuid)'::regprocedure) LIKE '%ERR_NOT_PENDING%'
      AND pg_get_functiondef('public.confirm_inventory_adjustment(uuid,uuid)'::regprocedure) LIKE '%FOR UPDATE%')`,
  kardex_invariante: `(pg_get_functiondef('public.confirm_inventory_adjustment(uuid,uuid)'::regprocedure) LIKE '%p_movement_type := ''adjustment''%'
      AND pg_get_functiondef('public.confirm_inventory_adjustment(uuid,uuid)'::regprocedure) LIKE '%p_unit_cost := 0%')`,
  acl_certificada: `(SELECT string_agg(distinct rg.grantee, ',') LIKE '%authenticated%' AND string_agg(distinct rg.grantee, ',') LIKE '%service_role%'
       AND string_agg(distinct rg.grantee, ',') NOT LIKE '%anon%'
       FROM information_schema.role_routine_grants rg
      WHERE rg.specific_schema='public' AND rg.routine_name='confirm_inventory_adjustment' AND rg.privilege_type='EXECUTE')`,
  security_definer: `(SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='confirm_inventory_adjustment'
        AND pg_get_function_identity_arguments(p.oid) = 'p_adjustment_id uuid, p_user_id uuid')`,
  search_path_fijo: `(SELECT proconfig IS NOT NULL AND array_to_string(proconfig, ',') LIKE '%search_path%public%'
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='confirm_inventory_adjustment'
        AND pg_get_function_identity_arguments(p.oid) = 'p_adjustment_id uuid, p_user_id uuid')`,
  helper_existe: `(SELECT count(*) = 1 FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
      WHERE n2.nspname='public' AND p2.proname='has_store_role_as'
        AND pg_get_function_identity_arguments(p2.oid) = 'p_user_id uuid, p_store_id uuid, p_roles text[]')`,
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
  console.log(ok ? '\nCHECK OK — R-05 presente en producción.' : '\nCHECK: marcas ausentes (migración NO aplicada).');
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
  WHERE n.nspname='public' AND p.proname='confirm_inventory_adjustment'
    AND pg_get_function_identity_arguments(p.oid) = 'p_adjustment_id uuid, p_user_id uuid';`);
console.log(`\nbody_hash prev: ${prev.body_hash_prev}`);
console.log(`body_hash post: ${post[0]?.body_hash_post}`);
console.log('\n→ R-05 aplicada y verificada en producción.');
