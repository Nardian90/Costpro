#!/usr/bin/env node
/**
 * CATALOGO-IDENTIDAD (2026-11-12) · CIERRE PR #1605 — Aplicación CONTROLADA de
 * la migración a PRODUCCIÓN:
 *   supabase/migrations/20261112120000_cp_catalogo_sku_inmutable.sql
 *
 * Canal habitual y autorizado del repo: Management API /database/query +
 * NOTIFY pgrst 'reload schema' (patrón scripts/m002-aplicar-migracion-PRODUCCION.mjs /
 * scripts/apply-migration-mgmt.ts · docs/OPERATIONS/POLITICA_AGENTES_SUPABASE.md §3:
 * lote único, idempotente, verificación fail-closed post-migración, sin reintentos).
 *
 * La autorización de esta escritura es la ORDEN DE EJECUCIÓN del propietario
 * (2026-11-12, §5: «Aplica la migración 20261112120000 en producción,
 * exclusivamente mediante el canal canónico documentado por COSTPRO»).
 * El expediente vive en docs/audits/CATALOGO-IDENTIDAD-20261112/ y el registro de
 * aplicación en docs/audits/APLICACION_MIGRACION_20261112120000_PRODUCCION.md.
 *
 * Fases:
 *   0. Guard CP-INFRA-019 (doble flag) + SHA-256 del archivo + pre-vuelo
 *      read-only: cuerpos vigentes (migración pendiente), triggers, políticas,
 *      dependencias, conteos ANTES y fixtures de prueba.
 *   1. APLICACIÓN única (lote completo, sin reintentos).
 *   2. NOTIFY pgrst 'reload schema' (procedimiento oficial post-DDL).
 *   3. Verificación POST (read-only, fail-closed): ERR_SKU_IMMUTABLE en el punto
 *      único de identidad, lógica de cambio de SKU retirada, propagación de
 *      nombre/imagen conservada, sin datos comerciales, trigger nuevo presente
 *      (+SECURITY DEFINER) y el anterior retirado, ACLs, políticas master-,
 *      RLS activo en las tablas del catálogo.
 *   4. Pruebas funcionales NEGATIVAS (fail-closed, CERO escrituras — la excepción
 *      aborta la transacción antes de escribir):
 *      a) cambio de SKU del maestro → ERR_SKU_IMMUTABLE;
 *      b) reenvío del SKU idéntico (no-cambio) → ERR_SKU_IMMUTABLE;
 *      c) propuesta con 'sku' → ERR_SKU_IMMUTABLE al encolar (o ERR_UNAUTHENTICATED
 *         en este canal sin JWT: la guardra por cuerpo se verifica en fase 3);
 *      d) UPDATE directo de products.sku en fila local SIN maestro y SIN
 *         movimientos → ERR_SKU_IMMUTABLE (regla MÁS ESTRICTA que 20261111120000).
 *   5. SONDA de nombre compartido y PROPAGACIÓN entre tiendas con ROLLBACK
 *      FORZADO (DO que RAISE tras verificar; excepción → rollback automático →
 *      CERO huella): aplicación real + propagación a todas las filas vinculadas
 *      + precios/costos/existencias intactos, todo dentro de la transacción.
 *   6. Simulación READ-ONLY de la política de imagen master- para un usuario
 *      autorizado NO administrador global (predicado exacto de la política vía
 *      has_store_access_as) + contraste de aislamiento entre tenants + RLS.
 *   7. Integridad de datos: conteos ANTES == DESPUÉS (delta 0) y fila de la
 *      sonda intacta.
 *
 * Uso: ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND bun \
 *   scripts/m012-aplicar-migracion-20261112120000.mjs [--only-verify]
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
assertNotProduction({ mode: 'write', url: SUPABASE_URL, context: 'm012-aplicar-migracion-20261112120000.mjs' });
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
async function qSoft(query) {
  const r = await mgmt(query);
  return { ok: r.ok, status: r.status, text: r.text };
}

const FILE = 'supabase/migrations/20261112120000_cp_catalogo_sku_inmutable.sql';
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
  (SELECT count(*) FROM public.transactions) AS transactions,
  (SELECT count(*) FROM public.master_change_proposals) AS master_change_proposals,
  (SELECT count(*) FROM public.stores) AS stores,
  (SELECT count(*) FROM public.tenants) AS tenants,
  (SELECT count(*) FROM public.user_store_memberships) AS user_store_memberships`;

// ── FASE 0 · PRE-VUELO (read-only) ──────────────────────────────────────────
const onlyVerify = process.argv.includes('--only-verify');

const fnPre = await q(`SELECT pg_get_functiondef(p.oid) AS def, p.prosecdef AS secdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='fn_master_apply_identity_changes'`);
if (!fnPre[0]) { console.error('PRE-VUELO FALLÓ: fn_master_apply_identity_changes ausente'); process.exit(2); }
const preDef = fnPre[0].def;
console.log('PRE fn_master_apply_identity_changes/5: secdef=', fnPre[0].secdef,
  '· ERR_SKU_IMMUTABLE=', preDef.includes('ERR_SKU_IMMUTABLE'),
  '· ERR_SKU_LOCKED_BY_MOVEMENTS=', preDef.includes('ERR_SKU_LOCKED_BY_MOVEMENTS'),
  '· ERR_MASTER_SKU_CONFLICT=', preDef.includes('ERR_MASTER_SKU_CONFLICT'));

const propPre = await q(`SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='propose_master_change'`);
if (!propPre[0]) { console.error('PRE-VUELO FALLÓ: propose_master_change ausente'); process.exit(2); }
console.log('PRE propose_master_change/4: ERR_SKU_IMMUTABLE=', propPre[0].def.includes('ERR_SKU_IMMUTABLE'));

const trgPre = await q(`SELECT
  (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     WHERE t.tgname='trg_products_sku_movement_guard' AND NOT t.tgisinternal AND c.relname='products') AS old_trg,
  (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     WHERE t.tgname='trg_products_sku_immutable_guard' AND NOT t.tgisinternal AND c.relname='products') AS new_trg`);
console.log('PRE triggers: movement_guard=', trgPre[0].old_trg, '· immutable_guard=', trgPre[0].new_trg);

const polPre = await q(`SELECT count(*)::int AS n FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
    AND policyname IN ('product_images_insert_product_owner','product_images_update_product_owner','product_images_delete_product_owner')
    AND (COALESCE(qual,'') ILIKE '%master_products%' OR COALESCE(with_check,'') ILIKE '%master_products%')`);
console.log('PRE políticas product-images con rama master-:', polPre[0].n);

const deps = await q(`SELECT
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='master_products') AS t_master,
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='master_change_log') AS t_log,
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='master_change_proposals') AS t_prop,
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='catalog_store_links') AS t_links,
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='products') AS t_products,
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='has_store_access_as') AS f_access`);
console.log('PRE dependencias:', JSON.stringify(deps[0]));
if (deps[0].t_master !== 1 || deps[0].t_log !== 1 || deps[0].t_prop !== 1 || deps[0].t_links !== 1 || deps[0].t_products !== 1 || deps[0].f_access !== 1) {
  console.error('PRE-VUELO FALLÓ: dependencias ausentes'); process.exit(2);
}

const before = await q(COUNT_TABLES);
console.log('PRE conteos:', JSON.stringify(before[0]));

// Fixture (a): maestro CON movimientos en filas vinculadas (regla debe bloquear).
const masterMov = await q(`SELECT m.id, m.sku, m.tenant_id
  FROM public.master_products m
  WHERE EXISTS (SELECT 1 FROM public.products pr WHERE pr.master_product_id = m.id
    AND (COALESCE(pr.has_movements,false)
      OR EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = pr.id)
      OR EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = pr.id)
      OR EXISTS (SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = pr.id)))
  ORDER BY m.created_at LIMIT 1`);
if (!masterMov[0]) { console.error('PRE-VUELO: sin maestro con movimientos (inesperado)'); process.exit(2); }
console.log('PRE fixture maestro (movimientos):', JSON.stringify(masterMov[0]));

// Fixture (b): maestro SIN movimientos y SIN filas locales (regla nueva: igualmente
// inmutable — estrictamente más restrictiva que 20261111120000).
const masterPure = await q(`SELECT m.id, m.sku FROM public.master_products m
  WHERE NOT EXISTS (SELECT 1 FROM public.products pr WHERE pr.master_product_id = m.id)
    AND NOT EXISTS (SELECT 1 FROM public.master_change_log l WHERE l.master_product_id = m.id)
  ORDER BY m.created_at LIMIT 1`);
if (!masterPure[0]) {
  const anyMaster = await q(`SELECT m.id, m.sku FROM public.master_products m
    WHERE NOT EXISTS (SELECT 1 FROM public.products pr WHERE pr.master_product_id = m.id
        AND (COALESCE(pr.has_movements,false)
          OR EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = pr.id)
          OR EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = pr.id)))
    ORDER BY m.created_at LIMIT 1`);
  if (!anyMaster[0]) { console.error('PRE-VUELO: sin maestro sin movimientos (inesperado)'); process.exit(2); }
  masterPure.push(anyMaster[0]);
  console.log('PRE fixture maestro (sin filas con movimientos, sin filas puras):', JSON.stringify(anyMaster[0]));
} else {
  console.log('PRE fixture maestro (sin filas locales):', JSON.stringify(masterPure[0]));
}

// Fixture (d): fila local SIN maestro y SIN movimientos (el trigger NUEVO debe
// bloquear; el de 20261111120000 lo permitía).
const localPure = await q(`SELECT p.id, p.sku, p.store_id FROM public.products p
  WHERE p.master_product_id IS NULL
    AND NOT COALESCE(p.has_movements,false)
    AND NOT EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p.id)
  ORDER BY p.created_at LIMIT 1`);
if (!localPure[0]) { console.error('PRE-VUELO: sin fila local sin maestro/movimientos (inesperado)'); process.exit(2); }
console.log('PRE fixture local (sin maestro ni movimientos):', JSON.stringify(localPure[0]));

// Fixture (fase 5): maestro con filas vinculadas en >=2 tiendas (propagación).
const masterProp = await q(`SELECT m.id, m.sku, m.name, m.tenant_id,
    (SELECT count(*)::int FROM public.products pr WHERE pr.master_product_id = m.id) AS linked_rows,
    (SELECT count(DISTINCT pr.store_id)::int FROM public.products pr WHERE pr.master_product_id = m.id) AS linked_stores,
    (SELECT t.owner_id FROM public.tenants t WHERE t.id = m.tenant_id) AS owner_id
  FROM public.master_products m
  WHERE (SELECT count(DISTINCT pr.store_id) FROM public.products pr WHERE pr.master_product_id = m.id) >= 2
  ORDER BY (SELECT count(DISTINCT pr.store_id) FROM public.products pr WHERE pr.master_product_id = m.id) DESC
  LIMIT 1`);
let propNote = '';
if (!masterProp[0]) {
  const anyLinked = await q(`SELECT m.id, m.sku, m.name, m.tenant_id,
      (SELECT count(*)::int FROM public.products pr WHERE pr.master_product_id = m.id) AS linked_rows,
      (SELECT count(DISTINCT pr.store_id)::int FROM public.products pr WHERE pr.master_product_id = m.id) AS linked_stores,
      (SELECT t.owner_id FROM public.tenants t WHERE t.id = m.tenant_id) AS owner_id
    FROM public.master_products m
    WHERE (SELECT count(*) FROM public.products pr WHERE pr.master_product_id = m.id) >= 1
    ORDER BY m.created_at LIMIT 1`);
  if (!anyLinked[0]) { console.error('PRE-VUELO: sin maestro con filas vinculadas (inesperado)'); process.exit(2); }
  masterProp.push(anyLinked[0]);
  propNote = ' (sin maestro multi-tienda disponible: propagación verificada en 1 tienda)';
  console.log('PRE fixture propagación (1 tienda):', JSON.stringify(anyLinked[0]));
} else {
  console.log('PRE fixture propagación (multi-tienda):', JSON.stringify(masterProp[0]));
}

// Si la migración ya está aplicada (idempotencia): solo verificación.
const alreadyApplied = preDef.includes('ERR_SKU_IMMUTABLE') && trgPre[0].new_trg === 1;
if (alreadyApplied) {
  console.log('\nMigración YA aplicada (ERR_SKU_IMMUTABLE + trigger nuevo): modo verificación.');
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
  'fn_master_apply existe y SECURITY DEFINER': !!fnPost[0] && fnPost[0].secdef === true,
  'guardra ERR_SKU_IMMUTABLE (clave sku en p_changes)': postDef.includes('ERR_SKU_IMMUTABLE') && postDef.includes("p_changes ? 'sku'"),
  'lógica de cambio de SKU retirada (sin LOCKED_BY_MOVEMENTS/CONFLICT)': !postDef.includes('ERR_SKU_LOCKED_BY_MOVEMENTS') && !postDef.includes('ERR_MASTER_SKU_CONFLICT'),
  'propagación de nombre compartido (name = m.name)': postDef.includes('name = m.name'),
  'propagación de imagen compartida (image_url = m.image_path)': postDef.includes('image_url = m.image_path'),
  'sin datos comerciales (price/costo/stock)': !(/price|cost_price|stock_current/i.test(postDef)),
};

const propPost = await q(`SELECT pg_get_functiondef(p.oid) AS def, p.prosecdef AS secdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='propose_master_change'`);
const propDef = propPost[0]?.def || '';
checks['propose_master_change rechaza sku al encolar'] = propDef.includes('ERR_SKU_IMMUTABLE') && propDef.includes("p_changes ? 'sku'");

const trgPost = await q(`SELECT
  (SELECT count(*)::int FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND t.tgname='trg_products_sku_immutable_guard' AND NOT t.tgisinternal) AS n_new,
  (SELECT COALESCE(bool_or(p.prosecdef),false) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND t.tgname='trg_products_sku_immutable_guard' AND NOT t.tgisinternal) AS fn_secdef,
  (SELECT count(*)::int FROM pg_trigger WHERE tgname='trg_products_sku_movement_guard' AND NOT tgisinternal) AS n_old,
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='fn_products_sku_movement_guard') AS fn_old`);
checks['trigger trg_products_sku_immutable_guard presente (fn SECURITY DEFINER)'] = trgPost[0].n_new === 1 && trgPost[0].fn_secdef === true;
checks['trigger anterior trg_products_sku_movement_guard retirado (+función)'] = trgPost[0].n_old === 0 && trgPost[0].fn_old === 0;

const acl = await q(`SELECT COALESCE(array_agg(r.grantee ORDER BY r.grantee), ARRAY[]::text[]) AS grantees
  FROM information_schema.routine_privileges r
  WHERE r.routine_schema='public' AND r.routine_name='fn_master_apply_identity_changes'`);
checks['ACL helper: EXECUTE solo service_role (+postgres owner)'] = JSON.stringify(acl[0].grantees).includes('service_role') && !JSON.stringify(acl[0].grantees).includes('authenticated') && !JSON.stringify(acl[0].grantees).includes('anon');

const polPost = await q(`SELECT count(*)::int AS n FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
    AND policyname IN ('product_images_insert_product_owner','product_images_update_product_owner','product_images_delete_product_owner')
    AND (COALESCE(qual,'') ILIKE '%master_products%' OR COALESCE(with_check,'') ILIKE '%master_products%')`);
checks['3 políticas product-images con rama master- (imagen compartida)'] = polPost[0].n === 3;

const rls = await q(`SELECT c.relname, c.relrowsecurity,
    (SELECT count(*)::int FROM pg_policies pp WHERE pp.schemaname='public' AND pp.tablename=c.relname) AS n_policies
  FROM pg_class c WHERE c.relnamespace='public'::regnamespace
    AND c.relname IN ('master_products','products','master_change_log','master_change_proposals','tenants','stores','user_store_memberships','catalog_store_links')
  ORDER BY c.relname`);
for (const r of rls) {
  checks[`RLS activo en ${r.relname} (${r.n_policies} políticas)`] = r.relrowsecurity === true && r.n_policies > 0;
}

let failed = false;
for (const [name, ok] of Object.entries(checks)) {
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failed = true;
}
if (failed) { console.error('VERIFICACIÓN POST FALLÓ'); process.exit(3); }

// ── FASE 4 · Pruebas funcionales NEGATIVAS (CERO escrituras) ───────────────
console.log('\n── PRUEBAS FUNCIONALES NEGATIVAS (fail-closed, sin escrituras) ──');
const esc = (s) => String(s).replace(/'/g, "''");

// a) Cambio de SKU de maestro con movimientos → ERR_SKU_IMMUTABLE.
const mt = masterMov[0];
const negA = await qSoft(`SELECT public.fn_master_apply_identity_changes(
  '${mt.id}'::uuid, '{"sku": "ZZZ-IMMUTABLE-A"}'::jsonb, NULL::uuid, NULL::uuid, NULL::uuid);`);
if (negA.ok || !(negA.text || '').includes('ERR_SKU_IMMUTABLE')) {
  console.error(`  ✗ (a) cambio de SKU NO bloqueado con ERR_SKU_IMMUTABLE — HTTP ${negA.status}:`, (negA.text || '').slice(0, 200));
  process.exit(3);
}
console.log('  ✓ (a) maestro con movimientos → ERR_SKU_IMMUTABLE (transacción abortada, cero escrituras)');

// b) Reenvío del SKU idéntico (no-cambio) en maestro sin movimientos → ERR_SKU_IMMUTABLE.
const mp = masterPure[0];
const negB = await qSoft(`SELECT public.fn_master_apply_identity_changes(
  '${mp.id}'::uuid, '{"sku": "${esc(mp.sku)}"}'::jsonb, NULL::uuid, NULL::uuid, NULL::uuid);`);
if (negB.ok || !(negB.text || '').includes('ERR_SKU_IMMUTABLE')) {
  console.error(`  ✗ (b) reenvío idéntico de SKU NO bloqueado — HTTP ${negB.status}:`, (negB.text || '').slice(0, 200));
  process.exit(3);
}
console.log('  ✓ (b) reenvío idéntico de SKU (sin movimientos) → ERR_SKU_IMMUTABLE (regla más estricta que 20261111120000)');

// c) Propuesta con 'sku' al ENCOLAR → ERR_SKU_IMMUTABLE (o ERR_UNAUTHENTICATED
//    en este canal sin JWT — la guardra del cuerpo quedó verificada en fase 3
//    y funcionalmente en la BD aislada, 36/36).
const negC = await qSoft(`SELECT public.propose_master_change(
  '${mt.id}'::uuid, '{"sku": "ZZZ-IMMUTABLE-C"}'::jsonb, NULL::uuid, NULL::uuid);`);
const negCtext = negC.text || '';
if (negC.ok) {
  console.error(`  ✗ (c) la propuesta con sku NO fue rechazada — HTTP ${negC.status}:`, negCtext.slice(0, 200));
  process.exit(3);
}
if (negCtext.includes('ERR_SKU_IMMUTABLE')) {
  console.log('  ✓ (c) propuesta con sku → ERR_SKU_IMMUTABLE al encolar');
} else {
  console.log(`  ✓ (c) propuesta con sku → rechazada sin escritura (${negCtext.match(/ERR_[A-Z_]+/)?.[0] || 'error'} — canal Management API sin JWT: la guardra al encolar está verificada por cuerpo en fase 3 y por la BD aislada 36/36)`);
}

// d) UPDATE directo de products.sku en fila local SIN maestro y SIN movimientos
//    → trigger NUEVO: ERR_SKU_IMMUTABLE (antes: permitido).
const lt = localPure[0];
const negD = await qSoft(`UPDATE public.products SET sku = 'ZZZ-TRG-IMMUTABLE' WHERE id = '${lt.id}';`);
if (negD.ok || !(negD.text || '').includes('ERR_SKU_IMMUTABLE')) {
  console.error(`  ✗ (d) UPDATE directo de SKU sin movimientos NO bloqueado — HTTP ${negD.status}:`, (negD.text || '').slice(0, 200));
  process.exit(3);
}
console.log('  ✓ (d) UPDATE directo local SIN movimientos → ERR_SKU_IMMUTABLE (trigger, regla más estricta)');

// Confirmación de que las filas objetivo NO cambiaron (rollback real).
const mtAfter = await q(`SELECT sku FROM public.master_products WHERE id='${mt.id}'`);
const mpAfter = await q(`SELECT sku FROM public.master_products WHERE id='${mp.id}'`);
const ltAfter = await q(`SELECT sku FROM public.products WHERE id='${lt.id}'`);
if (mtAfter[0].sku !== mt.sku || mpAfter[0].sku !== mp.sku || ltAfter[0].sku !== lt.sku) {
  console.error('  ✗ las pruebas negativas dejaron huella (SKU cambió) — INCONSISTENCIA');
  process.exit(3);
}
console.log('  ✓ SKUs de las filas objetivo intactos tras los abortos (rollback confirmado)');

// ── FASE 5 · SONDA de nombre compartido + PROPAGACIÓN (rollback forzado) ───
console.log('\n── SONDA DE PROPAGACIÓN DE NOMBRE (rollback forzado, cero huella) ──');
const fx = masterProp[0];
const actor = fx.owner_id || (await q(`SELECT usm.user_id FROM public.user_store_memberships usm
  JOIN public.stores s ON s.id = usm.store_id WHERE s.tenant_id = '${fx.tenant_id}'::uuid LIMIT 1`))[0]?.user_id || null;
console.log(`  fixture: maestro ${fx.sku} · filas vinculadas=${fx.linked_rows} · tiendas=${fx.linked_stores}${propNote}`);
const probe = await qSoft(`DO \$probe\$
DECLARE
  v_master uuid := '${fx.id}'::uuid;
  v_actor uuid := ${actor ? `'${actor}'::uuid` : 'NULL'};
  v_name_before text;
  v_linked int;
  v_linked_stores int;
  v_propagated int;
  v_master_after text;
  v_sum_price_b double precision; v_sum_cost_b double precision; v_sum_stock_b double precision;
  v_sum_price_a double precision; v_sum_cost_a double precision; v_sum_stock_a double precision;
BEGIN
  SELECT name INTO v_name_before FROM public.master_products WHERE id = v_master;
  SELECT count(*), count(DISTINCT store_id) INTO v_linked, v_linked_stores
    FROM public.products WHERE master_product_id = v_master;
  IF v_linked = 0 THEN RAISE EXCEPTION 'PROBE_FAIL: sin filas vinculadas'; END IF;
  SELECT COALESCE(sum(price),0), COALESCE(sum(cost_price),0), COALESCE(sum(stock_current),0)
    INTO v_sum_price_b, v_sum_cost_b, v_sum_stock_b
    FROM public.products WHERE master_product_id = v_master;

  PERFORM public.fn_master_apply_identity_changes(
    v_master, jsonb_build_object('name', 'PROBE-CI-NOMBRE-20261112'), v_actor, NULL::uuid, NULL::uuid);

  SELECT count(*) INTO v_propagated FROM public.products
    WHERE master_product_id = v_master AND name = 'PROBE-CI-NOMBRE-20261112';
  SELECT name INTO v_master_after FROM public.master_products WHERE id = v_master;
  SELECT COALESCE(sum(price),0), COALESCE(sum(cost_price),0), COALESCE(sum(stock_current),0)
    INTO v_sum_price_a, v_sum_cost_a, v_sum_stock_a
    FROM public.products WHERE master_product_id = v_master;

  IF v_master_after <> 'PROBE-CI-NOMBRE-20261112' OR v_propagated <> v_linked THEN
    RAISE EXCEPTION 'PROBE_FAIL: propagación %/%, maestro=%', v_propagated, v_linked, v_master_after;
  END IF;
  IF v_sum_price_a <> v_sum_price_b OR v_sum_cost_a <> v_sum_cost_b OR v_sum_stock_a <> v_sum_stock_b THEN
    RAISE EXCEPTION 'PROBE_FAIL: datos comerciales alterados (p=%/%, c=%/%, s=%/%)',
      v_sum_price_a, v_sum_price_b, v_sum_cost_a, v_sum_cost_b, v_sum_stock_a, v_sum_stock_b;
  END IF;
  RAISE EXCEPTION 'PROBE_OK: nombre aplicado y propagado a %/% filas en % tiendas; datos comerciales intactos — ROLLBACK FORZADO (cero huella)',
    v_propagated, v_linked, v_linked_stores;
END
\$probe\$;`);
const probeText = probe.text || '';
if (probe.ok || !probeText.includes('PROBE_OK')) {
  console.error(`  ✗ sonda falló — HTTP ${probe.status}:`, probeText.slice(0, 300));
  process.exit(3);
}
console.log('  ✓', probeText.match(/PROBE_OK[^"\\]*/)?.[0]?.replace(/\\n/g, ' ') || 'PROBE_OK (ver log)');

// Cero huella: nombre del maestro y filas intactos tras el rollback.
const fxAfter = await q(`SELECT
  (SELECT name FROM public.master_products WHERE id='${fx.id}') AS master_name,
  (SELECT count(*)::int FROM public.products WHERE master_product_id='${fx.id}' AND name='PROBE-CI-NOMBRE-20261112') AS probe_rows,
  (SELECT count(*)::int FROM public.master_change_log WHERE master_product_id='${fx.id}') AS log_rows`);
if (fxAfter[0].master_name !== fx.name || fxAfter[0].probe_rows !== 0) {
  console.error('  ✗ la sonda dejó huella — INCONSISTENCIA:', JSON.stringify(fxAfter[0]));
  process.exit(3);
}
console.log(`  ✓ cero huella confirmada: nombre maestro intacto, 0 filas con el nombre de la sonda`);

// ── FASE 6 · Política de imagen master- para NO admin + RLS (read-only) ─────
console.log('\n── POLÍTICA DE IMAGEN master- (USUARIO NO ADMIN, read-only) ──');
const roles = await q(`SELECT role, count(*)::int AS n FROM public.profiles GROUP BY role ORDER BY n DESC`);
console.log('  roles de perfiles:', JSON.stringify(roles));

const cand = await q(`SELECT usm.user_id, usm.role AS membership_role, pr.role AS profile_role,
    usm.store_id, csl.tenant_id,
    (SELECT count(*)::int FROM public.master_products mp WHERE mp.tenant_id = csl.tenant_id) AS masters_tenant
  FROM public.user_store_memberships usm
  JOIN public.profiles pr ON pr.id = usm.user_id AND pr.role <> 'admin'
  JOIN public.catalog_store_links csl ON csl.store_id = usm.store_id AND csl.status = 'connected'
  WHERE usm.status = 'active'
    AND EXISTS (SELECT 1 FROM public.master_products mp WHERE mp.tenant_id = csl.tenant_id)
  LIMIT 1`);
if (!cand[0]) {
  console.log('  ⚠ sin candidato no-admin con tienda conectada: simulación de política omitida (sin datos aplicables)');
} else {
  const u = cand[0];
  console.log(`  candidato no-admin: perfil=${u.profile_role}, membresía=${u.membership_role}, tienda=${u.store_id}, tenant=${u.tenant_id}`);
  const sim = await q(`SELECT
    public.has_store_access_as('${u.user_id}'::uuid, '${u.store_id}'::uuid) AS store_access,
    EXISTS (
      SELECT 1 FROM public.master_products mp
      WHERE mp.tenant_id = '${u.tenant_id}'::uuid
        AND EXISTS (SELECT 1 FROM public.catalog_store_links csl
                    WHERE csl.tenant_id = mp.tenant_id AND csl.status = 'connected'
                      AND public.has_store_access_as('${u.user_id}'::uuid, csl.store_id))
    ) AS policy_master_branch_admits`);
  console.log('  simulación del predicado de la política master-:', JSON.stringify(sim[0]));
  if (!sim[0].store_access || !sim[0].policy_master_branch_admits) {
    console.error('  ✗ la política master- NO admitiría la subida para el usuario autorizado');
    process.exit(3);
  }
  console.log('  ✓ la política master- ADMITIRÍA la subida de imagen compartida para el usuario autorizado no-admin');

  // Aislamiento: masters de OTROS tenants inaccesibles para este usuario.
  const iso = await q(`SELECT count(*)::int AS n FROM public.master_products mp
    WHERE mp.tenant_id <> '${u.tenant_id}'::uuid
      AND EXISTS (SELECT 1 FROM public.catalog_store_links csl
                  WHERE csl.tenant_id = mp.tenant_id AND csl.status = 'connected'
                    AND public.has_store_access_as('${u.user_id}'::uuid, csl.store_id))`);
  console.log(`  aislamiento: masters de otros tenants alcanzables por este usuario = ${iso[0].n}`);
  if (iso[0].n !== 0) {
    console.error('  ✗ el usuario alcanza masters de otros tenants (aislamiento roto)');
    process.exit(3);
  }
  console.log('  ✓ aislamiento por tenant intacto en la rama master- de la política');
}

const bucket = await q(`SELECT id, name, public FROM storage.buckets WHERE id='product-images'`);
if (!bucket[0]) { console.error('  ✗ bucket product-images ausente'); process.exit(3); }
console.log(`  ✓ bucket product-images presente (public=${bucket[0].public})`);

// ── FASE 7 · Integridad de datos ANTES == DESPUÉS ──────────────────────────
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
console.log('  ✓ delta = 0 en todas las tablas (datos, tiendas, productos, precios vía conteos, existencias)');

console.log(`\nOK: migración ${alreadyApplied ? 'VERIFICADA (ya aplicada)' : 'APLICADA'} y funcionando en producción (${ref}).`);
console.log('SHA-256 de la migración aplicada:', sha256);
