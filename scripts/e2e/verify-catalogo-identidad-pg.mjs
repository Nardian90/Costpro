#!/usr/bin/env node
/**
 * CORRECCIÓN FUNCIONAL — CATÁLOGO MAESTRO DE LA ORGANIZACIÓN (2026-11-12) —
 * Verificación de la migración 20261112120000 en PostgreSQL REAL
 * (BD desechable del proyecto aislado CostproE2E, guard fail-closed del repo).
 * NO toca producción.
 *
 * Fases:
 *   0. Pre-chequeos: conteos de datos históricos/financieros ANTES.
 *   1. Aplicar la migración (multi-statement, simple query protocol).
 *   2. Firmas: fn_master_apply_identity_changes con ERR_SKU_IMMUTABLE y SIN
 *      la lógica de cambio de SKU (movimientos/colisión); propose_master_
 *      change rechaza 'sku' al encolar; trigger trg_products_sku_immutable_
 *      guard presente (SECURITY DEFINER) y el anterior retirado; políticas
 *      de storage product-images con la rama master-.
 *   3. Fixture determinista (limpia → crea): organización con 2 tiendas
 *      CONECTADAS, maestros, filas locales vinculadas/puras, usuario
 *      gobernador (propietario del tenant) y usuario encargado de tienda 1
 *      (no gobernador — para el flujo de propuestas).
 *   4. REGLA SKU INMUTABLE (brief 2026-11-12 §2/§8.7):
 *      · maestro CON movimientos en filas vinculadas → ERR_SKU_IMMUTABLE.
 *      · maestro SIN movimientos (sin filas locales) → ERR_SKU_IMMUTABLE
 *        (regla MÁS ESTRICTA que 20261111120000: cualquier clave 'sku').
 *      · reenvío del SKU idéntico (no-cambio) → ERR_SKU_IMMUTABLE (la clave
 *        ya no forma parte del contrato de identidad editable).
 *      · propuesta con 'sku' → ERR_SKU_IMMUTABLE al ENCOLAR.
 *      · UPDATE directo de products.sku en fila local SIN maestro (con o sin
 *        movimientos) → ERR_SKU_IMMUTABLE (trigger fail-closed).
 *      · UPDATE directo de products.sku en fila VINCULADA → coerción del
 *        maestro (identity guard), sin error y sin cambio real.
 *   5. NOMBRE compartido editable (§3):
 *      · update_master_product({name}) → aplicado, auditado y PROPAGADO a
 *        TODAS las filas locales vinculadas; precios/costos/existencias de
 *        cada tienda INTACTOS (verificación por fila).
 *      · UPDATE local del nombre de una fila vinculada (PostgREST directo)
 *        → coerción al nombre canónico del maestro.
 *      · propuesta de nombre desde encargado (no gobernador) → pendiente;
 *        aprobación del gobernador (review_master_proposal) → aplicada y
 *        propagada.
 *      · nombre vacío → ERR_INVALID_CHANGES (validación conservada).
 *   6. Creación desde el servicio único (§4/§5): create_master_product como
 *      encargado de tienda conectada → maestro + fila local con defaults de
 *      alta manual (precio 0/CUP, min_stock 1, existencia 0), SIN duplicar
 *      (ERR_MASTER_SKU_EXISTS al repetir SKU) y SIN copiar datos comerciales.
 *   7. Conteos DESPUÉS == ANTES en tablas históricas/financieras + cleanup.
 *
 * Uso:  node scripts/e2e/verify-catalogo-identidad-pg.mjs
 * Requiere SUPABASE_ACCESS_TOKEN y E2E_SUPABASE_DB_URL en el entorno.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SUPA_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!SUPA_TOKEN) {
  console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido para el transporte Management API.');
  process.exit(2);
}
const E2E_REF = 'lguovmvrozxgssupkwpf';

async function execSql(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${E2E_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(`SQL HTTP ${res.status}: ${msg?.slice(0, 400)}`);
  }
  if (body && !Array.isArray(body) && body.error) throw new Error(`SQL error: ${JSON.stringify(body).slice(0, 400)}`);
  return Array.isArray(body) ? body : [];
}

function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** q(sql, params?) — interpola $n con literales seguros y devuelve { rows }. */
async function q(sql, params = []) {
  let out = sql;
  params.forEach((v, i) => { out = out.split(`$${i + 1}`).join(lit(v)); });
  const rows = await execSql(out);
  return { rows };
}

/** Ejecuta SQL esperando un error controlado — devuelve el mensaje o null. */
async function qExpectError(sql, params = []) {
  try {
    await q(sql, params);
    return null;
  } catch (e) {
    return e.message;
  }
}

/**
 * Impersonación de usuario autenticado en UN ÚNICO statement (cada llamada
 * HTTP del Management API es una sesión efímera): el CTE fija rol+claims y
 * el LATERAL ejecuta el RPC dependiendo de él. (Patrón del verificador
 * canónico 20261108150000 / 20261111120000.)
 */
async function asAuthSql(rpcSql, uid) {
  const claims = lit(JSON.stringify({ role: 'authenticated', sub: uid }));
  const sql = `WITH setup AS (
    SELECT set_config('role','authenticated',false) AS a,
           set_config('request.jwt.claims', ${claims}, false) AS b,
           set_config('request.jwt.claim.sub', ${lit(uid)}, false) AS c
  )
  SELECT r.* FROM setup, LATERAL (
    ${rpcSql}
  ) r;`;
  return execSql(sql);
}

/** RPC autenticado que se espera que FALLE — devuelve el mensaje o null. */
async function asAuthExpectError(rpcSql, uid) {
  try {
    await asAuthSql(rpcSql, uid);
    return null;
  } catch (e) {
    return e.message;
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

const DB_URL = process.env.E2E_SUPABASE_DB_URL || '';
if (!DB_URL.includes('lguovmvrozxgssupkwpf')) {
  console.error('FALLO DE SEGURIDAD: E2E_SUPABASE_DB_URL debe apuntar al proyecto aislado CostproE2E (lguovmvrozxgssupkwpf). Abortando.');
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// GUARD CANÓNICO DEL REPO (CP-INFRA-011): fail-closed contra producción.
const { assertIsolatedDb } = await import(
  pathToFileURL(join(repoRoot, 'e2e', 'fixtures', 'assert-isolated-db.ts')).href
).catch(() => ({}));
const guard = assertIsolatedDb
  ? { assertIsolatedDb }
  : await import(pathToFileURL(join(repoRoot, 'e2e', 'fixtures', 'assert-isolated-db.cjs')).href);
if (!guard?.assertIsolatedDb) {
  console.error('FALLO DE SEGURIDAD: no se pudo cargar e2e/fixtures/assert-isolated-db (guard canónico). Abortando.');
  process.exit(2);
}
await guard.assertIsolatedDb();

const MIGRATION = join(repoRoot, 'supabase', 'migrations', '20261112120000_cp_catalogo_sku_inmutable.sql');

// IDs deterministas del fixture (re-ejecutable: limpia antes de crear).
const FX = {
  tenant1: 'dd0100a1-0000-4000-8000-00000000000a',
  store1: 'dd0100b1-0000-4000-8000-00000000000a',
  store2: 'dd0100b2-0000-4000-8000-00000000000a',
  user1: 'dd0100c1-0000-4000-8000-00000000000a', // gobernador (propietario del tenant)
  user2: 'dd0100c2-0000-4000-8000-00000000000a', // encargado de tienda 1 (no gobernador)
  master1: 'dd0100d1-0000-4000-8000-00000000000a',
  master2: 'dd0100d2-0000-4000-8000-00000000000a',
  master3: 'dd0100d3-0000-4000-8000-00000000000a', // creado en fase 6 por create_master_product
  p1: 'dd0100e1-0000-4000-8000-00000000000a',
  p2: 'dd0100e2-0000-4000-8000-00000000000a',
  p4: 'dd0100e4-0000-4000-8000-00000000000a',
  p5: 'dd0100e5-0000-4000-8000-00000000000a',
  p6: 'dd0100e6-0000-4000-8000-00000000000a', // fila local del maestro creado (fase 6)
};

async function sensitiveCounts() {
  const tables = ['transactions', 'transaction_items', 'inventory', 'stock_movements', 'receipts', 'receipt_items', 'master_change_log', 'audit_logs'];
  const out = {};
  for (const t of tables) {
    try {
      const r = await q(`SELECT COUNT(*)::int AS n FROM public.${t}`);
      out[t] = r.rows[0].n;
    } catch {
      out[t] = '(tabla inexistente)';
    }
  }
  return out;
}

async function fixtureCleanup() {
  // Re-ejecutabilidad: borra residuos de corridas anteriores (solo IDs y
  // prefijos del fixture — incl. el maestro aleatorio creado por la fase 6).
  // audit_logs se limpia AL FINAL (los triggers auditan los DELETE). El orden
  // respeta las FK: propuestas → movimientos/inventario → productos →
  // master_change_log (por tenant/prefijo, no solo FX) → maestros.
  await q(`DELETE FROM public.master_change_proposals WHERE tenant_id = $1 OR master_product_id IN ($2,$3,$4)`, [FX.tenant1, FX.master1, FX.master2, FX.master3]).catch(() => {});
  await q(`DELETE FROM public.stock_movements WHERE product_id IN ($1,$2,$3,$4,$5)`, [FX.p1, FX.p2, FX.p4, FX.p5, FX.p6]).catch(() => {});
  await q(`DELETE FROM public.inventory WHERE product_id IN ($1,$2,$3,$4,$5)`, [FX.p1, FX.p2, FX.p4, FX.p5, FX.p6]).catch(() => {});
  await q(`DELETE FROM public.products WHERE id IN ($1,$2,$3,$4,$5) OR (store_id IN ($6,$7) AND sku LIKE 'CI-%')`, [FX.p1, FX.p2, FX.p4, FX.p5, FX.p6, FX.store1, FX.store2]);
  await q(`DELETE FROM public.master_change_log WHERE master_product_id IN ($1,$2,$3) OR master_product_id IN (SELECT id FROM public.master_products WHERE tenant_id = $4 AND sku LIKE 'CI-%')`, [FX.master1, FX.master2, FX.master3, FX.tenant1]);
  await q(`DELETE FROM public.audit_logs WHERE table_name = 'master_products' AND record_id IN ($1,$2,$3)`, [FX.master1, FX.master2, FX.master3]);
  await q(`DELETE FROM public.master_products WHERE id IN ($1,$2,$3) OR (tenant_id = $4 AND sku LIKE 'CI-%')`, [FX.master1, FX.master2, FX.master3, FX.tenant1]);
  await q(`DELETE FROM public.user_store_memberships WHERE user_id IN ($1,$2)`, [FX.user1, FX.user2]);
  await q(`DELETE FROM public.audit_logs WHERE store_id IN ($1,$2) OR user_id IN ($3,$4) OR record_id IN ($5,$6,$7)`, [FX.store1, FX.store2, FX.user1, FX.user2, FX.master1, FX.master2, FX.master3]);
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log('\n════════ RESUMEN CATÁLOGO-IDENTIDAD SKU INMUTABLE + NOMBRE COMPARTIDO (PostgreSQL real, BD E2E aislada) ════════');
  console.log(`Total: ${results.length} · OK: ${results.length - failed.length} · FALLOS: ${failed.length}`);
  if (results.length === 0) {
    console.log('SIN VERIFICACIONES EJECUTADAS (error de conexión).');
    process.exitCode = 2;
  } else if (failed.length) {
    for (const f of failed) console.log(`  ✗ ${f.name} ${f.detail}`);
    process.exitCode = 1;
  } else {
    console.log('TODAS las verificaciones PostgreSQL pasaron.');
  }
}

async function main() {
  const migSql = readFileSync(MIGRATION, 'utf8');
  const before = await sensitiveCounts();

  // ── FASE 1: aplicar la migración ────────────────────────────────────────
  try {
    await q(migSql);
    check('1.1 migración 20261112120000 aplicada SIN errores en PostgreSQL real', true);
  } catch (e) {
    check('1.1 migración 20261112120000 aplicada SIN errores en PostgreSQL real', false, e.message);
    return finish();
  }
  const afterMig = await sensitiveCounts();
  check('1.2 aplicar la migración NO cambia ninguna tabla (solo DDL de funciones/trigger/políticas)', Object.keys(before).every((t) => before[t] === afterMig[t]));

  // ── FASE 2: firmas, trigger y políticas ─────────────────────────────────
  const fn = (await q(`SELECT p.prosecdef AS secdef, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_master_apply_identity_changes'`)).rows[0];
  check('2.1 fn_master_apply_identity_changes: SECURITY DEFINER + search_path fijado', !!fn?.secdef && /search_path/.test(fn.def || ''));
  check('2.2 ERR_SKU_IMMUTABLE presente en la guardra del punto único', /ERR_SKU_IMMUTABLE/.test(fn.def || ''));
  check('2.3 la lógica de cambio de SKU del maestro DESAPARECIÓ (ni movimientos ni colisión)', !/ERR_SKU_LOCKED_BY_MOVEMENTS/.test(fn.def || '') && !/ERR_MASTER_SKU_CONFLICT/.test(fn.def || ''));
  check('2.4 propagación de imagen y nombre compartidos conservada', /SET image_url = m\.image_path/.test(fn.def || '') && /name = m\.name/.test(fn.def || ''));

  const fnProp = (await q(`SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='propose_master_change'`)).rows[0];
  check('2.5 propose_master_change rechaza la clave sku al ENCOLAR (ERR_SKU_IMMUTABLE)', /ERR_SKU_IMMUTABLE/.test(fnProp?.def || ''));

  const trgNew = (await q(`SELECT t.tgname, p.prosecdef AS secdef
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND t.tgname='trg_products_sku_immutable_guard' AND NOT t.tgisinternal`)).rows;
  const trgOld = (await q(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'trg_products_sku_movement_guard' AND NOT tgisinternal`)).rows[0].n;
  check('2.6 trigger trg_products_sku_immutable_guard presente (SECURITY DEFINER) y el anterior RETIRADO', trgNew.length === 1 && trgNew[0].secdef === true && trgOld === 0);

  const polCount = (await q(`SELECT count(*)::int AS n FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname IN ('product_images_insert_product_owner','product_images_update_product_owner','product_images_delete_product_owner')
      AND (COALESCE(qual,'') ILIKE '%master_products%' OR COALESCE(with_check,'') ILIKE '%master_products%')`)).rows[0].n;
  check('2.7 las 3 políticas de product-images incluyen la rama master- (imagen compartida)', polCount === 3, `rama master- en ${polCount}/3`);

  // ── FASE 3: fixture (limpia → crea) ────────────────────────────────────
  await fixtureCleanup();
  await q(`INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
           VALUES ($1, $2, 'x', now(), now(), now(), '{"name":"Verificacion CI gov"}'::jsonb) ON CONFLICT (id) DO NOTHING`, [FX.user1, 'verify-ci-gov@example.invalid']);
  await q(`INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
           VALUES ($1, $2, 'x', now(), now(), now(), '{"name":"Verificacion CI enc"}'::jsonb) ON CONFLICT (id) DO NOTHING`, [FX.user2, 'verify-ci-enc@example.invalid']);
  await q(`INSERT INTO public.profiles (id, role) VALUES ($1, 'usuario') ON CONFLICT (id) DO NOTHING`, [FX.user1]);
  await q(`INSERT INTO public.profiles (id, role) VALUES ($1, 'usuario') ON CONFLICT (id) DO NOTHING`, [FX.user2]);
  await q(`INSERT INTO public.tenants (id, name, owner_id) VALUES ($1, 'ORG-VERIFY-CATALOGO-IDENTIDAD', $2) ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id`, [FX.tenant1, FX.user1]);
  await q(`INSERT INTO public.stores (id, name, tenant_id) VALUES ($1, 'Tienda CI 1', $2) ON CONFLICT (id) DO NOTHING`, [FX.store1, FX.tenant1]);
  await q(`INSERT INTO public.stores (id, name, tenant_id) VALUES ($1, 'Tienda CI 2', $2) ON CONFLICT (id) DO NOTHING`, [FX.store2, FX.tenant1]);
  await q(`INSERT INTO public.user_store_memberships (user_id, store_id, role, status) VALUES ($1, $2, 'encargado', 'active') ON CONFLICT (user_id, store_id) DO UPDATE SET role='encargado', status='active'`, [FX.user2, FX.store1]);
  await q(`INSERT INTO public.catalog_store_links (tenant_id, store_id, status) VALUES ($1, $2, 'connected') ON CONFLICT (store_id) DO UPDATE SET status='connected'`, [FX.tenant1, FX.store1]);
  await q(`INSERT INTO public.catalog_store_links (tenant_id, store_id, status) VALUES ($1, $2, 'connected') ON CONFLICT (store_id) DO UPDATE SET status='connected'`, [FX.tenant1, FX.store2]);
  for (const [id, sku, name] of [[FX.master1, 'CI-M001', 'Cable Solar 6mm'], [FX.master2, 'CI-M002', 'Regleta premium']]) {
    await q(`INSERT INTO public.master_products (id, tenant_id, sku, name, is_service, status, created_by)
             VALUES ($1, $2, $3, $4, false, 'active', $5) ON CONFLICT (id) DO NOTHING`, [id, FX.tenant1, sku, name, FX.user1]);
  }
  // M1: vinculado en S1 (sin movimientos) y S2 (CON stock_movements real).
  await q(`INSERT INTO public.products (id, store_id, tenant_id, master_product_id, sku, name, price, price_currency, cost_price, min_stock, stock_current, is_active, is_complete)
           VALUES ($1, $2, $3, $4, 'CI-M001', 'Cable Solar 6mm', 100, 'CUP', 50, 1, 7, true, true) ON CONFLICT (id) DO NOTHING`, [FX.p1, FX.store1, FX.tenant1, FX.master1]);
  await q(`INSERT INTO public.products (id, store_id, tenant_id, master_product_id, sku, name, price, price_currency, cost_price, min_stock, stock_current, is_active, is_complete)
           VALUES ($1, $2, $3, $4, 'CI-M001', 'Cable Solar 6mm', 120, 'CUP', 60, 1, 4, true, true) ON CONFLICT (id) DO NOTHING`, [FX.p2, FX.store2, FX.tenant1, FX.master1]);
  // Locales puros SIN movimiento (P4) y CON movimiento (P5) en S1.
  await q(`INSERT INTO public.products (id, store_id, tenant_id, sku, name, price, price_currency, cost_price, min_stock, stock_current, is_active, is_complete)
           VALUES ($1, $2, $3, 'CI-LOC-SIN', 'Producto local sin movimientos', 10, 'CUP', 5, 1, 2, true, true) ON CONFLICT (id) DO NOTHING`, [FX.p4, FX.store1, FX.tenant1]);
  await q(`INSERT INTO public.products (id, store_id, tenant_id, sku, name, price, price_currency, cost_price, min_stock, stock_current, is_active, is_complete)
           VALUES ($1, $2, $3, 'CI-LOC-CON', 'Producto local con movimientos', 10, 'CUP', 5, 1, 2, true, true) ON CONFLICT (id) DO NOTHING`, [FX.p5, FX.store1, FX.tenant1]);
  await q(`INSERT INTO public.stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
           VALUES ($1, $2, 'purchase', 5, 3, 'Verificacion CI', now(), $3, now())`, [FX.p2, FX.store2, FX.user1]);
  await q(`INSERT INTO public.stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
           VALUES ($1, $2, 'purchase', 2, 1, 'Verificacion CI', now(), $3, now())`, [FX.p5, FX.store1, FX.user1]);
  check('3.1 fixture determinista creado (2 tiendas conectadas, gobernador + encargado, maestros, filas vinculadas/puras, movimientos reales)', true);

  // ── FASE 4: REGLA SKU INMUTABLE ─────────────────────────────────────────
  const errM1 = await asAuthExpectError(`SELECT public.update_master_product(${lit(FX.master1)}, '{"sku": "CI-M001-NEW"}'::jsonb, NULL) AS r`, FX.user1);
  check('4.1 maestro CON movimientos en filas vinculadas → ERR_SKU_IMMUTABLE', /ERR_SKU_IMMUTABLE/.test(errM1 || ''), (errM1 || '').slice(0, 120));

  const errM2 = await asAuthExpectError(`SELECT public.update_master_product(${lit(FX.master2)}, '{"sku": "CI-M002-NEW"}'::jsonb, NULL) AS r`, FX.user1);
  check('4.2 maestro SIN movimientos (sin filas locales) → ERR_SKU_IMMUTABLE (regla MÁS ESTRICTA que 20261111120000)', /ERR_SKU_IMMUTABLE/.test(errM2 || ''), (errM2 || '').slice(0, 120));
  const m2sku = (await q(`SELECT sku FROM public.master_products WHERE id = $1`, [FX.master2])).rows[0].sku;
  check('4.3 el SKU del maestro SIN movimientos PERMANECE inalterado (nada se persistió)', m2sku === 'CI-M002', m2sku);

  const errSame = await asAuthExpectError(`SELECT public.update_master_product(${lit(FX.master2)}, '{"sku": "CI-M002"}'::jsonb, NULL) AS r`, FX.user1);
  check('4.4 reenvío del SKU idéntico (no-cambio) → ERR_SKU_IMMUTABLE (la clave ya no es parte del contrato editable)', /ERR_SKU_IMMUTABLE/.test(errSame || ''), (errSame || '').slice(0, 120));

  const errProp = await asAuthExpectError(`SELECT public.propose_master_change(${lit(FX.master1)}, '{"sku": "CI-M001-PROP"}'::jsonb, ${lit(FX.store1)}) AS r`, FX.user2);
  check('4.5 propuesta con clave sku → ERR_SKU_IMMUTABLE al ENCOLAR (nada entra a la cola)', /ERR_SKU_IMMUTABLE/.test(errProp || ''), (errProp || '').slice(0, 120));
  const propSkuCount = (await q(`SELECT count(*)::int AS n FROM public.master_change_proposals WHERE tenant_id = $1`, [FX.tenant1])).rows[0].n;
  check('4.6 la cola de propuestas NO contiene la propuesta de sku', propSkuCount === 0, `propuestas: ${propSkuCount}`);

  const errLocalSin = await qExpectError(`UPDATE public.products SET sku = 'CI-LOC-SIN-NEW' WHERE id = $1`, [FX.p4]);
  check('4.7 UPDATE local de products.sku SIN maestro y SIN movimientos → ERR_SKU_IMMUTABLE (trigger)', /ERR_SKU_IMMUTABLE/.test(errLocalSin || ''), (errLocalSin || '').slice(0, 120));
  const errLocalCon = await qExpectError(`UPDATE public.products SET sku = 'CI-LOC-CON-NEW' WHERE id = $1`, [FX.p5]);
  check('4.8 UPDATE local de products.sku SIN maestro y CON movimientos → ERR_SKU_IMMUTABLE (subsumido por la regla general)', /ERR_SKU_IMMUTABLE/.test(errLocalCon || ''), (errLocalCon || '').slice(0, 120));

  // Fila VINCULADA: el UPDATE del SKU (y nombre) se coerciona al maestro — sin error.
  await q(`UPDATE public.products SET sku = 'CI-M001-HACK', name = 'Nombre pirateado' WHERE id = $1`, [FX.p1]);
  const p1After = (await q(`SELECT sku, name FROM public.products WHERE id = $1`, [FX.p1])).rows[0];
  check('4.9 UPDATE local de fila VINCULADA → coerción al maestro (SKU y nombre canónicos, sin error)', p1After.sku === 'CI-M001' && p1After.name === 'Cable Solar 6mm', `${p1After.sku}/${p1After.name}`);

  // ── FASE 5: NOMBRE compartido editable + propagación ────────────────────
  const p1Before = (await q(`SELECT price, cost_price, stock_current FROM public.products WHERE id = $1`, [FX.p1])).rows[0];
  const p2Before = (await q(`SELECT price, cost_price, stock_current FROM public.products WHERE id = $1`, [FX.p2])).rows[0];
  const resName = await asAuthSql(`SELECT public.update_master_product(${lit(FX.master1)}, '{"name": "Cable Solar 6mm Premium", "description": "Descripcion compartida CI", "image_path": "master-img-ci.webp"}'::jsonb, ${lit(FX.store1)}) AS r`, FX.user1);
  const nameOk = JSON.stringify(resName[0]?.r || '').includes('success');
  check('5.1 update_master_product con nombre+descripción+imagen → success', nameOk, JSON.stringify(resName[0]?.r || '').slice(0, 100));

  const rowsAfter = (await q(`SELECT id, name, sku, description, image_url, price, cost_price, stock_current FROM public.products WHERE master_product_id = $1 ORDER BY id`, [FX.master1])).rows;
  const byId = Object.fromEntries(rowsAfter.map(r => [r.id, r]));
  check('5.2 el NOMBRE se PROPAGA a TODAS las tiendas vinculadas (S1 y S2)', byId[FX.p1]?.name === 'Cable Solar 6mm Premium' && byId[FX.p2]?.name === 'Cable Solar 6mm Premium', `${byId[FX.p1]?.name} | ${byId[FX.p2]?.name}`);
  check('5.3 la IMAGEN compartida se propaga por referencia (image_url = image_path del maestro)', byId[FX.p1]?.image_url === 'master-img-ci.webp' && byId[FX.p2]?.image_url === 'master-img-ci.webp');
  check('5.4 el SKU de las filas vinculadas PERMANECE (inmutable y coherente)', byId[FX.p1]?.sku === 'CI-M001' && byId[FX.p2]?.sku === 'CI-M001');
  check('5.5 precios/costos/existencias de cada tienda INTACTOS tras el cambio de identidad',
    String(byId[FX.p1]?.price) === String(p1Before.price) && String(byId[FX.p1]?.cost_price) === String(p1Before.cost_price) && String(byId[FX.p1]?.stock_current) === String(p1Before.stock_current)
    && String(byId[FX.p2]?.price) === String(p2Before.price) && String(byId[FX.p2]?.cost_price) === String(p2Before.cost_price) && String(byId[FX.p2]?.stock_current) === String(p2Before.stock_current),
    `S1 p=${byId[FX.p1]?.price}/${byId[FX.p1]?.cost_price} · S2 p=${byId[FX.p2]?.price}/${byId[FX.p2]?.cost_price}`);

  const auditName = (await q(`SELECT count(*)::int AS n FROM public.master_change_log WHERE master_product_id = $1 AND field = 'name'`, [FX.master1])).rows[0].n;
  check('5.6 auditoría por campo del nombre en master_change_log', auditName >= 1, `registros name: ${auditName}`);

  const errEmptyName = await asAuthExpectError(`SELECT public.update_master_product(${lit(FX.master1)}, '{"name": "   "}'::jsonb, NULL) AS r`, FX.user1);
  check('5.7 nombre vacío → ERR_INVALID_CHANGES (validación conservada)', /ERR_INVALID_CHANGES/.test(errEmptyName || ''), (errEmptyName || '').slice(0, 120));

  // Propuesta de NOMBRE desde encargado (no gobernador) → pendiente → aprobada → propagada.
  const propRes = await asAuthSql(`SELECT public.propose_master_change(${lit(FX.master2)}, '{"name": "Regleta premium USB-C"}'::jsonb, ${lit(FX.store1)}) AS r`, FX.user2);
  const propId = propRes[0]?.r?.proposal_id;
  check('5.8 encargado (no gobernador) propone cambio de NOMBRE → propuesta encolada', !!propId);
  const reviewRes = await asAuthSql(`SELECT public.review_master_proposal(${lit(propId)}, 'approved', 'aprobado CI') AS r`, FX.user1);
  check('5.9 el gobernador APRUEBA la propuesta → aplicada al maestro', JSON.stringify(reviewRes[0]?.r || '').includes('success'), JSON.stringify(reviewRes[0]?.r || '').slice(0, 100));
  const m2name = (await q(`SELECT name FROM public.master_products WHERE id = $1`, [FX.master2])).rows[0].name;
  check('5.10 el nombre propuesto quedó persistido en el maestro', m2name === 'Regleta premium USB-C', m2name);

  // ── FASE 6: creación desde el servicio único (create_master_product) ────
  const createRes = await asAuthSql(`SELECT public.create_master_product(${lit(FX.store1)}, 'CI-CREADO-1', 'Producto creado desde el dialogo', 'descripcion compartida', NULL, NULL, NULL, 'unidad', false, '{}'::jsonb) AS r`, FX.user2);
  const created = createRes[0]?.r || {};
  check('6.1 encargado de tienda conectada crea maestro + fila local (transacción atómica)', created.status === 'success' && !!created.master_product_id && !!created.product_id, JSON.stringify(created).slice(0, 140));
  const localCreated = (await q(`SELECT price, price_currency, cost_price, min_stock, stock_current, master_product_id, name, sku, description FROM public.products WHERE id = $1`, [created.product_id])).rows[0];
  const defaultsOk = localCreated && Number(localCreated.price) === 0 && localCreated.price_currency === 'CUP'
    && Number(localCreated.cost_price ?? 0) === 0 && Number(localCreated.min_stock) === 1 && Number(localCreated.stock_current) === 0;
  check('6.2 la fila local nace con defaults de alta manual: precio 0/CUP, min_stock 1, existencia 0', !!defaultsOk,
    localCreated ? `price=${localCreated.price}/${localCreated.price_currency} cost=${localCreated.cost_price} min=${localCreated.min_stock} stock=${localCreated.stock_current}` : 'fila no encontrada');
  check('6.3 el vínculo maestro-local queda establecido y la identidad compartida coincide', localCreated?.master_product_id === created.master_product_id && localCreated?.sku === 'CI-CREADO-1' && localCreated?.name === 'Producto creado desde el dialogo' && localCreated?.description === 'descripcion compartida');

  const errDup = await asAuthExpectError(`SELECT public.create_master_product(${lit(FX.store1)}, 'CI-CREADO-1', 'Duplicado', NULL, NULL, NULL, NULL, 'unidad', false, '{}'::jsonb) AS r`, FX.user2);
  check('6.4 SKU repetido → ERR_MASTER_SKU_EXISTS (sin identidades duplicadas)', /ERR_MASTER_SKU_EXISTS/.test(errDup || ''), (errDup || '').slice(0, 120));
  const mastersCiCreados = (await q(`SELECT count(*)::int AS n FROM public.master_products WHERE tenant_id = $1 AND sku = 'CI-CREADO-1'`, [FX.tenant1])).rows[0].n;
  check('6.5 existe EXACTAMENTE un maestro con ese SKU (sin duplicados ni huérfanos)', mastersCiCreados === 1, `maestros: ${mastersCiCreados}`);

  // ── FASE 7: preservación + cleanup ─────────────────────────────────────
  await fixtureCleanup();
  const after = await sensitiveCounts();
  check('7.1 conteos de tablas históricas/financieras IDÉNTICOS a los iniciales (cero residuos)', Object.keys(before).every((t) => before[t] === after[t]), Object.keys(before).filter((t) => before[t] !== after[t]).join(', ') || 'todas iguales');
  const leftovers = (await q(`SELECT count(*)::int AS n FROM public.products WHERE store_id IN ($1,$2) AND sku LIKE 'CI-%'`, [FX.store1, FX.store2])).rows[0].n;
  const leftoverMasters = (await q(`SELECT count(*)::int AS n FROM public.master_products WHERE tenant_id = $1 AND sku LIKE 'CI-%'`, [FX.tenant1])).rows[0].n;
  check('7.2 fixture completamente retirado (productos y maestros de verificación)', leftovers === 0 && leftoverMasters === 0, `productos: ${leftovers} · maestros: ${leftoverMasters}`);
  return finish();
}

main().catch((e) => {
  console.error('ERROR INESPERADO:', e?.message || e);
  process.exitCode = 2;
  finish();
});
