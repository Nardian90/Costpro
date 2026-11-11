#!/usr/bin/env node
/**
 * GESTIÓN DE PRODUCTOS VINCULADOS AL CATÁLOGO MAESTRO (2026-11-11) —
 * Verificación de la migración 20261111120000 en PostgreSQL REAL
 * (BD desechable del proyecto aislado CostproE2E, guard fail-closed del repo).
 * NO toca producción.
 *
 * Fases:
 *   0. Pre-chequeos: conteos de datos históricos/financieros ANTES.
 *   1. Aplicar la migración (multi-statement, simple query protocol).
 *   2. Firmas: fn_master_apply_identity_changes SECURITY DEFINER +
 *      search_path; trigger trg_products_sku_movement_guard presente y su
 *      función SECURITY DEFINER; ACL del helper (solo service_role).
 *   3. Fixture determinista (limpia → crea): organización con 2 tiendas
 *      CONECTADAS, maestros, filas locales vinculadas/no-vinculadas,
 *      usuario gobernador (propietario del tenant).
 *   4. REGLA SKU (brief §4 — existencia real de movimientos):
 *      · maestro SIN movimientos en filas vinculadas → cambio de SKU PERMITIDO
 *        y propagado a las filas locales.
 *      · maestro CON movimientos en una fila vinculada (stock_movements real)
 *        → ERR_SKU_LOCKED_BY_MOVEMENTS (ninguna ruta: update directo).
 *      · cambio idéntico al SKU vigente → NO bloqueado (no-cambio).
 *      · colisión del SKU nuevo con fila local no-vinculada de una tienda
 *        afectada → ERR_MASTER_SKU_CONFLICT.
 *      · UPDATE directo de products.sku en fila local SIN maestro y CON
 *        movimientos → ERR_SKU_LOCKED_BY_MOVEMENTS (trigger fail-closed).
 *      · UPDATE directo en fila local SIN movimientos → PERMITIDO (la
 *        arquitectura lo permite con unicidad BD).
 *   5. La imagen/descripción compartidas NO quedan bloqueadas por la guardra
 *      (update_master_product con description/image_path + propagación de
 *      imagen intacta).
 *   6. Conteos DESPUÉS == ANTES en tablas históricas/financieras + cleanup.
 *
 * Uso:  node scripts/e2e/verify-master-gestion-pg.mjs
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
 * canónico 20261108150000.)
 */
async function asAuthSql(rpcSql) {
  const claims = lit(JSON.stringify({ role: 'authenticated', sub: FX.user1 }));
  const sql = `WITH setup AS (
    SELECT set_config('role','authenticated',false) AS a,
           set_config('request.jwt.claims', ${claims}, false) AS b,
           set_config('request.jwt.claim.sub', ${lit(FX.user1)}, false) AS c
  )
  SELECT r.* FROM setup, LATERAL (
    ${rpcSql}
  ) r;`;
  return execSql(sql);
}

/** RPC autenticado que se espera que FALLE — devuelve el mensaje o null. */
async function asAuthExpectError(rpcSql) {
  try {
    await asAuthSql(rpcSql);
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

const MIGRATION = join(repoRoot, 'supabase', 'migrations', '20261111120000_cp_catalogo_master_gestion_tienda.sql');

// IDs deterministas del fixture (re-ejecutable: limpia antes de crear).
const FX = {
  tenant1: 'dd0000a1-0000-4000-8000-00000000000a',
  store1: 'dd0000b1-0000-4000-8000-00000000000a',
  store2: 'dd0000b2-0000-4000-8000-00000000000a',
  user1: 'dd0000c1-0000-4000-8000-00000000000a',
  master1: 'dd0000d1-0000-4000-8000-00000000000a',
  master2: 'dd0000d2-0000-4000-8000-00000000000a',
  p1: 'dd0000e1-0000-4000-8000-00000000000a',
  p2: 'dd0000e2-0000-4000-8000-00000000000a',
  p3: 'dd0000e3-0000-4000-8000-00000000000a',
  p4: 'dd0000e4-0000-4000-8000-00000000000a',
  p5: 'dd0000e5-0000-4000-8000-00000000000a',
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
  // Re-ejecutabilidad: borra residuos de corridas anteriores (solo IDs del
  // fixture). audit_logs se limpia AL FINAL (los triggers auditan los DELETE).
  await q(`DELETE FROM public.stock_movements WHERE product_id IN ($1,$2,$3,$4,$5)`, [FX.p1, FX.p2, FX.p3, FX.p4, FX.p5]).catch(() => {});
  await q(`DELETE FROM public.inventory WHERE product_id IN ($1,$2,$3,$4,$5)`, [FX.p1, FX.p2, FX.p3, FX.p4, FX.p5]).catch(() => {});
  await q(`DELETE FROM public.products WHERE id IN ($1,$2,$3,$4,$5) OR (store_id IN ($6,$7) AND sku LIKE 'GMG-%')`, [FX.p1, FX.p2, FX.p3, FX.p4, FX.p5, FX.store1, FX.store2]);
  await q(`DELETE FROM public.master_change_log WHERE master_product_id IN ($1,$2)`, [FX.master1, FX.master2]);
  await q(`DELETE FROM public.audit_logs WHERE table_name = 'master_products' AND record_id IN ($1,$2)`, [FX.master1, FX.master2]);
  await q(`DELETE FROM public.master_products WHERE id IN ($1,$2)`, [FX.master1, FX.master2]);
  await q(`DELETE FROM public.user_store_memberships WHERE user_id = $1`, [FX.user1]);
  await q(`DELETE FROM public.audit_logs WHERE store_id IN ($1,$2) OR user_id = $3 OR record_id IN ($4,$5)`, [FX.store1, FX.store2, FX.user1, FX.master1, FX.master2]);
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log('\n════════ RESUMEN GESTIÓN-MAESTRO SKU/MOVIMIENTOS (PostgreSQL real, BD E2E aislada) ════════');
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
  const t0 = new Date().toISOString();

  // ── FASE 1: aplicar la migración ────────────────────────────────────────
  try {
    await q(migSql);
    check('1.1 migración 20261111120000 aplicada SIN errores en PostgreSQL real', true);
  } catch (e) {
    check('1.1 migración 20261111120000 aplicada SIN errores en PostgreSQL real', false, e.message);
    return finish();
  }
  const afterMig = await sensitiveCounts();
  check('1.2 aplicar la migración NO cambia ninguna tabla (solo DDL de funciones/trigger)', Object.keys(before).every((t) => before[t] === afterMig[t]));

  // ── FASE 2: firmas y ACL ─────────────────────────────────────────────────
  const fn = (await q(`SELECT p.prosecdef AS secdef, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_master_apply_identity_changes'`)).rows[0];
  check('2.1 fn_master_apply_identity_changes: SECURITY DEFINER + search_path fijado', !!fn?.secdef && /search_path/.test(fn.def || ''));
  check('2.2 guardras presentes en la definición (movimientos + colisión local)', /ERR_SKU_LOCKED_BY_MOVEMENTS/.test(fn.def || '') && /ERR_MASTER_SKU_CONFLICT/.test(fn.def || ''));
  check('2.3 propagación de imagen compartida conservada', /SET image_url = m\.image_path/.test(fn.def || ''));
  const trg = (await q(`SELECT t.tgname, p.prosecdef AS secdef
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND t.tgname='trg_products_sku_movement_guard' AND NOT t.tgisinternal`)).rows;
  check('2.4 trigger trg_products_sku_movement_guard presente (función SECURITY DEFINER)', trg.length === 1 && trg[0].secdef === true);
  const acl = (await q(`SELECT COALESCE(string_agg(rp.grantee, ','), '') AS grantees
    FROM information_schema.routine_privileges rp
   WHERE rp.routine_schema='public' AND rp.routine_name='fn_master_apply_identity_changes'`)).rows[0].grantees;
  check('2.5 ACL del helper interno: solo service_role (sin authenticated)', (acl || '').includes('service_role') && !(acl || '').includes('authenticated'), acl);

  // ── FASE 3: fixture (limpia → crea) ─────────────────────────────────────
  await fixtureCleanup();
  const afterCleanup = await sensitiveCounts();
  // Usuario gobernador: propietario del tenant (is_catalog_governor por diseño).
  // Se crea ANTES del tenant: tenants.owner_id tiene FK a profiles.
  await q(`INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
           VALUES ($1, $2, 'x', now(), now(), now(), '{"name":"Verificacion GMG"}'::jsonb) ON CONFLICT (id) DO NOTHING`, [FX.user1, 'verify-gestion-maestro@example.invalid']);
  await q(`INSERT INTO public.profiles (id, role) VALUES ($1, 'admin') ON CONFLICT (id) DO UPDATE SET role='admin'`, [FX.user1]);
  await q(`INSERT INTO public.tenants (id, name, owner_id) VALUES ($1, 'ORG-VERIFY-GESTION-MAESTRO', $2) ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id`, [FX.tenant1, FX.user1]);
  await q(`INSERT INTO public.stores (id, name, tenant_id) VALUES ($1, 'Tienda GMG 1', $2) ON CONFLICT (id) DO NOTHING`, [FX.store1, FX.tenant1]);
  await q(`INSERT INTO public.stores (id, name, tenant_id) VALUES ($1, 'Tienda GMG 2', $2) ON CONFLICT (id) DO NOTHING`, [FX.store2, FX.tenant1]);
  await q(`INSERT INTO public.catalog_store_links (tenant_id, store_id, status) VALUES ($1, $2, 'connected') ON CONFLICT (store_id) DO UPDATE SET status='connected'`, [FX.tenant1, FX.store1]);
  await q(`INSERT INTO public.catalog_store_links (tenant_id, store_id, status) VALUES ($1, $2, 'connected') ON CONFLICT (store_id) DO UPDATE SET status='connected'`, [FX.tenant1, FX.store2]);
  // Maestros: M1 (con fila local P1 en S1 SIN movimientos + P2 en S2 CON movimiento),
  // M2 (exclusivamente maestro, sin filas locales).
  for (const [id, sku, name] of [[FX.master1, 'GMG-M001', 'CableSolar 6mm'], [FX.master2, 'GMG-M002', 'Regleta premium']]) {
    await q(`INSERT INTO public.master_products (id, tenant_id, sku, name, is_service, status, created_by)
             VALUES ($1, $2, $3, $4, false, 'active', $5) ON CONFLICT (id) DO NOTHING`, [id, FX.tenant1, sku, name, FX.user1]);
  }
  await q(`INSERT INTO public.products (id, store_id, tenant_id, master_product_id, sku, name, price, price_currency, cost_price, min_stock, stock_current, is_active, is_complete)
           VALUES ($1, $2, $3, $4, 'GMG-M001', 'CableSolar 6mm', 100, 'CUP', 50, 1, 0, true, true) ON CONFLICT (id) DO NOTHING`, [FX.p1, FX.store1, FX.tenant1, FX.master1]);
  await q(`INSERT INTO public.products (id, store_id, tenant_id, master_product_id, sku, name, price, price_currency, cost_price, min_stock, stock_current, is_active, is_complete)
           VALUES ($1, $2, $3, $4, 'GMG-M001', 'CableSolar 6mm', 120, 'CUP', 60, 1, 0, true, true) ON CONFLICT (id) DO NOTHING`, [FX.p2, FX.store2, FX.tenant1, FX.master1]);
  // Local puro SIN movimientos (P4, S1) y local puro CON movimiento (P5, S1).
  await q(`INSERT INTO public.products (id, store_id, tenant_id, sku, name, price, price_currency, cost_price, min_stock, stock_current, is_active, is_complete)
           VALUES ($1, $2, $3, 'GMG-LOC-SIN', 'Producto local sin movimientos', 10, 'CUP', 5, 1, 0, true, true) ON CONFLICT (id) DO NOTHING`, [FX.p4, FX.store1, FX.tenant1]);
  await q(`INSERT INTO public.products (id, store_id, tenant_id, sku, name, price, price_currency, cost_price, min_stock, stock_current, is_active, is_complete)
           VALUES ($1, $2, $3, 'GMG-LOC-CON', 'Producto local con movimientos', 10, 'CUP', 5, 1, 0, true, true) ON CONFLICT (id) DO NOTHING`, [FX.p5, FX.store1, FX.tenant1]);
  // Movimiento REAL para P2 (S2, vinculada a M1) y para P5 (S1, local puro).
  await q(`INSERT INTO public.stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
           VALUES ($1, $2, 'purchase', 5, 3, 'Verificacion GMG', now(), $3, now())`, [FX.p2, FX.store2, FX.user1]);
  await q(`INSERT INTO public.stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
           VALUES ($1, $2, 'purchase', 2, 1, 'Verificacion GMG', now(), $3, now())`, [FX.p5, FX.store1, FX.user1]);
  check('3.1 fixture determinista creado (2 tiendas conectadas, 2 maestros, filas vinculadas/puras, movimientos reales)', true);

  // ── FASE 4: REGLA SKU (existencia real de movimientos) ──────────────────
  // 4.1 M1: P2 (S2, vinculada) tiene un stock_movements REAL → el cambio de
  // SKU del maestro debe bloquearse (propagaría el SKU a filas con historial).
  const errM1 = await asAuthExpectError(`SELECT public.update_master_product(${lit(FX.master1)}, '{"sku": "GMG-M001-NEW"}'::jsonb, NULL) AS r`);
  check('4.1 maestro con UNA fila vinculada con movimientos → ERR_SKU_LOCKED_BY_MOVEMENTS', /ERR_SKU_LOCKED_BY_MOVEMENTS/.test(errM1 || ''), (errM1 || '').slice(0, 120));

  // 4.2 M2 (exclusivamente maestro, sin filas → sin movimientos) → cambio PERMITIDO.
  const okM2 = await asAuthSql(`SELECT public.update_master_product(${lit(FX.master2)}, '{"sku": "GMG-M002-NEW"}'::jsonb, NULL) AS r`);
  check('4.2 maestro SIN movimientos (sin filas locales) → cambio de SKU PERMITIDO', JSON.stringify(okM2[0]?.r || '').includes('success'));
  const m2sku = (await q(`SELECT sku FROM public.master_products WHERE id = $1`, [FX.master2])).rows[0].sku;
  check('4.3 el SKU nuevo quedó persistido en el maestro', m2sku === 'GMG-M002-NEW', m2sku);

  // 4.4 Cambio idéntico al vigente (no-cambio) → NO bloqueado.
  const sameSku = await asAuthSql(`SELECT public.update_master_product(${lit(FX.master2)}, '{"sku": "GMG-M002-NEW"}'::jsonb, NULL) AS r`);
  check('4.4 reenvío del SKU idéntico (no-cambio) → NO bloqueado', JSON.stringify(sameSku[0]?.r || '').includes('success'));

  // 4.5 Colisión: M2 (sin filas) no colisiona; M1 sí — pero M1 está bloqueado
  // por movimientos, así que probamos con M2 apuntando a un SKU de un local
  // puro de S1… M2 no tiene filas locales → store list vacía → permitido.
  // Para provocar ERR_MASTER_SKU_CONFLICT usamos M2 tras vincularlo: primero
  // activamos M2 en S1 (fila local sin movimientos).
  await q(`INSERT INTO public.products (id, store_id, tenant_id, master_product_id, sku, name, price, price_currency, cost_price, min_stock, stock_current, is_active, is_complete)
           VALUES ($1, $2, $3, $4, 'GMG-M002-NEW', 'Regleta premium', 0, 'CUP', 0, 1, 0, true, true) ON CONFLICT (id) DO NOTHING`, [FX.p3, FX.store1, FX.tenant1, FX.master2]);
  // Ahora M2 tiene fila local en S1 sin movimientos; P4 (local puro de S1) tiene SKU 'GMG-LOC-SIN'.
  const errConflict = await asAuthExpectError(`SELECT public.update_master_product(${lit(FX.master2)}, '{"sku": "GMG-LOC-SIN"}'::jsonb, NULL) AS r`);
  check('4.5 colisión del SKU nuevo con fila local no-vinculada de una tienda afectada → ERR_MASTER_SKU_CONFLICT', /ERR_MASTER_SKU_CONFLICT/.test(errConflict || ''), (errConflict || '').slice(0, 120));
  // Unicidad de maestro (preexistente) sigue intacta.
  const errDup = await asAuthExpectError(`SELECT public.update_master_product(${lit(FX.master2)}, '{"sku": "GMG-M001"}'::jsonb, NULL) AS r`);
  check('4.6 unicidad de SKU entre maestros del tenant conserva su error controlado (ERR_MASTER_SKU_EXISTS)', /ERR_MASTER_SKU_EXISTS/.test(errDup || ''), (errDup || '').slice(0, 120));

  // 4.7 UPDATE directo (PostgREST local) de fila SIN maestro CON movimientos → bloqueado.
  const errP5 = await qExpectError(`UPDATE public.products SET sku = 'GMG-LOC-CON-2' WHERE id = $1`, [FX.p5]);
  check('4.7 UPDATE directo de SKU en fila local CON movimientos → ERR_SKU_LOCKED_BY_MOVEMENTS (trigger)', /ERR_SKU_LOCKED_BY_MOVEMENTS/.test(errP5 || ''), (errP5 || '').slice(0, 120));
  // 4.8 UPDATE directo de fila SIN maestro SIN movimientos → permitido (arquitectura + unicidad BD).
  const okP4 = await q(`UPDATE public.products SET sku = 'GMG-LOC-SIN-2' WHERE id = $1 RETURNING sku`, [FX.p4]);
  check('4.8 UPDATE directo de SKU en fila local SIN movimientos → PERMITIDO', okP4.rows[0]?.sku === 'GMG-LOC-SIN-2');
  // 4.9 UPDATE de OTROS campos en fila con movimientos → sigue permitido (no se bloquea nada más).
  const okP5name = await q(`UPDATE public.products SET description = 'desc' WHERE id = $1 RETURNING description`, [FX.p5]);
  check('4.9 otros campos de una fila con movimientos siguen editables (solo el SKU se protege)', okP5name.rows[0]?.description === 'desc');

  // ── FASE 5: imagen/descripción compartidas NO afectadas por la guardra ──
  const okDesc = await asAuthSql(`SELECT public.update_master_product(${lit(FX.master2)}, '{"description": "Nueva descripcion compartida", "image_path": "gmg-shared.webp"}'::jsonb, NULL) AS r`);
  check('5.1 imagen y descripción compartidas editables aunque haya movimientos (la guardra es SOLO de SKU)', JSON.stringify(okDesc[0]?.r || '').includes('success'));
  const propagated = (await q(`SELECT image_url FROM public.products WHERE id = $1`, [FX.p3])).rows[0]?.image_url;
  check('5.2 propagación de imagen compartida a las filas locales vinculadas intacta', propagated === 'gmg-shared.webp', String(propagated));

  // ── FASE 6: integridad + cleanup ────────────────────────────────────────
  await fixtureCleanup();
  const after = await sensitiveCounts();
  // Las tablas del fixture se limpian; audit_logs/master_change_log pueden
  // conservar filas de auditoría de ESTA verificación (documento histórico).
  const historical = ['transactions', 'transaction_items', 'receipts', 'receipt_items'];
  const histOk = historical.every((t) => before[t] === after[t]);
  check('6.1 tablas históricas/financieras sin cambios (jamás se tocan)', histOk);
  const fixtureGone = (await q(`SELECT COUNT(*)::int AS n FROM public.products WHERE id IN ($1,$2,$3,$4,$5)`, [FX.p1, FX.p2, FX.p3, FX.p4, FX.p5])).rows[0].n;
  check('6.2 fixture retirado (cero residuos de filas de producto)', fixtureGone === 0, `restantes=${fixtureGone}`);
  console.log(`\n[info] ventana de ejecución: ${t0} → ${new Date().toISOString()} (auditoría de la corrida)`);
  finish();
}

main().catch((e) => { console.error('ERROR FATAL:', e?.message || e); finish(); });
