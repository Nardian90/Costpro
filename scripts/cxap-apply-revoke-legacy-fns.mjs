#!/usr/bin/env node
/**
 * cxap-apply-revoke-legacy-fns.mjs — CP-AP-FORENSIC-RECONCILIATION-001.
 * ───────────────────────────────────────────────────────────────────────────
 * PROBLEMA: el SQL Security Gate (en vivo, read-only) falla en TODOS los PR
 * corrientes (incluido el #1708, previo a esta misión) por el hallazgo
 * preexistente secdef_public_grant: las funciones legado huérfanas
 * add_reception_items y save_pending_reception_changes (cero llamadores en
 * toda la aplicación) conservan el EXECUTE default de PostgreSQL para
 * anon/authenticated.
 *
 * Esta misión cierra el hallazgo con el patrón establecido del repo
 * (REVOKE — precedentes 20261025130000, 20261026180000, 20261113120700,
 * 20261120215000) mediante el canal gobernado:
 *   · guard CP-INFRA-019 (assert-not-production) con doble flag para escritura;
 *   · validación PREVIA en la BD aislada CostproE2E (regla de oro §11g);
 *   · marca re-ejecutable (ACL sin anon/authenticated), skip si ya aplicada;
 *   · verificación post-aplicación (--check).
 *
 * Uso:
 *   Validar en aislada:  node scripts/cxap-apply-revoke-legacy-fns.mjs --target e2e
 *   Chequear producción:  node scripts/cxap-apply-revoke-legacy-fns.mjs --check
 *   Aplicar (gobierno):   ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND \
 *                         node scripts/cxap-apply-revoke-legacy-fns.mjs
 * Expediente: docs/audits/CP-AP-FORENSIC-RECONCILIATION-001/INFORME.md
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

const target = process.argv.includes('--target') ? process.argv[process.argv.indexOf('--target') + 1] : 'prod';
const checkOnly = process.argv.includes('--check');

let projectRef;
if (target === 'e2e') {
  const e2eUrl = process.env.E2E_SUPABASE_URL || '';
  const ref = e2eUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!ref) { console.error('FALLO: E2E_SUPABASE_URL no disponible.'); process.exit(2); }
  projectRef = ref;
} else {
  projectRef = PROD_REF;
}
// --check NO escribe nunca: el guard lo trata como operación de lectura.
assertNotProduction({ mode: checkOnly ? 'read' : 'write', projectRef, context: 'cxap-apply-revoke-legacy-fns.mjs' });

const apiBase = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
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

const FILE = '20261125153000_cxap_revoke_legacy_reception_fns.sql';

/* Marca re-ejecutable: NINGÚN ejecutor anon/authenticated en las 2 funciones. */
const MARK = `
SELECT count(*) = 0 AS ok FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL (
  SELECT (aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner)))).grantee AS gid
) g
JOIN pg_roles r ON r.oid = g.gid
WHERE n.nspname = 'public'
  AND p.proname IN ('add_reception_items','save_pending_reception_changes')
  AND r.rolname IN ('anon','authenticated')`;

async function checkMark() {
  const rows = await runSql(`SELECT (${MARK}) AS ok`);
  return rows[0]?.ok === true;
}

console.log(`Destino: ${projectRef} ${target === 'e2e' ? '(BD aislada E2E — paso libre)' : '(PRODUCCIÓN CostproBD)'}`);

const already = await checkMark();
console.log(already ? '  MARCA PRESENTE: ACL ya sin anon/authenticated (ya aplicada).' : '  MARCA AUSENTE: las funciones aún tienen EXECUTE para anon/authenticated.');

if (already) {
  console.log('Nada que hacer. Estado verificado.');
  process.exit(0);
}
if (checkOnly) {
  console.log('--check: no se aplica nada. Ejecutar con doble flag para aplicar.');
  process.exit(1);
}

const sql = readFileSync(join(REPO, 'supabase/migrations', FILE), 'utf8');
console.log(`Aplicando ${FILE} (${sql.length} bytes)…`);
try {
  await runSql(sql);
  console.log('SQL ejecutado sin error.');
} catch (e) {
  console.error(`FALLO al aplicar: ${String(e.message).slice(0, 400)}`);
  process.exit(1);
}

const okNow = await checkMark();
if (!okNow) {
  console.error('FALLO: la marca sigue ausente tras aplicar. DETENER y diagnosticar.');
  process.exit(1);
}
console.log('→ Aplicada y verificada: ACL exclusiva {postgres, service_role}.');

/* Evidencia: ACL final de las 2 funciones. */
const evidence = await runSql(`
SELECT p.proname, array_agg(r.rolname ORDER BY r.rolname) AS ejecutores
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN LATERAL (SELECT (aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner)))).grantee AS gid) g ON true
LEFT JOIN pg_roles r ON r.oid = g.gid
WHERE n.nspname='public' AND p.proname IN ('add_reception_items','save_pending_reception_changes')
GROUP BY p.proname ORDER BY p.proname;`);
for (const row of evidence) console.log(`  ${row.proname} → ejecutores: ${row.ejecutores}`);
process.exit(0);
