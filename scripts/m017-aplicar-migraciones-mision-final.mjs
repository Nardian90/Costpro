#!/usr/bin/env node
/**
 * M017 — CP-FIN-FINAL-EXECUTION-001 (misión maestra del propietario, 2026-11-13):
 * aplicación CONTROLADA de las 3 migraciones de la misión + REGULARIZACIÓN del
 * libro production_migration_ledger (filas de aplicaciones 11/11–13/11 que
 * quedaron documentadas en docs/audits pero sin fila en el libro).
 *
 * Migraciones (orden cronológico; todas idempotentes CREATE OR REPLACE):
 *   1. supabase/migrations/20261113120800_fix_servicios_recibidos_moneda_documento.sql (PR #1612, fusionado)
 *   2. supabase/migrations/20261114120000_cp_fin_semantica_total_amount_cup.sql (PR #1615)
 *   3. supabase/migrations/20261114140000_cp_fin_ciclo_devolucion_divisa.sql (PR #1616)
 *
 * Canal canónico del repo: Management API /database/query + NOTIFY pgrst
 * 'reload schema' (patrón m002…m016 · docs/OPERATIONS/POLITICA_AGENTES_SUPABASE.md §3:
 * lote único por archivo, sin reintentos, verificación fail-closed post-migración).
 *
 * Fases:
 *   0. Guard CP-INFRA-019 (doble flag) + SHA-256 por archivo + PRE-VUELO read-only:
 *      marcadores de las 3 correcciones AUSENTES (no aplicadas aún), dependencias
 *      presentes y conteos ANTES de las tablas de negocio.
 *   1. APLICACIÓN (un lote por archivo) + NOTIFY pgrst tras cada una.
 *   2. VERIFICACIÓN POST (fail-closed): marcadores PRESENTES, delta 0 en las 12
 *      tablas de negocio, RLS FORCED ×8 intacto, conteo de asientos/movimientos
 *      sin cambios (las funciones reemplazadas no disparan contabilización).
 *   3. REGULARIZACIÓN del libro: filas por las migraciones aplicadas el 11/11–13/11
 *      sin registro (evidencia en docs/audits/APLICACION_* y expedientes CP-FIN /
 *      SKU 197), cada una con NOT EXISTS (idempotente, sin duplicar).
 *   4. FILAS NUEVAS de hoy para las 3 migraciones aplicadas por este script.
 *
 * Autorización: MISIÓN MAESTRA CP-FIN del propietario (2026-11-13, §1 y §4.B):
 * «Aplicar migraciones de base de datos en producción cuando correspondan a
 * cambios aprobados mediante este proceso», validadas en BD aislada (evidencia
 * 14/14, 23/23 y 37/37 PASS + NET DELTA 0 de los validadores de cada PR).
 *
 * Uso: ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND bun \
 *   scripts/m017-aplicar-migraciones-mision-final.mjs [--only-verify]
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
assertNotProduction({ mode: 'write', url: SUPABASE_URL, context: 'm017-aplicar-migraciones-mision-final.mjs' });
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
  return JSON.parse(r.text);
}

const FILES = [
  'supabase/migrations/20261113120800_fix_servicios_recibidos_moneda_documento.sql',
  'supabase/migrations/20261114120000_cp_fin_semantica_total_amount_cup.sql',
  'supabase/migrations/20261114140000_cp_fin_ciclo_devolucion_divisa.sql',
];

console.log(`M017 · migraciones de la misión final → PRODUCCIÓN (${ref})`);
for (const f of FILES) {
  const sql = readFileSync(resolve(process.cwd(), f), 'utf8');
  console.log(`  ${f}\n    SHA-256 ${createHash('sha256').update(sql).digest('hex')}`);
}

const COUNT_TABLES = `SELECT
  (SELECT count(*) FROM public.transactions) AS transactions,
  (SELECT count(*) FROM public.devolutions) AS devolutions,
  (SELECT count(*) FROM public.receipts) AS receipts,
  (SELECT count(*) FROM public.received_services) AS received_services,
  (SELECT count(*) FROM public.issue_slips) AS issue_slips,
  (SELECT count(*) FROM public.inventory_adjustments) AS inventory_adjustments,
  (SELECT count(*) FROM public.commission_payments) AS commission_payments,
  (SELECT count(*) FROM public.cash_flow_documents) AS cash_flow_documents,
  (SELECT count(*) FROM public.payment_transactions) AS payment_transactions,
  (SELECT count(*) FROM public.stock_movements) AS stock_movements,
  (SELECT count(*) FROM public.products) AS products,
  (SELECT count(*) FROM public.store_credit_ledger) AS store_credit_ledger`;

const MARKERS = `SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='update_payment_status'
       AND pg_get_functiondef(p.oid) LIKE '%FIX §17.1%') AS fix_17_1,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='fin_compute_metrics'
       AND pg_get_functiondef(p.oid) LIKE '%20261114120000%') AS fix_semantica,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='create_devolution_v2'
       AND pg_get_functiondef(p.oid) LIKE '%20261114140000%') AS fix_ciclo,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='create_devolution_v2') AS existe_cdv2,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='fin_compute_metrics') AS existe_fcm`;

// ── FASE 0 · PRE-VUELO ───────────────────────────────────────────────────────
console.log('\n── FASE 0 · PRE-VUELO (read-only) ──');
const markersPre = (await q(MARKERS))[0];
console.log('marcadores:', JSON.stringify(markersPre));
if (markersPre.fix_17_1 || markersPre.fix_semantica || markersPre.fix_ciclo) {
  console.error('ABORT: alguna migración YA aplicada (marcador presente) — no se re-ejecuta.');
  process.exit(3);
}
if (markersPre.existe_cdv2 !== 1 || markersPre.existe_fcm !== 1) {
  console.error('ABORT: funciones base ausentes — dependencias incumplidas.');
  process.exit(3);
}
const deps = (await q(`SELECT
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name IN
    ('received_services','payment_transactions','transactions','transaction_items','devolutions',
     'devolution_items','store_credit_ledger','cash_register_sessions','cash_movements')) AS t_deps,
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN
     ('validate_operation_date','get_cash_currency_summary','fin_post_document')) AS f_deps`))[0];
console.log('dependencias:', JSON.stringify(deps));
if (deps.t_deps !== 9 || deps.f_deps !== 3) {
  console.error('ABORT: dependencias ausentes.'); process.exit(3);
}
const antes = (await q(COUNT_TABLES))[0];
const asientosAntes = (await q('SELECT (SELECT count(*) FROM public.fin_entries) AS entries, (SELECT count(*) FROM public.fin_movements) AS movements'))[0];
console.log('conteos ANTES:', JSON.stringify(antes));
console.log('asientos ANTES:', JSON.stringify(asientosAntes));

if (onlyVerify) { console.log('\n--only-verify: migraciones PENDIENTES (pre-vuelo OK). Sin aplicar.'); process.exit(0); }

// ── FASE 1 · APLICACIÓN ─────────────────────────────────────────────────────
console.log('\n── FASE 1 · APLICACIÓN (lote único por archivo, sin reintentos) ──');
const shas = [];
for (const f of FILES) {
  const sql = readFileSync(resolve(process.cwd(), f), 'utf8');
  const sha = createHash('sha256').update(sql).digest('hex');
  shas.push(sha);
  const r = await mgmt(sql);
  console.log(`  ${f} → HTTP ${r.status} ${r.ok ? 'OK' : 'FALLO: ' + r.text.slice(0, 300)}`);
  if (!r.ok) { console.error('ABORT por fallo de migración — no se continúa con las siguientes.'); process.exit(5); }
  const n = await mgmt(`NOTIFY pgrst, 'reload schema'`);
  console.log(`    NOTIFY pgrst: HTTP ${n.status} ${n.ok ? 'OK' : n.text.slice(0, 120)}`);
}

// ── FASE 2 · VERIFICACIÓN POST (fail-closed) ─────────────────────────────────
console.log('\n── FASE 2 · VERIFICACIÓN POST ──');
const markersPost = (await q(MARKERS))[0];
console.log('marcadores:', JSON.stringify(markersPost));
if (!markersPost.fix_17_1 || !markersPost.fix_semantica || !markersPost.fix_ciclo) {
  console.error('FALLO: marcador ausente tras la aplicación.'); process.exit(6);
}
const despues = (await q(COUNT_TABLES))[0];
const asientosDespues = (await q('SELECT (SELECT count(*) FROM public.fin_entries) AS entries, (SELECT count(*) FROM public.fin_movements) AS movements'))[0];
let delta0 = JSON.stringify(antes) === JSON.stringify(despues) && JSON.stringify(asientosAntes) === JSON.stringify(asientosDespues);
console.log('conteos DESPUÉS:', JSON.stringify(despues));
console.log('asientos DESPUÉS:', JSON.stringify(asientosDespues));
console.log('DELTA 0 en tablas de negocio/asientos:', delta0 ? 'OK' : 'FALLO');
if (!delta0) process.exit(6);
const rls = (await q(`SELECT count(*)::int AS forced FROM pg_tables t
  WHERE t.schemaname='public' AND t.tablename LIKE 'fin_%'
    AND EXISTS (SELECT 1 FROM pg_class c WHERE c.relname=t.tablename AND c.relrowsecurity AND c.relforcerowsecurity)`))[0];
console.log('RLS FORCED en fin_*:', rls.forced, rls.forced >= 8 ? 'OK' : 'FALLO');
if (rls.forced < 8) process.exit(6);

// ── FASE 3 · REGULARIZACIÓN DEL LIBRO (aplicaciones 11/11–13/11 sin fila) ────
console.log('\n── FASE 3 · REGULARIZACIÓN production_migration_ledger ──');
const REG = [
  ['20261111120000', 'supabase/migrations/20261111120000_cp_catalogo_master_gestion_tienda.sql', '0826952331a8cecfaba8e4fc935b0451a8e0dd0db9b0597d4e9e8731aa88c4cb', '2026-11-11', 'management_api', 'docs/audits/APLICACION_MIGRACION_20261111120000_PRODUCCION.md', 'agent', 'applied', 'REGULARIZACIÓN (m017): aplicada el 11/11 sin fila en el libro; SHA del expediente de aplicación. Hora exacta no registrada en el expediente — se asienta la fecha documentada.'],
  ['20261111130000', 'supabase/migrations/20261111130000_cp_data_integrity_trigger_acl_normalization.sql', '244d9313203ea45fd5f039a1df1cdfdbcc886e8217ec5dc21e2cf06d73d5b6f5', '2026-11-11', 'management_api', 'docs/audits/APLICACION_MIGRACION_20261111120000_PRODUCCION.md', 'agent', 'applied', 'REGULARIZACIÓN (m017): aplicación conjunta del 11/11 («+ normalización de ACL», mismo expediente). Hora exacta no registrada.'],
  ['20261112120000', 'supabase/migrations/20261112120000_cp_catalogo_sku_inmutable.sql', '43d1faee9578f07fd547f8f616bb9c5da2baf64d76edc686ef89442bca6af1f1', '2026-11-12', 'management_api', 'docs/audits/APLICACION_MIGRACION_20261112120000_PRODUCCION.md', 'agent', 'applied', 'REGULARIZACIÓN (m017): aplicada el 12/11 (m012) sin fila; SHA idéntico al verificado en aislada (36/36). Hora exacta no registrada en el expediente.'],
  ['20261112180000', 'supabase/migrations/20261112180000_cp_payrolls_sc406.sql', '4255a3ad3b8cbde3c32b14f54c92ad3e82f0037046b092e4bbec6e3f12795096', '2026-11-12', 'management_api', 'docs/audits/APLICACION_MIGRACION_20261112180000_PRODUCCION.md', 'agent', 'applied', 'REGULARIZACIÓN (m017): aplicada el 12/11 (m013) sin fila; verificación aislada 54/54 + API 39/39. Hora exacta no registrada.'],
  ['20261113120000', 'supabase/migrations/20261113120000_cp_fin_partida_doble_base.sql', '638a660ea39671e35f2892d60ff6f2d23b66a96fee66533dc192a25fd948ee73', '2026-11-13 14:18:00+00', 'management_api', 'docs/audits/2026-11-13-cp-fin-partida-doble/APLICACION_MIGRACIONES_PRODUCCION.md', 'agent', 'applied', 'REGULARIZACIÓN (m017): lote 1 m014 (CP-FIN base) — 14/14 verificaciones OK del expediente.'],
  ['20261113120100', 'supabase/migrations/20261113120100_cp_fin_partida_doble_motor.sql', 'e7ac17eff98bb32f1c71aa4d0a2c56f412ef3c44e83ffd186d37c7498f38259e', '2026-11-13 14:18:00+00', 'management_api', 'docs/audits/2026-11-13-cp-fin-partida-doble/APLICACION_MIGRACIONES_PRODUCCION.md', 'agent', 'applied', 'REGULARIZACIÓN (m017): lote 1 m014 (motor CP-FIN) — hora del inicio del lote documentado (14:18–14:22 UTC).'],
  ['20261113120200', 'supabase/migrations/20261113120200_cp_fin_endurecimiento_rls.sql', 'de885c5ba856af21d2151f35467dbbfe6de855570b5d16826eca8dd2069a3809', '2026-11-13 14:18:00+00', 'management_api', 'docs/audits/2026-11-13-cp-fin-partida-doble/APLICACION_MIGRACIONES_PRODUCCION.md', 'agent', 'applied', 'REGULARIZACIÓN (m017): lote 1 m014 (RLS FORCED) — hora del inicio del lote documentado (14:18–14:22 UTC).'],
  ['20261113120300', 'supabase/migrations/20261113120300_cp_fin_triggers_diferidos.sql', '3d0b1e494740dd5b6a68735f96f5a5d6978a5adaeec894a5365ef519d92f14e9', '2026-11-13 15:12:00+00', 'management_api', 'docs/audits/2026-11-13-cp-fin-partida-doble/APLICACION_MIGRACIONES_PRODUCCION.md', 'agent', 'applied', 'REGULARIZACIÓN (m017): lote 2 m015 (triggers diferidos) — 10/10 OK.'],
  ['20261113120400', 'supabase/migrations/20261113120400_cp_fin_fix_metricas_nomina_flujo.sql', '429cf5ebba46c3fe8396e7443bd5a151a05f738d9cf97f8001a83918e29ab48d', '2026-11-13 15:12:00+00', 'management_api', 'docs/audits/2026-11-13-cp-fin-partida-doble/APLICACION_MIGRACIONES_PRODUCCION.md', 'agent', 'applied', 'REGULARIZACIÓN (m017): lote 2 m015 (métricas) — hora documentada del lote (15:12 UTC).'],
  ['20261113120500', 'supabase/migrations/20261113120500_cp_fin_fix_sentidos_pago.sql', '19c6779070bc67e6ce69d8fe9fbc2a44c2dc6800e7416364df4339ee9bb2c8d7', '2026-11-13 15:12:00+00', 'management_api', 'docs/audits/2026-11-13-cp-fin-partida-doble/APLICACION_MIGRACIONES_PRODUCCION.md', 'agent', 'applied', 'REGULARIZACIÓN (m017): lote 2 m015 (sentidos de pago) — hora documentada del lote (15:12 UTC).'],
  ['20261113120600', 'supabase/migrations/20261113120600_cp_fin_fix_audit_logs_check.sql', '7d4fb088e3a039d4d9b64e38171ba5f830f7ccd15b42e03a9ff5ed4e12a6def2', '2026-11-13 15:12:00+00', 'management_api', 'docs/audits/2026-11-13-cp-fin-partida-doble/APLICACION_MIGRACIONES_PRODUCCION.md', 'agent', 'applied', 'REGULARIZACIÓN (m017): lote 2 m015 (whitelist audit_logs) — hora documentada del lote (15:12 UTC).'],
  ['20261113120700', 'supabase/migrations/20261113120700_cp_fin_fix_acl_funciones.sql', 'f628f1527c2d8063e6e366a5c21ddef664b1b5a271d2fc76eec7496f9e5e5ccc', '2026-11-13 15:20:00+00', 'management_api', 'docs/audits/2026-11-13-cp-fin-partida-doble/APLICACION_MIGRACIONES_PRODUCCION.md', 'agent', 'applied', 'REGULARIZACIÓN (m017): lote 3 m016 (ACL funciones) — 4/4 OK.'],
  ['20261113140000', 'supabase/migrations/20261113140000_cp_products_audit_store_id.sql', '1306a30848f2413a49fb5ae07d4d6fe81aa0a42dabf2312216d55b0aa3f7823f', '2026-11-13', 'management_api', 'docs/audits/sku197-import-master-20261113/README.md', 'agent', 'applied', 'REGULARIZACIÓN (m017): SKU 197 aplicada el 13/11 (PR #1613) — objetos verificados read-only en producción (managed_delete_product / managed_toggle_product_active). Hora exacta no registrada.'],
  ['20261113140100', 'supabase/migrations/20261113140100_cp_catalogo_importador_maestro.sql', 'e7b1508fa17ce4a78c82a7f3ada4d213ac38c32828baa5a8ced7c99271da37e7', '2026-11-13', 'management_api', 'docs/audits/sku197-import-master-20261113/README.md', 'agent', 'applied', 'REGULARIZACIÓN (m017): SKU 197 (importador maestro) — managed_bulk_import_products verificada en producción. Hora exacta no registrada.'],
  ['20261113140200', 'supabase/migrations/20261113140200_cp_fin_acl_reconcile.sql', '13d5045c231b2eadfc3c46494b316368695057b85b34854155e1cb34e0943ab5', '2026-11-13', 'management_api', 'docs/audits/sku197-import-master-20261113/README.md', 'agent', 'applied', 'REGULARIZACIÓN (m017): SKU 197 (reconciliación ACL Capa C fin_*) — commit fa3abdad2 del PR #1613; el expediente la registra como aplicada (no-op en producción: replica la ACL viva). Hora exacta no registrada.'],
];
for (const [version, file, sha, fecha, mech, evid, by, status, notes] of REG) {
  const r = await mgmt(`INSERT INTO public.production_migration_ledger
    (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
  SELECT '${version}', '${file}', '${sha}', '${fecha}', '${mech}', '${evid}', '${by}', '${status}', '${notes}'
  WHERE NOT EXISTS (SELECT 1 FROM public.production_migration_ledger WHERE version='${version}')
  RETURNING id, version`);
  console.log(`  reg ${version}: ${r.ok ? (JSON.parse(r.text)[0]?.id ?? 'ya existía (0 filas)') : 'ERROR ' + r.text.slice(0, 120)}`);
}

// ── FASE 4 · FILAS NUEVAS DE HOY (las 3 de la misión) ─────────────────────────
console.log('\n── FASE 4 · FILAS NUEVAS (aplicación de hoy) ──');
const EVID = 'docs/audits/2026-11-14-mision-final-m017/EXPEDIENTE.md';
const NOTA = 'MISIÓN MAESTRA CP-FIN (autorización general del propietario 2026-11-13 §1/§4.B); validada en BD aislada (PR #1612: 14/14 · #1615: 23/23 · #1616: 37/37, NET DELTA 0). Aplicada por m017 con verificación fail-closed y delta 0.';
for (let i = 0; i < FILES.length; i++) {
  const version = FILES[i].split('/')[2].slice(0, 14);
  const r = await mgmt(`INSERT INTO public.production_migration_ledger
    (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
  SELECT '${version}', '${FILES[i]}', '${shas[i]}', now(), 'management_api', '${EVID}', 'agent', 'applied', '${NOTA}'
  WHERE NOT EXISTS (SELECT 1 FROM public.production_migration_ledger WHERE version='${version}')
  RETURNING id, version`);
  console.log(`  nueva ${version}: ${r.ok ? (JSON.parse(r.text)[0]?.id ?? 'ya existía (0 filas)') : 'ERROR ' + r.text.slice(0, 120)}`);
}

const total = (await q('SELECT count(*) AS n FROM public.production_migration_ledger'))[0];
console.log(`\nproduction_migration_ledger: ${total.n} filas.`);
console.log('M017 COMPLETADO — migraciones aplicadas, libro regularizado, verificación fail-closed OK.');
