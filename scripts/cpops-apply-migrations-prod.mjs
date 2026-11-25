#!/usr/bin/env node
/**
 * cpops-apply-migrations-prod.mjs — SR-CREATE-BLOCK-20261125.
 * ───────────────────────────────────────────────────────────────────────────
 * PROBLEMA: el despliegue de Vercel (main, ciclo CP-OPS-ENERVIDA) llama a
 * create_received_service_v2 CON p_creation_key (16 params), pero las 5
 * migraciones del ciclo NUNCA se aplicaron a producción → PGRST202
 * «Could not find the function public.create_received_service_v2(...) in
 * the schema cache» → no se puede crear/confirmar ningún servicio.
 *
 * Esta misión aplica a PRODUCCIÓN (CostproBD, wthkddeleylijmonclxg) las 5
 * migraciones del ciclo CP-OPS-ENERVIDA, EN ORDEN y UNA SOLA VEZ (regla de
 * oro §11g), por el canal gobernado:
 *   · guard scripts/lib/assert-not-production.mjs (CP-INFRA-019) con el
 *     doble flag explícito del operador;
 *   · verificación PREVIA de marcas (si ya están, la migración se SALTA);
 *   · verificación post-aplicación re-ejecutable (--check);
 *   · idempotencia de las migraciones (CREATE OR REPLACE / IF NOT EXISTS /
 *     DROP TRIGGER IF EXISTS) verificada por la misión CP-OPS-ENERVIDA.
 *
 * Validación previa (§11g): la BD aislada CostproE2E YA tiene el ciclo
 * aplicado (verificado read-only; integración 28/28 en el PR CP-OPS).
 * Contraste con la aislada:  node scripts/cpops-apply-migrations-prod.mjs --target e2e --check
 * Verificación de producción: node scripts/cpops-apply-migrations-prod.mjs --check
 * Aplicación (requiere flags): ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND \
 *                              node scripts/cpops-apply-migrations-prod.mjs
 * Expediente: docs/audits/SR-CREATE-BLOCK-20261125/INFORME.md
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
assertNotProduction({ mode: checkOnly ? 'read' : 'write', projectRef, context: 'cpops-apply-migrations-prod.mjs' });

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

/* ── Marcas re-ejecutables por migración (todas deben dar true) ────────── */
const MIGRATIONS = [
  {
    file: '20261124120000_cp_ops_enervida_payment_reversals.sql',
    marks: {
      col_reverses_payment_id: `(SELECT count(*) = 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='payment_transactions' AND column_name='reverses_payment_id')`,
      fn_reverse_supplier_payment: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='reverse_supplier_payment')`,
      fn_fin_post_payment_annulment: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='fin_post_payment_annulment')`,
      update_payment_status_netea_reversa: `pg_get_functiondef('public.update_payment_status()'::regprocedure) LIKE '%COALESCE(direction, ''in'') = ''reversal''%'`,
      register_payment_netea: `pg_get_functiondef('public.register_supplier_payment(uuid,text,uuid,numeric,text,uuid,text,numeric,text,text,text,timestamp with time zone)'::regprocedure) LIKE '%COALESCE(pt.direction%'`,
    },
  },
  {
    file: '20261124120100_cp_ops_enervida_service_void_idempotency.sql',
    marks: {
      v2_sobrecarga_16_args: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='create_received_service_v2'
          AND array_length(p.proargnames,1) = 16)`,
      v2_idempotencia_por_key: `pg_get_functiondef('public.create_received_service_v2(uuid,text,numeric,uuid,text,date,text,numeric,integer,text,text,text,jsonb,uuid,jsonb,text)'::regprocedure) LIKE '%SERVICE_CREATED%'`,
      void_crea_contrafila: `pg_get_functiondef('public.void_received_service_with_reversal(uuid,uuid,text,timestamp with time zone)'::regprocedure) LIKE '%reverses_payment_id%'`,
      set_status_revierte_pagos: `pg_get_functiondef('public.set_received_service_status(uuid,text,uuid,text)'::regprocedure) LIKE '%payments_reversed%'`,
      grant_v2_service_role: `(SELECT count(*) >= 1 FROM (
          SELECT (aclexplode(p.proacl)).grantee AS gid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname='public' AND p.proname='create_received_service_v2' AND array_length(p.proargnames,1) = 16
        ) x JOIN pg_roles r ON r.oid = x.gid WHERE r.rolname = 'service_role')`,
    },
  },
  {
    file: '20261124120200_cp_ops_enervida_cash_report_eligibility.sql',
    marks: {
      cash_report_eligibilidad: `pg_get_functiondef('public.get_cash_report(uuid,timestamp with time zone,timestamp with time zone,boolean)'::regprocedure) LIKE '%payment_reversals%'`,
      cash_summary_eligibilidad: `pg_get_functiondef('public.get_cash_currency_summary(uuid,timestamp with time zone,timestamp with time zone)'::regprocedure) LIKE '%voided%'`,
    },
  },
  {
    file: '20261124120300_cp_ops_enervida_multi_settlement.sql',
    marks: {
      fn_register_payment_multi: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='register_supplier_payment_multi')`,
    },
  },
  {
    file: '20261124120400_cp_ops_enervida_parties_consolidation.sql',
    marks: {
      col_customers_master_party_id: `(SELECT count(*) = 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='customers' AND column_name='master_party_id')`,
      fn_consolidate_local_party: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='consolidate_local_party')`,
      delete_master_party_guard_ok: `pg_get_functiondef('public.delete_master_party(uuid,uuid,uuid)'::regprocedure) LIKE '%master_party_id%'`,
    },
  },
];

const MULTILINE_SQL = { v2_idempotencia_por_key: true };

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
    process.exit(1); // abortar la cadena: el orden importa
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
    ? 'CHECK OK — ciclo CP-OPS-ENERVIDA completo en el destino.'
    : `CHECK: ${failures} migración(es) con marcas ausentes.`);
} else {
  console.log('Aplicación finalizada. Ejecutar ahora: node scripts/cpops-apply-migrations-prod.mjs --check');
}
process.exit(failures === 0 ? 0 : 1);
