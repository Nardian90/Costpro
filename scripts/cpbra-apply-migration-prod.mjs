#!/usr/bin/env node
/**
 * cpbra-apply-migration-prod.mjs — CP-BRA-REMEDIATION-001 (PR fix/cpbra-r01-r14).
 * ───────────────────────────────────────────────────────────────────────────
 * Aplica a PRODUCCIÓN (CostproBD, wthkddeleylijmonclxg) la migración
 * 20261126140000_cpbra_r01_r14_payment_engine.sql (motor de pagos: R-01 rama
 * OT del trigger + gate/lock de OT en register_supplier_payment + R-14 guard
 * de período fiscal en reverse_supplier_payment), UNA SOLA VEZ (regla de oro
 * §11g), por el canal gobernado:
 *   · guard scripts/lib/assert-not-production.mjs (CP-INFRA-019) con el
 *     doble flag explícito del operador;
 *   · verificación PREVIA de marcas (si están, se SALTA — idempotente);
 *   · verificación post-aplicación re-ejecutable (--check);
 *   · migración idempotente (CREATE OR REPLACE / DROP IF EXISTS).
 *
 * Orden: validar primero en la BD aislada (--target e2e), aplicar en
 * producción UNA sola vez y documentar la aplicación en el expediente.
 *
 *   Check aislada:  E2E_SUPABASE_URL=... node scripts/cpbra-apply-migration-prod.mjs --target e2e --check
 *   Check producción: node scripts/cpbra-apply-migration-prod.mjs --check
 *   Aplicación:      ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND \
 *                    node scripts/cpbra-apply-migration-prod.mjs
 * Expediente: docs/audits/CP-BRA-REMEDIATION-001/
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
assertNotProduction({ mode: checkOnly ? 'read' : 'write', projectRef, context: 'cpbra-apply-migration-prod.mjs' });

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

/* ── Marcas re-ejecutables de 20261126140000 (todas deben dar true) ─────── */
const MIGRATIONS = [
  {
    file: '20261126140000_cpbra_r01_r14_payment_engine.sql',
    marks: {
      trigger_rama_ot_restaurada: `pg_get_functiondef('public.update_payment_status()'::regprocedure) LIKE '%ref_type IN (''production_order'', ''work'')%'`,
      trigger_ot_netea_reversas: `(SELECT array_length(string_to_array(pg_get_functiondef('public.update_payment_status()'::regprocedure), 'COALESCE(direction'), 1) - 1 >= 6)`,
      trigger_delete_recompute: `pg_get_functiondef('public.update_payment_status()'::regprocedure) LIKE '%COALESCE(NEW.ref_type, OLD.ref_type)%'`,
      rpc_gate_ot_voided: `pg_get_functiondef('public.register_supplier_payment(uuid,text,uuid,numeric,text,uuid,text,numeric,text,text,text,timestamp with time zone)'::regprocedure) LIKE '%ERR_ORDER_NOT_PAYABLE%'`,
      rpc_ot_for_update: `pg_get_functiondef('public.register_supplier_payment(uuid,text,uuid,numeric,text,uuid,text,numeric,text,text,text,timestamp with time zone)'::regprocedure) LIKE '%production_orders WHERE id = p_ref_id FOR UPDATE%'`,
      reversal_5_args: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='reverse_supplier_payment' AND array_length(p.proargnames,1) = 5)`,
      reversal_4_args_eliminado: `(SELECT count(*) = 0 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='reverse_supplier_payment' AND array_length(p.proargnames,1) = 4)`,
      reversal_guard_periodo: `pg_get_functiondef('public.reverse_supplier_payment(uuid,text,uuid,timestamp with time zone,boolean)'::regprocedure) LIKE '%ERR_PAYMENT_IN_CLOSED_FISCAL_PERIOD%'`,
      reversal_excepcion_auditada: `pg_get_functiondef('public.reverse_supplier_payment(uuid,text,uuid,timestamp with time zone,boolean)'::regprocedure) LIKE '%PAYMENT_REVERSED_CLOSED_PERIOD%'`,
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
    process.exit(1); // abortar: el orden importa
  }
  const okNow = await checkMarks(mig);
  if (!okNow) {
    console.error('  FALLO: marcas ausentes tras aplicar. DETENER y diagnosticar.');
    process.exit(1);
  }
  console.log('  → Aplicada y verificada.');
}

console.log('\n=== RESUMEN ===');
if (checkOnly) {
  console.log(failures === 0
    ? 'CHECK OK — migración CP-BRA-REMEDIATION-001 presente en el destino.'
    : `CHECK: ${failures} migración(es) con marcas ausentes.`);
} else {
  console.log('Aplicación finalizada. Ejecutar ahora: node scripts/cpbra-apply-migration-prod.mjs --check');
}
process.exit(failures === 0 ? 0 : 1);
