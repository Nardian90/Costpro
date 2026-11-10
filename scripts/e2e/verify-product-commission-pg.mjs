#!/usr/bin/env node
/**
 * CP-PRODUCT-COMMISSION-001 — Verificación PostgreSQL REAL de la migración
 * 20261110090000 (TAREA 1: clasificación operativa obligatoria con DEFAULT
 * venta) sobre la BD desechable del proyecto aislado CostproE2E. Jamás
 * producción. Guard canónico assert-isolated-db.
 *
 * Secciones (misión §6.A + §1.3):
 *  0. Documentación ANTES de la migración: total de registros, sin
 *     clasificación, por organización/tienda, ya clasificados.
 *  1. Aplicar la migración (backfill NULL→venta contado + DEFAULT + NOT NULL).
 *  2. Verificación post: 0 sin clasificar, NOT NULL, DEFAULT, enum válido.
 *  3. Caminos de creación sin clasificación → nacen como 'venta' (DEFAULT de
 *     la columna y de las RPCs create_master_product/activate_master_product).
 *  4. Las clasificaciones explícitas existentes NO se modifican.
 *  5. Datos históricos/financieros íntegros; aislamiento por tienda intacto.
 *
 * Uso: node scripts/e2e/verify-product-commission-pg.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

// GUARD CANÓNICO DEL REPO (CP-INFRA-011).
const { assertIsolatedDb } = await import(
  pathToFileURL(join(repoRoot, 'e2e', 'fixtures', 'assert-isolated-db.ts')).href
).catch(() => ({}));
const guard = assertIsolatedDb
  ? { assertIsolatedDb }
  : await import(pathToFileURL(join(repoRoot, 'e2e', 'fixtures', 'assert-isolated-db.cjs')).href);
if (!guard?.assertIsolatedDb) {
  console.error('FALLO DE SEGURIDAD: no se pudo cargar el guard canónico. Abortando.');
  process.exit(2);
}
await guard.assertIsolatedDb();

const SUPA_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const E2E_REF = 'lguovmvrozxgssupkwpf';
if (!SUPA_TOKEN) {
  console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido para el transporte Management API.');
  process.exit(2);
}

async function execSql(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${E2E_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`SQL HTTP ${res.status}: ${JSON.stringify(body)?.slice(0, 400)}`);
  if (body && !Array.isArray(body) && body.error) throw new Error(`SQL error: ${JSON.stringify(body).slice(0, 400)}`);
  return Array.isArray(body) ? body : [];
}

function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function q(sql, params = []) {
  let out = sql;
  params.forEach((v, i) => { out = out.split(`$${i + 1}`).join(lit(v)); });
  return { rows: await execSql(out) };
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// Fixture determinista de la misión CP-OPERATIONAL-CLASS-002 (persiste entre
// corridas: tiendas conectadas + usuario encargado).
const FX = {
  tenant1: 'cc0000a1-0000-4000-8000-00000000000a',
  store1: 'cc0000b1-0000-4000-8000-00000000000a',
  store2: 'cc0000b2-0000-4000-8000-00000000000a',
  user1: 'cc0000c1-0000-4000-8000-00000000000a',
  master1: 'cc0000d1-0000-4000-8000-00000000000a',
  pc1: 'cc0000f1-0000-4000-8000-00000000000a',
  pc2: 'cc0000f2-0000-4000-8000-00000000000a',
};

const MIGRATION = join(repoRoot, 'supabase', 'migrations', '20261110090000_cp_operational_class_default_venta.sql');

async function sensitiveCounts() {
  const tables = ['transactions', 'transaction_items', 'inventory', 'stock_movements', 'cash_shifts', 'cash_movements', 'commission_payments'];
  const out = {};
  for (const t of tables) {
    try { out[t] = (await q(`SELECT COUNT(*)::int AS n FROM public.${t}`)).rows[0].n; } catch { out[t] = '(inexistente)'; }
  }
  return out;
}

async function main() {
  const migSql = readFileSync(MIGRATION, 'utf8');

  // ── §1.3 ANTES de la migración: documentación del estado ────────────────
  const pre = (await q(`
    SELECT
      (SELECT COUNT(*)::int FROM public.products) AS total,
      (SELECT COUNT(*)::int FROM public.products WHERE operational_class IS NULL) AS sin_clasificar,
      (SELECT COUNT(*)::int FROM public.products WHERE operational_class = 'venta') AS venta,
      (SELECT COUNT(*)::int FROM public.products WHERE operational_class NOT IN ('venta')) AS otras_clases,
      (SELECT COUNT(DISTINCT store_id)::int FROM public.products WHERE operational_class IS NULL) AS tiendas_afectadas`)).rows[0];
  const porOrg = await q(`
    SELECT COALESCE(t.name, '(sin organización)') AS org, p.store_id, COUNT(*)::int AS sin_clasificar
    FROM public.products p
    LEFT JOIN public.stores s ON s.id = p.store_id
    LEFT JOIN public.tenants t ON t.id = s.tenant_id
    WHERE p.operational_class IS NULL
    GROUP BY t.name, p.store_id ORDER BY 1, 2`);
  console.log(`— ANTES: total=${pre.total} · sin clasificar=${pre.sin_clasificar} · venta=${pre.venta} · otras=${pre.otras_clases} · tiendas afectadas=${pre.tiendas_afectadas}`);
  for (const r of porOrg.rows) console.log(`  · sin clasificar en ${r.org} / tienda ${r.store_id?.slice(0, 8)}…: ${r.sin_clasificar}`);
  const before = await sensitiveCounts();
  const t0 = new Date().toISOString();

  // ── Aplicar la migración ────────────────────────────────────────────────
  try {
    await execSql(migSql);
    check('1.1 migración 20261110090000 aplicada SIN errores (backfill + DEFAULT + NOT NULL + RPCs)', true);
  } catch (e) {
    check('1.1 migración 20261110090000 aplicada SIN errores', false, e.message);
    return finish();
  }

  // ── §1.3 DESPUÉS: regularización completa ───────────────────────────────
  const post = (await q(`
    SELECT
      (SELECT COUNT(*)::int FROM public.products) AS total,
      (SELECT COUNT(*)::int FROM public.products WHERE operational_class IS NULL) AS sin_clasificar,
      (SELECT COUNT(*)::int FROM public.products WHERE operational_class = 'venta') AS venta,
      (SELECT COUNT(*)::int FROM public.products WHERE operational_class = 'insumo') AS insumo,
      (SELECT COUNT(*)::int FROM public.products WHERE operational_class = 'activo_fijo') AS activo_fijo,
      (SELECT COUNT(*)::int FROM public.products WHERE operational_class = 'util_herramienta') AS util_herramienta,
      (SELECT COUNT(*)::int FROM public.products WHERE operational_class NOT IN ('venta','insumo','activo_fijo','util_herramienta')) AS invalidas`)).rows[0];
  check('1.2 §1.3 · 0 productos locales sin clasificación tras la migración', post.sin_clasificar === 0, `sin_clasificar=${post.sin_clasificar}`);
  check('1.3 §1.3 · el backfill convirtió exactamente los NULL en venta (venta = pre.venta + pre.sin_clasificar)', post.venta === pre.venta + pre.sin_clasificar, `venta ${pre.venta}→${post.venta} (+${post.venta - pre.venta})`);
  check('1.4 §1.3.3 · las clasificaciones explícitas NO cambiaron (insumo/activo_fijo/util intactos)',
        (post.insumo + post.activo_fijo + post.util_herramienta) === pre.otras_clases,
        `insumo=${post.insumo} activo=${post.activo_fijo} util=${post.util_herramienta} (pre otras=${pre.otras_clases})`);
  check('1.5 todas las clasificaciones pertenecen al enum (sin valores fuera)', post.invalidas === 0);

  const col = (await q(`SELECT is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='operational_class'`)).rows[0];
  check('1.6 §1.4 · NOT NULL con DEFAULT venta en la columna', col.is_nullable === 'NO' && (col.column_default || '').includes("'venta'"), `nullable=${col.is_nullable} default=${col.column_default}`);

  // ── §6.A.5 · camino SIN clasificación → nace venta (DEFAULT de columna) ─
  let bornVenta = null;
  try {
    await execSql(`INSERT INTO public.products (id, store_id, tenant_id, sku, name, price, cost_price, min_stock, stock_current, is_active, is_complete)
      VALUES (${lit(FX.pc1)}, ${lit(FX.store1)}, ${lit(FX.tenant1)}, 'PC1-DEFAULT', 'Insert sin operational_class', 0, 0, 1, 0, true, true)`);
    bornVenta = (await q(`SELECT operational_class FROM public.products WHERE id = ${lit(FX.pc1)}`)).rows[0]?.operational_class;
  } catch (e) { bornVenta = `ERROR: ${e.message.slice(0, 120)}`; }
  check('1.7 §6.A.5 · INSERT sin clasificación (importación/API/proceso) nace como venta (DEFAULT de BD)', bornVenta === 'venta', String(bornVenta));

  // ── §6.A.6 · ciclo de vida del maestro sin clase explícita → venta ──────
  const created = (await asAuthSql(`SELECT public.create_master_product(${lit(FX.store1)}, 'PC1-M005', 'Producto ciclo sin clase') AS r`))[0].r;
  const createdRow = (await q(`SELECT operational_class FROM public.products WHERE id = ${lit(created.product_id)}`)).rows[0];
  check('1.8 §6.A.6 · create_master_product SIN p_operational_class → fila local venta (DEFAULT RPC)', createdRow?.operational_class === 'venta', String(createdRow?.operational_class));
  const act = (await asAuthSql(`SELECT public.activate_master_product(${lit(FX.master1)}, ${lit(FX.store2)}) AS r`))[0].r;
  const actRow = (await q(`SELECT operational_class FROM public.products WHERE id = ${lit(act.product_id)}`)).rows[0];
  check('1.9 §6.A.6 · activate_master_product SIN clase → fila local venta (DEFAULT RPC)', actRow?.operational_class === 'venta', String(actRow?.operational_class));
  // Y con clase explícita distinta → se respeta (§6.A.8)
  const created2 = (await asAuthSql(`SELECT public.create_master_product(${lit(FX.store1)}, 'PC1-M006', 'Producto ciclo insumo', NULL, NULL, NULL, NULL, 'unidad', false, '{}'::jsonb, NULL, 'insumo'::public.product_operational_class) AS r`))[0].r;
  const created2Row = (await q(`SELECT operational_class FROM public.products WHERE id = ${lit(created2.product_id)}`)).rows[0];
  check('1.10 §6.A.8 · clase EXPLÍCITA distinta (insumo) se respeta al crear/activar', created2Row?.operational_class === 'insumo', String(created2Row?.operational_class));

  // ── §6.A.10 · aislamiento: la clasificación es por tienda (RPC v2) ──────
  const s1 = await asAuthSql(`SELECT * FROM public.get_paginated_products_v2(500, 0, ${lit(FX.store1)})`);
  const s2 = await asAuthSql(`SELECT * FROM public.get_paginated_products_v2(500, 0, ${lit(FX.store2)})`);
  const master1S1 = s1.find((r) => r.master_product_id === FX.master1);
  const master1S2 = s2.find((r) => r.master_product_id === FX.master1);
  check('1.11 §6.A.10 · multitienda: misma identidad maestra, clasificación independiente por tienda',
    master1S1?.operational_class === 'venta' && master1S2?.operational_class === 'venta', `S1=${master1S1?.operational_class} S2=${master1S2?.operational_class}`);

  // ── §6.D · datos históricos/financieros íntegros ────────────────────────
  const after = await sensitiveCounts();
  const drifted = Object.entries(before).filter(([t, n]) => after[t] !== n && n !== '(inexistente)');
  // EXCEPCIÓN CONTROLADA: commission_payments puede variar si el fixture de
  // la misión anterior creó pagos; aquí solo se permiten los deltas del
  // propio fixture (nada externo).
  const foreignAudit = (await q(`SELECT COUNT(*)::int AS n FROM public.audit_logs WHERE created_at > ${lit(t0)} AND NOT (store_id IN (${lit(FX.store1)}, ${lit(FX.store2)}) OR user_id = ${lit(FX.user1)})`)).rows[0].n;
  check('1.12 §6.D.28 · sin cambios en datos financieros/ventas/inventario (salvo auditoría del fixture)',
    drifted.every(([t]) => ['commission_payments'].includes(t)) && foreignAudit === 0,
    `deltas: ${drifted.map(([t]) => `${t}(${after[t] - before[t]})`).join(',') || 'ninguno'}; auditoría externa=${foreignAudit}`);

  // Limpieza del fixture de ESTA misión (los IDs deterministas se re-usan).
  await execSql(`DELETE FROM public.products WHERE id IN (${lit(FX.pc1)}, ${lit(FX.pc2)}) OR (store_id IN (${lit(FX.store1)}, ${lit(FX.store2)}) AND sku LIKE 'PC1-%')`);
  await execSql(`DELETE FROM public.master_change_log WHERE master_product_id IN (SELECT id FROM public.master_products WHERE sku LIKE 'PC1-M%')`);
  await execSql(`DELETE FROM public.audit_logs WHERE table_name = 'master_products' AND record_id IN (SELECT id FROM public.master_products WHERE sku LIKE 'PC1-M%') OR store_id IN (${lit(FX.store1)}, ${lit(FX.store2)}) AND created_at > ${lit(t0)}`);
  await execSql(`DELETE FROM public.master_products WHERE sku LIKE 'PC1-M%'`);

  return finish();
}

async function asAuthSql(rpcSql) {
  const claims = lit(JSON.stringify({ role: 'authenticated', sub: FX.user1 }));
  return execSql(`WITH setup AS (
    SELECT set_config('role','authenticated',false) AS a,
           set_config('request.jwt.claims', ${claims}, false) AS b,
           set_config('request.jwt.claim.sub', ${lit(FX.user1)}, false) AS c
  )
  SELECT r.* FROM setup, LATERAL (
    ${rpcSql}
  ) r;`);
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log('\n══════ RESUMEN CP-PRODUCT-COMMISSION-001 TAREA 1 (PostgreSQL real, BD desechable E2E) ══════');
  console.log(`Total: ${results.length} · OK: ${results.length - failed.length} · FALLOS: ${failed.length}`);
  if (results.length === 0) { console.log('SIN VERIFICACIONES EJECUTADAS.'); process.exitCode = 2; }
  else if (failed.length) {
    for (const f of failed) console.log(`  ✗ ${f.name} ${f.detail}`);
    process.exitCode = 1;
  } else console.log('TODAS las verificaciones PostgreSQL pasaron.');
}

main().catch((e) => { console.error('ERROR FATAL:', e?.message || e); finish(); });
