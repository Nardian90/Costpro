#!/usr/bin/env node
/**
 * M029 — CP-INVENTORY-TRACEABILITY-RECONCILIATION-001 FASE III:
 * RECONSTRUCCIÓN INTEGRAL DE CANTIDADES POR PRODUCTO (ENERVIDA-VITALLCONS).
 * READ-ONLY.
 *
 * Fórmula de la misión §5 por SKU:
 *   Existencia inicial + recepciones + devoluciones de clientes
 *   − ventas − vales de salida − ajustes negativos − otras salidas
 *   + reversiones y entradas correctivas = existencia resultante
 *
 * Mapa de tipos → categorías:
 *   recepciones            = purchase (+)
 *   devoluciones clientes  = return (+)
 *   ventas                 = sale (−)
 *   vales de salida        = issue_slip_out (−)
 *   ajustes                = adjustment (±) [positivos | negativos]
 *   otras salidas          = purchase_reverse (−)
 *   reversiones/entradas   = sale_reverse + issue_slip_reverse + sale_void (+)
 *
 * Verificaciones: cada movimiento contado exactamente una vez (sin duplicados
 * exactos), comparación vs stock_movements (Σ), products.stock_current e
 * inventory.quantity, separación por store_id.
 * Uso: node scripts/m029-fase3-reconstruccion.mjs
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
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: no es producción'); process.exit(2); }

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`(HTTP ${res.status}) ${text.slice(0, 300)}`);
  return JSON.parse(text || '[]');
}

const ENER = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';

// ── 1. ¿Existencia inicial antes del primer movimiento? ─────────────────────
const primera = await q(`SELECT min(movement_date)::text AS d FROM public.stock_movements WHERE store_id='${ENER}'`);
const antesDeMayo = await q(`SELECT count(*)::int AS n FROM public.stock_movements
  WHERE store_id='${ENER}' AND movement_date < '2026-05-01'`);
console.log(`primer movimiento ENERVIDA: ${primera[0].d} | movimientos anteriores: ${antesDeMayo[0].n} → existencia inicial = 0`);
const existenciaInicial = 0;

// ── 2. Duplicados exactos (misma fila repetida) ──────────────────────────────
const dups = await q(`SELECT store_id, product_id, movement_type, reference_id, quantity_change,
    movement_date, count(*)::int AS n
  FROM public.stock_movements WHERE store_id='${ENER}'
  GROUP BY 1,2,3,4,5,6 HAVING count(*) > 1
     AND (reference_id IS NOT NULL OR movement_date IS NOT NULL)
  ORDER BY n DESC LIMIT 50`);
console.log(`grupos de filas exactamente idénticas (prod+tipo+ref+cant+fecha): ${dups.length}`);
const dupsConRef = dups.filter(d => d.reference_id).length;
console.log(`  de ellas con reference_id (potencial doble contabilización): ${dupsConRef}`);
if (dups.length) for (const d of dups.slice(0, 10))
  console.log(`    DUP: prod=${d.product_id?.slice(0,8)} tipo=${d.movement_type} ref=${(d.reference_id||'NULL').slice(0,8)} q=${d.quantity_change} fecha=${d.movement_date?.slice(0,10)} ×${d.n}`);

// ── 3. Movimientos ENERVIDA por producto y categoría ────────────────────────
const porProducto = await q(`SELECT sm.product_id::text, p.sku, p.name AS producto, p.unit_of_measure AS um,
    sum(sm.quantity_change)::float8 AS neto_total,
    sum(sm.quantity_change) FILTER (WHERE sm.movement_type='purchase')::float8 AS recibido,
    sum(sm.quantity_change) FILTER (WHERE sm.movement_type='return')::float8 AS devuelto,
    sum(sm.quantity_change) FILTER (WHERE sm.movement_type='sale')::float8 AS vendido,
    sum(sm.quantity_change) FILTER (WHERE sm.movement_type='issue_slip_out')::float8 AS vales,
    sum(sm.quantity_change) FILTER (WHERE sm.movement_type='adjustment' AND sm.quantity_change > 0)::float8 AS ajustes_pos,
    sum(sm.quantity_change) FILTER (WHERE sm.movement_type='adjustment' AND sm.quantity_change < 0)::float8 AS ajustes_neg,
    sum(sm.quantity_change) FILTER (WHERE sm.movement_type='purchase_reverse')::float8 AS otras_salidas,
    sum(sm.quantity_change) FILTER (WHERE sm.movement_type IN ('sale_reverse','issue_slip_reverse','sale_void'))::float8 AS reversiones_entradas,
    count(*)::int AS n_movs
  FROM public.stock_movements sm LEFT JOIN public.products p ON p.id = sm.product_id
  WHERE sm.store_id='${ENER}'
  GROUP BY sm.product_id, p.sku, p.name, p.unit_of_measure
  ORDER BY p.sku NULLS LAST`);
console.log(`productos con movimientos ENERVIDA: ${porProducto.length}`);

// ── 4. Existencias registradas ───────────────────────────────────────────────
const stockCurrent = await q(`SELECT id::text, sku, stock_current::float8, cost_average::float8,
    name AS producto FROM public.products WHERE store_id='${ENER}'`);
const invRows = await q(`SELECT product_id::text, quantity::float8 FROM public.inventory WHERE store_id='${ENER}'`);
const mapStock = new Map(stockCurrent.map(p => [p.id, p]));
const mapInv = new Map(invRows.map(i => [i.product_id, i.quantity]));

// ── 5. Cruce: recibido (movs) vs recibido (receipt_items) por producto ──────
const porReciboLineas = await q(`SELECT ri.product_id::text, sum(ri.quantity)::float8 AS qty_lineas,
    sum(CASE WHEN r.status='reversed' THEN ri.quantity ELSE 0 END)::float8 AS qty_reversed,
    count(*)::int AS n_lineas
  FROM public.receipt_items ri JOIN public.receipts r ON r.id = ri.receipt_id
  WHERE r.store_id='${ENER}' GROUP BY ri.product_id`);
const mapLineas = new Map(porReciboLineas.map(l => [l.product_id, l]));

// ── 6. Reconstrucción por SKU ───────────────────────────────────────────────
const skus = [];
let descuadres = 0;
for (const pp of porProducto) {
  const stock = mapStock.get(pp.product_id);
  const inv = mapInv.get(pp.product_id) ?? null;
  const lineas = mapLineas.get(pp.product_id);
  const calculada = existenciaInicial + (pp.neto_total ?? 0);
  const registrada = stock ? stock.stock_current : null;
  const dif = (calculada !== null && registrada !== null) ? +(calculada - registrada).toFixed(6) : null;
  if (dif !== null && Math.abs(dif) > 1e-6) descuadres++;
  const difInv = (calculada !== null && inv !== null) ? +(calculada - inv).toFixed(6) : null;
  const difLineas = lineas ? +((pp.recibido ?? 0) - (lineas.qty_lineas - (lineas.qty_reversed ?? 0))).toFixed(6) : null;
  skus.push({
    product_id: pp.product_id, sku: pp.sku, producto: pp.producto, um: pp.um, n_movs: pp.n_movs,
    existencia_inicial: existenciaInicial,
    recibido: pp.recibido ?? 0, devuelto: pp.devuelto ?? 0, vendido: -(pp.vendido ?? 0),
    vales: -(pp.vales ?? 0), ajustes_pos: pp.ajustes_pos ?? 0, ajustes_neg: -(pp.ajustes_neg ?? 0),
    otras_salidas: -(pp.otras_salidas ?? 0), reversiones_entradas: pp.reversiones_entradas ?? 0,
    existencia_calculada: +calculada.toFixed(6),
    existencia_registrada_stock_current: registrada,
    existencia_registrada_inventory: inv,
    diferencia_stock_current: dif, diferencia_inventory: difInv,
    recibido_segun_lineas: lineas ? +(lineas.qty_lineas - (lineas.qty_reversed ?? 0)).toFixed(6) : null,
    dif_recibido_vs_lineas: difLineas,
    wac_registrado: stock ? stock.cost_average : null,
  });
}

// Productos con stock registrado pero SIN movimientos (huérfanos de kardex)
const sinMovs = stockCurrent.filter(p => !porProducto.find(pp => pp.product_id === p.id));
console.log(`productos con stock_current pero SIN movimientos: ${sinMovs.length}`);
for (const p of sinMovs.slice(0, 10)) console.log(`   ${p.sku} "${(p.producto||'').slice(0,40)}" stock=${p.stock_current}`);

// ── 7. Resumen ───────────────────────────────────────────────────────────────
const resumen = {
  productos_con_movimientos: skus.length,
  productos_stock_sin_movimientos: sinMovs.length,
  filas_duplicadas_exactas: dups.length,
  filas_duplicadas_con_ref: dupsConRef,
  skus_con_diferencia_stock_current: descuadres,
  total_recibido: +skus.reduce((a, s) => a + s.recibido, 0).toFixed(2),
  total_vendido: +skus.reduce((a, s) => a + s.vendido, 0).toFixed(2),
  total_vales: +skus.reduce((a, s) => a + s.vales, 0).toFixed(2),
  total_devuelto: +skus.reduce((a, s) => a + s.devuelto, 0).toFixed(2),
  total_ajustes_pos: +skus.reduce((a, s) => a + s.ajustes_pos, 0).toFixed(2),
  total_ajustes_neg: +skus.reduce((a, s) => a + s.ajustes_neg, 0).toFixed(2),
  total_otras_salidas: +skus.reduce((a, s) => a + s.otras_salidas, 0).toFixed(2),
  total_reversiones: +skus.reduce((a, s) => a + s.reversiones_entradas, 0).toFixed(2),
  existencia_calculada_total: +skus.reduce((a, s) => a + s.existencia_calculada, 0).toFixed(2),
  existencia_registrada_total: +skus.reduce((a, s) => a + (s.existencia_registrada_stock_current ?? 0), 0).toFixed(2),
};
console.log('\nRESUMEN ENERVIDA:', JSON.stringify(resumen, null, 1));
const difs = skus.filter(s => s.diferencia_stock_current !== null && Math.abs(s.diferencia_stock_current) > 1e-6);
console.log(`SKUs con diferencia calculada vs stock_current: ${difs.length}`);
for (const d of difs.slice(0, 25)) console.log(`   sku=${d.sku} "${(d.producto||'').slice(0,30)}": calc=${d.existencia_calculada} reg=${d.existencia_registrada_stock_current} dif=${d.diferencia_stock_current} (inv=${d.existencia_registrada_inventory})`);
const difsInv = skus.filter(s => s.diferencia_inventory !== null && Math.abs(s.diferencia_inventory) > 1e-6);
console.log(`SKUs con diferencia calculada vs inventory.quantity: ${difsInv.length}`);
const difsLineas = skus.filter(s => s.dif_recibido_vs_lineas !== null && Math.abs(s.dif_recibido_vs_lineas) > 1e-6);
console.log(`SKUs con recibido(movs) ≠ recibido(líneas): ${difsLineas.length}`);
for (const d of difsLineas.slice(0, 15)) console.log(`   sku=${d.sku}: movs=${d.recibido} lineas=${d.recibido_segun_lineas} dif=${d.dif_recibido_vs_lineas}`);

// ── 8. Evidencia ─────────────────────────────────────────────────────────────
writeFileSync(resolve('docs/audits/inventory-traceability-20261115/m029-fase3-reconstruccion.json'), JSON.stringify({
  generado: new Date().toISOString(), mision: 'CP-INVENTORY-TRACEABILITY-RECONCILIATION-001',
  fase: 'III — reconstrucción integral de cantidades por SKU (ENERVIDA-VITALLCONS)',
  tienda: 'ENERVIDA-VITALLCONS', store_id: ENER,
  fvc: FVC,
  supuestos: {
    existencia_inicial: 0, razon: 'el kardex ENERVIDA comienza 2026-05-01 con purchases; ningún movimiento anterior',
    categorias: 'purchase=recepciones | sale=ventas | issue_slip_out=vales | return=devoluciones clientes | adjustment=ajustes(±) | purchase_reverse=otras salidas | sale_reverse+issue_slip_reverse+sale_void=reversiones/entradas correctivas',
  },
  duplicados_exactos: dups, resumen, skus,
  productos_stock_sin_movimientos: sinMovs.map(p => ({ product_id: p.id, sku: p.sku, producto: p.producto, stock_current: p.stock_current })),
}, null, 2));
console.log('\nevidencia → docs/audits/inventory-traceability-20261115/m029-fase3-reconstruccion.json');
