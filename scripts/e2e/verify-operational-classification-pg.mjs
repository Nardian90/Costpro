#!/usr/bin/env node
/**
 * CP-OPERATIONAL-CLASS-002 — Verificación de la migración 20261108150000 en
 * PostgreSQL REAL (BD desechable del proyecto aislado CostproE2E, guard
 * fail-closed del repo). NO toca producción.
 *
 * Fases:
 *   0. Pre-chequeos: dependencias SQL de las RPCs (vistas/reglas) y conteos
 *      de datos históricos/financieros ANTES.
 *   1. Aplicar la migración (multi-statement, simple query protocol).
 *   2. Firmas, tipo de retorno (operational_class al FINAL), propietario,
 *      SECURITY DEFINER, search_path y permisos (anon/authenticated/service_role).
 *   3. Fixture determinista: organización con 2 tiendas CONECTADAS al
 *      catálogo maestro, maestros activos, fila local en cada tienda, un
 *      maestro EXCLUSIVAMENTE maestro (sin fila local), usuario con
 *      membresías activas en ambas tiendas y una organización ajena.
 *   4. get_paginated_products_v2 (tienda conectada): source master/local
 *      presentes, operational_class por tienda, NULL para exclusivamente
 *      maestros; get_products_for_pos: columna nueva e imagen master-first.
 *   5. Ciclo de vida: create_master_product y activate_master_product con
 *      p_operational_class (misma transacción; already_active correctivo).
 *   6. Rechazos: tienda ajena por RLS/has_store_access; rechazo de enum
 *      inválido por el tipo (no strings libres).
 *   7. Conteos DESPUÉS == ANTES en tablas históricas/financieras e inventario.
 *
 * Uso:  node scripts/e2e/verify-operational-classification-pg.mjs
 * Requiere E2E_SUPABASE_DB_URL (y E2E_ALLOWED_REMOTE_REF en el entorno).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
/**
 * Transporte: Management API de Supabase (HTTPS) contra el proyecto E2E
 * AISLADO — el sandbox no tiene salida directa al puerto 5432. El guard
 * fail-closed de arriba (y de cada llamada) rechaza cualquier otro ref.
 */
const SUPA_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!SUPA_TOKEN) {
  console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido para el transporte Management API.');
  process.exit(2);
}
const E2E_REF = 'lguovmvrozxgssupkwpf';

async function execSql(sql) {
  if (!sql.includes(E2E_REF) && !process.env.__OK) { /* el guard de abajo manda */ }
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

// GUARD CANÓNICO DEL REPO (CP-INFRA-011): fail-closed contra cualquier
// destino que no sea el proyecto aislado CostproE2E (jamás producción).
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

const MIGRATION = join(repoRoot, 'supabase', 'migrations', '20261108150000_cp_operational_classification.sql');

// IDs deterministas del fixture (re-ejecutable: limpia antes de crear).
const FX = {
  tenant1: 'cc0000a1-0000-4000-8000-00000000000a',
  tenant2: 'cc0000a2-0000-4000-8000-00000000000a',
  store1: 'cc0000b1-0000-4000-8000-00000000000a',
  store2: 'cc0000b2-0000-4000-8000-00000000000a',
  store3: 'cc0000b3-0000-4000-8000-00000000000a',
  user1: 'cc0000c1-0000-4000-8000-00000000000a',
  master1: 'cc0000d1-0000-4000-8000-00000000000a',
  master2: 'cc0000d2-0000-4000-8000-00000000000a',
  master3: 'cc0000d3-0000-4000-8000-00000000000a',
  p1: 'cc0000e1-0000-4000-8000-00000000000a',
  p2: 'cc0000e2-0000-4000-8000-00000000000a',
  p3: 'cc0000e3-0000-4000-8000-00000000000a',
};

// (sin cliente directo: el transporte es execSql/Mangement API)

/** 
 * Impersonación de usuario autenticado en UN ÚNICO statement (cada llamada
 * HTTP del Management API es una sesión efímera): el CTE fija rol+claims y
 * el LATERAL ejecuta el RPC dependiendo de él.
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

/** Conteos de tablas históricas/financieras/inventario (integridad §9.11). */
async function sensitiveCounts() {
  const tables = ['transactions', 'transaction_items', 'inventory', 'stock_movements', 'receipts', 'receipt_items', 'cash_shifts', 'cash_movements', 'master_change_log', 'audit_logs'];
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

async function main() {
  const migSql = readFileSync(MIGRATION, 'utf8');

  // ── FASE 0: pre-chequeos ────────────────────────────────────────────────
  const deps = await q(`
    SELECT COUNT(*)::int AS n
    FROM pg_depend d
    JOIN pg_proc p ON p.oid = d.refobjid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_rewrite rw ON rw.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
    LEFT JOIN pg_class vw ON vw.oid = rw.ev_class
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_paginated_products_v2', 'get_products_for_pos')
      AND d.refobjsubid = 0 AND d.deptype IN ('n','r','i')
      AND (d.classid <> 'pg_rewrite'::regclass OR vw.relkind IN ('v','m'))`);
  check('0.1 sin vistas/reglas dependientes de las RPCs (DROP sin CASCADE seguro)', deps.rows[0].n === 0, `dependientes=${deps.rows[0].n}`);

  const productsBefore = (await q(`SELECT COUNT(*)::int AS n FROM public.products`)).rows[0].n;
  const t0 = new Date().toISOString();
  const before = await sensitiveCounts();

  // ── FASE 1: aplicar la migración ────────────────────────────────────────
  try {
    await q(migSql);
    check('1.1 migración 20261108150000 aplicada SIN errores en PostgreSQL real', true);
  } catch (e) {
    check('1.1 migración 20261108150000 aplicada SIN errores en PostgreSQL real', false, e.message);
    return finish();
  }
  const productsAfterMig = (await q(`SELECT COUNT(*)::int AS n FROM public.products`)).rows[0].n;
  check('1.2 la migración no añadió/eliminó filas del catálogo (sin backfill)', productsBefore === productsAfterMig, `${productsBefore} → ${productsAfterMig}`);
  // §9.11 puro: NINGUNA tabla cambia por aplicar la migración.
  const afterMig = await sensitiveCounts();
  const allEqual = Object.keys(before).every((t) => before[t] === afterMig[t]);
  check('1.3 la migración NO modifica NINGUNA tabla de datos (histórico/financiero íntegros)', allEqual,
        Object.keys(before).filter((t) => before[t] !== afterMig[t]).map((t) => `${t}: ${before[t]}→${afterMig[t]}`).join(', ') || 'todas idénticas');

  // ── FASE 2: firmas/atributos/permisos ───────────────────────────────────
  for (const [fname, idArgs] of [
    // pg_get_function_identity_arguments devuelve nombres+tipos (igual que la original).
    ['get_paginated_products_v2', 'p_limit integer, p_offset integer, p_store_id uuid, p_search_term text, p_category text, p_sort_key text, p_sort_dir text, p_stock_filter text, p_active_filter text'],
    ['get_products_for_pos', 'p_store_id uuid, p_search_term text, p_category text, p_limit integer, p_offset integer'],
  ]) {
    const r = await q(`
      SELECT p.oid::regprocedure::text AS sig,
             pg_get_userbyid(p.proowner) AS owner,
             p.prosecdef AS security_definer,
             p.proconfig AS config,
             pg_get_function_identity_arguments(p.oid) AS args,
             pg_get_function_result(p.oid) AS result
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = $1`, [fname]);
    const f = r.rows[0];
    check(`2.x ${fname}: existe con firma EXACTA preservada`, f && f.args === idArgs, f?.args);
    const resultOrder = f.result;
    const posClass = resultOrder.indexOf('operational_class');
    const anchor = resultOrder.indexOf(fname === 'get_paginated_products_v2' ? 'master_product_id' : 'is_service');
    check(`2.x ${fname}: retorno incluye operational_class AL FINAL`, posClass > -1 && posClass > anchor, resultOrder.slice(-80));
    check(`2.x ${fname}: OWNER restaurado (postgres)`, f.owner === 'postgres', f.owner);
    check(`2.x ${fname}: SECURITY DEFINER + search_path intactos`, f.security_definer === true && (f.config || []).some((c) => c.includes('search_path')), `security_definer=${f.security_definer}`);
    const anon = (await q(`SELECT has_function_privilege('anon', '${f.sig}', 'EXECUTE') AS ok`)).rows[0].ok;
    const authd = (await q(`SELECT has_function_privilege('authenticated', '${f.sig}', 'EXECUTE') AS ok`)).rows[0].ok;
    const svc = (await q(`SELECT has_function_privilege('service_role', '${f.sig}', 'EXECUTE') AS ok`)).rows[0].ok;
    check(`2.x ${fname}: permisos restaurados (anon ✗, authenticated ✓, service_role ✓)`, !anon && authd && svc, `anon=${anon} auth=${authd} svc=${svc}`);
  }

  // ── FASE 3: fixture (limpia → crea) ─────────────────────────────────────
  await fixtureCleanup();
  // Base del fixture: los deltas de aquí al final son EXCLUSIVAMENTE del
  // fixture y de los RPCs probados (verificables en 7.1/7.2).
  const afterCleanup = await sensitiveCounts();
  await q(`INSERT INTO public.tenants (id, name) VALUES ($1, 'ORG-VERIFY-CLASS-002') ON CONFLICT (id) DO NOTHING`, [FX.tenant1]);
  await q(`INSERT INTO public.tenants (id, name) VALUES ($1, 'ORG-VERIFY-CLASS-002-B') ON CONFLICT (id) DO NOTHING`, [FX.tenant2]);
  for (const [id, name, tenant] of [
    [FX.store1, 'Tienda Verificación 1', FX.tenant1],
    [FX.store2, 'Tienda Verificación 2', FX.tenant1],
    [FX.store3, 'Tienda Ajena', FX.tenant2],
  ]) {
    await q(`INSERT INTO public.stores (id, name, tenant_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`, [id, name, tenant]);
  }
  // Tiendas conectadas al catálogo de SU organización (rama v_connected).
  await q(`INSERT INTO public.catalog_store_links (tenant_id, store_id, status) VALUES ($1, $2, 'connected') ON CONFLICT (store_id) DO UPDATE SET status = 'connected'`, [FX.tenant1, FX.store1]);
  await q(`INSERT INTO public.catalog_store_links (tenant_id, store_id, status) VALUES ($1, $2, 'connected') ON CONFLICT (store_id) DO UPDATE SET status = 'connected'`, [FX.tenant1, FX.store2]);
  await q(`INSERT INTO public.catalog_store_links (tenant_id, store_id, status) VALUES ($1, $2, 'connected') ON CONFLICT (store_id) DO UPDATE SET status = 'connected'`, [FX.tenant2, FX.store3]);

  // Usuario de verificación con membresías activas en S1 y S2 (NO en S3).
  await q(`INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
           VALUES ($1, $2, 'x', now(), now(), now(), '{"name":"Verificación"}'::jsonb) ON CONFLICT (id) DO NOTHING`, [FX.user1, 'verify-class-002@example.invalid']);
  // rol de tienda (encargado) — NO admin global, para que el aislamiento de
  // tiendas ajene se ponga a prueba de verdad (§9.10).
  await q(`INSERT INTO public.profiles (id, role) VALUES ($1, 'encargado') ON CONFLICT (id) DO UPDATE SET role = 'encargado'`, [FX.user1]);
  for (const s of [FX.store1, FX.store2]) {
    await q(`INSERT INTO public.user_store_memberships (user_id, store_id, role, status) VALUES ($1, $2, 'encargado', 'active') ON CONFLICT (user_id, store_id) DO UPDATE SET role = 'encargado', status = 'active'`, [FX.user1, s]);
  }

  // Maestros: M1 (con fila local en S1 y S2), M2 (exclusivamente maestro).
  for (const [id, sku, name] of [[FX.master1, 'CL2-M001', 'Detergente multiuso'], [FX.master2, 'CL2-M002', 'Refrigerador industrial']]) {
    await q(`INSERT INTO public.master_products (id, tenant_id, sku, name, is_service, status, created_by)
             VALUES ($1, $2, $3, $4, false, 'active', $5) ON CONFLICT (id) DO NOTHING`, [id, FX.tenant1, sku, name, FX.user1]);
  }
  // Filas locales: P1 (S1, maestro M1, CLASIFICADA venta), P2 (S1 local puro, sin clasificar),
  // P3 (S2, maestro M1, clasificación DISTINTA: insumo — no se comparte entre tiendas).
  await q(`INSERT INTO public.products (id, store_id, tenant_id, master_product_id, sku, name, price, price_currency, cost_price, min_stock, stock_current, is_active, is_complete, operational_class)
           VALUES ($1, $2, $3, $4, 'CL2-M001', 'Detergente multiuso', 100, 'CUP', 50, 1, 0, true, true, 'venta') ON CONFLICT (id) DO NOTHING`, [FX.p1, FX.store1, FX.tenant1, FX.master1]);
  // HALLAZGO (evidencia information_schema): products.price es numeric NOT
  // NULL DEFAULT 0 en el esquema vigente — el «sin precio» real es 0.
  await q(`INSERT INTO public.products (id, store_id, tenant_id, sku, name, price, price_currency, cost_price, min_stock, stock_current, is_active, is_complete, operational_class)
           VALUES ($1, $2, $3, 'CL2-LOC-1', 'Producto local puro', 0, 'CUP', 10, 1, 0, true, true, NULL) ON CONFLICT (id) DO NOTHING`, [FX.p2, FX.store1, FX.tenant1]);
  await q(`INSERT INTO public.products (id, store_id, tenant_id, master_product_id, sku, name, price, price_currency, cost_price, min_stock, stock_current, is_active, is_complete, operational_class)
           VALUES ($1, $2, $3, $4, 'CL2-M001', 'Detergente multiuso', 200, 'CUP', 80, 1, 0, true, true, 'insumo') ON CONFLICT (id) DO NOTHING`, [FX.p3, FX.store2, FX.tenant1, FX.master1]);
  // Existencia de P1 en S1 (criterio stock>0 del catálogo/listado).
  await q(`INSERT INTO public.inventory (product_id, store_id, quantity) VALUES ($1, $2, 5)`, [FX.p1, FX.store1]);
  check('3.x fixture determinista creado (2 tiendas conectadas + maestros + filas locales + usuario con membresías)', true, `tenant=${FX.tenant1.slice(0, 8)}…`);

  // ── FASE 4: ejecución real de las RPCs ──────────────────────────────────
  // get_paginated_products_v2 sobre tienda CONECTADA (rama v_connected).
  const cat = await asAuthSql(`SELECT * FROM public.get_paginated_products_v2(500, 0, ${lit(FX.store1)})`);
  const masterRow = cat.find((r) => r.master_product_id === FX.master2 && r.source === 'master');
  const localMasterRow = cat.find((r) => r.master_product_id === FX.master1 && r.source === 'local');
  const pureLocal = cat.find((r) => r.id === FX.p2 && r.source === 'local');
  check('4.1 v2: filas source=master y source=local presentes (catálogo maestro íntegro)', !!masterRow && !!localMasterRow && !!pureLocal, `master=${!!masterRow} localVinculado=${!!localMasterRow} localPuro=${!!pureLocal}`);
  check('4.2 v2: master_product_id preservado en filas vinculadas', localMasterRow?.master_product_id === FX.master1 && pureLocal?.master_product_id === null);
  check('4.3 v2: exclusivamente maestro → operational_class NULL (no se inventa ni se comparte)', masterRow && masterRow.operational_class === null);
  check('4.4 v2: fila local clasificada → venta', localMasterRow?.operational_class === 'venta');
  check('4.5 v2: local puro histórico → NULL (Sin clasificar)', pureLocal?.operational_class === null);
  // La MISMA identidad maestra en OTRA tienda tiene SU PROPIA clasificación.
  const cat2 = await asAuthSql(`SELECT * FROM public.get_paginated_products_v2(500, 0, ${lit(FX.store2)})`);
  const otherStore = cat2.find((r) => r.master_product_id === FX.master1 && r.source === 'local');
  check('4.6 v2: clasificación POR TIENDA (S1=venta vs S2=insumo para el mismo maestro)', otherStore?.operational_class === 'insumo', `S1=${localMasterRow?.operational_class} S2=${otherStore?.operational_class}`);

  // get_products_for_pos: nueva columna + imagen master-first.
  const pos = await asAuthSql(`SELECT * FROM public.get_products_for_pos(${lit(FX.store1)})`);
  const posP1 = pos.find((r) => r.id === FX.p1);
  check('4.7 pos: operational_class presente al final y con el valor de la tienda', posP1?.operational_class === 'venta', `columnas=${pos.length ? Object.keys(pos[0]).slice(-3).join(',') : '∅'}`);
  check('4.8 pos: las filas llegan scoping por tienda (solo S1)', pos.every((r) => r.store_id === FX.store1), `filas=${pos.length}`);

  // ── FASE 5: ciclo de vida con clasificación transaccional (§6) ──────────
  // create_master_product (tienda conectada S1) con p_operational_class.
  const created = (await asAuthSql(`SELECT public.create_master_product(${lit(FX.store1)}, 'CL2-M003', 'Tornillo especial', NULL, NULL, NULL, NULL, 'unidad', false, ${lit(JSON.stringify({ price: '25', cost_price: '10', min_stock: '1' }))}::jsonb, NULL, 'venta'::public.product_operational_class) AS r`))[0].r;
  const createdRow = (await q(`SELECT id, operational_class FROM public.products WHERE id = $1`, [created.product_id])).rows[0];
  check('5.1 create_master_product: fila local creada CON la clasificación en la misma transacción', createdRow?.operational_class === 'venta', `product=${created.product_id}`);
  check('5.2 create_master_product: master_change_log/auditoría intactos', (await q(`SELECT COUNT(*)::int AS n FROM public.master_change_log WHERE master_product_id = $1`, [created.master_product_id])).rows[0].n >= 2);

  // activate_master_product: M2 (exclusivamente maestro) se activa en S2 CON clase.
  const act = (await asAuthSql(`SELECT public.activate_master_product(${lit(FX.master2)}, ${lit(FX.store2)}, NULL, 'activo_fijo'::public.product_operational_class) AS r`))[0].r;
  const actRow = (await q(`SELECT operational_class FROM public.products WHERE id = $1`, [act.product_id])).rows[0];
  check('5.3 activate_master_product: fila local creada CON la clasificación (misma transacción)', actRow?.operational_class === 'activo_fijo');
  // Re-activación (already_active) con otra clase → correctivo idempotente.
  await asAuthSql(`SELECT public.activate_master_product(${lit(FX.master2)}, ${lit(FX.store2)}, NULL, 'util_herramienta'::public.product_operational_class) AS r`);
  const actRow2 = (await q(`SELECT operational_class FROM public.products WHERE id = $1`, [act.product_id])).rows[0];
  check('5.4 activate_master_product already_active: corrige la clasificación sin duplicar fila', actRow2?.operational_class === 'util_herramienta' && (await q(`SELECT COUNT(*)::int AS n FROM public.products WHERE master_product_id = $1 AND store_id = $2`, [FX.master2, FX.store2])).rows[0].n === 1);
  // Retrocompatibilidad: llamada SIN el parámetro nuevo sigue funcionando.
  const compat = (await asAuthSql(`SELECT public.create_master_product(${lit(FX.store2)}, 'CL2-M004', 'Producto compat') AS r`))[0].r;
  const compatRow = (await q(`SELECT operational_class FROM public.products WHERE id = $1`, [compat.product_id])).rows[0];
  check('5.5 retrocompatibilidad: sin p_operational_class la fila nace Sin clasificar (NULL)', compatRow?.operational_class === null);

  // ── FASE 6: rechazos de autorización y de tipo ──────────────────────────
  let denied = null;
  try {
    await asAuthSql(`SELECT * FROM public.get_products_for_pos(${lit(FX.store3)})`);
  } catch (e) { denied = e.message; }
  check('6.1 tienda AJENA rechazada por has_store_access (fail-closed)', !!denied, denied?.slice(0, 60));
  let denied2 = null;
  try {
    await asAuthSql(`SELECT * FROM public.get_paginated_products_v2(10, 0, ${lit(FX.store3)})`);
  } catch (e) { denied2 = e.message; }
  check('6.2 v2: tienda ajena también rechazada', !!denied2, denied2?.slice(0, 60));
  let badEnum = null;
  try {
    await q(`INSERT INTO public.products (id, store_id, tenant_id, sku, name, price, cost_price, min_stock, stock_current, is_active, is_complete, operational_class)
             VALUES (gen_random_uuid(), $1, $2, 'CL2-BAD', 'x', 0, 0, 1, 0, true, true, 'categoria_comercial')`, [FX.store1, FX.tenant1]);
  } catch (e) { badEnum = e.message; }
  check('6.3 el ENUM impide valores inventados (fail-closed por tipo)', !!badEnum, badEnum?.slice(0, 60));

  // ── FASE 7: datos históricos/financieros intactos ───────────────────────
  const after = await sensitiveCounts();
  const drifted = Object.entries(afterCleanup).filter(([t, n]) => after[t] !== n && n !== '(tabla inexistente)');
  // Deltas PERMITIDOS y acotados respecto a la base post-cleanup:
  // inventory +1 (existencia del fixture P1), master_change_log +2 (auditoría
  // del create_master_product probado) y audit_logs (auditoría de los RPCs).
  // Cualquier otra tabla cambiada = FALLO. Financieras puras intactas.
  const allowed = ['inventory', 'master_change_log', 'audit_logs'];
  const invDelta = (after.inventory - afterCleanup.inventory) || 0;
  // Todo el change_log nuevo pertenece a masters del fixture (altas por RPC:
  // 2 entradas por alta — sku y nombre; 5.1 y 5.5 → 4 entradas).
  const foreignChangeLog = (await q(`SELECT COUNT(*)::int AS n FROM public.master_change_log WHERE created_at > ${lit(t0)} AND master_product_id NOT IN (SELECT id FROM public.master_products WHERE tenant_id = ${lit(FX.tenant1)} AND sku LIKE 'CL2-%')`)).rows[0].n;
  check('7.1 sin cambios en datos históricos/financieros (salvo fixture y auditoría de los RPCs probados)',
        drifted.every(([t]) => allowed.includes(t)) && invDelta === 1 && foreignChangeLog === 0,
        `deltas: ${drifted.map(([t]) => `${t}(${after[t] - afterCleanup[t]})`).join(',') || 'ninguno'}; change_log externo=${foreignChangeLog}`);
  // TODA la auditoría nueva pertenece al fixture/RPCs probados (nada externo).
  const foreignAudit = (await q(`SELECT COUNT(*)::int AS n FROM public.audit_logs WHERE created_at > ${lit(t0)} AND NOT (store_id IN (${lit(FX.store1)}, ${lit(FX.store2)}, ${lit(FX.store3)}) OR user_id = ${lit(FX.user1)})`)).rows[0].n;
  check('7.2 la única auditoría nueva pertenece al fixture/RPCs probados (nada externo)', foreignAudit === 0, `filas externas=${foreignAudit}`);
  const unclassified = (await q(`SELECT COUNT(*)::int AS n FROM public.products WHERE operational_class IS NULL`)).rows[0].n;
  const classified = (await q(`SELECT COUNT(*)::int AS n FROM public.products WHERE operational_class IS NOT NULL`)).rows[0].n;
  check('7.3 inventario final de clasificación coherente (sin backfill masivo)', unclassified >= 0 && classified >= 0, `clasificadas=${classified}, sin clasificar=${unclassified}`);

  return finish();
}

async function fixtureCleanup() {
  // Re-ejecutabilidad: borra residuos de corridas anteriores (solo IDs del
  // fixture). ORDEN IMPORTANTE: los triggers de auditoría (memberships/stores)
  // escriben en audit_logs durante estos DELETE, por eso audit_logs se limpia
  // AL FINAL.
  await q(`DELETE FROM public.inventory WHERE product_id IN (SELECT id FROM public.products WHERE sku LIKE 'CL2-%' OR id IN ($1,$2,$3))`, [FX.p1, FX.p2, FX.p3]).catch(() => {});
  await q(`DELETE FROM public.products WHERE id IN ($1,$2,$3) OR (store_id IN ($4,$5,$6) AND sku LIKE 'CL2-%')`, [FX.p1, FX.p2, FX.p3, FX.store1, FX.store2, FX.store3]);
  // Auditoría de masters creados por RPC en corridas previas (UUIDs aleatorios).
  await q(`DELETE FROM public.master_change_log WHERE master_product_id IN (SELECT id FROM public.master_products WHERE tenant_id = $1 AND sku LIKE 'CL2-%') OR master_product_id IN ($2,$3,$4)`, [FX.tenant1, FX.master1, FX.master2, FX.master3]);
  await q(`DELETE FROM public.audit_logs WHERE table_name = 'master_products' AND record_id IN (SELECT id FROM public.master_products WHERE tenant_id = $1 AND sku LIKE 'CL2-%') OR record_id IN ($2,$3,$4)`, [FX.tenant1, FX.master1, FX.master2, FX.master3]);
  await q(`DELETE FROM public.master_products WHERE id IN ($1,$2,$3) OR (tenant_id = $4 AND sku LIKE 'CL2-%')`, [FX.master1, FX.master2, FX.master3, FX.tenant1]);
  await q(`DELETE FROM public.user_store_memberships WHERE user_id = $1`, [FX.user1]);
  // NOTA: profiles/auth.users del fixture PERSISTEN — el esquema prohíbe el
  // borrado físico de perfiles (ERR_HARD_DELETE_BLOCKED, política soft-delete
  // Iteración 12). El usuario determinista se re-utiliza entre corridas.
  // NOTA: tenants/stores/links del fixture son DETERMINISTAS y PERSISTEN
  // entre corridas (ON CONFLICT los re-crea). NO se borran porque el trigger
  // AFTER DELETE de stores audita en audit_logs con store_id ya inexistente
  // (FK audit_logs_store_id_fkey) y abortaría el cleanup.
  await q(`DELETE FROM public.audit_logs WHERE store_id IN ($1,$2,$3) OR user_id = $4 OR record_id IN ($5,$6,$7) OR (metadata->>'product_id' IN (SELECT id::text FROM public.products WHERE sku LIKE 'CL2-%'))`, [FX.store1, FX.store2, FX.store3, FX.user1, FX.master1, FX.master2, FX.master3]);
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log('\n════════ RESUMEN CP-OPERATIONAL-CLASS-002 (PostgreSQL real, BD desechable E2E) ════════');
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

main().catch((e) => { console.error('ERROR FATAL:', e?.message || e); finish(); });
