#!/usr/bin/env node
/**
 * cpsec-fx-apply-prod.mjs — CP-SEC-EXCHANGE-RATES-BACKUP-HARDENING-001.
 * ───────────────────────────────────────────────────────────────────────────
 * Aplica a PRODUCCIÓN (CostproBD, wthkddeleylijmonclxg) la migración ACL
 * 20261128173000_cpsec_fx_backup_private.sql UNA SOLA VEZ (regla de oro §11g),
 * por el canal gobernado (patrón cpbra-r06):
 *   · guard scripts/lib/assert-not-production.mjs con doble flag explícito;
 *   · PRE: captura del estado previo (RLS, grants, nº filas, hash de contenido,
 *     contadores pg_stat) + detección de «ya aplicada» (idempotente — si las
 *     marcas están, se SALTA);
 *   · aplicación UNA SOLA VEZ + NOTIFY pgrst (recarga PostgREST);
 *   · POST: verificación de marcas re-ejecutable (--check): RLS ON, grants
 *     anon/authenticated/PUBLIC = 0, comment documental, y DATOS INTACTOS
 *     (nº filas y hash de contenido PRE→POST idénticos: el endurecimiento
 *     NUNCA toca filas — FASE 5.7 conservación de datos históricos).
 *
 *   Check producción: node scripts/cpsec-fx-apply-prod.mjs --check
 *   Aplicación:      ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND \
 *                     node scripts/cpsec-fx-apply-prod.mjs
 * Expediente: docs/audits/CP-SEC-EXCHANGE-RATES-BACKUP-HARDENING-001/
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
const MIG_FILE = 'supabase/migrations/20261128173000_cpsec_fx_backup_private.sql';
const T = 'exchange_rates_backup_cpfx001';

if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerida.'); process.exit(2); }

const checkOnly = process.argv.includes('--check');
assertNotProduction({ mode: checkOnly ? 'read' : 'write', projectRef: PROD_REF, context: 'cpsec-fx-apply-prod.mjs' });

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

/* ── PRE: estado previo en producción (read-only) ───────────────────────── */
const pre = await runSql(`
  SELECT
    EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = '${T}' AND n.nspname = 'public' AND c.relkind = 'r') AS tabla_existe,
    (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = '${T}' AND n.nspname = 'public') AS rls_on,
    (SELECT count(*) FROM information_schema.role_table_grants g
      WHERE g.table_schema='public' AND g.table_name='${T}' AND g.grantee='anon') AS grants_anon,
    (SELECT count(*) FROM information_schema.role_table_grants g
      WHERE g.table_schema='public' AND g.table_name='${T}' AND g.grantee='authenticated') AS grants_auth,
    (SELECT count(*) FROM information_schema.role_table_grants g
      WHERE g.table_schema='public' AND g.table_name='${T}' AND g.grantee='PUBLIC') AS grants_public,
    (SELECT count(*)::int FROM public.${T}) AS filas,
    (SELECT md5(string_agg(concat_ws('|', rate_date::text, currency, source, segment, rate::text,
        coalesce(capture_method,''), coalesce(import_batch,'')), E'\\n' ORDER BY rate_date, source, segment)
      FROM public.${T}) ) AS content_hash;
`);
console.log('\n=== PRE (evidencia del estado previo en producción) ===');
const p = pre[0];
console.log(JSON.stringify(p, null, 1));

if (!p.tabla_existe) {
  console.error('\nFALLO: la tabla NO existe en producción — nada que endurecer. Abortando (unexpected).');
  process.exit(1);
}

/* ── Marcas POST re-ejecutables ─────────────────────────────────────────── */
async function checkMarks() {
  const post = await runSql(`
    SELECT
      (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname='${T}' AND n.nspname='public') AS rls_on,
      (SELECT count(*) FROM information_schema.role_table_grants g
        WHERE g.table_schema='public' AND g.table_name='${T}' AND g.grantee='anon') AS grants_anon,
      (SELECT count(*) FROM information_schema.role_table_grants g
        WHERE g.table_schema='public' AND g.table_name='${T}' AND g.grantee='authenticated') AS grants_auth,
      (SELECT count(*) FROM information_schema.role_table_grants g
        WHERE g.table_schema='public' AND g.table_name='${T}' AND g.grantee='PUBLIC') AS grants_public,
      (SELECT count(*)::int FROM public.${T}) AS filas,
      (SELECT md5(string_agg(concat_ws('|', rate_date::text, currency, source, segment, rate::text,
          coalesce(capture_method,''), coalesce(import_batch,'')), E'\\n' ORDER BY rate_date, source, segment)
        FROM public.${T})) AS content_hash,
      (SELECT obj_description('${T}'::regclass, 'pg_class') LIKE '%EXCLUSIVAMENTE PRIVADA%') AS comment_doc;
  `);
  const q = post[0];
  const marks = {
    rls_habilitada: q.rls_on === true,
    grants_anon_cero: Number(q.grants_anon) === 0,
    grants_authenticated_cero: Number(q.grants_auth) === 0,
    grants_public_cero: Number(q.grants_public) === 0,
    filas_conservadas: Number(q.filas) === Number(p.filas),
    hash_datos_intacto: q.content_hash === p.content_hash,
    comment_documental: q.comment_doc === true,
  };
  let allOk = true;
  for (const [k, ok] of Object.entries(marks)) {
    if (!ok) allOk = false;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${k}`);
  }
  return allOk;
}

if (p.rls_on && Number(p.grants_anon) === 0 && Number(p.grants_auth) === 0) {
  console.log('\n→ Endurecimiento YA APLICADO en producción (RLS on + grants revocados). Nada que hacer.');
  const ok = await checkMarks();
  process.exit(ok ? 0 : 1);
}

console.log('\nDestino: wthkddeleylijmonclxg (PRODUCCIÓN CostproBD)');

if (checkOnly) {
  console.log('\n== --check (no escribe) ==');
  const ok = await checkMarks();
  console.log(ok ? '\nCHECK OK — endurecimiento presente en producción.'
                  : '\nCHECK: marcas ausentes (migración NO aplicada en producción).');
  process.exit(ok ? 0 : 1);
}

console.log('\n== Aplicando (UNA SOLA VEZ) ==');
try {
  await runSql(readFileSync(sqlPath, 'utf8'));
  console.log('SQL ejecutado sin error (verificación fail-closed interna superada).');
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

console.log(`\nDatos históricos INTACTOS: ${p.filas} filas, hash ${String(p.content_hash).slice(0,12)}… PRE→POST idéntico.`);
console.log('\n→ Endurecimiento aplicado y verificado en producción (opción A: tabla exclusivamente privada).');
