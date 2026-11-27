#!/usr/bin/env node
/**
 * cpbra-tp-apply-prod.mjs — CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 (FASE 4, §0.3).
 * ───────────────────────────────────────────────────────────────────────────
 * Aplica a PRODUCCIÓN (CostproBD, wthkddeleylijmonclxg) la regularización
 * gobernada de las 3 recepciones de Tienda Pueblo
 * (20261127160000_cpbra_tienda_pueblo_receipts.sql) UNA SOLA VEZ (§11g),
 * por el canal gobernado (patrón cpbra-r26-apply-prod.mjs):
 *   · guard scripts/lib/assert-not-production.mjs con doble flag explícito;
 *   · verificación PREVIA de precondiciones EXACTAS (si ya está aplicada,
 *     se SALTA — idempotente);
 *   · NOTIFY pgrst tras aplicar;
 *   · verificación post-aplicación re-ejecutable (--check) con conciliación.
 *
 *   Check producción: node scripts/cpbra-tp-apply-prod.mjs --check
 *   Aplicación:       ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND \
 *                     node scripts/cpbra-tp-apply-prod.mjs
 * Expediente: docs/audits/CP-BRA-FINAL-COMPLIANCE-CLOSURE-001/TIENDA-PUEBLO-REGULARIZATION.md
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
const MIG_FILE = 'supabase/migrations/20261127160000_cpbra_tienda_pueblo_receipts.sql';
const IDS = [
  '0b026405-d090-46cc-9d68-60ff7cca3783',
  '79ffb3a9-9aa5-4258-b845-78049e06d814',
  'e564adca-c9b9-479b-bdbe-146033712085',
];
const IDS_SQL = `'${IDS.join("','")}'`;

if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido.'); process.exit(2); }

const checkOnly = process.argv.includes('--check');
assertNotProduction({ mode: checkOnly ? 'read' : 'write', projectRef: PROD_REF, context: 'cpbra-tp-apply-prod.mjs' });

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
    (SELECT count(*) FROM public.receipts WHERE id IN (${IDS_SQL})) AS ids_presentes,
    (SELECT count(*) FROM public.receipts WHERE id IN (${IDS_SQL}) AND status='active' AND btrim(COALESCE(supplier,'')) IN ('', '—')) AS pendientes,
    (SELECT count(*) FROM public.receipts WHERE id IN (${IDS_SQL}) AND supplier = 'Tienda Pueblo') AS ya_corregidas,
    (SELECT coalesce(sum(total_cost),0) FROM public.receipts WHERE id IN (${IDS_SQL})) AS total,
    (SELECT count(*) FROM public.payment_transactions WHERE ref_type='receipt' AND ref_id IN (${IDS_SQL})) AS pagos,
    (SELECT count(*) FROM public.suppliers s
       WHERE s.store_id = (SELECT store_id FROM public.receipts WHERE id IN (${IDS_SQL}) LIMIT 1)
         AND s.is_active AND lower(regexp_replace(btrim(s.name), '\\s', '', 'g')) = 'tiendapueblo') AS canonicos,
    (SELECT coalesce(sum(total_cost),0) FROM public.receipts WHERE status='active' AND btrim(COALESCE(supplier,'')) IN ('', '—')) AS bucket_dash_total,
    (SELECT count(*) FROM public.audit_logs WHERE action='RECEIPT_SUPPLIER_REGULARIZED' AND record_id::text IN (${IDS_SQL})) AS auditoria;
`);
console.log('\n=== PRE (evidencia del estado previo) ===');
console.log(JSON.stringify(pre, null, 1));
const p = pre[0];
if (p.ids_presentes !== 3) { console.error('FALLO: la lista cerrada no está íntegra en producción — ABORTAR.'); process.exit(1); }
if (p.ya_corregidas === 3) { console.log('\n→ FASE 4 YA APLICADA (3 recepciones en Tienda Pueblo). Nada que hacer.'); process.exit(0); }
if (p.pendientes !== 3) { console.error(`FALLO: estado PARCIAL (${p.pendientes} de 3 pendientes) — ABORTAR (no reprocesar a ciegas).`); process.exit(1); }
if (Number(p.total) !== 19435) { console.error(`FALLO: el agregado no es 19,435 (${p.total}) — ABORTAR.`); process.exit(1); }
if (p.pagos !== 0) { console.error('FALLO: hay pagos sobre las recepciones — ABORTAR.'); process.exit(1); }
if (p.canonicos !== 1) { console.error(`FALLO: proveedor canónico único no disponible (${p.canonicos}) — ABORTAR (no inventar alta, no asociación arbitraria).`); process.exit(1); }

const MARKS = {
  tres_en_tienda_pueblo: `(SELECT count(*) = 3 FROM public.receipts WHERE id IN (${IDS_SQL}) AND supplier = 'Tienda Pueblo')`,
  totales_intactos: `(SELECT coalesce(sum(total_cost),0) = 19435 FROM public.receipts WHERE id IN (${IDS_SQL}))`,
  estados_intactos: `(SELECT count(*) = 3 FROM public.receipts WHERE id IN (${IDS_SQL}) AND status='active' AND payment_status='unpaid')`,
  cero_pagos: `(SELECT count(*) = 0 FROM public.payment_transactions WHERE ref_type='receipt' AND ref_id IN (${IDS_SQL}))`,
  auditoria_owner_x3: `(SELECT count(*) = 3 FROM public.audit_logs WHERE action='RECEIPT_SUPPLIER_REGULARIZED' AND record_id::text IN (${IDS_SQL}) AND metadata->>'source' = 'OWNER_CONFIRMATION')`,
  sin_bucket_dash: `(SELECT count(*) = 0 FROM public.receipts WHERE id IN (${IDS_SQL}) AND btrim(COALESCE(supplier,'')) IN ('', '—'))`,
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
  console.log(ok ? '\nCHECK OK — regularización presente en producción.' : '\nCHECK: marcas ausentes (migración NO aplicada).');
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

console.log('\n== POST: verificación de marcas + conciliación ==');
const okNow = await checkMarks();
if (!okNow) { console.error('FALLO: marcas ausentes tras aplicar. DETENER y diagnosticar.'); process.exit(1); }

const post = await runSql(`
  SELECT
    (SELECT coalesce(sum(total_cost),0) FROM public.receipts WHERE supplier='Tienda Pueblo' AND status='active' AND payment_status='unpaid') AS cxp_tienda_pueblo,
    (SELECT count(*) FROM public.receipts WHERE status='active' AND btrim(COALESCE(supplier,'')) IN ('', '—')) AS bucket_dash_count,
    (SELECT count(*) FROM public.stock_movements WHERE reference_id::text IN (${IDS_SQL})) AS kardex_movs;
`);
console.log(`\nConciliación POST: CxP Tienda Pueblo (unpaid) = ${post[0]?.cxp_tienda_pueblo} · bucket «—» restante = ${post[0]?.bucket_dash_count} · movimientos kardex de las 3 = ${post[0]?.kardex_movs}`);
console.log('\n→ FASE 4 Tienda Pueblo aplicada y verificada en producción (OWNER_CONFIRMATION ×3, 19,435 atribuido).');
