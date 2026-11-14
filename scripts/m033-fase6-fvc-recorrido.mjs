#!/usr/bin/env node
/**
 * M033 — CP-INVENTORY-TRACEABILITY-RECONCILIATION-001 FASE VI:
 * INVESTIGACIÓN ESPECÍFICA DE LOS 192.039.436 CUP — recorrido completo de
 * FAC-VITALLCONS-001 desde su reconocimiento. READ-ONLY.
 *
 * Para los 101 productos de la FVC (tasa 680 aprobada — NO modificar):
 *   entrada FVC · entradas posteriores · COGS atribuido · vales · ajustes ·
 *   devoluciones · reversiones · existencias actuales (qty y valor) ·
 *   saldo remanente atribuible en ACT_INVENTARIO.
 * Uso: node scripts/m033-fase6-fvc-recorrido.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD'); process.exit(2); }
async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`(HTTP ${res.status}) ${text.slice(0, 300)}`);
  return JSON.parse(text || '[]');
}
const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const ENER = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

// ── 1. Productos FVC: entrada por producto (desde m032 engine) ────────────────
const engine = JSON.parse(readFileSync(resolve('docs/audits/inventory-traceability-20261115/m032-fase5-6-por-producto.json'), 'utf8'));
const porProd = new Map(engine.productos.filter(p => p.tienda === 'ENERVIDA-VITALLCONS').map(p => [p.product_id, p]));

// ── 2. COGS atribuido a productos FVC (por items y por unicidad) ──────────────
// items con cost_at_sale>0 (todas las tx con asiento)
const items = await q(`SELECT ti.transaction_id::text AS tx, ti.product_id::text,
    ti.quantity::float8, ti.cost_at_sale::float8
  FROM public.transaction_items ti`);
const cogsTx = await q(`SELECT fe.document_id::text AS tx, sum(fm.amount_cup)::float8 AS cogs
  FROM public.fin_entries fe JOIN public.fin_movements fm ON fm.entry_id=fe.id
  WHERE fe.document_type='VENTA' AND fm.category_code='GAS_COSTO_VENTAS' AND fm.sense='debito'
  GROUP BY 1`);
const mapCogs = new Map(cogsTx.map(c => [c.tx, c.cogs]));
const saleMovs = await q(`SELECT reference_id::text AS tx, product_id::text FROM public.stock_movements
  WHERE movement_type='sale' AND reference_id IS NOT NULL`);
const txProds = new Map();
for (const m of saleMovs) {
  if (!txProds.has(m.tx)) txProds.set(m.tx, new Set());
  txProds.get(m.tx).add(m.product_id);
}
// atribución
const cogsFvc = new Map(); // product_id → cogs atribuido
let cogsFvcItems = 0, cogsFvcUnico = 0, cogsFvcNoAtrib = 0;
for (const [tx, cogs] of mapCogs) {
  const its = items.filter(i => i.tx === tx && i.cost_at_sale > 0);
  if (its.length) {
    for (const it of its) {
      const v = it.quantity * it.cost_at_sale;
      if (porProd.has(it.product_id)) { cogsFvc.set(it.product_id, (cogsFvc.get(it.product_id) || 0) + v); cogsFvcItems += v; }
    }
    // residual de la tx (items sin costo o productos no-FVC) — no se atribuye a FVC salvo unicidad
    const cubiertoFvc = its.filter(i => porProd.has(i.product_id)).reduce((a, i) => a + i.quantity * i.cost_at_sale, 0);
    const totalItems = its.reduce((a, i) => a + i.quantity * i.cost_at_sale, 0);
    const difTx = cogs - totalItems;
    // si toda la tx es de UN producto FVC y hay dif → atribuir a FVC
    const prodsTx = [...(txProds.get(tx) || new Set())];
    if (prodsTx.length === 1 && porProd.has(prodsTx[0]) && (difTx > 0.01 || (totalItems === 0 && cogs > 0))) {
      cogsFvc.set(prodsTx[0], (cogsFvc.get(prodsTx[0]) || 0) + difTx); cogsFvcItems += difTx;
    }
  } else {
    const prodsTx = [...(txProds.get(tx) || new Set())];
    if (prodsTx.length === 1 && porProd.has(prodsTx[0])) {
      cogsFvc.set(prodsTx[0], (cogsFvc.get(prodsTx[0]) || 0) + cogs); cogsFvcUnico += cogs;
    }
    // multi-producto o no-FVC → no atribuye a FVC
  }
}
console.log(`COGS atribuido a los 101 productos FVC: items=${cogsFvcItems.toFixed(2)} unicidad=${cogsFvcUnico.toFixed(2)} → total=${(cogsFvcItems + cogsFvcUnico).toFixed(2)}`);

// ── 3. Recorrido por producto FVC ────────────────────────────────────────────
const fvcLineas = await q(`SELECT ri.product_id::text, sum(ri.quantity)::float8 AS q,
    sum(ri.quantity * ri.unit_cost * coalesce(NULLIF(ri.tasa_cambio_recepcion,0),1))::float8 AS v_cup,
    string_agg(DISTINCT ri.moneda_recepcion, ',') AS monedas, count(*)::int AS n_lineas
  FROM public.receipt_items ri WHERE ri.receipt_id='${FVC}' GROUP BY 1`);
const filas = [];
let t = { entrada: 0, entradas_post: 0, cogs: 0, vales: 0, ajustes: 0, devol: 0, revers: 0,
  valor_stock: 0, q_stock: 0, saldo_remanente: 0 };
for (const l of fvcLineas) {
  const p = porProd.get(l.product_id);
  const cogs = cogsFvc.get(l.product_id) || 0;
  const entrada = l.v_cup;
  // entradas posteriores (compras no-FVC del mismo producto)
  const entradasPost = (p?.v_recibido || 0) - entrada;
  const vales = -(p?.v_vales || 0);
  const ajustes = -(p?.v_ajuste || 0); // negativo ajustes netos valor
  const devol = p?.v_devuelto || 0;
  const revers = p?.v_reversiones || 0;
  const qStock = p?.q_existencia || 0;
  const valorStock = p?.valor_existencia_costo_vigente || 0;
  const saldoRemanente = entrada + entradasPost - cogs - vales - ajustes - devol - revers;
  // nota: esto es el valor que quedaría en el mayor SI todas las salidas se hubieran
  // valorizado a costo; el saldo negativo indica salidas sobre-valorizadas o
  // salidas sin costo registradas en el mayor.
  filas.push({
    product_id: l.product_id, sku: p?.sku, producto: p?.producto, monedas: l.monedas, n_lineas_fvc: l.n_lineas,
    q_entrada_fvc: l.q, valor_entrada_fvc: +entrada.toFixed(2),
    q_entradas_post: +((p?.q_recibido || 0) - l.q).toFixed(4), valor_entradas_post: +entradasPost.toFixed(2),
    q_vendido: -(p?.q_vendido || 0), cogs_atribuido: +cogs.toFixed(2),
    q_vales: -(p?.q_vales || 0), valor_vales: +vales.toFixed(2),
    q_ajustes: +((p?.q_ajuste_pos || 0) + (p?.q_ajuste_neg || 0)).toFixed(4), valor_ajustes: +ajustes.toFixed(2),
    q_devuelto: p?.q_devuelto || 0, valor_devuelto: +devol.toFixed(2),
    q_reversiones: p?.q_reversiones || 0, valor_reversiones: +revers.toFixed(2),
    q_stock_actual: qStock, cost_average_vigente: p?.cost_average_vigente,
    valor_stock_vigente: +valorStock.toFixed(2),
    saldo_remanente_mayor_atribuible: +saldoRemanente.toFixed(2),
  });
  t.entrada += entrada; t.entradas_post += entradasPost; t.cogs += cogs; t.vales += vales;
  t.ajustes += ajustes; t.devol += devol; t.revers += revers; t.valor_stock += valorStock;
  t.q_stock += qStock; t.saldo_remanente += saldoRemanente;
}
filas.sort((a, b) => b.valor_entrada_fvc - a.valor_entrada_fvc);

console.log(`\n════ FASE VI — RECORRIDO DE LOS 192.039.436 CUP ════`);
console.log(`productos FVC: ${filas.length}`);
console.log(`entrada FVC:                    ${t.entrada.toFixed(2)}`);
console.log(`entradas posteriores (no FVC):  ${t.entradas_post.toFixed(2)}`);
console.log(`COGS atribuido (ventas):        ${t.cogs.toFixed(2)}`);
console.log(`vales de salida:                ${t.vales.toFixed(2)}`);
console.log(`ajustes netos:                  ${t.ajustes.toFixed(2)}`);
console.log(`devoluciones:                   ${t.devol.toFixed(2)}`);
console.log(`reversiones/voids:              ${t.revers.toFixed(2)}`);
console.log(`valor existencias vigentes:     ${t.valor_stock.toFixed(2)} (q=${t.q_stock.toFixed(2)})`);
console.log(`saldo remanente atribuible:     ${t.saldo_remanente.toFixed(2)}`);
// top 15 productos por entrada
console.log('\nTop 15 productos FVC por valor de entrada:');
for (const f of filas.slice(0, 15)) console.log(`  sku=${f.sku} "${(f.producto||'').slice(0,35)}": entrada=${f.valor_entrada_fvc.toFixed(2)} cogs=${f.cogs_atribuido.toFixed(2)} vales=${f.valor_vales.toFixed(2)} stock=${f.q_stock_actual}×${f.cost_average_vigente}=${f.valor_stock_vigente.toFixed(2)} remanente=${f.saldo_remanente_mayor_atribuible.toFixed(2)}`);
// productos con stock actual > 0 vs = 0
const conStock = filas.filter(f => f.q_stock_actual > 0);
const sinStock = filas.filter(f => f.q_stock_actual === 0);
console.log(`\nproductos FVC CON existencia actual: ${conStock.length} (valor vigente ${conStock.reduce((a,f)=>a+f.valor_stock_vigente,0).toFixed(2)})`);
console.log(`productos FVC SIN existencia:      ${sinStock.length} (entrada ${sinStock.reduce((a,f)=>a+f.valor_entrada_fvc,0).toFixed(2)})`);
console.log(`  de los SIN existencia: cogs registrado ${(sinStock.reduce((a,f)=>a+f.cogs_atribuido,0)).toFixed(2)} | vales ${(sinStock.reduce((a,f)=>a+f.valor_vales,0)).toFixed(2)} | ajustes ${(sinStock.reduce((a,f)=>a+f.valor_ajustes,0)).toFixed(2)} | devol ${(sinStock.reduce((a,f)=>a+f.valor_devuelto,0)).toFixed(2)} | revers ${(sinStock.reduce((a,f)=>a+f.valor_reversiones,0)).toFixed(2)}`);
console.log(`  saldo remanente de los SIN existencia: ${(sinStock.reduce((a,f)=>a+f.saldo_remanente_mayor_atribuible,0)).toFixed(2)}`);

// verificación cruzada: saldo remanente FVC + salidas no-FVC + otros = saldo ENER
const saldoEner = 189439466.38;
console.log(`\nSaldo contable ENER: ${saldoEner.toFixed(2)}`);
console.log(`  FVC remanente atribuible: ${(t.saldo_remanente + t.cogs + t.vales + t.ajustes + t.devol + t.revers).toFixed(2)} ← entrada total atribuible FVC (${(t.entrada + t.entradas_post).toFixed(2)})`);
console.log(`  entradas no-FVC + saldo no atribuible: ${(saldoEner - (t.entrada + t.entradas_post)).toFixed(2)}`);

writeFileSync(resolve('docs/audits/inventory-traceability-20261115/m033-fase6-fvc-recorrido.json'), JSON.stringify({
  generado: new Date().toISOString(), mision: 'CP-INVENTORY-TRACEABILITY-RECONCILIATION-001',
  fase: 'VI — investigación específica de los 192.039.436 CUP',
  fvc: FVC, tasa_aprobada: 680, total_fvc: 192039436,
  totales: t, productos: filas,
  productos_con_existencia: conStock.length, productos_sin_existencia: sinStock.length,
  metodo_cogs: 'cost_at_sale (items) + unicidad de producto en tx (misión §6: no inventar asignaciones)',
}, null, 2));
console.log('\nevidencia → docs/audits/inventory-traceability-20261115/m033-fase6-fvc-recorrido.json');
