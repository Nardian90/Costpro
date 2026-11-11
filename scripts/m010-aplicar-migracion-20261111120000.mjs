#!/usr/bin/env node
/**
 * GESTIÓN-CATALOGO-MAESTRO (2026-11-11) · ORDEN DE CIERRE §1 — Aplicación
 * CONTROLADA de la migración a PRODUCCIÓN:
 *   supabase/migrations/20261111120000_cp_catalogo_master_gestion_tienda.sql
 *
 * Canal habitual y autorizado del repo: Management API + NOTIFY pgrst
 * (patrón scripts/m002-aplicar-migracion-PRODUCCION.mjs /
 *  scripts/apply-migration-mgmt.ts, ver docs/OPERATIONS/POLITICA_AGENTES_SUPABASE.md §3:
 *  lote único, idempotente, verificación fail-closed post-migración, sin reintentos).
 *
 * La autorización de esta escritura es la ORDEN DE EJECUCIÓN del propietario
 * (2026-11-11, §1: «Aplica efectivamente la migración en producción mediante
 * el canal habitual y autorizado del proyecto»). El expediente vive en
 * docs/audits/APLICACION_MIGRACION_20261111120000_PRODUCCION.md (SQL, SHA-256,
 * antes/después, verificación y rollback).
 *
 * Fases:
 *   0. Guard CP-INFRA-019 (doble flag) + SHA-256 del archivo + pre-vuelo
 *      read-only: firma vigente, cuerpo SIN guardas (migración pendiente),
 *      trigger ausente, dependencias presentes, snapshots de antes.
 *   1. APLICACIÓN única (lote completo, sin reintentos).
 *   2. NOTIFY pgrst 'reload schema' (procedimiento oficial post-DDL).
 *   3. Verificación post (read-only): guardas presentes, SECURITY DEFINER,
 *      ACL solo service_role, trigger presente + función SECURITY DEFINER,
 *      propagación de imagen intacta (image_path en el cuerpo).
 *   4. Pruebas funcionales NEGATIVAS (fail-closed, CERO escrituras — la
 *      excepción aborta la transacción antes de escribir):
 *      a) cambio de SKU de un maestro con movimientos en filas vinculadas
 *         → ERR_SKU_LOCKED_BY_MOVEMENTS;
 *      b) UPDATE directo de products.sku en fila local sin maestro con
 *         movimientos → ERR_SKU_LOCKED_BY_MOVEMENTS (trigger).
 *   5. Integridad de datos: conteos de tablas históricas/financieras
 *      ANTES == DESPUÉS (delta 0).
 *
 * Uso: ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND bun \
 *   scripts/m010-aplicar-migracion-20261111120000.mjs [--only-verify]
 */
import { readFileSync } from 'fs';
import { createHash } from 'node:crypto';
import { resolve } from 'path';
// GUARD (CP-INFRA-019): bloquea producción salvo doble flag explícito.
import { assertNotProduction } from './lib/assert-not-production.mjs';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
// El guard valida la URL REAL de la operación, ANTES de cualquier petición.
assertNotProduction({ mode: 'write', url: SUPABASE_URL, context: 'm010-aplicar-migracion-20261111120000.mjs' });
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
  if (!r.ok) { console.error('QUERY FAILED', r.status, r.text.slice(0, 300)); process.exit(4); }
  return JSON.parse(r.text);
}

const FILE = 'supabase/migrations/20261111120000_cp_catalogo_master_gestion_tienda.sql';
const sql = readFileSync(resolve(process.cwd(), FILE), 'utf8');
const sha256 = createHash('sha256').update(sql).digest('hex');
console.log(`Migración: ${FILE}`);
console.log(`SHA-256: ${sha256}`);
console.log(`Destino: PRODUCCIÓN (${ref})\n`);

const COUNT_TABLES = `
SELECT
  (SELECT count(*) FROM public.products) AS products,
  (SELECT count(*) FROM public.master_products) AS master_products,
  (SELECT count(*) FROM public.stock_movements) AS stock_movements,
  (SELECT count(*) FROM public.transaction_items) AS transaction_items,
  (SELECT count(*) FROM public.receipt_items) AS receipt_items,
  (SELECT count(*) FROM public.master_change_log) AS master_change_log,
  (SELECT count(*) FROM public.transactions) AS transactions`;

// ── FASE 0 · PRE-VUELO (read-only) ──────────────────────────────────────────
const onlyVerify = process.argv.includes('--only-verify');

const fnPre = await q(`SELECT pg_get_functiondef(p.oid) AS def, p.prosecdef AS secdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='fn_master_apply_identity_changes'`);
if (!fnPre[0]) { console.error('PRE-VUELO FALLÓ: fn_master_apply_identity_changes ausente'); process.exit(2); }
const preDef = fnPre[0].def;
console.log('PRE fn_master_apply_identity_changes/5: secdef=', fnPre[0].secdef,
  '· ERR_SKU_LOCKED_BY_MOVEMENTS=', preDef.includes('ERR_SKU_LOCKED_BY_MOVEMENTS'),
  '· ERR_MASTER_SKU_CONFLICT=', preDef.includes('ERR_MASTER_SKU_CONFLICT'));

const trgPre = await q(`SELECT count(*)::int AS n FROM pg_trigger t
  JOIN pg_class c ON c.oid=t.tgrelid
  WHERE t.tgname='trg_products_sku_movement_guard' AND NOT t.tgisinternal AND c.relname='products'`);
console.log('PRE trg_products_sku_movement_guard count:', trgPre[0].n);

const deps = await q(`SELECT
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='master_products') AS t_master,
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='master_change_log') AS t_log,
  (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='has_movements') AS c_has_mov,
  (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgname='trg_products_master_identity_guard' AND c.relname='products') AS trg_identity`);
console.log('PRE dependencias:', JSON.stringify(deps[0]));
if (deps[0].t_master !== 1 || deps[0].t_log !== 1 || deps[0].c_has_mov !== 1 || deps[0].trg_identity !== 1) {
  console.error('PRE-VUELO FALLÓ: dependencias ausentes'); process.exit(2);
}

const before = await q(COUNT_TABLES);
console.log('PRE conteos:', JSON.stringify(before[0]));

// Fixture objetivo para las pruebas funcionales negativas (read-only):
//   maestro con fila local vinculada CON movimientos (la regla debe bloquear).
const masterTarget = await q(`SELECT m.id, m.sku, m.tenant_id,
  (SELECT count(*)::int FROM public.products pr WHERE pr.master_product_id = m.id) AS linked_rows
  FROM public.master_products m
  WHERE EXISTS (SELECT 1 FROM public.products pr WHERE pr.master_product_id = m.id
    AND (COALESCE(pr.has_movements,false)
      OR EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = pr.id)
      OR EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = pr.id)
      OR EXISTS (SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = pr.id)))
  ORDER BY m.created_at LIMIT 1`);
if (!masterTarget[0]) {
  console.error('PRE-VUELO: sin maestro con movimientos para la prueba negativa (inesperado)');
  process.exit(2);
}
console.log('PRE fixture maestro (movimientos):', JSON.stringify(masterTarget[0]));

//   producto local SIN maestro CON movimientos (el trigger debe bloquear).
const localTarget = await q(`SELECT p.id, p.sku, p.store_id
  FROM public.products p
  WHERE p.master_product_id IS NULL
    AND (COALESCE(p.has_movements,false)
      OR EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p.id)
      OR EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id)
      OR EXISTS (SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p.id))
  ORDER BY p.created_at LIMIT 1`);
if (!localTarget[0]) {
  console.error('PRE-VUELO: sin producto local con movimientos para la prueba negativa (inesperado)');
  process.exit(2);
}
console.log('PRE fixture local (movimientos):', JSON.stringify(localTarget[0]));

// Si la migración ya está aplicada (idempotencia): solo verificación.
const alreadyApplied = preDef.includes('ERR_SKU_LOCKED_BY_MOVEMENTS') && preDef.includes('ERR_MASTER_SKU_CONFLICT') && trgPre[0].n === 1;
if (alreadyApplied) {
  console.log('\nMigración YA aplicada (cuerpo con guardas + trigger presentes): modo --only-verify.');
} else if (onlyVerify) {
  console.error('\n--only-verify pero la migración NO está aplicada: abortando sin escribir.');
  process.exit(2);
}

// ── FASE 1 · APLICACIÓN (lote único, sin reintentos) ───────────────────────
if (!alreadyApplied && !onlyVerify) {
  console.log(`\nAplicando ${FILE} a PRODUCCIÓN (${ref})...`);
  const res = await mgmt(sql);
  console.log('HTTP', res.status);
  if (!res.ok) {
    console.error('FALLO DE APLICACIÓN:', res.text.slice(0, 2000));
    process.exit(1);
  }
  console.log('resultado:', res.text.slice(0, 400) || '(sin filas)');

  // ── FASE 2 · Recarga de caché de PostgREST (procedimiento oficial) ───────
  const reload = await mgmt("NOTIFY pgrst, 'reload schema'");
  console.log('pgrst schema-cache reload: HTTP', reload.status);
}

// ── FASE 3 · VERIFICACIÓN POST (read-only, fail-closed) ────────────────────
console.log('\n── VERIFICACIÓN POST ──');
const fnPost = await q(`SELECT pg_get_functiondef(p.oid) AS def, p.prosecdef AS secdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='fn_master_apply_identity_changes'`);
const postDef = fnPost[0]?.def || '';
const checks = {
  'fn existe y SECURITY DEFINER': !!fnPost[0] && fnPost[0].secdef === true,
  'guarda ERR_SKU_LOCKED_BY_MOVEMENTS': postDef.includes('ERR_SKU_LOCKED_BY_MOVEMENTS'),
  'guarda ERR_MASTER_SKU_CONFLICT': postDef.includes('ERR_MASTER_SKU_CONFLICT'),
  'propagación de imagen intacta (image_path)': postDef.includes('image_path'),
  'sin datos comerciales (price/costo/stock)': !(/price|cost_price|stock_current/i.test(postDef)),
};
const trgPost = await q(`SELECT count(*)::int AS n, COALESCE(bool_or(p.prosecdef),false) AS fn_secdef
  FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND t.tgname='trg_products_sku_movement_guard' AND NOT t.tgisinternal`);
checks['trigger trg_products_sku_movement_guard presente (fn SECURITY DEFINER)'] = trgPost[0].n === 1 && trgPost[0].fn_secdef === true;

const acl = await q(`SELECT COALESCE(array_agg(r.grantee ORDER BY r.grantee), ARRAY[]::text[]) AS grantees
  FROM information_schema.routine_privileges r
  WHERE r.routine_schema='public' AND r.routine_name='fn_master_apply_identity_changes'`);
checks['ACL helper: EXECUTE solo service_role (+postgres owner)'] = JSON.stringify(acl[0].grantees).includes('service_role') && !JSON.stringify(acl[0].grantees).includes('authenticated') && !JSON.stringify(acl[0].grantees).includes('anon');

let failed = false;
for (const [name, ok] of Object.entries(checks)) {
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failed = true;
}
if (failed) { console.error('VERIFICACIÓN POST FALLÓ'); process.exit(3); }

// ── FASE 4 · Pruebas funcionales NEGATIVAS (CERO escrituras) ───────────────
console.log('\n── PRUEBAS FUNCIONALES NEGATIVAS (fail-closed, sin escrituras) ──');

// a) Cambio de SKU de maestro con movimientos → debe abortar con ERR_SKU_LOCKED_BY_MOVEMENTS.
const mt = masterTarget[0];
const negA = await mgmt(`SELECT public.fn_master_apply_identity_changes(
  '${mt.id}'::uuid,
  '{"sku": "ZZZ-LOCKED-BY-GUARD"}'::jsonb,
  NULL::uuid, NULL::uuid, NULL::uuid);`);
const negAtext = negA.text || '';
if (negA.ok) {
  console.error(`  ✗ (a) el cambio de SKU con movimientos NO fue bloqueado — HTTP ${negA.status}`);
  process.exit(3);
}
if (!negAtext.includes('ERR_SKU_LOCKED_BY_MOVEMENTS')) {
  console.error('  ✗ (a) abortó pero sin el error esperado:', negAtext.slice(0, 200));
  process.exit(3);
}
console.log('  ✓ (a) maestro con movimientos → ERR_SKU_LOCKED_BY_MOVEMENTS (transacción abortada, cero escrituras)');

// b) UPDATE directo de sku en fila local sin maestro con movimientos → trigger bloquea.
const lt = localTarget[0];
const negB = await mgmt(`UPDATE public.products SET sku = 'ZZZ-TRG-LOCKED' WHERE id = '${lt.id}';`);
const negBtext = negB.text || '';
if (negB.ok) {
  console.error(`  ✗ (b) el UPDATE directo de SKU con movimientos NO fue bloqueado — HTTP ${negB.status}`);
  process.exit(3);
}
if (!negBtext.includes('ERR_SKU_LOCKED_BY_MOVEMENTS')) {
  console.error('  ✗ (b) abortó pero sin el error esperado:', negBtext.slice(0, 200));
  process.exit(3);
}
console.log('  ✓ (b) UPDATE directo local con movimientos → ERR_SKU_LOCKED_BY_MOVEMENTS (trigger, cero escrituras)');

// Confirmación de que las filas objetivo NO cambiaron (rollback real).
const mtAfter = await q(`SELECT sku FROM public.master_products WHERE id='${mt.id}'`);
const ltAfter = await q(`SELECT sku FROM public.products WHERE id='${lt.id}'`);
if (mtAfter[0].sku !== mt.sku || ltAfter[0].sku !== lt.sku) {
  console.error('  ✗ las pruebas negativas dejaron huella (SKU cambió) — INCONSISTENCIA');
  process.exit(3);
}
console.log('  ✓ SKUs de las filas objetivo intactos tras los abortos (rollback confirmado)');

// ── FASE 5 · Integridad de datos ANTES == DESPUÉS ──────────────────────────
console.log('\n── INTEGRIDAD DE DATOS ──');
const after = await q(COUNT_TABLES);
const b = before[0], a = after[0];
const deltas = {};
for (const k of Object.keys(b)) {
  deltas[k] = Number(a[k]) - Number(b[k]);
}
console.log('DESPUÉS:', JSON.stringify(a));
console.log('DELTAS :', JSON.stringify(deltas));
for (const [k, v] of Object.entries(deltas)) {
  if (v !== 0) { console.error(`  ✗ delta ≠ 0 en ${k} (${v})`); process.exit(3); }
}
console.log('  ✓ delta = 0 en todas las tablas históricas/financieras');

console.log(`\nOK: migración ${alreadyApplied ? 'VERIFICADA (ya aplicada)' : 'APLICADA'} y funcionando en producción (${ref}).`);
