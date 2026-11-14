#!/usr/bin/env node
/**
 * M032 — CP-INVENTORY-TRACEABILITY-RECONCILIATION-001 FASES V/VI (motor):
 * RECONSTRUCCIÓN POR PRODUCTO DEL VALOR DEL INVENTARIO. READ-ONLY.
 *
 * Tres bases de valoración (misión §7):
 *  A. según movimientos y costos históricos (kardex): por producto,
 *     valor de entradas/salidas y valor de la existencia según costo de
 *     adquisición (último costo de compra y WAC de compras).
 *  B. según costos vigentes: stock_current × products.cost_average (fuente y
 *     fecha documentadas — wac_change_log).
 *  C. según conteo físico: sin conteos válidos → hoja de conteo aparte.
 *
 * Atribución por producto del COGS contable (§6, reconstrucción indirecta):
 *  1) transaction_items.cost_at_sale (base del motor, exacta en 368/700);
 *  2) transacción con movimientos de UN solo producto → COGS del asiento
 *     atribuido a ese producto (unicidad demostrada);
 *  3) resto → NO atribuible por producto (residual documentado).
 *
 * Uso: node scripts/m032-fase5-6-motor-producto.mjs
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

// ═══ 1. Productos con movimientos (todas las tiendas, por separado) ══════════
const movs = await q(`SELECT sm.id::text, sm.store_id::text, sm.product_id::text, sm.movement_type,
    sm.quantity_change::float8, sm.unit_cost::float8, sm.reference_id::text, sm.movement_date::text
  FROM public.stock_movements sm ORDER BY sm.store_id, sm.movement_date, sm.id`);
console.log(`movimientos: ${movs.length}`);
const products = await q(`SELECT p.id::text, p.store_id::text, p.sku, p.name AS producto, p.unit_of_measure AS um,
    p.stock_current::float8, p.cost_average::float8, p.cost_price::float8, p.created_at::text, p.updated_at::text
  FROM public.products p`);
const mapProd = new Map(products.map(p => [p.id, p]));
const stores = await q(`SELECT id::text, name FROM public.stores`);
const mapStore = new Map(stores.map(s => [s.id, s.name]));

// ═══ 2. COGS por transacción (asiento) + atribución por producto ════════════
const cogsEntries = await q(`SELECT fe.document_id::text AS tx, sum(fm.amount_cup)::float8 AS cogs
  FROM public.fin_entries fe JOIN public.fin_movements fm ON fm.entry_id=fe.id
  WHERE fe.document_type='VENTA' AND fm.category_code='GAS_COSTO_VENTAS' AND fm.sense='debito'
  GROUP BY 1`);
const mapCogs = new Map(cogsEntries.map(c => [c.tx, c.cogs]));
console.log(`transacciones con asiento VENTA (COGS): ${cogsEntries.length}`);

// items con cost_at_sale > 0
const items = await q(`SELECT ti.transaction_id::text AS tx, ti.product_id::text,
    ti.quantity::float8, ti.cost_at_sale::float8
  FROM public.transaction_items ti WHERE ti.cost_at_sale > 0`);
console.log(`transaction_items con cost_at_sale>0: ${items.length}`);

// movimientos de venta por transacción (para unicidad de producto)
const saleMovsByTx = new Map();
for (const m of movs.filter(m => m.movement_type === 'sale')) {
  if (!saleMovsByTx.has(m.reference_id)) saleMovsByTx.set(m.reference_id, []);
  saleMovsByTx.get(m.reference_id).push(m);
}

// Atribución por producto del COGS contable
const cogsPorProducto = new Map(); // product_id -> {por_items, por_unicidad, no_atribuible}
let cogsAtribItems = 0, cogsAtribUnico = 0, cogsNoAtribuible = 0, cogsSinItems = 0;
for (const [tx, cogs] of mapCogs) {
  const its = items.filter(i => i.tx === tx);
  if (its.length > 0) {
    for (const it of its) {
      const v = +(it.quantity * it.cost_at_sale).toFixed(2);
      cogsAtribItems += v;
      if (!cogsPorProducto.has(it.product_id)) cogsPorProducto.set(it.product_id, { por_items: 0, por_unicidad: 0 });
      cogsPorProducto.get(it.product_id).por_items += v;
    }
    // parte del COGS no cubierta por items con costo (p.ej. items costo 0)
    const cubierto = its.reduce((a, i) => a + i.quantity * i.cost_at_sale, 0);
    const dif = cogs - cubierto;
    if (Math.abs(dif) > 0.01) cogsNoAtribuible += dif;
  } else {
    const ms = saleMovsByTx.get(tx) || [];
    const prods = [...new Set(ms.map(m => m.product_id))];
    if (prods.length === 1) {
      cogsAtribUnico += cogs;
      if (!cogsPorProducto.has(prods[0])) cogsPorProducto.set(prods[0], { por_items: 0, por_unicidad: 0 });
      cogsPorProducto.get(prods[0]).por_unicidad += cogs;
    } else {
      cogsNoAtribuible += cogs;
      cogsSinItems++;
    }
  }
}
const cogsTotal = [...mapCogs.values()].reduce((a, b) => a + b, 0);
console.log(`COGS total contable=${cogsTotal.toFixed(2)} | atribuido por items=${cogsAtribItems.toFixed(2)} | por unicidad=${cogsAtribUnico.toFixed(2)} | no atribuible=${cogsNoAtribuible.toFixed(2)} (tx=${cogsSinItems})`);
console.log(`  check: atribuido+no atribuible = ${(cogsAtribItems + cogsAtribUnico + cogsNoAtribuible).toFixed(2)}`);

// ═══ 3. Valor por producto y categoría (todas las tiendas) ════════════════════
const perProduct = new Map();
function bucket(store, prod) {
  const k = `${store}|${prod}`;
  if (!perProduct.has(k)) perProduct.set(k, {
    store_id: store, tienda: mapStore.get(store), product_id: prod,
    sku: mapProd.get(prod)?.sku, producto: mapProd.get(prod)?.producto, um: mapProd.get(prod)?.um,
    // cantidades
    q_recibido: 0, q_vendido: 0, q_vales: 0, q_devuelto: 0, q_ajuste_pos: 0, q_ajuste_neg: 0,
    q_otras_salidas: 0, q_reversiones: 0,
    // valores según movimientos
    v_recibido: 0, v_vendido: 0, v_vales: 0, v_devuelto: 0, v_ajuste: 0, v_otras_salidas: 0, v_reversiones: 0,
    // costos de adquisición
    v_compras_lista: [], ultima_compra: null, wac_compras: null,
  });
  return perProduct.get(k);
}
for (const m of movs) {
  const b = bucket(m.store_id, m.product_id);
  const v = +(m.quantity_change * m.unit_cost).toFixed(6);
  switch (m.movement_type) {
    case 'purchase': b.q_recibido += m.quantity_change; b.v_recibido += v; b.v_compras_lista.push({ q: m.quantity_change, v, fecha: m.movement_date }); break;
    case 'sale': b.q_vendido += m.quantity_change; b.v_vendido += v; break;
    case 'issue_slip_out': b.q_vales += m.quantity_change; b.v_vales += v; break;
    case 'return': b.q_devuelto += m.quantity_change; b.v_devuelto += v; break;
    case 'adjustment':
      if (m.quantity_change > 0) b.q_ajuste_pos += m.quantity_change; else b.q_ajuste_neg += m.quantity_change;
      b.v_ajuste += v; break;
    case 'purchase_reverse': b.q_otras_salidas += m.quantity_change; b.v_otras_salidas += v; break;
    case 'sale_reverse': case 'issue_slip_reverse': case 'sale_void':
      b.q_reversiones += m.quantity_change; b.v_reversiones += v; break;
  }
}
// COGS contable atribuido por producto (del paso 2) — se añade por tienda del producto
for (const [prod, at] of cogsPorProducto) {
  const p = mapProd.get(prod);
  if (!p) continue;
  const b = bucket(p.store_id, prod);
  b.cogs_atribuido_items = at.por_items; b.cogs_atribuido_unicidad = at.por_unicidad;
}

// costos de adquisición derivados + costos vigentes
for (const b of perProduct.values()) {
  const totalQ = b.v_compras_lista.reduce((a, c) => a + c.q, 0);
  const totalV = b.v_compras_lista.reduce((a, c) => a + c.v, 0);
  if (b.v_compras_lista.length) {
    const ult = b.v_compras_lista[b.v_compras_lista.length - 1];
    b.ultima_compra = { fecha: ult.fecha.slice(0, 10), uc: +(ult.v / ult.q).toFixed(4) };
    b.wac_compras = totalQ > 0 ? +(totalV / totalQ).toFixed(4) : null;
  }
  b.q_existencia = +(b.q_recibido + b.q_vendido + b.q_vales + b.q_devuelto + b.q_ajuste_pos
    + b.q_ajuste_neg + b.q_otras_salidas + b.q_reversiones).toFixed(6);
  const p = mapProd.get(b.product_id);
  b.stock_current_registrado = p ? p.stock_current : null;
  b.cost_average_vigente = p ? p.cost_average : null;
  b.valor_existencia_costo_vigente = (p && p.cost_average !== null && b.q_existencia) ? +(b.q_existencia * p.cost_average).toFixed(2) : 0;
  b.valor_existencia_ultimo_costo = b.ultima_compra ? +(b.q_existencia * b.ultima_compra.uc).toFixed(2) : null;
  b.valor_existencia_wac_compras = b.wac_compras !== null ? +(b.q_existencia * b.wac_compras).toFixed(2) : null;
}

// ═══ 4. FVC: líneas por producto (para Fase VI) ══════════════════════════════
const fvcLineas = await q(`SELECT ri.product_id::text, sum(ri.quantity)::float8 AS q,
    sum(ri.quantity * ri.unit_cost * coalesce(NULLIF(ri.tasa_cambio_recepcion,0),1))::float8 AS v_cup,
    min(ri.moneda_recepcion) AS moneda, count(*)::int AS n_lineas
  FROM public.receipt_items ri WHERE ri.receipt_id='${FVC}' GROUP BY 1`);
const mapFvc = new Map(fvcLineas.map(f => [f.product_id, f]));
console.log(`productos distintos en FVC: ${fvcLineas.length} (101 líneas)`);

// ═══ 5. WAC change log (fuente/fecha de costos vigentes) ═════════════════════
const wacLog = await q(`SELECT product_id::text, store_id::text, wac_before::float8, wac_after::float8,
    event, qty_in::float8, uc_in::float8, source_ref::text, created_at::text
  FROM public.wac_change_log WHERE store_id='${'5e6fe821-5465-48b1-b3f1-3aa3182edc38'}'
  ORDER BY created_at DESC LIMIT 30`);
const wacN = await q(`SELECT count(*)::int AS n, min(created_at)::text AS desde, max(created_at)::text AS hasta FROM public.wac_change_log`);
console.log(`wac_change_log: ${wacN[0].n} filas (${wacN[0].desde?.slice(0,10)} → ${wacN[0].hasta?.slice(0,10)}); muestra ENERVIDA:`);
for (const w of wacLog.slice(0, 8)) console.log(`  prod=${w.product_id.slice(0,8)} ${w.event} ${w.wac_before}→${w.wac_after} qty_in=${w.qty_in} uc_in=${w.uc_in} ${w.created_at?.slice(0,10)} ref=${w.source_ref?.slice(0,60)}`);

// ═══ 6. Consolidación y evidencia ════════════════════════════════════════════
const filas = [...perProduct.values()].map(b => ({
  ...b, v_compras_lista: undefined,
  fvc: mapFvc.get(b.product_id) ? { q: mapFvc.get(b.product_id).q, v_cup: mapFvc.get(b.product_id).v_cup, moneda: mapFvc.get(b.product_id).moneda } : null,
}));
const resumen = { por_tienda: {} };
for (const b of filas) {
  const t = resumen.por_tienda[b.tienda] = resumen.por_tienda[b.tienda] || {
    productos: 0, q_existencia: 0, v_recibido: 0, v_vendido: 0, v_vales: 0, v_ajuste: 0,
    valor_existencia_costo_vigente: 0, cogs_atribuido: 0,
  };
  t.productos++; t.q_existencia += b.q_existencia || 0; t.v_recibido += b.v_recibido || 0;
  t.v_vendido += b.v_vendido || 0; t.v_vales += b.v_vales || 0; t.v_ajuste += b.v_ajuste || 0;
  t.valor_existencia_costo_vigente += b.valor_existencia_costo_vigente || 0;
  t.cogs_atribuido += (b.cogs_atribuido_items || 0) + (b.cogs_atribuido_unicidad || 0);
}
console.log('\nRESUMEN por tienda:', JSON.stringify(resumen, null, 1).slice(0, 1500));

writeFileSync(resolve('docs/audits/inventory-traceability-20261115/m032-fase5-6-por-producto.json'), JSON.stringify({
  generado: new Date().toISOString(), mision: 'CP-INVENTORY-TRACEABILITY-RECONCILIATION-001',
  fase: 'V/VI — motor de reconstrucción por producto',
  cogs_atribucion: { total_contable: +cogsTotal.toFixed(2), por_items: +cogsAtribItems.toFixed(2),
    por_unicidad_producto: +cogsAtribUnico.toFixed(2), no_atribuible: +cogsNoAtribuible.toFixed(2),
    tx_no_atribuibles: cogsSinItems,
    metodo: '1) cost_at_sale de transaction_items (base del motor) 2) unicidad de producto en la transacción 3) residual documentado' },
  wac_log: { filas: wacN[0].n, desde: wacN[0].desde, hasta: wacN[0].hasta, muestra: wacLog.slice(0, 10) },
  resumen, productos: filas,
}, null, 2));
console.log(`\nproductos totales reconstruidos: ${filas.length}`);
console.log('evidencia → docs/audits/inventory-traceability-20261115/m032-fase5-6-por-producto.json');
