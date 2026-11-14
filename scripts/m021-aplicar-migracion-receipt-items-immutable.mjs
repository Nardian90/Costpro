#!/usr/bin/env node
/**
 * M021 — CP-RECEIPT-INTEGRITY-001 (CIERRE): aplicación CONTROLADA a producción
 * de la migración 20261114160000 (inmutabilidad económica de receipt_items).
 *
 * PR #1624 fusionado en main (2e37270e0) con 9/9 checks verdes; la migración
 * fue validada en BD aislada CostproE2E (replay 161 + E2E 12/12 PASS del
 * expediente docs/audits/receipt-integrity-20261114/).
 *
 * Canal canónico del repo (patrón m002…m017 · docs/OPERATIONS/POLITICA_AGENTES_SUPABASE.md §3):
 * Management API /database/query + NOTIFY pgrst 'reload schema' — lote único
 * por archivo, sin reintentos, verificación fail-closed post-migración,
 * fila en production_migration_ledger.
 *
 * La migración es DDL PURO (CREATE OR REPLACE FUNCTION + CREATE TRIGGER):
 * NO modifica datos históricos (verificación delta 0 tras aplicar).
 *
 * Sondeos de inmutabilidad (ninguno deja cambios permanentes):
 *   A) UPDATE (no-op) sobre línea de recepción ACTIVE → DEBE fallar con
 *      ERR_RECEIPT_ITEM_IMMUTABLE (acceso directo privilegiado Management API,
 *      equivalente a service_role). NUNCA se probea FAC-VITALLCONS-001.
 *   B) Escape hatch gobernado: BEGIN + SET LOCAL app.allow_receipt_item_edit='on'
 *      + UPDATE no-op sobre línea ACTIVE + ROLLBACK → debe ejecutarse y revertir.
 *   C) Recepción PENDING permite ediciones legítimas: sonda transaccional
 *      (INSERT recepción/linea de prueba → UPDATE → OK → ROLLBACK). Delta 0.
 *
 * Uso: ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND bun \
 *   scripts/m021-aplicar-migracion-receipt-items-immutable.mjs [--only-verify]
 */
import { readFileSync } from 'fs';
import { createHash } from 'node:crypto';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const onlyVerify = process.argv.includes('--only-verify');

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
assertNotProduction({ mode: 'write', url: SUPABASE_URL, context: 'm021-aplicar-migracion-receipt-items-immutable.mjs' });
if (ref !== 'wthkddeleylijmonclxg') {
  console.error('FALLO DE GUARD: destino no es producción (wthkddeleylijmonclxg)');
  process.exit(2);
}

async function mgmt(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}
async function q(query) {
  const r = await mgmt(query);
  if (!r.ok) { console.error('QUERY FAILED', r.status, r.text.slice(0, 400)); process.exit(4); }
  return JSON.parse(r.text || '[]');
}
// Sondeo que ESPERA error: devuelve { falloEsperado: true, msg } sin abortar.
async function qExpectFail(query, fragmento) {
  const r = await mgmt(query);
  if (r.ok) return { falloEsperado: false, msg: 'LA CONSULTA SE EJECUTÓ (NO debía)' };
  const ok = r.text.includes(fragmento);
  return { falloEsperado: ok, msg: r.text.slice(0, 300) };
}

const FILE = 'supabase/migrations/20261114160000_cp_receipt_items_immutable.sql';
const SQL = readFileSync(resolve(process.cwd(), FILE), 'utf8');
const SHA = createHash('sha256').update(SQL).digest('hex');

const COUNTS = `SELECT
  (SELECT count(*) FROM public.receipts) AS receipts,
  (SELECT count(*) FROM public.receipt_items) AS receipt_items,
  (SELECT count(*) FROM public.fin_entries) AS fin_entries,
  (SELECT count(*) FROM public.fin_movements) AS fin_movements,
  (SELECT count(*) FROM public.stock_movements) AS stock_movements,
  (SELECT count(*) FROM public.audit_logs) AS audit_logs,
  (SELECT count(*) FROM public.receipt_tasa_audit) AS receipt_tasa_audit`;

console.log(`M021 · migración 20261114160000 → PRODUCCIÓN (${ref})`);
console.log(`  ${FILE}\n    SHA-256 ${SHA}`);

// ── FASE 0 · PRE-VUELO (read-only) ───────────────────────────────────────────
console.log('\n── FASE 0 · PRE-VUELO (read-only) ──');
const markersPre = (await q(`SELECT
  (SELECT count(*)::int FROM pg_trigger WHERE tgname='trg_receipt_items_economic_immutable') AS trigger_presente,
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='trg_fn_receipt_items_economic_immutable') AS funcion_presente,
  (SELECT count(*)::int FROM information_schema.tables
     WHERE table_schema='public' AND table_name='receipt_items') AS tabla_receipt_items,
  (SELECT count(*)::int FROM pg_trigger WHERE tgrelid='public.receipt_items'::regclass AND NOT tgisinternal) AS triggers_previos`))[0];
console.log('marcadores:', JSON.stringify(markersPre));
if (markersPre.trigger_presente > 0 || markersPre.funcion_presente > 0) {
  console.error('ABORT: la migración YA está aplicada (trigger/función presentes) — no se re-ejecuta.');
  process.exit(3);
}
if (markersPre.tabla_receipt_items !== 1) {
  console.error('ABORT: tabla receipt_items ausente.'); process.exit(3);
}
if (markersPre.triggers_previos < 2) {
  console.error('ABORT: triggers previos esperados (trg_check_reception_cost_variation, trg_sync_has_movements_receipt) ausentes.');
  process.exit(3);
}
// Restricciones RLS previas sobre receipt_items (revisión de restricciones existentes)
const rlsPre = (await q(`SELECT
  (SELECT count(*)::int FROM pg_tables WHERE schemaname='public' AND tablename='receipt_items' AND rowsecurity) AS rls_activo,
  (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='receipt_items'
     AND cmd='UPDATE') AS politicas_update,
  (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='receipt_items'
     AND policyname LIKE '%denied%') AS politicas_denied`))[0];
console.log('RLS receipt_items:', JSON.stringify(rlsPre));

const antes = (await q(COUNTS))[0];
console.log('conteos ANTES:', JSON.stringify(antes));

if (onlyVerify) { console.log('\n--only-verify: migración PENDIENTE (pre-vuelo OK). Sin aplicar.'); process.exit(0); }

// ── FASE 1 · APLICACIÓN (lote único, sin reintentos) ─────────────────────────
console.log('\n── FASE 1 · APLICACIÓN ──');
const r = await mgmt(SQL);
console.log(`  ${FILE} → HTTP ${r.status} ${r.ok ? 'OK' : 'FALLO: ' + r.text.slice(0, 400)}`);
if (!r.ok) process.exit(5);
const n = await mgmt(`NOTIFY pgrst, 'reload schema'`);
console.log(`    NOTIFY pgrst: HTTP ${n.status} ${n.ok ? 'OK' : n.text.slice(0, 120)}`);

// ── FASE 2 · VERIFICACIÓN POST (fail-closed) ────────────────────────────────
console.log('\n── FASE 2 · VERIFICACIÓN POST ──');
const markersPost = (await q(`SELECT
  (SELECT count(*)::int FROM pg_trigger WHERE tgname='trg_receipt_items_economic_immutable') AS trigger_presente,
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='trg_fn_receipt_items_economic_immutable') AS funcion_presente,
  (SELECT count(*)::int FROM pg_trigger WHERE tgrelid='public.receipt_items'::regclass AND NOT tgisinternal) AS triggers_totales`))[0];
console.log('marcadores:', JSON.stringify(markersPost));
if (markersPost.trigger_presente !== 1 || markersPost.funcion_presente !== 1) {
  console.error('FALLO: marcador ausente tras la aplicación.'); process.exit(6);
}
const despues = (await q(COUNTS))[0];
const delta0 = JSON.stringify(antes) === JSON.stringify(despues);
console.log('conteos DESPUÉS:', JSON.stringify(despues));
console.log('DELTA 0 (DDL puro, sin datos tocados):', delta0 ? 'OK' : 'FALLO');
if (!delta0) process.exit(6);

// SONDA A — línea de recepción ACTIVE (PUERTO PADRE 646be7c5, NO FAC-VITALLCONS-001):
// UPDATE no-op por acceso privilegiado → DEBE fallar con ERR_RECEIPT_ITEM_IMMUTABLE
console.log('\n── SONDA A · inmutabilidad de recepción ACTIVE (UPDATE directo privilegiado) ──');
const itemActivo = (await q(`SELECT ri.id::text FROM receipt_items ri
  WHERE ri.receipt_id='646be7c5-9d74-47a2-871f-0f1c1f790424' LIMIT 1`))[0];
const sondaA = await qExpectFail(
  `UPDATE public.receipt_items SET unit_cost = unit_cost WHERE id='${itemActivo.id}'`,
  'ERR_RECEIPT_ITEM_IMMUTABLE');
console.log(`  item ${itemActivo.id.slice(0, 8)} → ${sondaA.falloEsperado ? 'RECHAZADO (OK)' : 'NO BLOQUEADO (FALLO)'}`);
console.log(`    ${sondaA.msg.slice(0, 200)}`);
if (!sondaA.falloEsperado) process.exit(7);

// SONDA B — escape hatch gobernado + ROLLBACK (sin cambios permanentes)
console.log('\n── SONDA B · escape hatch gobernado (transacción revertida) ──');
const sondaB = await q(`BEGIN;
SET LOCAL app.allow_receipt_item_edit = 'on';
UPDATE public.receipt_items SET unit_cost = unit_cost WHERE id='${itemActivo.id}';
SELECT 'SONDA_B_OK' AS resultado;
ROLLBACK;`);
const bOk = Array.isArray(sondaB) && sondaB.some((x) => x && x.resultado === 'SONDA_B_OK');
console.log(`  UPDATE con SET LOCAL app.allow_receipt_item_edit='on' → ${bOk ? 'PERMITIDO y REVERTIDO (OK)' : 'FALLO'}`);
if (!bOk) process.exit(7);
const itemActivoDespues = (await q(`SELECT unit_cost FROM receipt_items WHERE id='${itemActivo.id}'`))[0];
console.log(`  valor unit_cost tras ROLLBACK: ${itemActivoDespues.unit_cost} (intacto)`);

// SONDA C — recepción PENDING permite ediciones legítimas (sonda transaccional con ROLLBACK)
console.log('\n── SONDA C · recepción PENDING sí permite ediciones (sonda transaccional) ──');
const COSTPRO = '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1';
const sondaC = await q(`BEGIN;
INSERT INTO public.receipts (id, store_id, status, reception_date, total_cost, notes)
  VALUES ('00000000-0000-0000-0000-00c0ffee0001', '${COSTPRO}', 'pending', current_date, 0, 'SONDA M021 (rollback)');
INSERT INTO public.receipt_items (receipt_id, quantity, unit_cost, moneda_recepcion, tasa_cambio_recepcion)
  VALUES ('00000000-0000-0000-0000-00c0ffee0001', 1, 10, 'CUP', 1);
UPDATE public.receipt_items SET unit_cost = 25
  WHERE receipt_id='00000000-0000-0000-0000-00c0ffee0001';
SELECT (SELECT count(*) FROM public.receipt_items
  WHERE receipt_id='00000000-0000-0000-0000-00c0ffee0001' AND unit_cost=25) AS editado;
ROLLBACK;`);
const cOk = Array.isArray(sondaC) && sondaC.some((x) => x && Number(x.editado) === 1);
console.log(`  edición sobre pending → ${cOk ? 'PERMITIDA y REVERTIDA (OK)' : 'BLOQUEADA (FALLO)'}`);
if (!cOk) process.exit(7);
const residuoC = (await q(`SELECT count(*)::int AS n FROM public.receipts
  WHERE id='00000000-0000-0000-0000-00c0ffee0001'`))[0].n;
console.log(`  residuo tras ROLLBACK: ${residuoC} filas (debe ser 0)`);
if (residuoC !== 0) process.exit(7);

// RLS intacta tras la migración
const rlsPost = (await q(`SELECT
  (SELECT count(*)::int FROM pg_tables WHERE schemaname='public' AND tablename='receipt_items' AND rowsecurity) AS rls_activo,
  (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='receipt_items'
     AND policyname LIKE '%denied%') AS politicas_denied`))[0];
console.log('\nRLS receipt_items tras migración:', JSON.stringify(rlsPost));
if (rlsPost.rls_activo !== rlsPre.rls_activo || rlsPost.politicas_denied !== rlsPre.politicas_denied) {
  console.error('FALLO: RLS cambió con la migración (no debía).'); process.exit(6);
}

// ── FASE 3 · LEDGER ──────────────────────────────────────────────────────────
console.log('\n── FASE 3 · production_migration_ledger ──');
const ledger = `INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
SELECT '20261114160000', '${FILE}', '${SHA}', now(), 'management_api',
  'docs/audits/receipt-integrity-20261114/ (PR #1624, main 2e37270e0; E2E aislada 12/12 + replay 161)',
  'agent', 'applied',
  'CP-RECEIPT-INTEGRITY-001 (cierre): inmutabilidad UPDATE de receipt_items para recepciones no-pending + escape hatch gobernado (SET LOCAL app.allow_receipt_item_edit). DDL puro, delta 0 verificado. Sondeos: active→ERR_RECEIPT_ITEM_IMMUTABLE, escape hatch OK (rollback), pending editable OK (rollback).'
WHERE NOT EXISTS (SELECT 1 FROM public.production_migration_ledger WHERE version='20261114160000')`;
await q(ledger);
const fila = (await q(`SELECT version, sha256, applied_at, status FROM production_migration_ledger WHERE version='20261114160000'`))[0];
console.log('  fila:', JSON.stringify(fila));
if (!fila || fila.sha256 !== SHA) { console.error('FALLO: fila de ledger inconsistente.'); process.exit(8); }

console.log('\nM021 COMPLETO: migración aplicada, verificada y registrada.');
