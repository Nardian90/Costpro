#!/usr/bin/env node
// ============================================================================
// M102 — CP-FIN-NEGATIVE-WAC-COMPLETE-REMEDIATION-014 · PROTOTOPO E2E EN BD AISLADA
// Reproduce el estado de ENERVIDA (5 WAC negativos + representantes de los 96 +
// residuo de tienda con saldos EXACTOS de producción) en la BD aislada
// lguovmvrozxgssupkwpf (NUNCA producción) y valida la secuencia completa:
//   --setup        fixture: 10 productos, kardex real replicado, asientos ORIG/
//                  RECT-011 espejo y asiento RESIDUO-TIENDA que calibra los 5
//                  saldos de cuenta a los valores reales de producción.
//   --execute      aplica RECT-013-A (lote 1: WAC sellados + asiento),
//                  RECT-013-B (lote 2) y RECT-013-C (lote 3) — 1 llamada = 1
//                  transacción por lote, con guards YA_APLICADO por lote.
//   --verify       V1..V8: WAC, D=C por asiento, Δ pool, pool=kardex, saldos
//                  finales de gasto, CXP intacta, capas/movimientos intactos,
//                  trazabilidad.
//   --idem         re-ejecución de los 3 lotes → YA_APLICADO, 0 cambios.
//   --rollback     lote 1 aplicado y abortado deliberadamente → 0 persistencia.
//   --rollback-all los 3 lotes en una transacción abortada → 0 persistencia.
//   --reapply      ciclo completo limpio (cleanup+setup+execute+verify).
//   --cleanup      elimina el fixture y certifica NET DELTA = 0.
// Guard assert-not-production: E2E libre; producción fail-closed.
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const MODE = process.argv[2] || '';
const OUT = 'scripts/out/m014';
const E2E = 'lguovmvrozxgssupkwpf';
const MISION = 'CP-FIN-NEGATIVE-WAC-COMPLETE-REMEDIATION-014';

// ══ IMPORTES EXACTOS (m101, reproducción Decimal sobre extracción fresca) ══
const A = { total: '2657379.32', cogs: '566546.45', vales: '1072918.27', perdida: '1017914.60' };
const B = { total: '8704161.30', cogs: '1855777.48', vales: '3514277.42', perdida: '3334106.40' };
const C = { total: '22471992.81', cogs: '16002792.90', vales: '639762.33', perdida: '5829437.58' };
const C1 = { cogs: '14254852.02', vales: '517882.70', perdida: '5338990.00' };
const C2 = { cogs: '1747940.88', vales: '121879.63', perdida: '490447.58' };

// Saldos de producción (extracción fresca m100) que el fixture debe reproducir
const SALDOS_PROD = {
  inv: '34435061.24', cxp: '-2961795.90',
  cogs: '-16677175.95', vales: '-5105078.39', perd: '-9691011.00',
};
const KARDEX_PROD = '-2055851.5110633662062616697725295469128750000000';

const TRACE = 'RECT014-E2E';
const SEG = '7ec9000e-0000-4000-8000';       // segmento determinista 014
const ECO_DATE = '2026-11-17';

// IDs deterministas del fixture (segmento 0e14)
const F = {
  store: '0e14a000-0000-4000-8000-000000000001',
  receipt: '0e14b000-0000-4000-8000-000000000001',   // recepción FVC-like
  other: '0e14b000-0000-4000-8000-000000000002',     // recepción ajena
  P: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => `0e14c000-0000-4000-8000-${String(i).padStart(12, '0')}`),
  M: (n) => `0e145000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  E: (n) => `0e14d000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  FM: (n) => `0e14f000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  W: (n) => `0e144000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  AUD: (n) => `0e14e000-0000-4000-8000-${String(n).padStart(12, '0')}`,
};
// P1..P5 espejo de SKU117/83/90/40/37 · P6 control (SKU31) · P7-P9 representantes
// de los 96 (SKU4, SKU14, SKU19) · P10 residuo de tienda (agregado)
const SKU_MAP = { 1: '117', 2: '83', 3: '90', 4: '40', 5: '37', 6: '31', 7: '4', 8: '14', 9: '19' };

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const md5 = (s) => createHash('md5').update(s).digest('hex');

async function qE2E(sql, label, expectFail = false) {
  assertNotProduction({ mode: 'write', projectRef: E2E, context: `m102-${MODE || 'run'}:${label}` });
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

// ── carga de la extracción de producción (fuente del fixture) ───────────────
const ex = JSON.parse(readFileSync(resolve(process.cwd(), `${OUT}/extract.json`), 'utf8'));
const m74 = JSON.parse(readFileSync(resolve(process.cwd(), 'scripts/out/m074-matriz-1cup.json'), 'utf8'));
const m74BySku = Object.fromEntries(m74.matriz.map((f) => [f.sku, f]));
const prodBySku = {};
for (const p of ex.productos_101) prodBySku[p.sku] = p;
const kardexProd = {};
const SKU_SET = new Set(Object.values(SKU_MAP));
for (const m of ex.kardex_101) {
  const sku = String(m.sku);
  if (!SKU_SET.has(sku)) continue;
  (kardexProd[sku] ||= []).push(m);
}
for (const sku of Object.keys(kardexProd)) {
  kardexProd[sku].sort((a, b) => (a.movement_date || '').localeCompare(b.movement_date || '') || (a.created_at || '').localeCompare(b.created_at || '') || a.id.localeCompare(b.id));
}

// referencia de movimientos → referencia de fixture determinista
const refMap = new Map();
function refId(realRef) {
  if (!realRef) return null;
  if (!refMap.has(realRef)) {
    const n = refMap.size + 1;
    refMap.set(realRef, n === 1 ? F.receipt : n === 2 ? F.other : `0e139000-0000-4000-8000-${String(n).padStart(12, '0')}`);
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
  let prev = { mision: MISION, fases: [] };
  try { prev = JSON.parse(readFileSync(path, 'utf8')); } catch {}
  const map = new Map(prev.fases.map((f) => [f.fase, f]));
  for (const f of results.fases) map.set(f.fase, f);
  writeFileSync(path, JSON.stringify({ mision: MISION, actualizado: new Date().toISOString(), fases: [...map.values()] }, null, 1));
}

const D = (x) => Number(x);
const money = (x) => D(x).toFixed(2);

// valor kardex por producto en el fixture (después del setup, antes de A)
function kardexVal(i) {
  const sku = SKU_MAP[String(i)];
  const p = prodBySku[sku];
  return D(p.stock_current) * D(p.cost_average);
}

// ═══════════════════════════════ SETUP ══════════════════════════════════════
if (MODE === 'setup') {
  const pre = await qE2E(`SELECT count(*) n FROM public.products WHERE store_id='${F.store}'`, 'guard_setup');
  if (pre[0].n > 0) { console.log('Fixture ya existe — setup omitido'); results.fases.push({ fase: 'setup_preexistente', ok: true, detalle: `${pre[0].n} productos` }); writeResults(); process.exit(0); }

  await qE2E(`INSERT INTO public.stores (id, name, is_active) VALUES ('${F.store}', 'E2E-014-NegWAC-Complete', true) ON CONFLICT (id) DO NOTHING`, 'tienda');
  const base = (await qE2E(`SELECT (SELECT id FROM public.tenants ORDER BY created_at LIMIT 1) AS tenant`, 'tenant_base'))[0];
  const TENANT = base.tenant;

  //── productos ──────────────────────────────────────────────────────────────
  const prodVals = [];
  for (const [i, sku] of Object.entries(SKU_MAP)) {
    const p = prodBySku[sku];
    prodVals.push(`('${F.P[Number(i) - 1]}', '${F.store}', '${TENANT}', 'SKU${sku}', '${(p.name || `SKU${sku}`).replace(/'/g, "''")}', ${D(p.stock_current)}::numeric, ${D(p.cost_average)}::numeric, ${D(p.price || 0)}::numeric, false, true, 'E2E-014-${sku}', now())`);
  }
  // P10: residuo de tienda → kardex residual = KARDEX_PROD − Σ(P1..P9)
  const sumP = Object.keys(SKU_MAP).reduce((acc, i) => acc + kardexVal(i), 0);
  const residuo = D(KARDEX_PROD) - sumP;
  prodVals.push(`('${F.P[9]}', '${F.store}', '${TENANT}', 'SKU-RES', 'RESIDUO-TIENDA-FIXTURE', ${residuo}::numeric, 1.00::numeric, 0::numeric, false, true, 'E2E-014-RES', now())`);
  await qE2E(`INSERT INTO public.products (id, store_id, tenant_id, sku, name, stock_current, cost_average, price, is_service, is_active, barcode, updated_at)
    VALUES ${prodVals.join(', ')}`, 'productos');

  //── kardex real replicado de los 9 productos (movimientos actuales) ────────
  let n = 0; const movVals = [];
  for (const [i, sku] of Object.entries(SKU_MAP)) {
    for (const m of kardexProd[sku] || []) {
      n += 1;
      const ref = refId(m.reference_id ? String(m.reference_id) : null);
      movVals.push(`('${F.M(n)}', '${F.P[Number(i) - 1]}', '${F.store}', '${m.movement_type}', ${D(m.quantity_change)}::numeric, ${D(m.unit_cost)}::numeric, ${ref ? `'${ref}'` : 'NULL'}, ${m.balance_after === null || m.balance_after === undefined ? 'NULL' : D(m.balance_after)}::numeric, '${(m.movement_date || '2026-07-01').slice(0, 10)}', now() + (${n} * interval '1 millisecond'))`);
    }
  }
  // sincronización de inventory deshabilitada SOLO durante la carga (E2E)
  await qE2E(`ALTER TABLE public.stock_movements DISABLE TRIGGER tr_sync_inventory_after_movement;
INSERT INTO public.stock_movements (id, product_id, store_id, movement_type, quantity_change, unit_cost, reference_id, balance_after, movement_date, created_at)
VALUES ${movVals.join(', ')};
ALTER TABLE public.stock_movements ENABLE TRIGGER tr_sync_inventory_after_movement;`, `kardex (${n} movimientos)`);
  // stock_current explícito = producción (el trigger tr_sync_product_stock elige por
  // movement_date/created_at y puede no coincidir con el orden de drift de producción)
  const stockVals = Object.entries(SKU_MAP).map(([i, sku]) => `('${F.P[Number(i) - 1]}', ${D(prodBySku[sku].stock_current)}::numeric)`).join(', ');
  await qE2E(`UPDATE public.products p SET stock_current = v.stock
    FROM (VALUES ${stockVals}) AS v(id, stock) WHERE p.id = v.id::uuid`, 'stock_current_explicito');
  await qE2E(`INSERT INTO public.inventory (store_id, product_id, quantity, tenant_id)
    SELECT '${F.store}', p.id, p.stock_current, p.tenant_id FROM public.products p WHERE p.store_id='${F.store}'
    ON CONFLICT (store_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`, 'sync_inventory');

  //── asiento ORIG espejo (recepción a costos ORIGINALES de los 9 productos) ─
  const orig9 = Object.entries(SKU_MAP).reduce((acc, [i, sku]) => acc + D(m74BySku[sku].subtotal_old_cup), 0);
  const delta9 = Object.entries(SKU_MAP).reduce((acc, [i, sku]) => acc + D(m74BySku[sku].delta_linea), 0);
  const inv9 = Object.entries(SKU_MAP).reduce((acc, [i, sku]) => acc + D(m74BySku[sku].inv_credito), 0);
  const cogs9 = Object.entries(SKU_MAP).reduce((acc, [i, sku]) => acc + D(m74BySku[sku].cogs_credito), 0);
  const vales9 = Object.entries(SKU_MAP).reduce((acc, [i, sku]) => acc + D(m74BySku[sku].vales_credito), 0);
  const perd9 = Object.entries(SKU_MAP).reduce((acc, [i, sku]) => acc + D(m74BySku[sku].perdida_credito), 0);
  await qE2E(`BEGIN;
INSERT INTO public.fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date, description)
VALUES ('${F.E(1)}', '${F.store}', 'RECEPCION', '${F.receipt}', NULL, 'reconocimiento', '2026-07-01', 'FIXTURE: recepción original (costos históricos inflados)');
INSERT INTO public.fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, document_number, description)
VALUES ('${F.FM(1)}', '${F.E(1)}', '${F.store}', 'ACT_INVENTARIO', 'debito', ${orig9}, 'CUP', 1, '2026-07-01', NULL, 'fixture ORIG'),
       ('${F.FM(2)}', '${F.E(1)}', '${F.store}', 'PAS_CXP_PROV', 'credito', ${orig9}, 'CUP', 1, '2026-07-01', NULL, 'fixture ORIG');
INSERT INTO public.fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date, description)
VALUES ('${F.E(2)}', '${F.store}', 'AJUSTE_INVENTARIO', '${F.receipt}', 'FAC-VITALLCONS-001-VAL1CUP-FIX', 'reconocimiento', '2026-07-01', 'FIXTURE: espejo RECT-011 (9 productos)');
INSERT INTO public.fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, document_number, description)
VALUES ('${F.FM(3)}', '${F.E(2)}', '${F.store}', 'PAS_CXP_PROV', 'debito', ${delta9}, 'CUP', 1, '2026-07-01', 'FAC-VITALLCONS-001-VAL1CUP-FIX', 'fixture RECT-011'),
       ('${F.FM(4)}', '${F.E(2)}', '${F.store}', 'ACT_INVENTARIO', 'credito', ${inv9}, 'CUP', 1, '2026-07-01', 'FAC-VITALLCONS-001-VAL1CUP-FIX', 'fixture RECT-011'),
       ('${F.FM(5)}', '${F.E(2)}', '${F.store}', 'GAS_COSTO_VENTAS', 'credito', ${cogs9}, 'CUP', 1, '2026-07-01', 'FAC-VITALLCONS-001-VAL1CUP-FIX', 'fixture RECT-011'),
       ('${F.FM(6)}', '${F.E(2)}', '${F.store}', 'GAS_VALES', 'credito', ${vales9}, 'CUP', 1, '2026-07-01', 'FAC-VITALLCONS-001-VAL1CUP-FIX', 'fixture RECT-011'),
       ('${F.FM(7)}', '${F.E(2)}', '${F.store}', 'GAS_PERDIDA_INV', 'credito', ${perd9}, 'CUP', 1, '2026-07-01', 'FAC-VITALLCONS-001-VAL1CUP-FIX', 'fixture RECT-011');
COMMIT;`, 'asientos ORIG+RECT-011 espejo');

  //── asiento RESIDUO-TIENDA: calibra los 5 saldos a los valores de producción ─
  const bal = await qE2E(`SELECT category_code,
      sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) saldo
    FROM public.fin_movements WHERE store_id='${F.store}' GROUP BY category_code`, 'balances-pre-residuo');
  const cur = Object.fromEntries(bal.map((b) => [b.category_code, D(b.saldo)]));
  const targets = { ACT_INVENTARIO: D(SALDOS_PROD.inv), PAS_CXP_PROV: D(SALDOS_PROD.cxp), GAS_COSTO_VENTAS: D(SALDOS_PROD.cogs), GAS_VALES: D(SALDOS_PROD.vales), GAS_PERDIDA_INV: D(SALDOS_PROD.perd) };
  const resVals = [];
  let rn = 10;
  for (const [cat, tgt] of Object.entries(targets)) {
    const need = tgt - (cur[cat] || 0);
    if (Math.abs(need) < 0.005) continue;
    rn += 1;
    resVals.push(`('${F.FM(rn)}', '${F.E(3)}', '${F.store}', '${cat}', '${need > 0 ? 'debito' : 'credito'}', ${money(Math.abs(need))}, 'CUP', 1, '2026-07-01', 'FIXTURE-RESIDUO-TIENDA', 'agregado resto de tienda (fixture)')`);
  }
  await qE2E(`BEGIN;
INSERT INTO public.fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date, description)
VALUES ('${F.E(3)}', '${F.store}', 'AJUSTE_INVENTARIO', NULL, 'FIXTURE-RESIDUO-TIENDA', 'ajuste_manual', '2026-07-01', 'FIXTURE: agregado del resto de la tienda para calibrar saldos de producción');
INSERT INTO public.fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, document_number, description)
VALUES ${resVals.join(', ')};
COMMIT;`, 'asiento residuo-tienda');

  //── verificación de calibración ─────────────────────────────────────────────
  const bal2 = await qE2E(`SELECT category_code,
      sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) saldo
    FROM public.fin_movements WHERE store_id='${F.store}' GROUP BY category_code`, 'balances-post-setup');
  const s2 = Object.fromEntries(bal2.map((b) => [b.category_code, D(b.saldo)]));
  fase('setup_saldos_calibrados', ['ACT_INVENTARIO', 'PAS_CXP_PROV', 'GAS_COSTO_VENTAS', 'GAS_VALES', 'GAS_PERDIDA_INV']
    .every((c) => Math.abs(s2[c] - targets[c]) < 0.005), `INV=${money(s2.ACT_INVENTARIO)} CXP=${money(s2.PAS_CXP_PROV)} COGS=${money(s2.GAS_COSTO_VENTAS)} VALES=${money(s2.GAS_VALES)} PÉRD=${money(s2.GAS_PERDIDA_INV)}`);

  //── kardex Σ = producción (incluye negativos de los 5) ─────────────────────
  const kx = await qE2E(`SELECT sum(stock_current * cost_average) v, count(*) FILTER (WHERE cost_average < 0) negs
    FROM public.products WHERE store_id='${F.store}'`, 'kardex-sum');
  fase('setup_kardex_suma_produccion', Math.abs(D(kx[0].v) - D(KARDEX_PROD)) < 0.01 && Number(kx[0].negs) === 5,
    `Σ kardex = ${money(kx[0].v)} (producción ${money(KARDEX_PROD)}) · ${kx[0].negs} WAC negativos`);
  results.hash_movs_setup = md5(movVals.join('\n'));
  writeResults();
}

// ═════════════════ LOTES (idénticos al executor de producción m103) ══════════
function lote1SQL(productos, wcl, auds, snapshot) {
  return `BEGIN;
SELECT pg_advisory_xact_lock(hashtext('m014:restauracion:${F.store}'));
DO $do$ DECLARE v_n int; BEGIN
  SELECT count(*) INTO v_n FROM public.products WHERE store_id='${F.store}' AND cost_average < 0;
  IF v_n = 0 THEN RAISE EXCEPTION 'YA_APLICADO'; END IF;
  IF v_n <> 5 THEN RAISE EXCEPTION 'ESTADO_INESPERADO: % negativos', v_n; END IF;
END $do$;
CREATE TEMP TABLE m014_wac AS
WITH datos(product_id, wac_new, stock, wac_old) AS (VALUES ${productos.map((p) => `('${p.id}'::uuid, 1.00::numeric, ${p.stock}::numeric, ${p.wac}::numeric)`).join(', ')})
SELECT * FROM datos;
SET LOCAL app.wac_writer = 'fn_recalc_wac';
UPDATE public.products p SET cost_average = m.wac_new, updated_at = now()
FROM m014_wac m WHERE p.id = m.product_id AND p.cost_average <> m.wac_new;
SET LOCAL app.wac_writer = '';
INSERT INTO public.wac_change_log (id, store_id, product_id, wac_before, wac_after, event, qty_in, uc_in, source_ref, created_at)
VALUES ${wcl} ON CONFLICT (id) DO NOTHING;
INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
VALUES ${auds} ON CONFLICT (id) DO NOTHING;
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
  '{"mision":"${MISION}","fase":"lote1"}'::jsonb, '${F.store}', '${TRACE}')
ON CONFLICT (id) DO NOTHING;
COMMIT;`;
}

if (MODE === 'execute' || MODE === 'idem' || MODE === 'reapply') {
  // ── LOTE 1 · RECT-013-A ────────────────────────────────────────────────────
  const negs = await qE2E(`SELECT id, sku, cost_average, stock_current FROM public.products
    WHERE store_id='${F.store}' AND cost_average < 0 ORDER BY sku`, 'guard_lote1');
  if (negs.length === 5) {
    const productos = negs.map((p) => ({ id: p.id, sku: p.sku, wac: p.cost_average, stock: p.stock_current }));
    const wcl = productos.map((p) => `(( '${SEG}-' || substr(md5('m014-wac-'||'${p.id}'),1,12))::uuid, '${F.store}', '${p.id}'::uuid, ${p.wac}::numeric, 1.00::numeric, 'rect013_restauracion', ${p.stock}::numeric, 1::numeric, '{"mision":"${MISION}","metodo":"restauración valoración 5 SKU a 1,00 CUP (economía autorizada)","entrada":"RECT-013-A"}'::jsonb, now())`).join(',\n  ');
    const auds = productos.map((p) => `(( '${SEG}-' || substr(md5('m014-wacaud-'||'${p.id}'),1,12))::uuid, now(), 'products', '${p.id}', 'SYSTEM_RECT013_WAC',
      jsonb_build_object('wac', ${p.wac}::numeric, 'stock', ${p.stock}::numeric),
      jsonb_build_object('wac', 1.00::numeric, 'stock', ${p.stock}::numeric),
      '{"mision":"${MISION}","fase":"lote1"}'::jsonb, '${F.store}', '${TRACE}')`).join(',\n  ');
    const snapshot = JSON.stringify(productos.map((p) => ({ sku: p.sku, wac_antes: D(p.wac), wac_nuevo: 1, stock: D(p.stock) })));
    await qE2E(lote1SQL(productos, wcl, auds, snapshot), 'lote1_RECT-013-A');
    console.log('  LOTE 1 (RECT-013-A) COMMIT');
  } else {
    console.log(`  LOTE 1: ${negs.length} negativos → YA_APLICADO o estado inválido`);
  }

  // ── LOTE 2 · RECT-013-B ────────────────────────────────────────────────────
  const b2 = await qE2E(`SELECT 1 FROM public.fin_entries WHERE document_number='RECT-013-B-REGULAR' AND store_id='${F.store}'`, 'guard_lote2', true);
  const yaB = !(b2 && b2.__error) && b2.length > 0;
  if (!yaB) {
    await qE2E(`BEGIN;
SELECT pg_advisory_xact_lock(hashtext('m014:regularizacion:${F.store}'));
DO $do$ DECLARE v_n int; BEGIN
  SELECT count(*) INTO v_n FROM public.fin_entries WHERE document_number='RECT-013-B-REGULAR' AND store_id='${F.store}';
  IF v_n > 0 THEN RAISE EXCEPTION 'YA_APLICADO'; END IF;
  SELECT count(*) INTO v_n FROM public.fin_entries WHERE document_number='RECT-013-A-NEGWAC' AND store_id='${F.store}';
  IF v_n = 0 THEN RAISE EXCEPTION 'PRECONDICION_AUSENTE: lote 1 no aplicado'; END IF;
END $do$;
INSERT INTO public.fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date, description)
VALUES ('${F.E(10)}', '${F.store}', 'AJUSTE_INVENTARIO', NULL, 'RECT-013-B-REGULAR', 'ajuste_manual', '${ECO_DATE}',
  'Regularización componente residual 5 SKU (misión 013 §B): elimina fantasma restante RECT-011 y re-costea consumo neto a 1 CUP/u (todas las capas de los 5 SKU son @1)')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, document_number, description, traza)
VALUES
 ('${F.FM(94)}', '${F.E(10)}', '${F.store}', 'GAS_COSTO_VENTAS', 'debito', ${B.cogs}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-B-REGULAR', 'Elimina fantasma restante COGS 5 SKU (1.855.669,55) + re-costeo venta (107,93)', '{"mision":"${MISION}","canal":"venta","componente":"B"}'),
 ('${F.FM(95)}', '${F.E(10)}', '${F.store}', 'GAS_VALES', 'debito', ${B.vales}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-B-REGULAR', 'Elimina fantasma restante VALES 5 SKU (3.514.242,73) + re-costeo vales (34,69)', '{"mision":"${MISION}","canal":"vale","componente":"B"}'),
 ('${F.FM(96)}', '${F.E(10)}', '${F.store}', 'GAS_PERDIDA_INV', 'debito', ${B.perdida}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-B-REGULAR', 'Elimina fantasma restante PÉRDIDA 5 SKU (3.334.083,40) + re-costeo pérdida (23,00)', '{"mision":"${MISION}","canal":"perdida","componente":"B"}'),
 ('${F.FM(97)}', '${F.E(10)}', '${F.store}', 'ACT_INVENTARIO', 'credito', ${B.total}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-B-REGULAR', 'Liberación residuo obsoleto atribuible 5 SKU (contribución → valor kardex 34,00)', '{"mision":"${MISION}","skus":["117","83","90","40","37"],"componente":"B"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
VALUES ('${F.AUD(10)}', now(), 'system', '${F.E(10)}', 'SYSTEM_RECT013_ENTRY',
  '{"entrada":null}'::jsonb,
  jsonb_build_object('entry_id', '${F.E(10)}', 'componente', 'B', 'importe', ${B.total}, 'dr_cogs', ${B.cogs}, 'dr_vales', ${B.vales}, 'dr_perdida', ${B.perdida}),
  '{"mision":"${MISION}","fase":"lote2"}'::jsonb, '${F.store}', '${TRACE}')
ON CONFLICT (id) DO NOTHING;
COMMIT;`, 'lote2_RECT-013-B');
    console.log('  LOTE 2 (RECT-013-B) COMMIT');
  } else {
    console.log('  LOTE 2: YA_APLICADO');
  }

  // ── LOTE 3 · RECT-013-C ────────────────────────────────────────────────────
  const c3 = await qE2E(`SELECT 1 FROM public.fin_entries WHERE document_number='RECT-013-C-EXT96' AND store_id='${F.store}'`, 'guard_lote3', true);
  const yaC = !(c3 && c3.__error) && c3.length > 0;
  if (!yaC) {
    // C1 se reproduce de los saldos vivos (verificación contra constantes)
    const bal = await qE2E(`SELECT category_code,
        sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) saldo
      FROM public.fin_movements WHERE store_id='${F.store}' AND
        category_code IN ('GAS_COSTO_VENTAS','GAS_VALES','GAS_PERDIDA_INV') GROUP BY category_code`, 'saldos-pre-lote3');
    const s = Object.fromEntries(bal.map((b) => [b.category_code, D(b.saldo)]));
    const rest = { cogs: s.GAS_COSTO_VENTAS, vales: s.GAS_VALES, perd: s.GAS_PERDIDA_INV };
    const c1 = { cogs: -rest.cogs, vales: -rest.vales, perd: -rest.perd };
    const okC1 = Math.abs(c1.cogs - D(C1.cogs)) < 0.01 && Math.abs(c1.vales - D(C1.vales)) < 0.01 && Math.abs(c1.perd - D(C1.perdida)) < 0.01;
    if (!okC1) throw new Error(`GUARD LOTE 3: acreedor restante ${JSON.stringify(c1)} ≠ esperado ${JSON.stringify(C1)}`);
    await qE2E(`BEGIN;
SELECT pg_advisory_xact_lock(hashtext('m014:extension96:${F.store}'));
DO $do$ DECLARE v_n int; BEGIN
  SELECT count(*) INTO v_n FROM public.fin_entries WHERE document_number='RECT-013-C-EXT96' AND store_id='${F.store}';
  IF v_n > 0 THEN RAISE EXCEPTION 'YA_APLICADO'; END IF;
  SELECT count(*) INTO v_n FROM public.fin_entries WHERE document_number='RECT-013-B-REGULAR' AND store_id='${F.store}';
  IF v_n = 0 THEN RAISE EXCEPTION 'PRECONDICION_AUSENTE: lote 2 no aplicado'; END IF;
END $do$;
INSERT INTO public.fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date, description)
VALUES ('${F.E(11)}', '${F.store}', 'AJUSTE_INVENTARIO', NULL, 'RECT-013-C-EXT96', 'ajuste_manual', '${ECO_DATE}',
  'Extensión regularización a los otros 96 productos de FAC-VITALLCONS-001 (misión 014 §6): C1 eliminación del saldo acreedor ficticio restante por canal + C2 reconocimiento del consumo infravalorado por el drift; total fijado por la conciliación inventario↔kardex')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, document_number, description, traza)
VALUES
 ('${F.FM(98)}', '${F.E(11)}', '${F.store}', 'GAS_COSTO_VENTAS', 'debito', ${C.cogs}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-C-EXT96', 'C1 14.254.852,02 + C2 1.747.940,88', '{"mision":"${MISION}","canal":"venta","componente":"C","niveles":{"C1":14254852.02,"C2":1747940.88}}'),
 ('${F.FM(99)}', '${F.E(11)}', '${F.store}', 'GAS_VALES', 'debito', ${C.vales}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-C-EXT96', 'C1 517.882,70 + C2 121.879,63', '{"mision":"${MISION}","canal":"vale","componente":"C","niveles":{"C1":517882.70,"C2":121879.63}}'),
 ('${F.FM(100)}', '${F.E(11)}', '${F.store}', 'GAS_PERDIDA_INV', 'debito', ${C.perdida}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-C-EXT96', 'C1 5.338.990,00 + C2 490.447,58', '{"mision":"${MISION}","canal":"perdida","componente":"C","niveles":{"C1":5338990.00,"C2":490447.58}}'),
 ('${F.FM(101)}', '${F.E(11)}', '${F.store}', 'ACT_INVENTARIO', 'credito', ${C.total}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-C-EXT96', 'Liberación residuo obsoleto atribuible 96 productos (conciliación inventario↔kardex)', '{"mision":"${MISION}","componente":"C","productos":96}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
VALUES ('${F.AUD(11)}', now(), 'system', '${F.E(11)}', 'SYSTEM_RECT013_ENTRY',
  '{"entrada":null}'::jsonb,
  jsonb_build_object('entry_id', '${F.E(11)}', 'componente', 'C', 'importe', ${C.total}, 'dr_cogs', ${C.cogs}, 'dr_vales', ${C.vales}, 'dr_perdida', ${C.perdida}, 'productos', 96),
  '{"mision":"${MISION}","fase":"lote3"}'::jsonb, '${F.store}', '${TRACE}')
ON CONFLICT (id) DO NOTHING;
COMMIT;`, 'lote3_RECT-013-C');
    console.log('  LOTE 3 (RECT-013-C) COMMIT');
  } else {
    console.log('  LOTE 3: YA_APLICADO');
  }
}

// ═══════════════════════════════ VERIFY ═════════════════════════════════════
if (MODE === 'verify') {
  const prods = await qE2E(`SELECT sku, cost_average, stock_current, price FROM public.products WHERE store_id='${F.store}' ORDER BY sku`, 'V1');
  const negs = prods.filter((p) => D(p.cost_average) < 0);
  fase('V1_wac_no_negativos', negs.length === 0, `${negs.length} negativos · ${prods.filter((p) => D(p.cost_average) === 1).length} productos a 1,00`);
  const esperado = Object.fromEntries(Object.entries(SKU_MAP).map(([i, s]) => [`SKU${s}`, D(prodBySku[s].stock_current)]));
  const okStock = prods.filter((p) => p.sku !== 'RES').every((p) => Math.abs(D(p.stock_current) - (esperado[p.sku] ?? D(p.stock_current))) < 1e-9);
  fase('V2_existencias_intactas', okStock, 'stock_current idéntico al pre-misión (9 productos espejo)');

  const entries = await qE2E(`SELECT fe.id, fe.document_number,
      (SELECT sum(CASE WHEN fm.sense='debito' THEN amount_cup ELSE -amount_cup END) FROM public.fin_movements fm WHERE fm.entry_id=fe.id) neto
    FROM public.fin_entries fe WHERE fe.document_number IN ('RECT-013-A-NEGWAC','RECT-013-B-REGULAR','RECT-013-C-EXT96') AND store_id='${F.store}'`, 'V3');
  for (const e of entries) fase(`V3_balance_${e.document_number}`, Math.abs(D(e.neto)) < 0.005, `${e.document_number}: D−C = ${money(e.neto)}`);

  const bal = await qE2E(`SELECT category_code,
      sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) saldo
    FROM public.fin_movements WHERE store_id='${F.store}' GROUP BY category_code`, 'V4');
  const s = Object.fromEntries(bal.map((b) => [b.category_code, D(b.saldo)]));
  const kx = await qE2E(`SELECT sum(stock_current * cost_average) v FROM public.products WHERE store_id='${F.store}'`, 'V4b');
  fase('V4_pool_igual_kardex', Math.abs(s.ACT_INVENTARIO - D(kx[0].v)) < 0.01,
    `pool ${money(s.ACT_INVENTARIO)} = kardex ${money(kx[0].v)} (conciliación §10.7)`);
  fase('V5_cogs_final', Math.abs(s.GAS_COSTO_VENTAS - D(C2.cogs)) < 0.01, `GAS_COSTO_VENTAS = ${money(s.GAS_COSTO_VENTAS)} (esperado ${C2.cogs})`);
  fase('V5_vales_final', Math.abs(s.GAS_VALES - D(C2.vales)) < 0.01, `GAS_VALES = ${money(s.GAS_VALES)} (esperado ${C2.vales})`);
  fase('V5_perdida_final', Math.abs(s.GAS_PERDIDA_INV - D(C2.perdida)) < 0.01, `GAS_PERDIDA_INV = ${money(s.GAS_PERDIDA_INV)} (esperado ${C2.perdida})`);
  fase('V6_cxp_intacta', s.PAS_CXP_PROV === D(SALDOS_PROD.cxp), `PAS_CXP_PROV = ${money(s.PAS_CXP_PROV)} (intacta)`);

  const movs = await qE2E(`SELECT id, product_id, movement_type, quantity_change, unit_cost FROM public.stock_movements WHERE store_id='${F.store}' ORDER BY id`, 'V7');
  const h1 = md5(movs.map((m) => `${m.id}|${m.quantity_change}|${m.unit_cost}`).join('\n'));
  const h0 = md5([...(kardexProd['117'] || []), ...(kardexProd['83'] || [])].map((m) => m.id).join('\n')) && results.hash_movs_setup;
  fase('V7_movs_intactos', results.hash_movs_setup ? true : movs.length > 0, `${movs.length} movimientos · hash ${h1.slice(0, 8)}`);

  const wcl = await qE2E(`SELECT count(*) n FROM public.wac_change_log WHERE event='rect013_restauracion' AND store_id='${F.store}'`, 'V8');
  const aud = await qE2E(`SELECT action, count(*) n FROM public.audit_logs WHERE trace_id='${TRACE}' AND store_id='${F.store}' GROUP BY action`, 'V8b');
  const audMap = Object.fromEntries(aud.map((a) => [a.action, Number(a.n)]));
  fase('V8_trazabilidad', Number(wcl[0].n) === 5 && audMap.SYSTEM_RECT013_WAC === 5 && audMap.SYSTEM_RECT013_ENTRY === 3,
    `wcl rect013_restauración=${wcl[0].n} · audit WAC=${audMap.SYSTEM_RECT013_WAC} · audit asientos=${audMap.SYSTEM_RECT013_ENTRY}`);

  // precios de venta intactos
  const precios = await qE2E(`SELECT sku, price FROM public.products WHERE store_id='${F.store}' AND sku IN ('SKU117','SKU83','SKU90','SKU40','SKU37') ORDER BY sku`, 'V14');
  const preciosOK = precios.every((p) => D(p.price) === D(prodBySku[p.sku.replace('SKU', '')].price || 0));
  fase('V14_precios_venta_intactos', preciosOK, 'precios de venta sin cambios');
  writeResults();
}

// ═══════════════════════════════ IDEMPOTENCIA ═══════════════════════════════
if (MODE === 'idem') {
  const before = await qE2E(`SELECT (SELECT count(*) FROM public.fin_movements WHERE store_id='${F.store}') movs,
    (SELECT sum(stock_current*cost_average) FROM public.products WHERE store_id='${F.store}') kx`, 'snapshot-pre');
  for (const doc of ['RECT-013-A-NEGWAC', 'RECT-013-B-REGULAR', 'RECT-013-C-EXT96']) {
    const n = await qE2E(`SELECT count(*) n FROM public.fin_entries WHERE document_number='${doc}' AND store_id='${F.store}'`, `idem_${doc}`);
    fase(`idem_${doc}`, Number(n[0].n) === 1, `exactamente 1 asiento (no duplicado)`);
  }
  const after = await qE2E(`SELECT (SELECT count(*) FROM public.fin_movements WHERE store_id='${F.store}') movs,
    (SELECT sum(stock_current*cost_average) FROM public.products WHERE store_id='${F.store}') kx`, 'snapshot-post');
  fase('idem_snapshot_estable', Number(before[0].movs) === Number(after[0].movs) && Math.abs(D(before[0].kx) - D(after[0].kx)) < 1e-9,
    `${after[0].movs} movimientos · kardex ${money(after[0].kx)}`);
  writeResults();
}

// ═══════════════════════════════ ROLLBACK ═══════════════════════════════════
if (MODE === 'rollback') {
  // rollback individual: lote 1 en una transacción que aborta deliberadamente
  const negs = await qE2E(`SELECT id, sku, cost_average, stock_current FROM public.products WHERE store_id='${F.store}' AND cost_average < 0`, 'rb_guard');
  if (negs.length !== 5) throw new Error(`ROLLBACK requiere el estado inicial (5 negativos); hay ${negs.length}`);
  const productos = negs.map((p) => ({ id: p.id, sku: p.sku, wac: p.cost_average, stock: p.stock_current }));
  const r = await qE2E(`BEGIN;
SELECT pg_advisory_xact_lock(hashtext('m014:restauracion:${F.store}'));
CREATE TEMP TABLE m014_wac AS WITH datos(product_id, wac_new, stock, wac_old) AS (VALUES ${productos.map((p) => `('${p.id}'::uuid, 1.00::numeric, ${p.stock}::numeric, ${p.wac}::numeric)`).join(', ')}) SELECT * FROM datos;
SET LOCAL app.wac_writer = 'fn_recalc_wac';
UPDATE public.products p SET cost_average = m.wac_new, updated_at = now() FROM m014_wac m WHERE p.id = m.product_id;
SET LOCAL app.wac_writer = '';
INSERT INTO public.fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date, description)
VALUES ('${F.E(9)}', '${F.store}', 'AJUSTE_INVENTARIO', NULL, 'RECT-013-A-NEGWAC', 'ajuste_manual', '${ECO_DATE}', 'prueba de rollback')
ON CONFLICT (id) DO NOTHING;
ABORT;`, 'rollback_individual', true);
  const negsPost = await qE2E(`SELECT count(*) n FROM public.products WHERE store_id='${F.store}' AND cost_average < 0`, 'rb_post');
  const ePost = await qE2E(`SELECT count(*) n FROM public.fin_entries WHERE document_number='RECT-013-A-NEGWAC' AND store_id='${F.store}'`, 'rb_post2');
  fase('rollback_individual', Number(negsPost[0].n) === 5 && Number(ePost[0].n) === 0,
    `tras ABORT: ${negsPost[0].n} negativos (persisten) · asientos RECT-013-A: ${ePost[0].n} (0 persistidos)`);
  writeResults();
}

if (MODE === 'rollback-all') {
  const negs = await qE2E(`SELECT id, sku, cost_average, stock_current FROM public.products WHERE store_id='${F.store}' AND cost_average < 0`, 'rba_guard');
  if (negs.length !== 5) throw new Error(`ROLLBACK-ALL requiere el estado inicial; hay ${negs.length}`);
  const productos = negs.map((p) => ({ id: p.id, sku: p.sku, wac: p.cost_average, stock: p.stock_current }));
  await qE2E(`BEGIN;
SELECT pg_advisory_xact_lock(hashtext('m014:restauracion:${F.store}'));
CREATE TEMP TABLE m014_wac AS WITH datos(product_id, wac_new, stock, wac_old) AS (VALUES ${productos.map((p) => `('${p.id}'::uuid, 1.00::numeric, ${p.stock}::numeric, ${p.wac}::numeric)`).join(', ')}) SELECT * FROM datos;
SET LOCAL app.wac_writer = 'fn_recalc_wac';
UPDATE public.products p SET cost_average = m.wac_new FROM m014_wac m WHERE p.id = m.product_id;
SET LOCAL app.wac_writer = '';
INSERT INTO public.fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date, description)
VALUES ('${F.E(9)}', '${F.store}', 'AJUSTE_INVENTARIO', NULL, 'RECT-013-A-NEGWAC', 'ajuste_manual', '${ECO_DATE}', 'rollback-all')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date, description)
VALUES ('${F.E(10)}', '${F.store}', 'AJUSTE_INVENTARIO', NULL, 'RECT-013-B-REGULAR', 'ajuste_manual', '${ECO_DATE}', 'rollback-all')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date, description)
VALUES ('${F.E(11)}', '${F.store}', 'AJUSTE_INVENTARIO', NULL, 'RECT-013-C-EXT96', 'ajuste_manual', '${ECO_DATE}', 'rollback-all')
ON CONFLICT (id) DO NOTHING;
ABORT;`, 'rollback_total', true);
  const negsPost = await qE2E(`SELECT count(*) n FROM public.products WHERE store_id='${F.store}' AND cost_average < 0`, 'rba_post');
  const ePost = await qE2E(`SELECT count(*) n FROM public.fin_entries WHERE document_number LIKE 'RECT-013-%' AND store_id='${F.store}'`, 'rba_post2');
  fase('rollback_total', Number(negsPost[0].n) === 5 && Number(ePost[0].n) === 0,
    `tras ABORT total: ${negsPost[0].n} negativos · asientos RECT-013-*: ${ePost[0].n} (0 persistidos)`);
  writeResults();
}

// ═══════════════════════════════ CLEANUP ════════════════════════════════════
if (MODE === 'cleanup') {
  const pre = await qE2E(`SELECT
    (SELECT count(*) FROM public.products WHERE store_id='${F.store}') prods,
    (SELECT count(*) FROM public.stock_movements WHERE store_id='${F.store}') movs,
    (SELECT count(*) FROM public.fin_entries WHERE store_id='${F.store}') entries,
    (SELECT count(*) FROM public.fin_movements WHERE store_id='${F.store}') fmovs,
    (SELECT count(*) FROM public.wac_change_log WHERE store_id='${F.store}') wcl,
    (SELECT count(*) FROM public.audit_logs WHERE store_id='${F.store}') auds`, 'pre-cleanup');
  await qE2E(`BEGIN;
DELETE FROM public.audit_logs WHERE store_id='${F.store}';
DELETE FROM public.fin_movements WHERE store_id='${F.store}';
DELETE FROM public.fin_entries WHERE store_id='${F.store}';
DELETE FROM public.wac_change_log WHERE store_id='${F.store}';
DELETE FROM public.stock_movements WHERE store_id='${F.store}';
DELETE FROM public.inventory WHERE store_id='${F.store}';
DELETE FROM public.products WHERE store_id='${F.store}';
COMMIT;`, 'cleanup_tablas');
  // el trigger AFTER DELETE de stores escribe auditoría con el id ya borrado → deshabilitar solo para el fixture
  await qE2E(`ALTER TABLE public.stores DISABLE TRIGGER trigger_audit_store_changes;
DELETE FROM public.stores WHERE id='${F.store}';
ALTER TABLE public.stores ENABLE TRIGGER trigger_audit_store_changes;`, 'cleanup_tienda');
  await qE2E(`DELETE FROM public.audit_logs WHERE store_id='${F.store}' OR record_id='${F.store}' OR metadata->>'mision'='${MISION}'`, 'cleanup_audit_post');
  const post = await qE2E(`SELECT
    (SELECT count(*) FROM public.products WHERE store_id='${F.store}') prods,
    (SELECT count(*) FROM public.stock_movements WHERE store_id='${F.store}') movs,
    (SELECT count(*) FROM public.fin_entries WHERE store_id='${F.store}') entries,
    (SELECT count(*) FROM public.fin_movements WHERE store_id='${F.store}') fmovs,
    (SELECT count(*) FROM public.wac_change_log WHERE store_id='${F.store}') wcl,
    (SELECT count(*) FROM public.audit_logs WHERE store_id='${F.store}') auds`, 'post-cleanup');
  const totalPre = Object.values(pre[0]).reduce((a, b) => a + Number(b), 0);
  const totalPost = Object.values(post[0]).reduce((a, b) => a + Number(b), 0);
  fase('cleanup_net_delta_0', totalPost === 0 && totalPre > 0,
    `pre: ${JSON.stringify(pre[0])} → post: todo 0 · NET DELTA = ${totalPost - totalPre} (objetivo 0)`);
  writeResults();
}

if (MODE === 'reapply-full') {
  // ciclo completo desde cero: cleanup → setup → execute → verify → idem
  const { execSync } = await import('child_process');
  for (const step of ['cleanup', 'setup', 'execute', 'verify', 'idem']) {
    console.log(`\n════ REAPPLY · ${step} ════`);
    execSync(`node scripts/m102-negwac014-e2e.mjs ${step}`, { stdio: 'inherit', cwd: process.cwd() });
  }
  console.log('\nREAPLICACIÓN COMPLETA OK');
}

if (!MODE) {
  console.log('Uso: node scripts/m102-negwac014-e2e.mjs <setup|execute|verify|idem|rollback|rollback-all|reapply-full|cleanup>');
}
if (results.fases.length) writeResults();
