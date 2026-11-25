#!/usr/bin/env node
/**
 * cp-pos-apply-migration-prod.mjs — CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 (cierre).
 * ───────────────────────────────────────────────────────────────────────────
 * APLICACIÓN CONTROLADA EN PRODUCCIÓN (CostproBD, wthkddeleylijmonclxg) de la
 * migración del ciclo CP-POS (PR #1708, merge a3f398a88):
 *   · 20261125120000_cp_pos_per_item_payments.sql
 *     (col transaction_items.payment_distributions + create_sale_v2 /35 con
 *      items[].payments + p_customer_ci + hash de idempotencia ampliado +
 *      reconciliación de ACLs).
 *
 * Canal gobernado (mismo contrato que scripts/cpops-apply-migrations-prod.mjs
 * y scripts/m012-aplicar-migracion-20261112120000.mjs):
 *   · guard scripts/lib/assert-not-production.mjs (CP-INFRA-019) con el
 *     doble flag explícito del operador para escribir en producción;
 *   · verificación PREVIA de marcas (si ya están, la migración se SALTA);
 *   · verificación post-aplicación re-ejecutable (--check);
 *   · NOTIFY pgrst, 'reload schema' (procedimiento oficial post-DDL);
 *   · idempotencia de la migración verificada en la misión
 *     (ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE + DROP IF EXISTS).
 *
 * Validación previa (§11g): la migración YA está aplicada y validada en la
 * BD aislada CostproE2E (replay manifiesto + E2E pos-checkout 21/21 del
 * PR #1708; E2E Aislado success en head 4e2631013).
 *
 * Uso:
 *   Contraste con la aislada:  node scripts/cp-pos-apply-migration-prod.mjs --target e2e --check
 *   Verificación producción:   node scripts/cp-pos-apply-migration-prod.mjs --check
 *   Aplicación (flags):        ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND \
 *                              node scripts/cp-pos-apply-migration-prod.mjs
 * Expediente: docs/audits/APLICACION_MIGRACION_20261125120000_PRODUCCION.md
 * ───────────────────────────────────────────────────────────────────────────
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
  projectRef = ref; // el guard clasifica CostproE2E como ref E2E conocido (paso libre)
} else {
  projectRef = PROD_REF; // producción: exige los doble flags para escritura
}
// --check NO escribe nunca: el guard lo trata como operación de lectura.
assertNotProduction({ mode: checkOnly ? 'read' : 'write', projectRef, context: 'cp-pos-apply-migration-prod.mjs' });

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

/* ── Marcas re-ejecutables (todas deben dar true) ────────────────────────── */
const MIGRATIONS = [
  {
    file: '20261125120000_cp_pos_per_item_payments.sql',
    marks: {
      col_payment_distributions: `(SELECT count(*) = 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='transaction_items' AND column_name='payment_distributions')`,
      sobrecarga_unica: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='create_sale_v2')`,
      firma_35_args: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='create_sale_v2' AND array_length(p.proargnames,1) = 35)`,
      p_customer_ci_ultimo_param: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='create_sale_v2' AND array_length(p.proargnames,1) = 35
          AND p.proargnames[35] = 'p_customer_ci')`,
      validacion_fail_closed: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='create_sale_v2' AND array_length(p.proargnames,1) = 35
          AND p.prosrc LIKE '%ERR_ITEM_PAYMENTS_INVALID%')`,
      persistencia_distribucion: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='create_sale_v2' AND array_length(p.proargnames,1) = 35
          AND p.prosrc LIKE '%payment_distributions%')`,
      hash_idempotencia_ampliado: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='create_sale_v2' AND array_length(p.proargnames,1) = 35
          AND p.prosrc LIKE '%payments%' AND p.prosrc LIKE '%p_customer_ci%')`,
      acl_service_role: `(SELECT count(*) >= 1 FROM (
          SELECT (aclexplode(p.proacl)).grantee AS gid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname='public' AND p.proname='create_sale_v2' AND array_length(p.proargnames,1) = 35
        ) x JOIN pg_roles r ON r.oid = x.gid WHERE r.rolname = 'service_role')`,
      acl_anon_revocado: `(SELECT count(*) = 0 FROM (
          SELECT (aclexplode(p.proacl)).grantee AS gid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname='public' AND p.proname='create_sale_v2' AND array_length(p.proargnames,1) = 35
        ) x JOIN pg_roles r ON r.oid = x.gid WHERE r.rolname = 'anon')`,
      comment_mision: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='create_sale_v2' AND array_length(p.proargnames,1) = 35
          AND obj_description(p.oid) LIKE '%CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001%')`,
    },
  },
];

async function checkMarks(mig) {
  let allOk = true;
  for (const [k, q] of Object.entries(mig.marks)) {
    const rows = await runSql(`SELECT (${q}) AS ok`);
    const ok = rows[0]?.ok === true;
    if (!ok) allOk = false;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${k}`);
  }
  return allOk;
}

console.log(`Destino: ${projectRef} ${target === 'e2e' ? '(BD aislada E2E — paso libre)' : '(PRODUCCIÓN CostproBD)'}`);

let failures = 0;
for (const mig of MIGRATIONS) {
  console.log(`\n== ${mig.file}`);
  let present = false;
  try {
    present = await checkMarks(mig);
  } catch (e) {
    console.log(`  (marcas no evaluables: ${String(e.message).slice(0, 160)})`);
    present = false;
  }
  if (present) {
    console.log('  → YA APLICADA (todas las marcas presentes). Se salta.');
    continue;
  }
  if (checkOnly) {
    console.log('  → MARCAS AUSENTES (--check no aplica nada).');
    failures++;
    continue;
  }
  const sql = readFileSync(join(REPO, 'supabase/migrations', mig.file), 'utf8');
  console.log(`  Aplicando (${sql.length} bytes)…`);
  try {
    await runSql(sql);
    console.log('  SQL ejecutado sin error.');
  } catch (e) {
    console.error(`  FALLO al aplicar: ${String(e.message).slice(0, 400)}`);
    process.exit(1); // abortar: una sola migración, un solo lote, sin reintentos a ciegas
  }
  const okNow = await checkMarks(mig);
  if (!okNow) {
    console.error('  FALLO: marcas ausentes tras aplicar. DETENER y diagnosticar.');
    process.exit(1);
  }
  console.log('  → Aplicada y verificada.');
  // Procedimiento oficial post-DDL (patrón m012): recarga del caché de esquema.
  if (target !== 'e2e') {
    try {
      await runSql("NOTIFY pgrst, 'reload schema'");
      console.log('  NOTIFY pgrst (reload schema) emitido.');
    } catch (e) {
      console.log(`  (NOTIFY pgrst no evaluable por este canal: ${String(e.message).slice(0, 120)})`);
    }
  }
}

console.log('\n=== RESUMEN ===');
if (checkOnly) {
  console.log(failures === 0
    ? 'CHECK OK — ciclo CP-POS completo en el destino.'
    : 'CHECK: 1 migración con marcas ausentes (CP-POS pendiente).');
} else {
  console.log('Aplicación finalizada. Ejecutar ahora: node scripts/cp-pos-apply-migration-prod.mjs --check');
}
process.exit(failures === 0 ? 0 : 1);
