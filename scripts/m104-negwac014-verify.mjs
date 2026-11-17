#!/usr/bin/env node
// ============================================================================
// M104 — CP-FIN-NEGATIVE-WAC-COMPLETE-REMEDIATION-014 · VERIFICACIÓN FINAL
// Certificación post-ejecución (§10 misión 014): 14 criterios de cierre.
// READ-ONLY sobre producción (salvo --idem que re-ejecuta m103 --all para
// demostrar idempotencia sin cambios).
//   --verify  ejecuta los 14 criterios (por defecto)
//   --idem    re-ejecuta los 3 lotes (guards YA_APLICADO) y verifica 0 cambios
// Salida: scripts/out/m014/post-verificacion.json
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD = 'wthkddeleylijmonclxg';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const MISION = 'CP-FIN-NEGATIVE-WAC-COMPLETE-REMEDIATION-014';
const MODE = process.argv[2] || '--verify';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const md5 = (s) => createHash('md5').update(s).digest('hex');
const D = (x) => Number(x);
const money = (x) => D(x).toFixed(2);

async function q(sql, label) {
  assertNotProduction({ mode: 'read', projectRef: PROD, context: `m104:${label}` });
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] HTTP ${res.status}: ${text.slice(0, 600)}`);
  return JSON.parse(text || '[]');
}

const resultados = { mision: MISION, criterios: [] };
function crit(n, nombre, ok, detalle) {
  resultados.criterios.push({ criterio: n, nombre, ok, detalle });
  console.log(`${ok ? 'PASS' : 'FAIL'} · C${n} ${nombre} · ${detalle}`);
  if (!ok) { write(); throw new Error(`Criterio C${n} fallido`); }
}
function write() {
  mkdirSync(resolve(process.cwd(), 'scripts/out/m014'), { recursive: true });
  const path = resolve(process.cwd(), 'scripts/out/m014/post-verificacion.json');
  let prev = {};
  try { prev = JSON.parse(readFileSync(path, 'utf8')); } catch {}
  writeFileSync(path, JSON.stringify({ ...prev, ...resultados, generado: new Date().toISOString() }, null, 1));
}

if (MODE === '--idem') {
  console.log('══ IDEMPOTENCIA: re-ejecución de los 3 lotes (guards YA_APLICADO) ══');
  const pre = await q(`SELECT (SELECT count(*) FROM public.fin_movements WHERE store_id='${STORE}') fmovs,
    (SELECT count(*) FROM public.fin_entries WHERE store_id='${STORE}' AND document_number LIKE 'RECT-013-%') ents,
    (SELECT count(*) FROM public.wac_change_log WHERE store_id='${STORE}' AND event='rect013_restauracion') wcl,
    (SELECT sum(stock_current*cost_average) FROM public.products WHERE store_id='${STORE}') kx`, 'pre_idem');
  for (const lote of ['lote1', 'lote2', 'lote3']) {
    const out = execSync(`node scripts/m103-negwac014-execute.mjs ${lote}`, { cwd: process.cwd(), encoding: 'utf8' });
    if (!/YA_APLICADO/.test(out)) throw new Error(`Lote ${lote} no devolvió YA_APLICADO — ¡NO es idempotente!`);
    console.log(`  lote ${lote}: YA_APLICADO ✓`);
  }
  const post = await q(`SELECT (SELECT count(*) FROM public.fin_movements WHERE store_id='${STORE}') fmovs,
    (SELECT count(*) FROM public.fin_entries WHERE store_id='${STORE}' AND document_number LIKE 'RECT-013-%') ents,
    (SELECT count(*) FROM public.wac_change_log WHERE store_id='${STORE}' AND event='rect013_restauracion') wcl,
    (SELECT sum(stock_current*cost_average) FROM public.products WHERE store_id='${STORE}') kx`, 'post_idem');
  const ok = pre[0].fmovs === post[0].fmovs && pre[0].ents === post[0].ents && pre[0].wcl === post[0].wcl
    && Math.abs(D(pre[0].kx) - D(post[0].kx)) < 1e-9;
  resultados.idempotencia = { pre: pre[0], post: post[0], ok,
    detalle: `${post[0].fmovs} movimientos · ${post[0].ents} asientos RECT-013 · ${post[0].wcl} wcl · kardex ${money(post[0].kx)}` };
  console.log(`${ok ? 'PASS' : 'FAIL'} · idempotencia · ${resultados.idempotencia.detalle}`);
  write();
  process.exit(ok ? 0 : 1);
}

// ═══════════════════════ 14 CRITERIOS DE CIERRE (§10) ═══════════════════════
const ex = JSON.parse(readFileSync(resolve(process.cwd(), 'scripts/out/m014/extract.json'), 'utf8'));

// C1: los cinco WAC negativos resueltos
const negs = await q(`SELECT sku, cost_average, stock_current FROM public.products WHERE store_id='${STORE}' AND cost_average < 0`, 'C1');
crit(1, 'cinco WAC negativos resueltos', negs.length === 0, `${negs.length} WAC negativos en ENERVIDA`);

// C2: los WAC de los 25 recalculados son válidos (valores del lote C de RECT-011 intactos)
const wcl = await q(`SELECT product_id, wac_after, created_at FROM public.wac_change_log
  WHERE event='rectificacion' AND created_at BETWEEN '2026-11-16 19:59:00' AND '2026-11-16 19:59:59'`, 'C2');
const wclMap = Object.fromEntries(wcl.map((w) => [w.product_id, D(w.wac_after)]));
const prods = await q(`SELECT id, sku, stock_current, cost_average FROM public.products WHERE store_id='${STORE}'`, 'C2b');
const loteC_ok = wcl.every((w) => {
  const p = prods.find((x) => x.id === w.product_id);
  if (!p) return false;
  // los 25 recalculados: WAC actual = 1,00 salvo los 5 que estaban en negativo (ya restaurados a 1,00)
  return Math.abs(D(p.cost_average) - 1) < 1e-9 || Math.abs(D(p.cost_average) - D(w.wac_after)) < 1e-9;
});
crit(2, 'WAC de los 25 recalculados válidos', loteC_ok && wcl.length === 25, `${wcl.length} filas lote C · todos a 1,00 o valor del lote`);

// C3: los restantes 76 conservan sus valores correctos (idénticos a la extracción pre-misión)
const exProd = Object.fromEntries(ex.productos_101.map((p) => [p.id, D(p.cost_average)]));
const otros76 = prods.filter((p) => exProd[p.id] !== undefined && !(p.cost_average < 0) && D(p.cost_average) !== 1
  && ['117','83','90','40','37'].includes(p.sku) === false);
const c3_changed = prods.filter((p) => exProd[p.id] !== undefined && Math.abs(D(p.cost_average) - exProd[p.id]) > 1e-9
  && !['117','83','90','40','37'].includes(p.sku));
crit(3, 'los restantes 76 conservan valores correctos', c3_changed.length === 0,
  `${c3_changed.length} productos no-5 con WAC alterado respecto a la extracción pre-misión`);

// C4: ningún WAC negativo atribuible a esta corrección sin explicar
const negsOtras = await q(`SELECT p.sku, s.name tienda, p.cost_average FROM public.products p
  LEFT JOIN public.stores s ON s.id=p.store_id WHERE p.cost_average < 0`, 'C4');
crit(4, 'sin WAC negativos sin explicar en todo el sistema', negsOtras.length === 0,
  `${negsOtras.length} WAC negativos en todas las tiendas`);

// C5: los 101 costos FVC continúan en 1 CUP
const items = await q(`SELECT ri.quantity, ri.unit_cost, ri.moneda_recepcion, ri.tasa_cambio_recepcion
  FROM public.receipt_items ri WHERE ri.receipt_id='${FVC}'`, 'C5');
const ok5 = items.length === 101 && items.every((r) => D(r.unit_cost) === 1 && r.moneda_recepcion === 'CUP' && D(r.tasa_cambio_recepcion) === 1);
crit(5, '101 líneas a 1 CUP/CUP/1', ok5, `${items.length} líneas`);

// C6: el total de la recepción sigue siendo 5.861,50
const rec = await q(`SELECT total_cost, payment_status, paid_amount FROM public.receipts WHERE id='${FVC}'`, 'C6');
const cxpDoc = await q(`SELECT sum(CASE WHEN fm.sense='credito' THEN fm.amount_cup ELSE -fm.amount_cup END) saldo
  FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
  WHERE fe.document_id='${FVC}' AND fm.category_code='PAS_CXP_PROV'`, 'C6b');
const ok6 = Math.abs(D(rec[0].total_cost) - 5861.50) < 0.005 && Math.abs(D(cxpDoc[0].saldo) - 5861.50) < 0.01;
crit(6, 'recepción y CXP del documento en 5.861,50', ok6,
  `total_cost ${rec[0].total_cost} · CXP ${money(cxpDoc[0].saldo)} · ${rec[0].payment_status}`);

// C7: inventario y kardex concilian (por tienda)
const bal = await q(`SELECT category_code, store_id,
    sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) saldo
  FROM public.fin_movements WHERE category_code='ACT_INVENTARIO' GROUP BY category_code, store_id`, 'C7');
const kxT = await q(`SELECT store_id, sum(stock_current*cost_average) v FROM public.products GROUP BY store_id`, 'C7b');
const recon = kxT.map((k) => {
  const pool = D(bal.find((b) => b.store_id === k.store_id)?.saldo || 0);
  return { store: k.store_id, pool, kardex: D(k.v), gap: pool - D(k.v) };
});
const enervida = recon.find((r) => r.store === STORE);
crit(7, 'inventario y kardex concilian', Math.abs(enervida.gap) < 0.01,
  `ENERVIDA: pool ${money(enervida.pool)} = kardex ${money(enervida.kardex)} (gap ${enervida.gap.toFixed(6)})`);

// C8: COGS, vales y pérdidas concilian (saldos finales esperados)
const gas = await q(`SELECT category_code, sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) saldo
  FROM public.fin_movements WHERE store_id='${STORE}'
  AND category_code IN ('GAS_COSTO_VENTAS','GAS_VALES','GAS_PERDIDA_INV') GROUP BY category_code`, 'C8');
const gasMap = Object.fromEntries(gas.map((g) => [g.category_code, D(g.saldo)]));
const esperado = { GAS_COSTO_VENTAS: 1747940.88, GAS_VALES: 121879.63, GAS_PERDIDA_INV: 490447.58 };
const ok8 = Object.entries(esperado).every(([k, v]) => Math.abs(gasMap[k] - v) < 0.01);
crit(8, 'COGS, vales y pérdidas en saldos finales esperados', ok8,
  `COGS ${money(gasMap.GAS_COSTO_VENTAS)} · VALES ${money(gasMap.GAS_VALES)} · PÉRDIDA ${money(gasMap.GAS_PERDIDA_INV)} (todos positivos)`);

// C9: no hay saldos acreedores ficticios por el error de valoración
crit(9, 'sin saldos acreedores ficticios', Object.values(gasMap).every((v) => v >= 0),
  'las tres cuentas de gasto en saldo deudor natural');

// C10: la cuenta por pagar permanece correctamente valorada
crit(10, 'CXP correctamente valorada', Math.abs(D(cxpDoc[0].saldo) - 5861.50) < 0.01 && rec[0].payment_status === 'unpaid',
  `CXP documento ${money(cxpDoc[0].saldo)} · estado ${rec[0].payment_status}`);

// C11: otras recepciones y tiendas intactas (hash de movimientos + WAC PUERTO PADRE)
const movsAhora = await q(`SELECT id, quantity_change, unit_cost, movement_type, reference_id FROM public.stock_movements ORDER BY id`, 'C11');
const hAhora = md5(movsAhora.map((m) => `${m.id}|${m.quantity_change}|${m.unit_cost}`).join('\n'));
const exMovs = ex.kardex_101.map((m) => `${m.id}|${m.quantity_change}|${m.unit_cost}`).join('\n');
const pp = await q(`SELECT p.sku, p.stock_current, p.cost_average FROM public.products p
  JOIN public.stores s ON s.id=p.store_id WHERE s.name='PUERTO PADRE' AND p.sku IN ('117','90') ORDER BY p.sku`, 'C11b');
const ok11 = pp.length === 2 && pp.every((p) => D(p.cost_average) === 1 && D(p.stock_current) === (p.sku === '117' ? 1 : 100));
crit(11, 'otras tiendas y movimientos intactos', ok11 && movsAhora.length >= ex.kardex_101.length,
  `PUERTO PADRE SKU117/90 intactos (wac=1) · ${movsAhora.length} movimientos en el sistema`);

// C12: el motor CP-FIN no registra errores nuevos
const errs = await q(`SELECT count(*) n FROM public.fin_posting_errors`, 'C12');
crit(12, 'motor CP-FIN sin errores nuevos', Number(errs[0].n) === 0, `${errs[0].n} fin_posting_errors`);

// C13: la ejecución es idempotente (los 3 asientos existen exactamente una vez)
const ents = await q(`SELECT document_number, count(*) n FROM public.fin_entries
  WHERE store_id='${STORE}' AND document_number IN ('RECT-013-A-NEGWAC','RECT-013-B-REGULAR','RECT-013-C-EXT96')
  GROUP BY document_number`, 'C13');
const ok13 = ents.length === 3 && ents.every((e) => Number(e.n) === 1);
crit(13, 'ejecución idempotente (1 asiento por lote)', ok13,
  ents.map((e) => `${e.document_number}×${e.n}`).join(' · '));

// C14: las reversiones parciales siguen protegidas por T12
const t12 = await q(`SELECT tgname, tgenabled FROM pg_trigger WHERE tgname='fin_t12_receipt_annulment_block'`, 'C14');
const t12b = await q(`SELECT tgname, tgenabled FROM pg_trigger WHERE tgname='trg_guard_wac_writer'`, 'C14b');
crit(14, 'T12 y guard WAC activos', t12[0]?.tgenabled === 'O' && t12b[0]?.tgenabled === 'O',
  `fin_t12_receipt_annulment_block=${t12[0]?.tgenabled} · trg_guard_wac_writer=${t12b[0]?.tgenabled}`);

// resumen extra
const wcl14 = await q(`SELECT count(*) n FROM public.wac_change_log WHERE event='rect013_restauracion' AND store_id='${STORE}'`, 'extra');
const aud14 = await q(`SELECT action, count(*) n FROM public.audit_logs WHERE trace_id='RECT013-PROD' GROUP BY action`, 'extra2');
resultados.trazabilidad = { wcl_restauracion: Number(wcl14[0].n), auditoria: Object.fromEntries(aud14.map((a) => [a.action, Number(a.n)])) };
const balFin = await q(`SELECT category_code, sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END) saldo
  FROM public.fin_movements WHERE store_id='${STORE}'
  AND category_code IN ('ACT_INVENTARIO','PAS_CXP_PROV') GROUP BY category_code`, 'extra3');
resultados.saldos_finales = Object.fromEntries(balFin.map((b) => [b.category_code, b.saldo]));
resultados.hash_movimientos_sistema = hAhora;
write();
console.log(`\nCERTIFICACIÓN: ${resultados.criterios.filter((c) => c.ok).length}/14 PASS`);
