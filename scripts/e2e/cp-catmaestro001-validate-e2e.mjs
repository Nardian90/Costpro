#!/usr/bin/env node
/**
 * CP-RECEPCIONES-CATALOGO-MAESTRO-001 — FASE 1 · Validación en BD AISLADA (E2E)
 * ============================================================================
 * Aplica la migración 20261125130000 (renumeración) al proyecto aislado
 * CostproE2E (ref lguovmvrozxgssupkwpf) y valida la función con un fixture
 * determinista que reproduce la forma del defecto real:
 *
 *   · tenant + tienda CONECTADA al Catálogo Maestro
 *   · maestros numéricos 1..5 + outliers 998/999 (regla del consecutivo)
 *   · 4 maestros AUTO-* con fila local vinculada + existencias + movimientos
 *     ligados a una recepción (para verificar inmutabilidad de integridad)
 *
 * Valida:
 *   1. dry_run: mapeo 6,7,8,9 (primer hueco tras el prefijo contiguo).
 *   2. apply: maestros 6..9, filas locales sincronizadas (coerción),
 *      master_change_log (4), audit_logs (4 + lote), receipt_items y
 *      stock_movements SIN cambios, saldos intactos.
 *   3. idempotencia: re-aplicar → already_renumbered=4, applied=0.
 *   4. fail-closed: SKU corrupto → ERR_UNEXPECTED_SKU (rollback implícito).
 *   5. cleanup total (sin residuos).
 *
 * Uso: node scripts/e2e/cp-catmaestro001-validate-e2e.mjs
 * Requiere SUPABASE_ACCESS_TOKEN en el entorno. NUNCA producción (guard).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const E2E_REF = 'lguovmvrozxgssupkwpf';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido'); process.exit(2); }
if (E2E_REF === 'wthkddeleylijmonclxg') { console.error('FALLO: guard — ref de producción'); process.exit(2); }

const api = `https://api.supabase.com/v1/projects/${E2E_REF}/database/query`;

async function execSql(sql) {
  const res = await fetch(api, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL HTTP ${res.status}: ${text.slice(0, 500)}`);
  let rows = null;
  try { rows = JSON.parse(text); } catch { rows = null; }
  if (rows && !Array.isArray(rows) && rows.error) throw new Error(`SQL: ${JSON.stringify(rows).slice(0, 500)}`);
  return Array.isArray(rows) ? rows : [];
}

const results = [];
function check(name, cond, extra = '') {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? '✓' : '✗ FALLO'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) process.exitCode = 1;
}

const T = '11111111-1111-4111-8111-111111111111'; // tenant fixture
const S = '22222222-2222-4222-8222-222222222222'; // store fixture
const R = '33333333-3333-4333-8333-333333333333'; // receipt fixture
const M = {
  auto1: 'aaaa0001-0000-4000-8000-000000000001',
  auto2: 'aaaa0001-0000-4000-8000-000000000002',
  auto3: 'aaaa0001-0000-4000-8000-000000000003',
  auto4: 'aaaa0001-0000-4000-8000-000000000004',
};
const PAIRS = JSON.stringify([
  { master_id: M.auto1, old_sku: 'AUTO-FIXT0TA-1', name: 'Producto fixture 1' },
  { master_id: M.auto2, old_sku: 'AUTO-FIXT0TB-2', name: 'Producto fixture 2' },
  { master_id: M.auto3, old_sku: 'AUTO-FIXT0TC-3', name: 'Producto fixture 3' },
  { master_id: M.auto4, old_sku: 'AUTO-FIXT0TD-4', name: 'Producto fixture 4' }
]);

const cleanup = async () => {
  // session_replication_role=replica desactiva los triggers de auditoría
  // (trigger_audit_store_changes inserta audit_logs tras DELETE de stores y
  // viola la FK — patrón hard-cleanup del repo, docs de la misión 2026-11-14).
  await execSql(`SET session_replication_role = replica;
    DELETE FROM public.stock_movements WHERE store_id = '${S}';
    DELETE FROM public.receipt_items WHERE receipt_id = '${R}';
    DELETE FROM public.receipts WHERE id = '${R}';
    DELETE FROM public.products WHERE store_id = '${S}';
    DELETE FROM public.master_change_log WHERE tenant_id = '${T}';
    DELETE FROM public.master_products WHERE tenant_id = '${T}';
    DELETE FROM public.audit_logs WHERE store_id = '${S}';
    DELETE FROM public.catalog_store_links WHERE store_id = '${S}';
    DELETE FROM public.stores WHERE id = '${S}';
    DELETE FROM public.tenants WHERE id = '${T}';
    SET session_replication_role = DEFAULT;`);
};

(async () => {
  console.log('=== CP-CATMAESTRO-001 · validación BD aislada ===');
  try { await cleanup(); } catch { /* tolerable si no existe nada */ }

  // 1. Aplicar la migración al aislado.
  const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/20261125130000_cp_catmaestro001_renumber_enervida_auto.sql'), 'utf8');
  await execSql(sql);
  await execSql("NOTIFY pgrst, 'reload schema'");
  check('migración aplicada (función existe)', true);

  // 2. Fixture.
  await execSql(`INSERT INTO public.tenants (id, name) VALUES ('${T}', 'CP-CATMAESTRO-001 fixture');
    INSERT INTO public.stores (id, tenant_id, name, is_active) VALUES ('${S}', '${T}', 'Tienda fixture', true);
    INSERT INTO public.catalog_store_links (tenant_id, store_id, status, connected_at, created_at, updated_at)
      VALUES ('${T}', '${S}', 'connected', now(), now(), now());`);

  // Maestros numéricos 1..5 + outliers 998/999.
  let vals = '';
  for (let i = 1; i <= 5; i++) vals += `('${T}', '${i}', 'Numerico ${i}', 'active'),`;
  vals += `('${T}', '998', 'Outlier 998', 'active'), ('${T}', '999', 'Outlier 999', 'active')`;
  await execSql(`INSERT INTO public.master_products (tenant_id, sku, name, status) VALUES ${vals};`);

  // Maestros AUTO-* + filas locales vinculadas con saldos.
  const locals = {};
  let i = 0;
  for (const [key, id] of Object.entries(M)) {
    i++;
    const sku = `AUTO-FIXT0T${'ABCD'[i - 1]}-${i}`;
    await execSql(`INSERT INTO public.master_products (id, tenant_id, sku, name, status, unit_of_measure)
      VALUES ('${id}', '${T}', '${sku}', 'Producto fixture ${i}', 'active', 'unidad');`);
    const rows = await execSql(`INSERT INTO public.products
      (store_id, tenant_id, master_product_id, sku, name, price, cost_price, cost_average, stock_current, is_active, unit_of_measure)
      VALUES ('${S}', '${T}', '${id}', '${sku}', 'Producto fixture ${i}', 5, 1, 1, ${10 + i}, true, 'unidad')
      RETURNING id;`);
    locals[key] = rows[0].id;
  }

  // Recepción pendiente + 2 ítems + 2 movimientos ligados (nota = receipt id).
  await execSql(`INSERT INTO public.receipts (id, store_id, user_id, status, total_cost, supplier, reception_date)
    VALUES ('${R}', '${S}', NULL, 'pending', 2, 'Proveedor fixture', current_date);
    INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost)
    VALUES ('${R}', '${locals.auto1}', 2, 1), ('${R}', '${locals.auto2}', 3, 1);
    INSERT INTO public.stock_movements (store_id, product_id, quantity_change, movement_type, reference_doc, notes, unit_cost, created_at)
    VALUES ('${S}', '${locals.auto1}', 10, 'purchase', 'Recepción de mercancía', '${R}', 1, now()),
           ('${S}', '${locals.auto2}', 11, 'purchase', 'Recepción de mercancía', '${R}', 1, now());`);

  // 3. Dry-run.
  const dry = await execSql(`SELECT public.cp_catmaestro001_renumber_auto_masters(
    p_dry_run := true, p_tenant := '${T}', p_store := '${S}', p_receipt := '${R}', p_pairs := '${PAIRS.replaceAll("'", "''")}'::jsonb) AS res;`);
  const dryRes = dry[0].res;
  check('dry_run: 4 to_renumber', dryRes.to_renumber === 4, `to_renumber=${dryRes.to_renumber}`);
  const dryNewSkus = dryRes.mapping.map(m => m.new_sku).join(',');
  check('dry_run: códigos 6,7,8,9', dryNewSkus === '6,7,8,9', `codes=${dryNewSkus}`);

  // 4. Aplicar. (snapshot de saldos ANTES — la renumeración no puede tocarlos)
  const stocksBefore = await execSql(`SELECT p.master_product_id::text AS mid, p.stock_current, p.cost_average, p.price, p.cost_price
    FROM public.products p
    WHERE p.store_id = '${S}' AND p.master_product_id IN ('${M.auto1}','${M.auto2}','${M.auto3}','${M.auto4}')
    ORDER BY p.master_product_id;`);
  const app = await execSql(`SELECT public.cp_catmaestro001_renumber_auto_masters(
    p_dry_run := false, p_tenant := '${T}', p_store := '${S}', p_receipt := '${R}', p_pairs := '${PAIRS.replaceAll("'", "''")}'::jsonb) AS res;`);
  const appRes = app[0].res;
  check('apply: applied=4', appRes.applied === 4, `applied=${appRes.applied}`);
  check('apply: receipt_items antes=después', appRes.receipt_items_before === 2 && appRes.receipt_items_after === 2,
    `${appRes.receipt_items_before}/${appRes.receipt_items_after}`);
  check('apply: stock_movements antes=después', appRes.stock_movements_before === 2 && appRes.stock_movements_after === 2,
    `${appRes.stock_movements_before}/${appRes.stock_movements_after}`);

  const stocksAfter = await execSql(`SELECT p.master_product_id::text AS mid, p.stock_current, p.cost_average, p.price, p.cost_price
    FROM public.products p
    WHERE p.store_id = '${S}' AND p.master_product_id IN ('${M.auto1}','${M.auto2}','${M.auto3}','${M.auto4}')
    ORDER BY p.master_product_id;`);
  check('apply: saldos/precios intactos (antes == después)',
    JSON.stringify(stocksBefore) === JSON.stringify(stocksAfter),
    stocksAfter.map(r => r.stock_current).join(','));
  const state = await execSql(`SELECT mp.sku AS master_sku, p.sku AS local_sku, p.stock_current, p.master_product_id::text AS mid
    FROM public.products p JOIN public.master_products mp ON mp.id = p.master_product_id
    WHERE p.store_id = '${S}' AND p.master_product_id IN ('${M.auto1}','${M.auto2}','${M.auto3}','${M.auto4}')
    ORDER BY mp.sku::int;`);
  check('apply: maestros y locales renumerados 6..9 sincronizados',
    state.length === 4 && state.every(r => r.master_sku === r.local_sku) &&
    state.map(r => Number(r.master_sku)).join(',') === '6,7,8,9',
    state.map(r => `${r.master_sku}/${r.local_sku}`).join(' '));
  check('apply: existencias idénticas a las del snapshot pre-renumeración',
    state.every(r => r.stock_current === (stocksBefore.find(b => b.mid === r.mid)?.stock_current ?? null)),
    state.map(r => r.stock_current).join(','));

  const changeLog = await execSql(`SELECT COUNT(*) AS n FROM public.master_change_log WHERE tenant_id = '${T}' AND field = 'sku';`);
  check('apply: master_change_log 4 entradas', changeLog[0].n === 4, `n=${changeLog[0].n}`);
  const audits = await execSql(`SELECT COUNT(*) AS n FROM public.audit_logs WHERE store_id = '${S}' AND action LIKE 'CP_CATMAESTRO001%';`);
  check('apply: audit_logs 5 (4 producto + 1 lote)', audits[0].n === 5, `n=${audits[0].n}`);

  // 5. Idempotencia: re-aplicar.
  const re = await execSql(`SELECT public.cp_catmaestro001_renumber_auto_masters(
    p_dry_run := false, p_tenant := '${T}', p_store := '${S}', p_receipt := '${R}', p_pairs := '${PAIRS.replaceAll("'", "''")}'::jsonb) AS res;`);
  check('idempotencia: already=4 applied=0', re[0].res.already_renumbered === 4 && re[0].res.applied === 0,
    `already=${re[0].res.already_renumbered} applied=${re[0].res.applied}`);

  // 6. Fail-closed: SKU corrupto.
  await execSql(`UPDATE public.master_products SET sku = 'WEIRD-99' WHERE id = '${M.auto3}' AND tenant_id = '${T}';`);
  let failedAsExpected = false;
  try {
    await execSql(`SELECT public.cp_catmaestro001_renumber_auto_masters(
      p_dry_run := true, p_tenant := '${T}', p_store := '${S}', p_receipt := '${R}', p_pairs := '${PAIRS.replaceAll("'", "''")}'::jsonb);`);
  } catch (e) { failedAsExpected = /ERR_UNEXPECTED_SKU/.test(e.message); }
  check('fail-closed: ERR_UNEXPECTED_SKU ante SKU corrupto', failedAsExpected);
  await execSql(`UPDATE public.master_products SET sku = 'AUTO-FIXT0TC-3' WHERE id = '${M.auto3}' AND tenant_id = '${T}';`);

  // 7. Limpieza + verificación de residuos.
  await cleanup();
  const residue = await execSql(`SELECT
    (SELECT COUNT(*) FROM public.products WHERE store_id = '${S}') AS p,
    (SELECT COUNT(*) FROM public.master_products WHERE tenant_id = '${T}') AS m,
    (SELECT COUNT(*) FROM public.receipts WHERE id = '${R}') AS r,
    (SELECT COUNT(*) FROM public.stores WHERE id = '${S}') AS s,
    (SELECT COUNT(*) FROM public.tenants WHERE id = '${T}') AS t;`);
  const row = residue[0];
  check('cleanup: cero residuos', row.p === 0 && row.m === 0 && row.r === 0 && row.s === 0 && row.t === 0,
    JSON.stringify(row));

  const passed = results.filter(r => r.ok).length;
  console.log(`\n=== RESULTADO: ${passed}/${results.length} pruebas ===`);
  if (results.some(r => !r.ok)) process.exit(1);
  console.log('VALIDACIÓN E2E DE FASE 1: ' + (process.exitCode ? 'CON FALLOS' : 'APROBADA'));
})().catch(e => { console.error('EXCEPCIÓN:', e.message); process.exit(1); });
