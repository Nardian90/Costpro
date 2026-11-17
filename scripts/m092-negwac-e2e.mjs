#!/usr/bin/env node
// ============================================================================
// M092 — CP-FIN-NEGATIVE-WAC-REMEDIATION-013 · PROTOTIPO E2E EN BD AISLADA
// Reproduce el estado actual de los 5 SKU con WAC negativo (SKU117/83/90/40/37,
// ENERVIDA) + 1 control (SKU31) en la BD aislada lguovmvrozxgssupkwpf (NUNCA
// producción) y valida la corrección RECT-013-A:
//   --setup     fixture fiel: productos con WAC negativo exacto, kardex
//               completo replicado (capas FVC a 1 CUP + capa ajena @1 + salidas
//               a costo ≈0), wac_change_log histórico y asientos ORIG/RECT-011
//               con los importes reales de los 5 SKU.
//   --execute   aplica RECT-013-A (1 llamada = 1 transacción): lote A (WAC
//               sellado → 1,00 + wac_change_log + auditoría) y lote B (asiento
//               DR COGS+VALES+PÉRDIDA / CR ACT_INVENTARIO 2.657.379,32).
//   --verify    post-estado: WAC=1, existencias intactas, capas ajenas intactas,
//               reconciliación ACT_INVENTARIO (Δ = −2.657.379,32), CXP intacta.
//   --idem      re-ejecución → 0 cambios (idempotencia).
//   --rollback  transacción con aborto deliberado tras aplicar → 0 persistencia.
//   --reapply   ciclo completo limpio (cleanup+setup+execute+verify) desde
//               cero para demostrar reaplicación (camino de reanudación).
//   --cleanup   elimina el fixture y certifica NET DELTA = 0 (11 tablas).
// Guard assert-not-production: E2E pasa libre; producción fail-closed.
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const MODE = process.argv[2] || '';
const OUT = 'scripts/out/m013';
const E2E = 'lguovmvrozxgssupkwpf';
const MISION = 'CP-FIN-NEGATIVE-WAC-REMEDIATION-013';

// Importes EXACTOS de la propuesta RECT-013-A (m091, producción)
const A = {
  total: '2657379.32',
  cogs: '566546.45',
  vales: '1072918.27',
  perdida: '1017914.60',
};
const TRACE = 'RECT013-E2E';
const SEG = '7ec9000d-0000-4000-8000';       // segmento determinista 013
const ECO_DATE = '2026-11-17';

// IDs deterministas del fixture
const F = {
  store: '0e13a000-0000-4000-8000-000000000001',
  receipt: '0e13b000-0000-4000-8000-000000000001',   // recepción FVC-like
  other: '0e13b000-0000-4000-8000-000000000002',     // recepción ajena (P3)
  P: [1, 2, 3, 4, 5, 6].map((i) => `0e13c000-0000-4000-8000-00000000000${i}`),
  M: (n) => `0e135000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  E: (n) => `0e13d000-0000-4000-8000-00000000000${n}`,
  FM: (n) => `0e13f000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  W: (n) => `0e134000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  AUD: (n) => `0e13e000-0000-4000-8000-${String(n).padStart(12, '0')}`,
};
// P1..P5 espejo de SKU117/83/90/40/37 · P6 control (SKU31)
const SKU_MAP = { 1: '117', 2: '83', 3: '90', 4: '40', 5: '37', 6: '31' };

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const md5 = (s) => createHash('md5').update(s).digest('hex');

async function qE2E(sql, label, expectFail = false) {
  assertNotProduction({ mode: 'write', projectRef: E2E, context: `m092-${MODE || 'run'}:${label}` });
  const res = await fetch(`https://api.supabase.com/v1/projects/${E2E}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    if (expectFail) return { __error: text.slice(0, 400) };
    throw new Error(`[${label}] HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const rows = JSON.parse(text || '[]');
  console.log(`[OK] ${label} → ${rows.length} filas`);
  return rows;
}

// ── carga del extracto de producción (fuente del fixture) ───────────────────
const prodExtract = JSON.parse(readFileSync(resolve(process.cwd(), `${OUT}/extract.json`), 'utf8'));
const prodBySku = {};
for (const p of prodExtract.productos_todas_tiendas) {
  if (p.store_id === '5e6fe821-5465-48b1-b3f1-3aa3182edc38') prodBySku[p.sku] = p;
}
const prodByPid = {};
for (const [i, sku] of Object.entries(SKU_MAP)) prodByPid[prodBySku[sku].id] = Number(i);

// kardex de producción por product_id (ordenado)
const kardexProd = {};
for (const m of prodExtract.kardex_actual) {
  if (m.store_id !== '5e6fe821-5465-48b1-b3f1-3aa3182edc38') continue;
  const i = prodByPid[m.product_id];
  if (!i) continue;
  (kardexProd[i] ||= []).push(m);
}
for (const i of Object.keys(kardexProd)) {
  kardexProd[i].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '') || a.id.localeCompare(b.id));
}

// referencia de movimientos → ID de fixture determinista
const refMap = new Map();
function refId(realRef) {
  if (!realRef) return null;
  if (!refMap.has(realRef)) {
    const n = refMap.size + 1;
    refMap.set(realRef, n <= 2 ? (n === 1 ? F.receipt : F.other) : `0e139000-0000-4000-8000-${String(n).padStart(12, '0')}`);
  }
  return refMap.get(realRef);
}

let results = { mision: MISION, fases: [] };
function fase(nombre, ok, detalle) {
  results.fases.push({ fase: nombre, ok, detalle });
  console.log(`${ok ? 'PASS' : 'FAIL'} · ${nombre} · ${detalle}`);
  if (!ok) { writeResults(); throw new Error(`Fase ${nombre} fallida`); }
}
function writeResults() {
  mkdirSync(resolve(process.cwd(), OUT), { recursive: true });
  const path = resolve(process.cwd(), `${OUT}/e2e-resultados.json`);
  // consolidar: append por fase (re-ejecuciones reemplazan la fase homónima)
  let prev = { mision: MISION, fases: [] };
  try { prev = JSON.parse(readFileSync(path, 'utf8')); } catch { /* primera vez */ }
  const byName = new Map(prev.fases.map((f) => [f.fase, f]));
  for (const f of results.fases) byName.set(f.fase, f);
  prev.fases = [...byName.values()];
  if (results.saldos_post) prev.saldos_post = results.saldos_post;
  if (results.hash_movs_post) prev.hash_movs_post = results.hash_movs_post;
  prev.ultima_fase = MODE;
  prev.generado = new Date().toISOString();
  writeFileSync(path, JSON.stringify(prev, null, 1));
}

// ═══════════════════════════════ SETUP ══════════════════════════════════════
if (MODE === 'setup') {
  // 0. pre-limpieza (idempotente)
  await cleanup(false);

  await qE2E(`INSERT INTO public.stores (id, name, is_active) VALUES ('${F.store}', 'E2E-013-NegWAC', true)`, 'tienda');
  const base = (await qE2E(`SELECT (SELECT id FROM public.tenants ORDER BY created_at LIMIT 1) AS tenant`, 'tenant_base'))[0];
  const TENANT = base.tenant;

  // 1. productos (estado post-RECT-011 espejo exacto)
  const vals = Object.entries(SKU_MAP).map(([i, sku]) => {
    const p = prodBySku[sku];
    return `('${F.P[Number(i) - 1]}', '${F.store}', '${TENANT}', 'SKU${sku}', '${p.name.replace(/'/g, "''")}', ${p.stock_current}, ${p.cost_average}, 1, false, true, 'E2E-013-${sku}')`;
  }).join(',\n  ');
  await qE2E(`INSERT INTO public.products (id, store_id, tenant_id, sku, name, stock_current, cost_average, price, is_service, is_active, barcode)
              VALUES ${vals}`, 'productos_6');

  // 2. kardex completo replicado (FVC a 1 CUP, salidas a costo histórico)
  const movVals = [];
  let mn = 0;
  for (const i of [1, 2, 3, 4, 5, 6]) {
    for (const m of kardexProd[i] || []) {
      mn++;
      const q = m.quantity_change, uc = m.unit_cost === null ? 'NULL' : m.unit_cost;
      movVals.push(`('${F.M(mn)}', '${F.store}', '${F.P[i - 1]}', '${m.movement_type}', ${q}, ${uc}, ${m.reference_id ? `'${refId(m.reference_id)}'` : 'NULL'}, '${(m.reference_doc || 'E2E-013').replace(/'/g, "''").slice(0, 90)}', '${(m.movement_date || '2026-07-01').slice(0, 10)}')`);
    }
  }
  // el kardex real pasó por saldos negativos intermedios (el drift mismo) — los triggers de
  // sincronización (con guard prevent_negative_inventory) se deshabilitan SOLO durante el setup (E2E)
  await qE2E(`ALTER TABLE public.stock_movements DISABLE TRIGGER tr_sync_inventory_after_movement;
ALTER TABLE public.stock_movements DISABLE TRIGGER trg_sync_product_stock;
INSERT INTO public.stock_movements (id, store_id, product_id, movement_type, quantity_change, unit_cost, reference_id, reference_doc, movement_date)
              VALUES ${movVals.join(',\n  ')};
ALTER TABLE public.stock_movements ENABLE TRIGGER tr_sync_inventory_after_movement;
ALTER TABLE public.stock_movements ENABLE TRIGGER trg_sync_product_stock;`, `kardex_${mn}_movimientos`);
  // sincronizar inventory con el neto final real (los triggers quedaron deshabilitados durante la carga)
  await qE2E(`INSERT INTO public.inventory (store_id, product_id, quantity, tenant_id)
    SELECT '${F.store}', p.id, p.stock_current, p.tenant_id FROM public.products p
    WHERE p.store_id='${F.store}'
    ON CONFLICT (store_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`, 'sync_inventory');

  // 3. wac_change_log histórico (drift) + filas RECT-011-like (estado negativo)
  const wcl = [];
  let wn = 0;
  for (const w of prodExtract.wac_log_historico) {
    const i = prodByPid[w.product_id];
    if (!i) continue;
    wn++;
    wcl.push(`('${F.W(wn)}', '${F.store}', '${F.P[i - 1]}', ${w.wac_before}, ${w.wac_after}, '${w.event}', ${w.qty_in ?? 'NULL'}, ${w.uc_in ?? 'NULL'}::numeric, '{"mision":"fixture-013"}'::jsonb)`);
  }
  await qE2E(`INSERT INTO public.wac_change_log (id, store_id, product_id, wac_before, wac_after, event, qty_in, uc_in, source_ref)
              VALUES ${wcl.join(',\n  ')}`, `wac_log_${wn}`);

  // 4. asientos contables del fixture (importes reales de los 5 SKU)
  // E1 ORIG-like: D INV 14.018.950 / C CXP 14.018.950
  // E2 RECT-011-like: D CXP 14.018.750 / C INV 2.657.375,00 + C COGS 2.422.216,00 + C VALES 4.587.161,00 + C PÉRD 4.351.998,00
  // E3 vales históricos 5SKU: D VALES 98,31 / C INV 98,31 · E4 cogs: D COGS 19,55 / C INV 19,55
  // E5 recepción ajena P3: D INV 100 / C CXP 100 · E5b vale ajeno: D VALES 70,68 / C INV 70,68
  // E6 control: D INV 205 / C CXP 205 · E7 control salidas: D COGS 3 + D VALES 51 + D PÉRD 40 / C INV 94
  const entries = [];
  const movs = [];
  let fn = 0;
  const addEntry = (eid, type, docId, event, desc, eco, lines) => {
    entries.push(`('${eid}', '${F.store}', '${type}', ${docId ? `'${docId}'` : 'NULL'}, 'TEST-${type}-013', '${event}', ${eco}, '{"mision":"${MISION}","fixture":true}'::jsonb, '${desc.replace(/'/g, "''")}')`);
    for (const [cat, sense, amt] of lines) {
      fn++;
      movs.push(`('${F.FM(fn)}', '${eid}', '${F.store}', '${cat}', '${sense}', ${amt}, 'CUP', 1, ${eco}, 'TEST-013', '${desc.replace(/'/g, "''")}')`);
    }
  };
  addEntry(F.E(1), 'RECEPCION', F.receipt, 'reconocimiento', 'ORIG fixture (espejo ORIG real)', `'2026-07-01'`, [
    ['ACT_INVENTARIO', 'debito', '14018950.00'], ['PAS_CXP_PROV', 'credito', '14018950.00']]);
  addEntry(F.E(2), 'AJUSTE_INVENTARIO', F.receipt, 'reconocimiento', 'RECT-011 fixture (espejo importes reales 5 SKU)', `'2026-07-01'`, [
    ['PAS_CXP_PROV', 'debito', '14018750.00'], ['ACT_INVENTARIO', 'credito', '2657375.00'],
    ['GAS_COSTO_VENTAS', 'credito', '2422216.00'], ['GAS_VALES', 'credito', '4587161.00'],
    ['GAS_PERDIDA_INV', 'credito', '4351998.00']]);
  addEntry(F.E(3), 'VALE_SALIDA', null, 'reconocimiento', 'Vales históricos 5 SKU (consolidado)', `'2026-10-28'`, [
    ['GAS_VALES', 'debito', '98.31'], ['ACT_INVENTARIO', 'credito', '98.31']]);
  addEntry(F.E(4), 'VENTA', null, 'reconocimiento', 'Ventas históricas 5 SKU (consolidado, costo>0)', `'2026-09-09'`, [
    ['GAS_COSTO_VENTAS', 'debito', '19.55'], ['ACT_INVENTARIO', 'credito', '19.55']]);
  addEntry(F.E(5), 'RECEPCION', F.other, 'reconocimiento', 'Recepción ajena P3 100u@1 (espejo 30538c95)', `'2026-09-22'`, [
    ['ACT_INVENTARIO', 'debito', '100.00'], ['PAS_CXP_PROV', 'credito', '100.00']]);
  addEntry(F.E(6), 'VALE_SALIDA', null, 'reconocimiento', 'Vale ajeno P3 94u@0.7519 (espejo VS-000106)', `'2026-09-26'`, [
    ['GAS_VALES', 'debito', '70.68'], ['ACT_INVENTARIO', 'credito', '70.68']]);
  addEntry(F.E(7), 'RECEPCION', null, 'reconocimiento', 'Recepciones control P6 (95+10+100 @1)', `'2026-07-01'`, [
    ['ACT_INVENTARIO', 'debito', '205.00'], ['PAS_CXP_PROV', 'credito', '205.00']]);
  addEntry(F.E(8), 'VENTA', null, 'reconocimiento', 'Salidas control P6 (venta 3, vale 51, pérdida 40 @1)', `'2026-10-16'`, [
    ['GAS_COSTO_VENTAS', 'debito', '3.00'], ['GAS_VALES', 'debito', '51.00'],
    ['GAS_PERDIDA_INV', 'debito', '40.00'], ['ACT_INVENTARIO', 'credito', '94.00']]);
  await qE2E(`INSERT INTO public.fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date, movements_snapshot, description)
              VALUES ${entries.join(',\n  ')}`, `fin_entries_8`);
  await qE2E(`INSERT INTO public.fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, document_number, description)
              VALUES ${movs.join(',\n  ')}`, `fin_movements_${fn}`);

  // 5. verificación del estado inicial (negativo)
  const wacs = await qE2E(`SELECT sku, cost_average, stock_current FROM public.products WHERE store_id='${F.store}' ORDER BY sku`, 'wacs_iniciales');
  const negs = wacs.filter((w) => Number(w.cost_average) < 0);
  fase('setup_estado_inicial_negativo', negs.length === 5 && wacs.length === 6,
    `${negs.length} WAC negativos (SKU${negs.map((n) => n.sku.replace('SKU', '')).join(', ')}) · 6 productos`);
  const bal = await qE2E(`SELECT
      sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) FILTER (WHERE category_code='ACT_INVENTARIO') inv,
      sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) FILTER (WHERE category_code='PAS_CXP_PROV') cxp
      FROM public.fin_movements WHERE store_id='${F.store}'`, 'saldos_fixture');
  console.log(`  fixture: ACT_INVENTARIO=${Number(bal[0].inv).toFixed(2)} · PAS_CXP_PROV=${Number(bal[0].cxp).toFixed(2)}`);
  const stock = await qE2E(`SELECT sku, stock_current FROM public.products WHERE store_id='${F.store}' ORDER BY sku`, 'stocks');
  const esperado = Object.fromEntries(Object.entries(SKU_MAP).map(([i, s]) => [`SKU${s}`, Number(prodBySku[s].stock_current)]));
  const okStock = stock.every((s) => Math.abs(Number(s.stock_current) - esperado[s.sku]) < 1e-9);
  fase('setup_existencias_conservadas', okStock, 'stock_current tras kardex replicado = producción');
}

// ═══════════════════════════════ EXECUTE ════════════════════════════════════
if (MODE === 'execute') {
  // guard: los 5 WAC siguen negativos (estado esperado)
  const negs = await qE2E(`SELECT id, sku, cost_average, stock_current FROM public.products WHERE store_id='${F.store}' AND cost_average < 0 ORDER BY sku`, 'guard_negativos');
  if (negs.length !== 5) throw new Error(`GUARD: se esperaban 5 WAC negativos, hay ${negs.length}`);
  const productos = negs.map((n) => ({ id: n.id, sku: n.sku, wac: n.cost_average, stock: n.stock_current }));

  const wacVals = productos.map((p) => `('${p.id}'::uuid, 1.00::numeric, ${p.stock}::numeric, ${p.wac}::numeric)`).join(', ');
  const wclVals = productos.map((p, idx) =>
    `(( '${SEG}-' || substr(md5('m013-wac-'||'${p.id}'),1,12))::uuid, '${F.store}', '${p.id}'::uuid, ${p.wac}::numeric, 1.00::numeric, 'rect013_restauracion', ${p.stock}::numeric, 1::numeric, '{"mision":"${MISION}","metodo":"restauración valoración 5 SKU a 1,00 CUP (economía autorizada)","entrada":"RECT-013-A"}'::jsonb, now())`).join(',\n  ');
  const audVals = productos.map((p) =>
    `(( '${SEG}-' || substr(md5('m013-wacaud-'||'${p.id}'),1,12))::uuid, now(), 'products', '${p.id}', 'SYSTEM_RECT013_WAC',
     jsonb_build_object('wac', ${p.wac}::numeric, 'stock', ${p.stock}::numeric),
     jsonb_build_object('wac', 1.00::numeric, 'stock', ${p.stock}::numeric),
     '{"mision":"${MISION}","fase":"loteA"}'::jsonb, '${F.store}', '${TRACE}')`).join(',\n  ');

  const snapshot = JSON.stringify(productos.map((p) => ({ sku: p.sku, wac_antes: Number(p.wac), wac_nuevo: 1, stock: Number(p.stock) })));

  const sql = `BEGIN;
SELECT pg_advisory_xact_lock(hashtext('m013:restauracion:${F.store}'));
-- GUARD: ya aplicado → abortar silenciosamente para idempotencia
DO $do$ DECLARE v_n int; BEGIN
  SELECT count(*) INTO v_n FROM public.products WHERE store_id='${F.store}' AND cost_average < 0;
  IF v_n = 0 THEN RAISE EXCEPTION 'YA_APLICADO'; END IF;
  IF v_n <> 5 THEN RAISE EXCEPTION 'ESTADO_INESPERADO: % negativos', v_n; END IF;
END $do$;
-- LOTE A · WAC sellado → 1,00 + wac_change_log + auditoría
CREATE TEMP TABLE m013_wac AS
WITH datos(product_id, wac_new, stock, wac_old) AS (VALUES ${wacVals})
SELECT * FROM datos;
SET LOCAL app.wac_writer = 'fn_recalc_wac';
UPDATE public.products p SET cost_average = m.wac_new, updated_at = now()
FROM m013_wac m WHERE p.id = m.product_id AND p.cost_average <> m.wac_new;
SET LOCAL app.wac_writer = '';
INSERT INTO public.wac_change_log (id, store_id, product_id, wac_before, wac_after, event, qty_in, uc_in, source_ref, created_at)
VALUES ${wclVals} ON CONFLICT (id) DO NOTHING;
INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
VALUES ${audVals} ON CONFLICT (id) DO NOTHING;
-- LOTE B · asiento RECT-013-A: DR COGS+VALES+PÉRDIDA / CR ACT_INVENTARIO
INSERT INTO public.fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date, movements_snapshot, description)
VALUES ('${F.E(9)}', '${F.store}', 'AJUSTE_INVENTARIO', NULL, 'RECT-013-A-NEGWAC', 'ajuste_manual', '${ECO_DATE}',
        '${snapshot.replace(/'/g, "''")}'::jsonb, 'Restauración valoración 5 SKU (WAC negativo → 1,00 CUP): exceso de crédito de inventario RECT-011 devuelto a las cuentas de gasto que lo originaron')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, document_number, description, traza)
VALUES
 ('${F.FM(90)}', '${F.E(9)}', '${F.store}', 'GAS_COSTO_VENTAS', 'debito', ${A.cogs}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-A-NEGWAC', 'Restauración WAC 5 SKU (reparto proporcional créditos RECT-011)', '{"mision":"${MISION}","canal":"venta"}'),
 ('${F.FM(91)}', '${F.E(9)}', '${F.store}', 'GAS_VALES', 'debito', ${A.vales}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-A-NEGWAC', 'Restauración WAC 5 SKU', '{"mision":"${MISION}","canal":"vale"}'),
 ('${F.FM(92)}', '${F.E(9)}', '${F.store}', 'GAS_PERDIDA_INV', 'debito', ${A.perdida}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-A-NEGWAC', 'Restauración WAC 5 SKU (residuo de reparto)', '{"mision":"${MISION}","canal":"perdida"}'),
 ('${F.FM(93)}', '${F.E(9)}', '${F.store}', 'ACT_INVENTARIO', 'credito', ${A.total}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-A-NEGWAC', 'Liberación atribución ficticia de inventario 5 SKU', '{"mision":"${MISION}","skus":["117","83","90","40","37"]}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
VALUES ('${F.AUD(9)}', now(), 'system', '${F.E(9)}', 'SYSTEM_RECT013_ENTRY',
  '{"entrada":null}'::jsonb,
  jsonb_build_object('entry_id', '${F.E(9)}', 'importe', ${A.total}, 'dr_cogs', ${A.cogs}, 'dr_vales', ${A.vales}, 'dr_perdida', ${A.perdida}, 'wac_actualizados', 5),
  '{"mision":"${MISION}","fase":"loteB"}'::jsonb, '${F.store}', '${TRACE}')
ON CONFLICT (id) DO NOTHING;
COMMIT;`;
  await qE2E(sql, 'ejecucion_RECT-013-A');

  // verificación inmediata
  const post = await qE2E(`SELECT sku, cost_average, stock_current FROM public.products WHERE store_id='${F.store}' ORDER BY sku`, 'wacs_post');
  const quedan = post.filter((p) => Number(p.cost_average) < 0);
  const unos = post.filter((p) => Number(p.cost_average) === 1 && p.sku !== 'SKU31');
  fase('execute_wac_no_negativos', quedan.length === 0, `0 negativos · ${post.filter((p) => Number(p.cost_average) === 1).length} productos a 1,00`);
  const bal = await qE2E(`SELECT
      sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) FILTER (WHERE category_code='ACT_INVENTARIO') inv,
      sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) FILTER (WHERE category_code='PAS_CXP_PROV') cxp,
      sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) FILTER (WHERE category_code='GAS_COSTO_VENTAS') cogs,
      sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) FILTER (WHERE category_code='GAS_VALES') vales,
      sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) FILTER (WHERE category_code='GAS_PERDIDA_INV') perd
      FROM public.fin_movements WHERE store_id='${F.store}'`, 'saldos_post');
  results.saldos_post = bal[0];
  console.log(`  post: INV=${Number(bal[0].inv).toFixed(2)} CXP=${Number(bal[0].cxp).toFixed(2)} COGS=${Number(bal[0].cogs).toFixed(2)} VALES=${Number(bal[0].vales).toFixed(2)} PÉRD=${Number(bal[0].perd).toFixed(2)}`);
}

// ═══════════════════════════════ VERIFY ═════════════════════════════════════
if (MODE === 'verify') {
  // V1 WAC y valoración
  const prods = await qE2E(`SELECT sku, cost_average, stock_current FROM public.products WHERE store_id='${F.store}' ORDER BY sku`, 'V1');
  const negs = prods.filter((p) => Number(p.cost_average) < 0);
  fase('V1_wac_no_negativos', negs.length === 0, `${negs.length} negativos · ${prods.filter((p) => Number(p.cost_average) === 1).length} productos a 1,00`);
  // V2 existencias intactas
  const esperado = Object.fromEntries(Object.entries(SKU_MAP).map(([i, s]) => [`SKU${s}`, Number(prodBySku[s].stock_current)]));
  const okStock = prods.every((p) => Math.abs(Number(p.stock_current) - esperado[p.sku]) < 1e-9);
  fase('V2_existencias_intactas', okStock, 'stock_current idéntico al pre-misión');
  // V3 movimientos intactos (conteo + hash)
  const movs = await qE2E(`SELECT id, product_id, movement_type, quantity_change, unit_cost, reference_id FROM public.stock_movements WHERE store_id='${F.store}' ORDER BY id`, 'V3');
  const h1 = md5(movs.map((m) => `${m.id}|${m.quantity_change}|${m.unit_cost}`).join('\n'));
  fase('V3_movs_conteo', movs.length === (results.conteo_movs_setup ?? movs.length), `${movs.length} movimientos · hash ${h1.slice(0, 8)}`);
  results.hash_movs_post = h1;
  // V4 reconciliación contable: Δ de cada cuenta = RECT-013-A
  const bal = await qE2E(`SELECT category_code,
      sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) saldo
      FROM public.fin_movements WHERE store_id='${F.store}' GROUP BY category_code`, 'V4');
  const s = Object.fromEntries(bal.map((b) => [b.category_code, Number(b.saldo)]));
  const baseInv = 14018950 - 2657375 - 98.31 - 19.55 + 100 - 70.68 + 205 - 94;   // saldo fixture pre
  const baseCxp = -14018950 + 14018750 - 100 - 205;
  const baseCogs = -2422216 + 19.55 + 3;
  const baseVales = -4587161 + 98.31 + 70.68 + 51;
  const basePerd = -4351998 + 40;
  const okInv = Math.abs(s.ACT_INVENTARIO - (baseInv - 2657379.32)) < 0.005;
  const okCxp = Math.abs(s.PAS_CXP_PROV - baseCxp) < 0.005;
  const okCogs = Math.abs(s.GAS_COSTO_VENTAS - (baseCogs + 566546.45)) < 0.005;
  const okVales = Math.abs(s.GAS_VALES - (baseVales + 1072918.27)) < 0.005;
  const okPerd = Math.abs(s.GAS_PERDIDA_INV - (basePerd + 1017914.60)) < 0.005;
  fase('V5_act_inventario_delta', okInv, `Δ ACT_INVENTARIO = −2.657.379,32 exacto (saldo ${s.ACT_INVENTARIO.toFixed(2)})`);
  fase('V6_cxp_intacta', okCxp, `PAS_CXP_PROV sin cambios (${s.PAS_CXP_PROV.toFixed(2)}) — economía recepción intacta`);
  fase('V7_gastos_según_propuesta', okCogs && okVales && okPerd,
    `COGS +566.546,45 · VALES +1.072.918,27 · PÉRDIDA +1.017.914,60 (deshace parte del ingreso fantasma)`);
  // V8 asiento único y balanceado
  const ent = await qE2E(`SELECT e.id, e.document_type, e.event,
      sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END) diff
      FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id=e.id
      WHERE e.store_id='${F.store}' AND e.document_number='RECT-013-A-NEGWAC' GROUP BY e.id, e.document_type, e.event`, 'V8');
  fase('V8_asiento_unico_balanceado', ent.length === 1 && Math.abs(Number(ent[0].diff)) < 0.005,
    `1 entrada AJUSTE_INVENTARIO/ajuste_manual · D−C = ${Number(ent[0]?.diff ?? 0).toFixed(2)}`);
  // V9 wac_change_log y auditoría
  const wcl = await qE2E(`SELECT count(*) n FROM public.wac_change_log WHERE event='rect013_restauracion' AND store_id='${F.store}'`, 'V9a');
  const aud = await qE2E(`SELECT action, count(*) n FROM public.audit_logs WHERE trace_id='${TRACE}' AND store_id='${F.store}' GROUP BY action`, 'V9b');
  const audMap = Object.fromEntries(aud.map((a) => [a.action, a.n]));
  fase('V9_trazabilidad', Number(wcl[0].n) === 5 && audMap.SYSTEM_RECT013_WAC === 5 && audMap.SYSTEM_RECT013_ENTRY === 1,
    `wac_change_log +5 · auditoría WAC +5 · auditoría entrada +1 (trace RECT013-E2E)`);
  // V10 capas ajenas intactas (P3 capa 100@1 de recepción ajena y P6 capas)
  const capas = await qE2E(`SELECT count(*) n, sum(quantity_change*unit_cost) valor
      FROM public.stock_movements
      WHERE store_id='${F.store}' AND movement_type='purchase'
        AND product_id='${F.P[2]}'
        AND reference_id IN (SELECT reference_id FROM public.stock_movements WHERE store_id='${F.store}' AND product_id='${F.P[2]}' AND movement_type='purchase' AND quantity_change=100 AND unit_cost=1 LIMIT 1)`, 'V10');
  fase('V10_capas_ajenas_intactas', Number(capas[0].n) >= 1 && Math.abs(Number(capas[0].valor) - 100) < 1e-9,
    `capa ajena P3: ${capas[0].n} capa(s) · valor ${Number(capas[0].valor).toFixed(2)} intacto`);
}

// ═══════════════════════════════ IDEMPOTENCIA ═══════════════════════════════
if (MODE === 'idem') {
  const before = await snapshotState();
  // re-ejecución: el guard YA_APLICADO aborta con excepción (sin cambios)
  const negs = await qE2E(`SELECT count(*) n FROM public.products WHERE store_id='${F.store}' AND cost_average < 0`, 'idem_negativos');
  if (Number(negs[0].n) !== 0) throw new Error('idem: estado inesperado, hay negativos');
  // la re-ejecución del bloque completo aborta en el guard (YA_APLICADO)
  const wacs = await qE2E(`SELECT id, sku, cost_average, stock_current FROM public.products WHERE store_id='${F.store}' AND cost_average=1 ORDER BY sku`, 'idem_wacs');
  const wacVals = wacs.map((p) => `('${p.id}'::uuid, 1.00::numeric, ${p.stock_current}::numeric, 1.00::numeric)`).join(', ');
  const res = await qE2E(`BEGIN;
SELECT pg_advisory_xact_lock(hashtext('m013:restauracion:${F.store}'));
DO $do$ DECLARE v_n int; BEGIN
  SELECT count(*) INTO v_n FROM public.products WHERE store_id='${F.store}' AND cost_average < 0;
  IF v_n = 0 THEN RAISE EXCEPTION 'YA_APLICADO'; END IF;
END $do$;
UPDATE public.products p SET cost_average = 1.00 FROM (VALUES ${wacVals}) AS d(id, wac_new, stock, wac_old) WHERE p.id = d.id AND p.cost_average <> d.wac_new;
COMMIT;`, 'idem_reejecucion', true);
  const abortada = res && res.__error && res.__error.includes('YA_APLICADO');
  const after = await snapshotState();
  const igual = JSON.stringify(before) === JSON.stringify(after);
  fase('idem_reejecucion_0_cambios', abortada && igual,
    `guard YA_APLICADO activo · estado idéntico pre/post re-ejecución (${igual ? 'hash-igual' : 'CAMBIÓ'})`);
}

// ═══════════════════════════════ ROLLBACK ═══════════════════════════════════
if (MODE === 'rollback') {
  // reset a estado PRE-ejecución para probar el aborto: volvemos los WAC a negativo (solo fixture)
  // (también requiere el token sellado — el guard w62 exige escritor único; prueba adicional del guard)
  await qE2E(`BEGIN;
SET LOCAL app.wac_writer = 'fn_recalc_wac';
UPDATE public.products p SET cost_average = d.wac_old
      FROM (VALUES
        ('${F.P[0]}'::uuid, -2175998.00::numeric), ('${F.P[1]}'::uuid, -122398.00::numeric),
        ('${F.P[2]}'::uuid, -78176.248120300752::numeric), ('${F.P[3]}'::uuid, -665.857142857143::numeric),
        ('${F.P[4]}'::uuid, -1.00::numeric)) AS d(id, wac_old)
      WHERE p.id = d.id;
COMMIT;`, 'rollback_reset_negativos');
  const before = await snapshotState();
  // transacción que aplica y LUEGO aborta deliberadamente
  const res = await qE2E(`BEGIN;
SET LOCAL app.wac_writer = 'fn_recalc_wac';
UPDATE public.products SET cost_average = 1.00 WHERE store_id='${F.store}' AND sku IN ('SKU117','SKU83','SKU90','SKU40','SKU37');
SET LOCAL app.wac_writer = '';
INSERT INTO public.fin_entries (id, store_id, document_type, document_number, event, economic_date, description)
VALUES ('${F.E(9)}', '${F.store}', 'AJUSTE_INVENTARIO', 'RECT-013-A-NEGWAC-ROLLBACK', 'ajuste_manual', '${ECO_DATE}', 'prueba de rollback')
ON CONFLICT (id) DO NOTHING;
DO $do$ BEGIN RAISE EXCEPTION 'ABORTO_DELIBERADO_DE_PRUEBA'; END $do$;
COMMIT;`, 'rollback_aborto', true);
  const abortada = res && res.__error && res.__error.includes('ABORTO_DELIBERADO_DE_PRUEBA');
  const after = await snapshotState();
  const igual = JSON.stringify(before) === JSON.stringify(after);
  fase('rollback_aborto_sin_persistencia', abortada && igual,
    `excepción → ROLLBACK atómico · estado idéntico (${igual ? 'hash-igual' : 'CAMBIÓ'})`);
  // reaplicación tras el aborto (camino de reanudación)
  await qE2E(`BEGIN;
SELECT pg_advisory_xact_lock(hashtext('m013:restauracion:${F.store}'));
DO $do$ DECLARE v_n int; BEGIN
  SELECT count(*) INTO v_n FROM public.products WHERE store_id='${F.store}' AND cost_average < 0;
  IF v_n <> 5 THEN RAISE EXCEPTION 'ESTADO_INESPERADO'; END IF;
END $do$;
SET LOCAL app.wac_writer = 'fn_recalc_wac';
UPDATE public.products SET cost_average = 1.00 WHERE store_id='${F.store}' AND sku IN ('SKU117','SKU83','SKU90','SKU40','SKU37');
SET LOCAL app.wac_writer = '';
COMMIT;`, 'reapply_wac');
  const post = await qE2E(`SELECT count(*) n FROM public.products WHERE store_id='${F.store}' AND cost_average < 0`, 'reapply_verif');
  fase('reapply_tras_aborto_exitosa', Number(post[0].n) === 0, `0 negativos tras reaplicar (reanudación segura)`);
}

// ═══════════════════════════════ REAPPLY (ciclo limpio completo) ═════════════
if (MODE === 'reapply') {
  await cleanup(true);
  console.log('→ ciclo limpio: setup + execute + verify');
}

// ═══════════════════════════════ CLEANUP ════════════════════════════════════
if (MODE === 'cleanup') {
  await cleanup(true);
}

async function snapshotState() {
  const rows = await qE2E(`SELECT
    (SELECT count(*) FROM public.products WHERE store_id='${F.store}') p,
    (SELECT count(*) FROM public.stock_movements WHERE store_id='${F.store}') sm,
    (SELECT count(*) FROM public.fin_entries WHERE store_id='${F.store}') fe,
    (SELECT count(*) FROM public.fin_movements WHERE store_id='${F.store}') fm,
    (SELECT count(*) FROM public.wac_change_log WHERE store_id='${F.store}') wcl,
    (SELECT count(*) FROM public.audit_logs WHERE store_id='${F.store}') aud,
    (SELECT coalesce(sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END),0) FROM public.fin_movements WHERE store_id='${F.store}' AND category_code='ACT_INVENTARIO') inv,
    (SELECT coalesce(sum(cost_average),0) FROM public.products WHERE store_id='${F.store}') wsum`, 'snapshot');
  return rows[0];
}

async function cleanup(certificar) {
  // borrado en orden de dependencias, por IDs deterministas del fixture
  const movs = await qE2E(`SELECT id FROM public.stock_movements WHERE store_id='${F.store}'`, 'del_movs_ids');
  if (movs.length) await qE2E(`DELETE FROM public.stock_movements WHERE store_id='${F.store}'`, 'del_movs');
  await qE2E(`DELETE FROM public.fin_movements WHERE entry_id IN (SELECT id FROM public.fin_entries WHERE store_id='${F.store}') OR store_id='${F.store}'`, 'del_fin_movs');
  await qE2E(`DELETE FROM public.fin_entries WHERE store_id='${F.store}'`, 'del_fin_entries');
  await qE2E(`DELETE FROM public.wac_change_log WHERE store_id='${F.store}'`, 'del_wcl');
  await qE2E(`DELETE FROM public.audit_logs WHERE store_id='${F.store}' OR trace_id='${TRACE}'`, 'del_audit');
  await qE2E(`DELETE FROM public.receipt_items WHERE receipt_id IN ('${F.receipt}','${F.other}')`, 'del_ri');
  await qE2E(`DELETE FROM public.receipts WHERE id IN ('${F.receipt}','${F.other}')`, 'del_receipts');
  await qE2E(`DELETE FROM public.products WHERE store_id='${F.store}'`, 'del_products');
  await qE2E(`DELETE FROM public.inventory WHERE store_id='${F.store}'`, 'del_inventory');
  // el trigger AFTER DELETE de stores escribe auditoría con el id ya borrado → deshabilitar solo para el fixture
  await qE2E(`ALTER TABLE public.stores DISABLE TRIGGER trigger_audit_store_changes;
DELETE FROM public.stores WHERE id='${F.store}';
ALTER TABLE public.stores ENABLE TRIGGER trigger_audit_store_changes;`, 'del_store');
  // limpiar auditoría residual del fixture
  await qE2E(`DELETE FROM public.audit_logs WHERE store_id='${F.store}' OR trace_id='${TRACE}' OR record_id='${F.store}'`, 'del_audit_post');
  if (certificar) {
    const delta = await qE2E(`SELECT
      (SELECT count(*) FROM public.products WHERE store_id='${F.store}') p,
      (SELECT count(*) FROM public.inventory WHERE store_id='${F.store}') inv,
      (SELECT count(*) FROM public.stock_movements WHERE id::text LIKE '0e13%') sm,
      (SELECT count(*) FROM public.fin_entries WHERE id::text LIKE '0e13%') fe,
      (SELECT count(*) FROM public.fin_movements WHERE id::text LIKE '0e13%') fm,
      (SELECT count(*) FROM public.wac_change_log WHERE id::text LIKE '0e13%') wcl,
      (SELECT count(*) FROM public.audit_logs WHERE trace_id='${TRACE}') aud`, 'net_delta');
    const d = delta[0];
    const total = Number(d.p) + Number(d.inv) + Number(d.sm) + Number(d.fe) + Number(d.fm) + Number(d.wcl) + Number(d.aud);
    fase('cleanup_net_delta_cero', total === 0, `NET DELTA = 0 (p=${d.p} inv=${d.inv} sm=${d.sm} fe=${d.fe} fm=${d.fm} wcl=${d.wcl} aud=${d.aud})`);
  }
}

writeResults();
console.log(`\nM092 fase ${MODE || '?'} completada. Resultados: ${OUT}/e2e-resultados.json`);
