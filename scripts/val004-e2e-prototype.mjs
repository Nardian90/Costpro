// ============================================================================
// VAL004 — CP-VALUATION-NOMINAL-ACTIVATION-004 · PROTOTIPO E2E AISLADO
// Política nominal 1 CUP: corrección de los 64 PP + vía de activación futura.
// ============================================================================
// REGLA: producción INTACTA; TODO write ocurre en lguovmvrozxgssupkwpf (E2E).
// Guard de aislamiento: réplica del contrato e2e/fixtures/assert-isolated-db.ts
// (sentinela e2e_is_isolated_db() verificada por REST y SQL, fail-closed) +
// guard canónico CP-INFRA-019 assert-not-production (exigido también por
// check-destructive-guard y declarado en writers.manifest.json
// isolationProtected). Uso:
//   E2E_SUPABASE_SERVICE_ROLE_KEY=... E2E_SUPABASE_DB_PASSWORD=... \
//   node scripts/val004-e2e-prototype.mjs
// ============================================================================
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
// GUARD CANÓNICO (CP-INFRA-019): el destino es la BD E2E aislada y debe
// verificarse ANTES de cualquier operación (check-destructive-guard +
// writers.manifest.json → isolationProtected).
import { assertNotProduction } from './lib/assert-not-production.mjs';

const BASE = 'https://lguovmvrozxgssupkwpf.supabase.co';
const KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) throw new Error('FALTA E2E_SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const POOLER = { host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.lguovmvrozxgssupkwpf', password: process.env.E2E_SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } };
const OUT = '/home/z/my-project/scripts/out/val004-e2e-prototype.json';

// Aislamiento canónico: fail-closed si el destino no es CostproE2E.
assertNotProduction({ projectRef: 'lguovmvrozxgssupkwpf', mode: 'write', context: 'val004-e2e-prototype' });

// ── IDs deterministas (segmento 0004, aislado de m042/m049/m050x) ───────────
const SEG = '7ec70004';
const T = `${SEG}-0000-4000-8000-000000000001`;   // tenant
const A = `${SEG}-0000-4000-8000-000000000002`;   // tienda A
const B = `${SEG}-0000-4000-8000-000000000003`;   // tienda B
const M1 = `${SEG}-0000-4000-8000-000000000010`;  // maestro 1
const M2 = `${SEG}-0000-4000-8000-000000000011`;  // maestro 2 (legado cero)
const ADMIN = '5b12c5d8-15f5-456e-879b-656e4b6e141e'; // perfil admin EXISTENTE en E2E (no se crea ni borra)

const sha256 = (s) => createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex');
const log = (...a) => console.log(...a);

async function rest(method, path, body) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    method, headers: { ...H, Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let j; try { j = JSON.parse(txt); } catch { j = txt; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${txt.slice(0, 300)}`);
  return j;
}
const get = (p) => rest('GET', p, null);
const post = (p, b) => rest('POST', p, b);
const del = (p) => rest('DELETE', p, null);

const rpc = async (fn, args) => {
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { ...H }, body: JSON.stringify(args),
  });
  const txt = await res.text();
  let j; try { j = JSON.parse(txt); } catch { j = txt; }
  if (!res.ok) { const e = new Error(`rpc ${fn} → ${res.status}: ${txt.slice(0, 300)}`); e.status = res.status; e.body = j; throw e; }
  return j;
};

const EVID = { mision: 'CP-VALUATION-NOMINAL-ACTIVATION-004', fase: 'prototipo E2E aislado',
  generado: new Date().toISOString(),
  bd: { url: BASE, proyecto: 'lguovmvrozxgssupkwpf (CostproE2E — AISLADA)', sentinela: true,
    canal_escritura: 'pooler IPv4 aws-0-us-east-1:6543 + REST service_role' },
  escenarios: {}, idempotencia: {}, guard: {}, cleanup: {} };

async function paso(nombre, fn) {
  const t0 = Date.now();
  const r = await fn();
  EVID.escenarios[nombre] = { ms: Date.now() - t0, ...(typeof r === 'object' ? r : { resumen: String(r) }) };
  log(`▸ ${nombre} (${Date.now() - t0}ms)`);
  return r;
}

const q = (sql, params = []) => db.query(sql, params);
// qRaw: protocolo SIMPLE de node-postgres (sin values) → permite lotes
// multi-sentencia (necesario para re-ejecutar el archivo de migración tal cual).
const qRaw = (sql) => db.query(sql);
const db = new pg.Client(POOLER);

// ── SQL del producto (fixture legado con cost_average = 0, vía INSERT) ──────
async function crearProductoLegado(pId, sku, storeId) {
  // Simula una activación PRE-corrección (INSERT sin cost_average → default 0).
  // El guard WAC es BEFORE UPDATE: el INSERT no lo viola (estado inicial).
  await q(
    `INSERT INTO public.products
       (id, store_id, tenant_id, master_product_id, sku, name, unit_of_measure,
        is_service, price, price_currency, cost_price, min_stock, stock_current,
        is_active, is_complete, operational_class)
     VALUES ($1, $2, $3, $4, $5, $6, 'unidad', false, 0, 'CUP', 0, 1, 0, true, true, 'venta')`,
    [pId, storeId, T, M2, sku, `LEGACY ${sku}`]);
}

const CLEANUP_TABLAS = [
  ['cp_cost_nominal_pp64_20261115_audit', `product_id = '${SEG}-0000-4000-8000-000000000090'`],
  ['audit_logs', `store_id IN ('${A}', '${B}') OR (action = 'COST_NOMINAL_PP64_OWNER_DECISION' AND metadata->>'mission' = 'CP-VALUATION-NOMINAL-ACTIVATION-004')`],
  ['stock_movements', `store_id IN ('${A}', '${B}')`],
  ['receipt_items', `receipt_id IN (SELECT id FROM public.receipts WHERE store_id IN ('${A}','${B}'))`],
  ['receipts', `store_id IN ('${A}', '${B}')`],
  ['wac_change_log', `store_id IN ('${A}', '${B}')`],
  ['products', `store_id IN ('${A}', '${B}')`],
  ['master_products', `id IN ('${M1}', '${M2}')`],
  ['catalog_store_links', `store_id IN ('${A}', '${B}')`],
  ['stores', `id IN ('${A}', '${B}')`],
  ['tenants', `id = '${T}'`],
];
async function limpiarTodo() {
  // Transacción EXPLÍCITA: SET LOCAL solo dura una transacción; cada query()
  // sin BEGIN abriría la suya y el modo replica no aplicaría.
  await q('BEGIN');
  try {
    await q("SET LOCAL session_replication_role = 'replica'"); // hard-delete gobernado (patrón repo)
    for (const [t, cond] of CLEANUP_TABLAS) {
      const r = await q(`DELETE FROM public.${t} WHERE ${cond}`);
      if (r.rowCount) log(`  cleanup ${t}: -${r.rowCount}`);
    }
    await q('COMMIT');
  } catch (e) {
    await q('ROLLBACK');
    throw e;
  }
}
// ═══ 0. PREFLIGHT (sentinela + conexión + limpieza previa) ═════════════════
await paso('preflight', async () => {
  const sent = await get('rpc/e2e_is_isolated_db').catch(() => null);
  if (sent !== true) throw new Error('SENTINELA E2E NO CONFIRMA AISLAMIENTO — ABORTAR');
  await db.connect();
  const iso = await q('select e2e_is_isolated_db() as iso');
  if (iso.rows[0].iso !== true) { await db.end(); throw new Error('sentinela SQL != true'); }
  await limpiarTodo();
  return { resumen: 'sentinela=true (REST+SQL); residuos previos del segmento eliminados' };
});

// Baseline de conteos para net-delta-0
const TABLAS = ['stores', 'products', 'master_products', 'receipts', 'receipt_items',
  'stock_movements', 'wac_change_log', 'audit_logs', 'catalog_store_links', 'tenants'];
async function conteos() {
  const c = {};
  for (const t of TABLAS) {
    const r = await fetch(`${BASE}/rest/v1/${t}?select=id`, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, Range: '0-0', Prefer: 'count=exact' } });
    c[t] = Number(r.headers.get('content-range')?.split('/')[1] || 0);
  }
  return c;
}
const BASELINE = await conteos();
EVID.cleanup.baseline_conteos = BASELINE;
log('baseline:', JSON.stringify(BASELINE));

// ═══ 1. SEED — tenant, 2 tiendas conectadas al catálogo, 2 maestros ═════════
await paso('seed', async () => {
  await post('tenants', { id: T, name: 'VAL004 tenant (prototipo)', plan: 'free', subscription_status: 'trial' });
  await post('stores', [
    { id: A, tenant_id: T, name: 'VAL004 tienda A', slug: 'val004-a', is_active: true, backup_restore_protected: false, created_at: '2026-11-15T00:00:00Z' },
    { id: B, tenant_id: T, name: 'VAL004 tienda B', slug: 'val004-b', is_active: true, backup_restore_protected: false, created_at: '2026-11-15T00:00:01Z' },
  ]);
  await post('catalog_store_links', [
    { tenant_id: T, store_id: A, status: 'connected', connected_at: '2026-11-15T00:00:00Z' },
    { tenant_id: T, store_id: B, status: 'connected', connected_at: '2026-11-15T00:00:01Z' },
  ]);
  await post('master_products', [
    { id: M1, tenant_id: T, sku: 'VAL004-M1', name: 'Maestro VAL004 M1', unit_of_measure: 'unidad', is_service: false, status: 'active', created_at: '2026-11-15T00:00:02Z' },
    { id: M2, tenant_id: T, sku: 'VAL004-M2', name: 'Maestro VAL004 M2 (legado)', unit_of_measure: 'unidad', is_service: false, status: 'active', created_at: '2026-11-15T00:00:03Z' },
  ]);
  return { resumen: 'tenant + 2 tiendas + 2 links + 2 maestros', tenant: T, admin: ADMIN };
});

// ═══ S1. ALTA NOMINAL: activación nueva → cost_average = 1 CUP ══════════════
const r1 = await paso('S1_alta_nominal_1cup', async () => {
  const res = await rpc('activate_master_product', {
    p_master_id: M1, p_store_id: A, p_user_id: ADMIN, p_operational_class: 'venta' });
  const prod = await q(`SELECT id::text, cost_average, cost_price, price, stock_current,
      operational_class::text AS oc, is_active, master_product_id::text AS master
      FROM public.products WHERE id = $1`, [res.product_id]);
  const p = prod.rows[0];
  const ok = res.status === 'success' && res.already_active === false
    && Number(p.cost_average) === 1 && Number(p.cost_price) === 0 && Number(p.price) === 0
    && Number(p.stock_current) === 0 && p.oc === 'venta' && p.is_active === true
    && p.master === M1
    && res.nominal_cost_assigned === true
    && res.cost_average_origin === 'nominal_1cup_owner_policy';
  if (!ok) throw new Error(`S1 FAIL: ${JSON.stringify({ res, p })}`);
  return { resumen: 'activación nueva con WAC nominal 1 CUP exacto', producto: p, respuesta_rpc: res };
});
log('S1 ✓ cost_average =', r1.producto.cost_average);

// ═══ S2. REACTIVACIÓN inmediata: no degrada (cost_average sigue 1) ══════════
await paso('S2_reactivacion_sin_degradacion', async () => {
  const res = await rpc('activate_master_product', {
    p_master_id: M1, p_store_id: A, p_user_id: ADMIN, p_operational_class: null });
  const prod = await q(`SELECT id::text, cost_average, cost_price, price FROM public.products WHERE id = $1`, [res.product_id]);
  const p = prod.rows[0];
  const ok = res.already_active === true && res.product_id === r1.producto.id
    && Number(p.cost_average) === 1 && Number(p.cost_price) === 0 && Number(p.price) === 0
    && res.cost_average_origin === 'preexistente_intacto';
  if (!ok) throw new Error(`S2 FAIL: ${JSON.stringify({ res, p })}`);
  return { resumen: 'reactivación NO degrada (cost_average preexistente intacto)', respuesta: res };
});

// ═══ S3. PRIMERA RECEPCIÓN REAL: sustituye el nominal EXACTAMENTE ═══════════
await paso('S3_primera_recepcion_reemplaza_nominal', async () => {
  const receiptId = await rpc('register_reception', {
    p_store_id: A, p_supplier: 'Proveedor VAL004', p_reception_date: '2026-11-15T01:00:00Z',
    p_invoice_number: 'VAL004-FAC-1', p_user_id: ADMIN,
    p_items: [{ product_id: r1.producto.id, quantity: 10, unit_cost: 500,
                moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0 }] });
  if (!receiptId) throw new Error('S3: register_reception sin receipt_id');
  const prod = await q(`SELECT cost_average, cost_price, price, stock_current FROM public.products WHERE id = $1`, [r1.producto.id]);
  const p = prod.rows[0];
  // Blend D-01 con S=0: (0·1 + 10·500)/(0+10) = 500 EXACTO (el nominal 1 NO contamina)
  const ok = Number(p.cost_average) === 500 && Number(p.stock_current) === 10
    && Number(p.cost_price) === 0 && Number(p.price) === 0;
  if (!ok) throw new Error(`S3 FAIL: ${JSON.stringify(p)}`);
  const wlog = await q(`SELECT count(*)::int AS n FROM public.wac_change_log
      WHERE product_id = $1 AND event = 'reception_in'`, [r1.producto.id]);
  const movs = await q(`SELECT movement_type, count(*)::int AS n FROM public.stock_movements
      WHERE product_id = $1 GROUP BY movement_type`, [r1.producto.id]);
  if (wlog.rows[0].n < 1) throw new Error('S3: sin asiento reception_in en wac_change_log');
  return { resumen: '1ª recepción 10u@500 → WAC=500 EXACTO (nominal reemplazado)',
    wac: p.cost_average, stock: p.stock_current, receipt_id: receiptId,
    wac_log_reception_in: wlog.rows[0].n, movimientos: movs.rows };
});

// ═══ S4. SEGUNDA RECEPCIÓN: ponderación correcta ════════════════════════════
await paso('S4_segunda_recepcion_ponderada', async () => {
  const receiptId = await rpc('register_reception', {
    p_store_id: A, p_supplier: 'Proveedor VAL004', p_reception_date: '2026-11-15T02:00:00Z',
    p_invoice_number: 'VAL004-FAC-2', p_user_id: ADMIN,
    p_items: [{ product_id: r1.producto.id, quantity: 5, unit_cost: 700,
                moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0 }] });
  const prod = await q(`SELECT cost_average, stock_current, cost_price, price FROM public.products WHERE id = $1`, [r1.producto.id]);
  const p = prod.rows[0];
  // Blend: (10·500 + 5·700)/(10+5) = 8500/15 = 566.6666666666666667
  const esperado = (10 * 500 + 5 * 700) / 15;
  const ok = Math.abs(Number(p.cost_average) - esperado) < 1e-9 && Number(p.stock_current) === 15
    && Number(p.cost_price) === 0 && Number(p.price) === 0;
  if (!ok) throw new Error(`S4 FAIL: esperado ${esperado}, obtenido ${p.cost_average}, ${JSON.stringify(p)}`);
  return { resumen: `2ª recepción 5u@700 → WAC=${p.cost_average} (ponderación (10·500+5·700)/15)`,
    wac: p.cost_average, esperado, stock: p.stock_current, receipt_id: receiptId };
});

// ═══ S5. DOS TIENDAS: costos independientes con maestro compartido ══════════
await paso('S5_dos_tiendas_independientes', async () => {
  const res = await rpc('activate_master_product', {
    p_master_id: M1, p_store_id: B, p_user_id: ADMIN, p_operational_class: 'venta' });
  const rowB = await q(`SELECT id::text, cost_average, cost_price, price, stock_current, master_product_id::text AS master
      FROM public.products WHERE id = $1`, [res.product_id]);
  const rowA = await q(`SELECT id::text, cost_average, cost_price, price FROM public.products WHERE id = $1`, [r1.producto.id]);
  const pb = rowB.rows[0], pa = rowA.rows[0];
  const ok = pb.id !== pa.id && pb.master === M1 && Number(pb.cost_average) === 1
    && Number(pb.stock_current) === 0
    && Math.abs(Number(pa.cost_average) - (8500 / 15)) < 1e-9; // A NO contaminado por B
  if (!ok) throw new Error(`S5 FAIL: A=${JSON.stringify(pa)} B=${JSON.stringify(pb)}`);
  return { resumen: 'tienda B con nominal 1; tienda A conserva su WAC real (566.67); maestro compartido',
    tienda_a: pa, tienda_b: pb };
});

// ═══ S6. REACTIVACIÓN tras WAC real: SIN degradación ════════════════════════
await paso('S6_reactivacion_post_wac_real', async () => {
  const res = await rpc('activate_master_product', {
    p_master_id: M1, p_store_id: A, p_user_id: ADMIN, p_operational_class: null });
  const prod = await q(`SELECT cost_average, cost_price, price FROM public.products WHERE id = $1`, [res.product_id]);
  const p = prod.rows[0];
  const ok = res.already_active === true && Math.abs(Number(p.cost_average) - 8500 / 15) < 1e-9
    && Number(p.cost_price) === 0 && Number(p.price) === 0;
  if (!ok) throw new Error(`S6 FAIL (WAC degradado): ${JSON.stringify({ res, p })}`);
  return { resumen: 'reactivación tras WAC real → cost_average intacto (566.67)', wac: p.cost_average };
});

// ═══ S7. CORRECCIÓN PP64 + IDEMPOTENCIA (re-ejecución de la migración) ══════
await paso('S7_correccion_pp64_idempotente', async () => {
  // 7a. Fixture LEGADO: producto con cost_average=0 (INSERT, como pre-fix)
  const L = `${SEG}-0000-4000-8000-000000000090`;
  await crearProductoLegado(L, 'VAL004-LEG', A);
  const pre = await q(`SELECT cost_average, stock_current FROM public.products WHERE id = $1`, [L]);
  if (Number(pre.rows[0].cost_average) !== 0) throw new Error('S7a: fixture legado sin cero');
  const snapAntes = await q(`SELECT count(*)::int AS n FROM public.cp_cost_nominal_pp64_20261115_audit`);
  const wlogAntes = await q(`SELECT count(*)::int AS n FROM public.wac_change_log WHERE event LIKE 'cp_valuation_004_nominal%'`);

  // 7b. Re-ejecutar la MIGRACIÓN 20261115120000 (el archivo real, vía pooler,
  //     lote multi-sentencia con protocolo simple) → el legado debe quedar en
  //     1 CUP por vía canónica.
  const sql = fs.readFileSync('/home/z/my-project/Costpro/supabase/migrations/20261115120000_cp_valuation_nominal_pp64.sql', 'utf8');
  await qRaw(sql);

  const post1 = await q(`SELECT cost_average, cost_price, price, stock_current, sku, name, master_product_id::text AS master
      FROM public.products WHERE id = $1`, [L]);
  const p1 = post1.rows[0];
  const snapPost = await q(`SELECT count(*)::int AS n, max(assigned_cost_average::text) AS asignado
      FROM public.cp_cost_nominal_pp64_20261115_audit`);
  const wlogPost = await q(`SELECT count(*)::int AS n FROM public.wac_change_log WHERE event LIKE 'cp_valuation_004_nominal%'`);
  const wlogRow = await q(`SELECT event, wac_before, wac_after, qty_in, uc_in
      FROM public.wac_change_log WHERE product_id = $1 AND event LIKE 'cp_valuation_004_nominal%'
      ORDER BY created_at DESC LIMIT 1`, [L]);
  const ok1 = Number(p1.cost_average) === 1 && Number(p1.cost_price) === 0 && Number(p1.price) === 0
    && Number(p1.stock_current) === 0 && p1.master === M2
    // identidad: el trigger trg_products_master_identity_guard coerciona
    // sku/name al MAESTRO (por diseño, como en el importador) — intactos
    && p1.sku === 'VAL004-M2' && p1.name === 'Maestro VAL004 M2 (legado)'
    && wlogRow.rows[0]?.event === 'cp_valuation_004_nominal'
    && Number(wlogRow.rows[0]?.wac_before) === 0 && Number(wlogRow.rows[0]?.wac_after) === 1;
  if (!ok1) throw new Error(`S7b FAIL: ${JSON.stringify({ p1, wlogRow: wlogRow.rows[0] })}`);

  // 7c. RE-EJECUCIÓN: idempotente → cero cambios de datos (la 2ª corrida
  //     registra asiento de auditoría con updated=0, evidencia por diseño)
  const auditAntes = await q(`SELECT count(*)::int AS n FROM public.audit_logs WHERE action = 'COST_NOMINAL_PP64_OWNER_DECISION'`);
  await qRaw(sql);
  const post2 = await q(`SELECT cost_average FROM public.products WHERE id = $1`, [L]);
  const snapPost2 = await q(`SELECT count(*)::int AS n FROM public.cp_cost_nominal_pp64_20261115_audit`);
  const wlogPost2 = await q(`SELECT count(*)::int AS n FROM public.wac_change_log WHERE event LIKE 'cp_valuation_004_nominal%'`);
  const auditPost2 = await q(`SELECT count(*)::int AS n FROM public.audit_logs WHERE action = 'COST_NOMINAL_PP64_OWNER_DECISION'`);
  const auditUltima = await q(`SELECT metadata->>'updated' AS updated, metadata->>'universe_before' AS universo
      FROM public.audit_logs WHERE action = 'COST_NOMINAL_PP64_OWNER_DECISION'
      ORDER BY created_at DESC LIMIT 1`);
  const ceroUniversal = await q(`SELECT count(*)::int AS n FROM public.products WHERE cost_average = 0`);
  const ok2 = Number(post2.rows[0].cost_average) === 1
    && snapPost2.rows[0].n === snapPost.rows[0].n          // snapshot SIN filas nuevas
    && wlogPost2.rows[0].n === wlogPost.rows[0].n          // sin asientos nuevos
    && auditPost2.rows[0].n === auditAntes.rows[0].n + 1   // 1 asiento de evidencia por corrida
    && auditUltima.rows[0].updated === '0'                 // la reejecución actualizó 0 filas
    && auditUltima.rows[0].universo === '0';               // y el universo en cero era 0
  if (!ok2) throw new Error(`S7c FAIL (no idempotente): ${JSON.stringify({
    snapshot: { antes: snapPost.rows[0].n, despues: snapPost2.rows[0].n },
    wlog: { antes: wlogPost.rows[0].n, despues: wlogPost2.rows[0].n },
    audit: { antes: auditAntes.rows[0].n, despues: auditPost2.rows[0].n },
    wac: post2.rows[0] })}`);
  return { resumen: 'migración corrige el cero → 1 CUP canónico; 2ª corrida SIN cambios de datos (idempotente)',
    legado_despues: p1, wac_log: wlogRow.rows[0],
    snapshot_filas: { tras_1a: snapPost.rows[0].n, tras_2a: snapPost2.rows[0].n },
    universo_cero_tras_politica: ceroUniversal.rows[0].n };
});

// ═══ S8. COSTO DOCUMENTAL Y PRECIO: intocados en TODO el flujo ══════════════
await paso('S8_costo_documental_precio_intactos', async () => {
  const rows = await q(`SELECT id::text, cost_price, price, price_currency FROM public.products
      WHERE master_product_id IN ($1, $2) OR id = $3`, [M1, M2, `${SEG}-0000-4000-8000-000000000090`]);
  const ok = rows.rows.every(r => Number(r.cost_price) === 0 && Number(r.price) === 0 && r.price_currency === 'CUP');
  if (!ok) throw new Error(`S8 FAIL: ${JSON.stringify(rows.rows)}`);
  return { resumen: 'cost_price=0 y price=0 en todos los productos del flujo (documental/precio intactos)', filas: rows.rows.length };
});

// ═══ S9. GUARD WAC: activo y NO eludible sin token ══════════════════════════
await paso('S9_guard_wac_activo', async () => {
  const L = `${SEG}-0000-4000-8000-000000000090`;
  let violacion = null;
  try {
    await q(`UPDATE public.products SET cost_average = 7 WHERE id = $1`, [L]);
  } catch (e) {
    violacion = String(e.message || e).slice(0, 200);
  }
  if (!violacion || !violacion.includes('ERR_WAC_SINGLE_WRITER_VIOLATION')) {
    throw new Error(`S9 FAIL: el UPDATE directo NO fue bloqueado (mensaje: ${violacion})`);
  }
  const trg = await q(`SELECT t.tgenabled, t.tgtype FROM pg_trigger t
      WHERE NOT t.tgisinternal AND t.tgname = 'trg_guard_wac_writer'`);
  const tg = trg.rows[0];
  if (!tg || !['A', 'O'].includes(tg.tgenabled)) throw new Error(`S9 FAIL: guard ${JSON.stringify(tg.rows)}`);
  const wacFinal = await q(`SELECT cost_average FROM public.products WHERE id = $1`, [L]);
  if (Number(wacFinal.rows[0].cost_average) !== 1) throw new Error('S9: el WAC cambió tras el intento');
  return { resumen: 'UPDATE directo sin token → ERR_WAC_SINGLE_WRITER_VIOLATION; guard activo', tgenabled: tg.tgenabled, tgtype: tg.tgtype, mensaje: violacion };
});

// ═══ CLEANUP — net delta 0 (hard-delete gobernado del segmento 0004) ════════
await paso('cleanup_net_delta_0', async () => {
  const post = await conteos();
  const delta = {};
  for (const t of TABLAS) {
    const d = post[t] - BASELINE[t];
    if (d !== 0) delta[t] = d;
  }
  if (Object.keys(delta).length) {
    // Reintentar limpieza (por si audit_logs POST-S1 quedó fuera del filtro)
    await limpiarTodo();
    const post2 = await conteos();
    const delta2 = {};
    for (const t of TABLAS) if (post2[t] - BASELINE[t] !== 0) delta2[t] = post2[t] - BASELINE[t];
    if (Object.keys(delta2).length) throw new Error(`CLEANUP FAIL net-delta: ${JSON.stringify(delta2)}`);
  }
  return { resumen: 'net delta = 0 (todas las tablas del segmento limpiadas)', delta_final: delta };
});

EVID.checksum_evidencia = sha256(JSON.stringify(EVID.escenarios));
fs.mkdirSync('/home/z/my-project/scripts/out', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(EVID, null, 2));
console.log(`\nVAL004 E2E: TODOS LOS ESCENARIOS PASS → ${OUT}`);
await db.end();
process.exit(0);
