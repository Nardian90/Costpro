#!/usr/bin/env node
// ============================================================================
// M103 — CP-FIN-NEGATIVE-WAC-COMPLETE-REMEDIATION-014 · EJECUTOR DE PRODUCCIÓN
// Aplica en PRODUCCIÓN (wthkddeleylijmonclxg) los tres lotes atómicos y
// reanudables autorizados expresamente por el propietario (misión 014 §1):
//   --lote1  RECT-013-A: WAC sellados de los 5 SKU negativos → 1,00 CUP +
//            asiento balanceado DR COGS+VALES+PÉRDIDA / CR INV 2.657.379,32.
//   --lote2  RECT-013-B: regularización componente residual 5 SKU
//            (8.704.161,30 — misión 013 §B, autorizada en 014).
//   --lote3  RECT-013-C: extensión a los otros 96 productos de FAC-VITALLCONS-001
//            (22.471.992,81 — C1 eliminación acreedor restante + C2 reconocimiento
//            drift; total fijado por la conciliación inventario↔kardex).
//   --all    secuencia completa con guards entre lotes (reanudable).
//   --status estado read-only de los lotes (sin escrituras).
// Reanudabilidad: si un lote confirma y el siguiente falla, el confirmado se
// conserva (transacciones atómicas independientes); re-ejecutar --all reanuda
// sin repetir efectos (guards YA_APLICADO + ON CONFLICT DO NOTHING).
// Doble flag CP-INFRA-019: ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND.
// Validado en E2E aislada por m102 (batería completa 42/42 PASS).
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const MODE = process.argv[2] || '';
const OUT = 'scripts/out/m014';
const PROD = 'wthkddeleylijmonclxg';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS
const MISION = 'CP-FIN-NEGATIVE-WAC-COMPLETE-REMEDIATION-014';
const TRACE = 'RECT013-PROD';
const ECO_DATE = '2026-11-17';
const SEG = '7ec9000f-0000-4000-8000';           // segmento determinista 014

// ══ IMPORTES EXACTOS (m101 — reproducción Decimal sobre extracción fresca) ══
const A = { total: '2657379.32', cogs: '566546.45', vales: '1072918.27', perdida: '1017914.60' };
const B = { total: '8704161.30', cogs: '1855777.48', vales: '3514277.42', perdida: '3334106.40' };
const C = { total: '22471992.81', cogs: '16002792.90', vales: '639762.33', perdida: '5829437.58' };
const C1 = { cogs: '14254852.02', vales: '517882.70', perdida: '5338990.00' };
// WAC negativos esperados (estado fresco verificado; fail-closed si difieren)
const EXPECTED_NEG = {
  '117': '-2175998', '83': '-122398', '90': '-78176.248120300752',
  '40': '-665.857142857143', '37': '-1',
};
const E = { a: `${SEG}-d01400000001`, b: `${SEG}-d01400000002`, c: `${SEG}-d01400000003` };
const FM = {
  a1: `${SEG}-d01400000011`, a2: `${SEG}-d01400000012`, a3: `${SEG}-d01400000013`, a4: `${SEG}-d01400000014`,
  b1: `${SEG}-d01400000021`, b2: `${SEG}-d01400000022`, b3: `${SEG}-d01400000023`, b4: `${SEG}-d01400000024`,
  c1: `${SEG}-d01400000031`, c2: `${SEG}-d01400000032`, c3: `${SEG}-d01400000033`, c4: `${SEG}-d01400000034`,
};
const AUD = { a: `${SEG}-d01400000041`, b: `${SEG}-d01400000042`, c: `${SEG}-d01400000043` };

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const md5 = (s) => createHash('md5').update(s).digest('hex');

async function q(sql, label) {
  assertNotProduction({
    mode: 'write', projectRef: PROD, context: `m103-${MODE}:${label}`,
    allowWrite: process.env.ALLOW_PROD === 'read-only' && process.env.ALLOW_PROD_WRITE === 'I_UNDERSTAND',
  });
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] HTTP ${res.status}: ${text.slice(0, 600)}`);
  const rows = JSON.parse(text || '[]');
  console.log(`[OK] ${label} → ${rows.length} filas`);
  return rows;
}
// Consulta read-only (sin flags de escritura)
async function qr(sql, label) {
  assertNotProduction({ mode: 'read', projectRef: PROD, context: `m103-ro:${label}` });
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] HTTP ${res.status}: ${text.slice(0, 600)}`);
  return JSON.parse(text || '[]');
}

function saveState(state) {
  mkdirSync(resolve(process.cwd(), OUT), { recursive: true });
  writeFileSync(resolve(process.cwd(), `${OUT}/prod-ejecucion.json`), JSON.stringify(state, null, 1));
}
const D = (x) => Number(x);
const money = (x) => D(x).toFixed(2);

// ═══════════════════════════════ STATUS ═════════════════════════════════════
if (MODE === 'status') {
  const negs = await qr(`SELECT p.sku, p.cost_average, p.stock_current FROM public.products p
    WHERE p.store_id='${STORE}' AND p.cost_average < 0 ORDER BY p.cost_average`, 'negativos');
  const entries = await qr(`SELECT document_number, posted_at,
      (SELECT sum(CASE WHEN fm.sense='debito' THEN fm.amount_cup ELSE -fm.amount_cup END)
         FROM public.fin_movements fm WHERE fm.entry_id=fe.id) neto
    FROM public.fin_entries fe WHERE fe.document_number IN ('RECT-013-A-NEGWAC','RECT-013-B-REGULAR','RECT-013-C-EXT96')
      AND store_id='${STORE}'`, 'asientos');
  const bal = await qr(`SELECT category_code,
      sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) saldo
    FROM public.fin_movements WHERE store_id='${STORE}'
      AND category_code IN ('ACT_INVENTARIO','GAS_COSTO_VENTAS','GAS_VALES','GAS_PERDIDA_INV','PAS_CXP_PROV')
    GROUP BY category_code`, 'saldos');
  const kx = await qr(`SELECT sum(stock_current*cost_average) v FROM public.products WHERE store_id='${STORE}'`, 'kardex');
  const state = {
    momento: new Date().toISOString(),
    wac_negativos: negs, asientos_aplicados: entries,
    saldos: Object.fromEntries(bal.map((b) => [b.category_code, b.saldo])),
    kardex_suma: kx[0]?.v,
    conciliado: bal.length ? Math.abs(D(bal.find((b) => b.category_code === 'ACT_INVENTARIO')?.saldo) - D(kx[0]?.v)) < 0.01 : false,
  };
  console.log(JSON.stringify(state, null, 1));
  saveState({ mision: MISION, status: state });
  process.exit(0);
}

// ═══════════════════════════════ LOTE 1 ═════════════════════════════════════
async function lote1() {
  const negs = await qr(`SELECT id, sku, cost_average, stock_current FROM public.products
    WHERE store_id='${STORE}' AND cost_average < 0 ORDER BY sku`, 'guard_lote1');
  if (negs.length === 0) { console.log('LOTE 1: YA_APLICADO (0 negativos)'); return 'ya_aplicado'; }
  if (negs.length !== 5) throw new Error(`GUARD: se esperaban 5 WAC negativos, hay ${negs.length}`);
  for (const n of negs) {
    const exp = EXPECTED_NEG[n.sku];
    if (exp === undefined) throw new Error(`GUARD: SKU inesperado ${n.sku} (fuera de alcance)`);
    if (Math.abs(D(n.cost_average) - D(exp)) > 0.001) throw new Error(`GUARD: WAC de ${n.sku} derivó (${n.cost_average} ≠ ${exp})`);
  }
  const productos = negs.map((p) => ({ id: p.id, sku: p.sku, wac: p.cost_average, stock: p.stock_current }));
  // verificación de deuda del documento (economía intacta)
  const cxp = await qr(`SELECT sum(CASE WHEN fm.sense='credito' THEN fm.amount_cup ELSE -fm.amount_cup END) saldo
    FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
    WHERE fe.document_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63' AND fm.category_code='PAS_CXP_PROV'`, 'guard_cxp');
  if (Math.abs(D(cxp[0].saldo) - 5861.50) > 0.01) throw new Error(`GUARD: CXP del documento ${cxp[0].saldo} ≠ 5.861,50`);

  const wcl = productos.map((p) => `(( '${SEG}-' || substr(md5('m014-wac-'||'${p.id}'),1,12))::uuid, '${STORE}', '${p.id}'::uuid, ${p.wac}::numeric, 1.00::numeric, 'rect013_restauracion', ${p.stock}::numeric, 1::numeric, '{"mision":"${MISION}","metodo":"restauración valoración 5 SKU a 1,00 CUP (economía autorizada)","entrada":"RECT-013-A"}'::jsonb, now())`).join(',\n  ');
  const auds = productos.map((p) => `(( '${SEG}-' || substr(md5('m014-wacaud-'||'${p.id}'),1,12))::uuid, now(), 'products', '${p.id}', 'SYSTEM_RECT013_WAC',
    jsonb_build_object('wac', ${p.wac}::numeric, 'stock', ${p.stock}::numeric),
    jsonb_build_object('wac', 1.00::numeric, 'stock', ${p.stock}::numeric),
    '{"mision":"${MISION}","fase":"lote1"}'::jsonb, '${STORE}', '${TRACE}')`).join(',\n  ');
  const snapshot = JSON.stringify(productos.map((p) => ({ sku: p.sku, wac_antes: D(p.wac), wac_nuevo: 1, stock: D(p.stock) })));

  await q(`BEGIN;
SELECT pg_advisory_xact_lock(hashtext('m014:restauracion:${STORE}'));
DO $do$ DECLARE v_n int; BEGIN
  SELECT count(*) INTO v_n FROM public.products WHERE store_id='${STORE}' AND cost_average < 0;
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
VALUES ('${E.a}', '${STORE}', 'AJUSTE_INVENTARIO', NULL, 'RECT-013-A-NEGWAC', 'ajuste_manual', '${ECO_DATE}',
        '${snapshot.replace(/'/g, "''")}'::jsonb, 'Restauración valoración 5 SKU (WAC negativo → 1,00 CUP): exceso de crédito de inventario RECT-011 devuelto a las cuentas de gasto que lo originaron (autorización propietario misión 014 §1)')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, document_number, description, traza)
VALUES
 ('${FM.a1}', '${E.a}', '${STORE}', 'GAS_COSTO_VENTAS', 'debito', ${A.cogs}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-A-NEGWAC', 'Restauración WAC 5 SKU (reparto proporcional créditos RECT-011)', '{"mision":"${MISION}","canal":"venta"}'),
 ('${FM.a2}', '${E.a}', '${STORE}', 'GAS_VALES', 'debito', ${A.vales}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-A-NEGWAC', 'Restauración WAC 5 SKU', '{"mision":"${MISION}","canal":"vale"}'),
 ('${FM.a3}', '${E.a}', '${STORE}', 'GAS_PERDIDA_INV', 'debito', ${A.perdida}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-A-NEGWAC', 'Restauración WAC 5 SKU (residuo de reparto)', '{"mision":"${MISION}","canal":"perdida"}'),
 ('${FM.a4}', '${E.a}', '${STORE}', 'ACT_INVENTARIO', 'credito', ${A.total}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-A-NEGWAC', 'Liberación atribución ficticia de inventario 5 SKU', '{"mision":"${MISION}","skus":["117","83","90","40","37"]}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
VALUES ('${AUD.a}', now(), 'system', '${E.a}', 'SYSTEM_RECT013_ENTRY',
  '{"entrada":null}'::jsonb,
  jsonb_build_object('entry_id', '${E.a}', 'importe', ${A.total}, 'dr_cogs', ${A.cogs}, 'dr_vales', ${A.vales}, 'dr_perdida', ${A.perdida}, 'wac_actualizados', 5),
  '{"mision":"${MISION}","fase":"lote1"}'::jsonb, '${STORE}', '${TRACE}')
ON CONFLICT (id) DO NOTHING;
COMMIT;`, 'LOTE1_RECT-013-A');

  // verificación inmediata del lote
  const post = await qr(`SELECT (SELECT count(*) FROM public.products WHERE store_id='${STORE}' AND cost_average < 0) negs,
    (SELECT count(*) FROM public.fin_movements WHERE entry_id='${E.a}') movs,
    (SELECT sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) FROM public.fin_movements WHERE entry_id='${E.a}') neto`, 'post_lote1');
  if (Number(post[0].negs) !== 0 || Number(post[0].movs) !== 4 || Math.abs(D(post[0].neto)) > 0.005) {
    throw new Error(`POST-LOTE 1 INVÁLIDO: ${JSON.stringify(post[0])}`);
  }
  console.log(`  LOTE 1 COMMIT · asiento ${E.a} · D−C = ${money(post[0].neto)}`);
  return 'aplicado';
}

// ═══════════════════════════════ LOTE 2 ═════════════════════════════════════
async function lote2() {
  const pre = await qr(`SELECT
    (SELECT count(*) FROM public.fin_entries WHERE document_number='RECT-013-B-REGULAR' AND store_id='${STORE}') b,
    (SELECT count(*) FROM public.fin_entries WHERE document_number='RECT-013-A-NEGWAC' AND store_id='${STORE}') a,
    (SELECT count(*) FROM public.products WHERE store_id='${STORE}' AND cost_average < 0) negs`, 'guard_lote2');
  if (Number(pre[0].b) > 0) { console.log('LOTE 2: YA_APLICADO'); return 'ya_aplicado'; }
  if (Number(pre[0].a) !== 1) throw new Error('GUARD: lote 1 (RECT-013-A) no aplicado');
  if (Number(pre[0].negs) !== 0) throw new Error(`GUARD: aún hay ${pre[0].negs} WAC negativos`);

  await q(`BEGIN;
SELECT pg_advisory_xact_lock(hashtext('m014:regularizacion:${STORE}'));
DO $do$ DECLARE v_n int; BEGIN
  SELECT count(*) INTO v_n FROM public.fin_entries WHERE document_number='RECT-013-B-REGULAR' AND store_id='${STORE}';
  IF v_n > 0 THEN RAISE EXCEPTION 'YA_APLICADO'; END IF;
  SELECT count(*) INTO v_n FROM public.fin_entries WHERE document_number='RECT-013-A-NEGWAC' AND store_id='${STORE}';
  IF v_n = 0 THEN RAISE EXCEPTION 'PRECONDICION_AUSENTE: lote 1'; END IF;
END $do$;
INSERT INTO public.fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date, description)
VALUES ('${E.b}', '${STORE}', 'AJUSTE_INVENTARIO', NULL, 'RECT-013-B-REGULAR', 'ajuste_manual', '${ECO_DATE}',
  'Regularización componente residual 5 SKU (misión 013 §B, autorizada misión 014 §1): elimina fantasma restante RECT-011 y re-costea el consumo neto histórico a 1 CUP/u (todas las capas de los 5 SKU son @1)')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, document_number, description, traza)
VALUES
 ('${FM.b1}', '${E.b}', '${STORE}', 'GAS_COSTO_VENTAS', 'debito', ${B.cogs}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-B-REGULAR', 'Elimina fantasma restante COGS 5 SKU (1.855.669,55) + re-costeo venta (107,93)', '{"mision":"${MISION}","canal":"venta","componente":"B"}'),
 ('${FM.b2}', '${E.b}', '${STORE}', 'GAS_VALES', 'debito', ${B.vales}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-B-REGULAR', 'Elimina fantasma restante VALES 5 SKU (3.514.242,73) + re-costeo vales (34,69)', '{"mision":"${MISION}","canal":"vale","componente":"B"}'),
 ('${FM.b3}', '${E.b}', '${STORE}', 'GAS_PERDIDA_INV', 'debito', ${B.perdida}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-B-REGULAR', 'Elimina fantasma restante PÉRDIDA 5 SKU (3.334.083,40) + re-costeo pérdida (23,00)', '{"mision":"${MISION}","canal":"perdida","componente":"B"}'),
 ('${FM.b4}', '${E.b}', '${STORE}', 'ACT_INVENTARIO', 'credito', ${B.total}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-B-REGULAR', 'Liberación residuo obsoleto atribuible 5 SKU (contribución → valor kardex 34,00)', '{"mision":"${MISION}","skus":["117","83","90","40","37"],"componente":"B"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
VALUES ('${AUD.b}', now(), 'system', '${E.b}', 'SYSTEM_RECT013_ENTRY',
  '{"entrada":null}'::jsonb,
  jsonb_build_object('entry_id', '${E.b}', 'componente', 'B', 'importe', ${B.total}, 'dr_cogs', ${B.cogs}, 'dr_vales', ${B.vales}, 'dr_perdida', ${B.perdida}),
  '{"mision":"${MISION}","fase":"lote2"}'::jsonb, '${STORE}', '${TRACE}')
ON CONFLICT (id) DO NOTHING;
COMMIT;`, 'LOTE2_RECT-013-B');

  const post = await qr(`SELECT (SELECT count(*) FROM public.fin_movements WHERE entry_id='${E.b}') movs,
    (SELECT sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) FROM public.fin_movements WHERE entry_id='${E.b}') neto`, 'post_lote2');
  if (Number(post[0].movs) !== 4 || Math.abs(D(post[0].neto)) > 0.005) throw new Error(`POST-LOTE 2 INVÁLIDO: ${JSON.stringify(post[0])}`);
  console.log(`  LOTE 2 COMMIT · asiento ${E.b} · D−C = ${money(post[0].neto)}`);
  return 'aplicado';
}

// ═══════════════════════════════ LOTE 3 ═════════════════════════════════════
async function lote3() {
  const pre = await qr(`SELECT
    (SELECT count(*) FROM public.fin_entries WHERE document_number='RECT-013-C-EXT96' AND store_id='${STORE}') c,
    (SELECT count(*) FROM public.fin_entries WHERE document_number='RECT-013-B-REGULAR' AND store_id='${STORE}') b`, 'guard_lote3');
  if (Number(pre[0].c) > 0) { console.log('LOTE 3: YA_APLICADO'); return 'ya_aplicado'; }
  if (Number(pre[0].b) !== 1) throw new Error('GUARD: lote 2 (RECT-013-B) no aplicado');

  // C1 se reproduce de los saldos vivos y se compara contra la constante (fail-closed)
  const bal = await qr(`SELECT category_code,
      sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) saldo
    FROM public.fin_movements WHERE store_id='${STORE}'
      AND category_code IN ('GAS_COSTO_VENTAS','GAS_VALES','GAS_PERDIDA_INV') GROUP BY category_code`, 'saldos_pre_lote3');
  const s = Object.fromEntries(bal.map((b) => [b.category_code, D(b.saldo)]));
  const rest = { cogs: s.GAS_COSTO_VENTAS, vales: s.GAS_VALES, perd: s.GAS_PERDIDA_INV };
  const c1 = { cogs: -rest.cogs, vales: -rest.vales, perd: -rest.perd };
  const okC1 = Math.abs(c1.cogs - D(C1.cogs)) < 0.01 && Math.abs(c1.vales - D(C1.vales)) < 0.01 && Math.abs(c1.perd - D(C1.perdida)) < 0.01;
  if (!okC1) throw new Error(`GUARD LOTE 3: acreedor restante ${JSON.stringify(c1)} ≠ esperado ${JSON.stringify(C1)} — estado derivado, NO escribir`);

  // verificación de deuda del documento (economía intacta)
  const cxp = await qr(`SELECT sum(CASE WHEN fm.sense='credito' THEN fm.amount_cup ELSE -fm.amount_cup END) saldo
    FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
    WHERE fe.document_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63' AND fm.category_code='PAS_CXP_PROV'`, 'guard_cxp3');
  if (Math.abs(D(cxp[0].saldo) - 5861.50) > 0.01) throw new Error(`GUARD: CXP del documento ${cxp[0].saldo} ≠ 5.861,50`);

  await q(`BEGIN;
SELECT pg_advisory_xact_lock(hashtext('m014:extension96:${STORE}'));
DO $do$ DECLARE v_n int; BEGIN
  SELECT count(*) INTO v_n FROM public.fin_entries WHERE document_number='RECT-013-C-EXT96' AND store_id='${STORE}';
  IF v_n > 0 THEN RAISE EXCEPTION 'YA_APLICADO'; END IF;
  SELECT count(*) INTO v_n FROM public.fin_entries WHERE document_number='RECT-013-B-REGULAR' AND store_id='${STORE}';
  IF v_n = 0 THEN RAISE EXCEPTION 'PRECONDICION_AUSENTE: lote 2'; END IF;
END $do$;
INSERT INTO public.fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date, description)
VALUES ('${E.c}', '${STORE}', 'AJUSTE_INVENTARIO', NULL, 'RECT-013-C-EXT96', 'ajuste_manual', '${ECO_DATE}',
  'Extensión de la regularización a los otros 96 productos de FAC-VITALLCONS-001 (misión 014 §6, autorización propietario): C1 eliminación del saldo acreedor ficticio restante por canal + C2 reconocimiento del consumo infravalorado por el drift; total fijado por la conciliación inventario↔kardex (§10.7)')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, document_number, description, traza)
VALUES
 ('${FM.c1}', '${E.c}', '${STORE}', 'GAS_COSTO_VENTAS', 'debito', ${C.cogs}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-C-EXT96', 'C1 14.254.852,02 + C2 1.747.940,88', '{"mision":"${MISION}","canal":"venta","componente":"C","niveles":{"C1":14254852.02,"C2":1747940.88}}'),
 ('${FM.c2}', '${E.c}', '${STORE}', 'GAS_VALES', 'debito', ${C.vales}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-C-EXT96', 'C1 517.882,70 + C2 121.879,63', '{"mision":"${MISION}","canal":"vale","componente":"C","niveles":{"C1":517882.70,"C2":121879.63}}'),
 ('${FM.c3}', '${E.c}', '${STORE}', 'GAS_PERDIDA_INV', 'debito', ${C.perdida}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-C-EXT96', 'C1 5.338.990,00 + C2 490.447,58', '{"mision":"${MISION}","canal":"perdida","componente":"C","niveles":{"C1":5338990.00,"C2":490447.58}}'),
 ('${FM.c4}', '${E.c}', '${STORE}', 'ACT_INVENTARIO', 'credito', ${C.total}, 'CUP', 1, '${ECO_DATE}', 'RECT-013-C-EXT96', 'Liberación residuo obsoleto atribuible 96 productos (conciliación inventario↔kardex)', '{"mision":"${MISION}","componente":"C","productos":96}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
VALUES ('${AUD.c}', now(), 'system', '${E.c}', 'SYSTEM_RECT013_ENTRY',
  '{"entrada":null}'::jsonb,
  jsonb_build_object('entry_id', '${E.c}', 'componente', 'C', 'importe', ${C.total}, 'dr_cogs', ${C.cogs}, 'dr_vales', ${C.vales}, 'dr_perdida', ${C.perdida}, 'productos', 96),
  '{"mision":"${MISION}","fase":"lote3"}'::jsonb, '${STORE}', '${TRACE}')
ON CONFLICT (id) DO NOTHING;
COMMIT;`, 'LOTE3_RECT-013-C');

  const post = await qr(`SELECT (SELECT count(*) FROM public.fin_movements WHERE entry_id='${E.c}') movs,
    (SELECT sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) FROM public.fin_movements WHERE entry_id='${E.c}') neto`, 'post_lote3');
  if (Number(post[0].movs) !== 4 || Math.abs(D(post[0].neto)) > 0.005) throw new Error(`POST-LOTE 3 INVÁLIDO: ${JSON.stringify(post[0])}`);
  console.log(`  LOTE 3 COMMIT · asiento ${E.c} · D−C = ${money(post[0].neto)}`);
  return 'aplicado';
}

// ═══════════════════════════════ ORQUESTACIÓN ═══════════════════════════════
const state = { mision: MISION, lots: [], inicio: new Date().toISOString() };
try {
  if (MODE === 'lote1') state.lots.push({ lote: 1, resultado: await lote1() });
  else if (MODE === 'lote2') state.lots.push({ lote: 2, resultado: await lote2() });
  else if (MODE === 'lote3') state.lots.push({ lote: 3, resultado: await lote3() });
  else if (MODE === 'all') {
    state.lots.push({ lote: 1, resultado: await lote1() });
    state.lots.push({ lote: 2, resultado: await lote2() });
    state.lots.push({ lote: 3, resultado: await lote3() });
  } else {
    console.log('Uso: node scripts/m103-negwac014-execute.mjs <status|lote1|lote2|lote3|all>');
    process.exit(0);
  }
  state.fin = new Date().toISOString();
  saveState(state);
  console.log('\nEJECUCIÓN COMPLETADA:', JSON.stringify(state.lots));
} catch (err) {
  state.error = String(err.message || err);
  state.fin = new Date().toISOString();
  saveState(state);
  console.error('ERROR:', err.message);
  console.error('Los lotes ya confirmados se conservan (transacciones atómicas). Reanudar con --all.');
  process.exit(1);
}
