#!/usr/bin/env node
/**
 * M034 — CP-INVENTORY-TRACEABILITY-RECONCILIATION-001 FASE V:
 * TRES VALORACIONES INDEPENDIENTES + PUENTE EXACTO MAYOR→INVENTARIO.
 * READ-ONLY.
 *
 * A. Valoración según movimientos y costos históricos de adquisición:
 *    existencias × costo de adquisición (WAC de compras por producto;
 *    para productos FVC también a costo de línea FVC).
 * B. Valoración según costos vigentes: existencias × products.cost_average
 *    (fuente: wac_change_log / motor, fecha = updated_at).
 * C. Valoración según conteo físico: NO existen conteos firmados
 *    (physical_counts=0; physical_inventories=11 todas voided) →
 *    la conciliación es CONTABLE contra inventario REGISTRADO; hoja de
 *    conteo física se entrega aparte (HOJA_CONTEO_FISICO_ENERVIDA.xlsx).
 *
 * Puente: saldo_contable − valoración_B = D_A (mayor vs adquisición) +
 * D_AB (adquisición vs vigente); D_A se descompone exactamente en
 * salidas sin asiento + reentradas sin asiento + residual por salidas
 * contabilizadas por debajo del costo de adquisición.
 * Uso: node scripts/m034-fase5-valoraciones.mjs
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

// ── motor por producto (m032) ─────────────────────────────────────────────────
const engine = JSON.parse(readFileSync(resolve('docs/audits/inventory-traceability-20261115/m032-fase5-6-por-producto.json'), 'utf8'));
const ener = engine.productos.filter(p => p.tienda === 'ENERVIDA-VITALLCONS');

// ── vales posted vs sin asiento por producto ────────────────────────────────
const valesMov = await q(`SELECT sm.reference_id::text AS vale, sm.product_id::text,
    sum(abs(sm.quantity_change) * sm.unit_cost)::float8 AS v
  FROM public.stock_movements sm WHERE sm.movement_type='issue_slip_out' AND sm.store_id='${ENER}'
    AND sm.reference_id IS NOT NULL GROUP BY 1,2`);
const valesConAsiento = await q(`SELECT fe.document_id::text AS vale FROM public.fin_entries fe
  WHERE fe.document_type='VALE_SALIDA' AND fe.store_id='${ENER}'`);
const setValePosted = new Set(valesConAsiento.map(v => v.vale));
const valesPostedPorProd = new Map(), valesSinPorProd = new Map();
for (const v of valesMov) {
  const target = setValePosted.has(v.vale) ? valesPostedPorProd : valesSinPorProd;
  target.set(v.product_id, (target.get(v.product_id) || 0) + v.v);
}
// ── ventas sin asiento por producto (valor mov) ───────────────────────────────
const ventasSinPorProd = new Map();
const vSin = await q(`SELECT sm.reference_id::text AS tx, sm.product_id::text,
    sum(abs(sm.quantity_change) * sm.unit_cost)::float8 AS v
  FROM public.stock_movements sm WHERE sm.movement_type='sale' AND sm.store_id='${ENER}'
    AND sm.reference_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.fin_entries fe WHERE fe.document_type='VENTA' AND fe.document_id = sm.reference_id::uuid)
  GROUP BY 1,2`);
for (const v of vSin) ventasSinPorProd.set(v.product_id, (ventasSinPorProd.get(v.product_id) || 0) + v.v);
// ── ajustes por producto (ninguno posted salvo 1 CUP) ─────────────────────────
const ajustesPorProd = new Map();
const aj = await q(`SELECT product_id::text, sum(quantity_change * unit_cost)::float8 AS v
  FROM public.stock_movements WHERE movement_type='adjustment' AND store_id='${ENER}' GROUP BY 1`);
for (const a of aj) ajustesPorProd.set(a.product_id, a.v);
// ── reversiones por producto ───────────────────────────────────────────────────
const revPorProd = new Map();
const rev = await q(`SELECT product_id::text, sum(quantity_change * unit_cost)::float8 AS v
  FROM public.stock_movements WHERE movement_type IN ('sale_reverse','issue_slip_reverse','sale_void')
    AND store_id='${ENER}' GROUP BY 1`);
for (const r of rev) revPorProd.set(r.product_id, r.v);

// ── FVC líneas por producto ──────────────────────────────────────────────────
const fvcLineas = await q(`SELECT ri.product_id::text, sum(ri.quantity)::float8 AS q,
    (sum(ri.quantity * ri.unit_cost * coalesce(NULLIF(ri.tasa_cambio_recepcion,0),1)) / sum(ri.quantity))::float8 AS uc_fvc
  FROM public.receipt_items ri WHERE ri.receipt_id='${FVC}' GROUP BY 1`);
const mapFvcUc = new Map(fvcLineas.map(f => [f.product_id, f.uc_fvc]));

// ═══ VALORACIONES ENERVIDA ════════════════════════════════════════════════════
let A_wac = 0, A_ult = 0, A_fvc = 0, B = 0, qTotal = 0;
const filas = [];
for (const p of ener) {
  const q = p.q_existencia || 0;
  const wacCompras = p.wac_compras;
  const ult = p.ultima_compra?.uc;
  const fvcUc = mapFvcUc.get(p.product_id);
  const vA = wacCompras !== null ? q * wacCompras : 0;
  const vUlt = ult != null ? q * ult : 0;
  const vFvc = fvcUc != null ? q * fvcUc : null;
  const vB = p.valor_existencia_costo_vigente || 0;
  A_wac += vA; A_ult += vUlt; if (vFvc !== null) A_fvc += vFvc; B += vB; qTotal += q;
  // componentes del puente por producto
  const valesPosted = valesPostedPorProd.get(p.product_id) || 0;
  const valesSin = valesSinPorProd.get(p.product_id) || 0;
  const ventasSin = ventasSinPorProd.get(p.product_id) || 0;
  const ajustes = ajustesPorProd.get(p.product_id) || 0;
  const reverses = revPorProd.get(p.product_id) || 0;
  filas.push({
    sku: p.sku, producto: p.producto, um: p.um, q_stock: q,
    wac_compras: wacCompras, ultimo_costo: ult, uc_fvc: fvcUc, cost_average_vigente: p.cost_average_vigente,
    valor_A_wac: +vA.toFixed(2), valor_A_ultimo: +vUlt.toFixed(2),
    valor_A_fvc: vFvc !== null ? +vFvc.toFixed(2) : null,
    valor_B_vigente: +vB.toFixed(2),
    fvc: p.fvc ? true : false,
    saldo_mayor_atribuible: +((p.v_recibido || 0) + (p.v_devuelto || 0) - (p.cogs_atribuido_items || 0) - (p.cogs_atribuido_unicidad || 0) - valesPosted).toFixed(2),
    salidas_sin_asiento: +(valesSin + ventasSin + (ajustes < 0 ? -ajustes : ajustes)).toFixed(2),
    reentradas_sin_asiento: +reverses.toFixed(2),
  });
}
console.log('════ FASE V — TRES VALORACIONES (ENERVIDA-VITALLCONS) ════');
console.log(`A. según costos históricos de adquisición:`);
console.log(`   A1 (WAC de compras):      ${A_wac.toFixed(2)} (${qTotal.toFixed(2)} unidades)`);
console.log(`   A2 (último costo compra): ${A_ult.toFixed(2)}`);
console.log(`   A-FVC (línea FVC, solo 101 productos): ${A_fvc.toFixed(2)}`);
console.log(`B. según costos vigentes (cost_average):  ${B.toFixed(2)}`);
console.log(`C. según conteo físico: SIN conteos firmados (physical_counts=0; 11 voided) → NO certificar físico.`);

// ═══ PUENTE EXACTO ════════════════════════════════════════════════════════════
const saldoMayor = 189439466.38;
const comprasExact = 194995370.40; // = débitos RECEPCION ENER (motor == movs)
const devolPosted = 2.0;
const cogsPosted = 4747041.91;    // créditos VENTA ENER (100% ENER)
const valesPosted = 808863.11;    // créditos VALE ENER
const ajustePosted = 1.0;
const checkSaldo = comprasExact + devolPosted - cogsPosted - valesPosted - ajustePosted;
console.log(`\n════ PUENTE MAYOR → INVENTARIO (ENERVIDA) ════`);
console.log(`saldo contable: ${saldoMayor.toFixed(2)} (verif. reconstrucción: ${checkSaldo.toFixed(2)})`);
const D = saldoMayor - B;
console.log(`D. diferencia total (mayor − B): ${D.toFixed(2)}`);
// D_A y D_AB
const D_AB = A_wac - B; // adquisición vs vigente
const D_A = saldoMayor - A_wac; // mayor vs adquisición
console.log(`D_AB (A1 − B, WAC compras vs costos vigentes): ${D_AB.toFixed(2)}`);
console.log(`D_A  (mayor − A1, salidas por debajo del costo de adquisición): ${D_A.toFixed(2)}`);
// descomposición exacta de D_A
const valesSinTotal = [...valesSinPorProd.values()].reduce((a, b) => a + b, 0);
const ventasSinTotal = [...ventasSinPorProd.values()].reduce((a, b) => a + b, 0);
const ajustesTotal = [...ajustesPorProd.values()].reduce((a, b) => a + b, 0);
const ajustesSinAsiento = Math.min(ajustesTotal, 0) + 1; // neto negativo − 1 CUP ya posted (crédito)
const reversesTotal = [...revPorProd.values()].reduce((a, b) => a + b, 0);
console.log(`  componentes exactos (valor de movimientos, ENERVIDA):`);
console.log(`  · vales de salida SIN asiento:        ${valesSinTotal.toFixed(2)}`);
console.log(`  · ventas SIN asiento (valor movs):    ${ventasSinTotal.toFixed(2)}`);
console.log(`  · ajustes de cuadre SIN asiento:       ${(-ajustesSinAsiento).toFixed(2)} (salidas físicas no contabilizadas)`);
console.log(`  · reversiones/voids SIN asiento:      +${reversesTotal.toFixed(2)} (reingresan stock sin débito — reducen la diferencia)`);
// residual = D_A − salidas_sin_asiento + reentradas_sin_asiento
// (publicar las salidas pendientes reduce el saldo; publicar las reentradas lo aumenta)
const residual = D_A - valesSinTotal - ventasSinTotal + ajustesSinAsiento + reversesTotal;
console.log(`  residual D_A tras componentes exactos: ${residual.toFixed(2)} (= salidas CONTABILIZADAS a costo inferior al de adquisición de lo salido + COGS 2.060,40 no atribuible + efectos de base de costo en la atribución)`);

// ═══ HOJA DE CONTEO FÍSICO (datos) ════════════════════════════════════════════
const productosEner = await q(`SELECT id::text, sku, name, unit_of_measure AS um, stock_current::float8,
    cost_average::float8 FROM public.products WHERE store_id='${ENER}' ORDER BY sku NULLS LAST`);
console.log(`\nproductos ENERVIDA para hoja de conteo: ${productosEner.length}`);
const conStock = productosEner.filter(p => (p.stock_current || 0) > 0);
console.log(`  con stock > 0: ${conStock.length} | sin stock: ${productosEner.length - conStock.length}`);

// ═══ Evidencia ════════════════════════════════════════════════════════════════
writeFileSync(resolve('docs/audits/inventory-traceability-20261115/m034-fase5-valoraciones.json'), JSON.stringify({
  generado: new Date().toISOString(), mision: 'CP-INVENTORY-TRACEABILITY-RECONCILIATION-001',
  fase: 'V — tres valoraciones + puente mayor vs inventario',
  tienda: 'ENERVIDA-VITALLCONS',
  valoraciones: {
    A1_wac_compras: +A_wac.toFixed(2), A2_ultimo_costo: +A_ult.toFixed(2),
    A_fvc_lineas_fvc: +A_fvc.toFixed(2), B_costos_vigentes: +B.toFixed(2),
    C_conteo_fisico: 'NO EXISTEN conteos firmados — conciliación contable contra inventario registrado; hoja de conteo entregada aparte',
    unidades_en_existencia: +qTotal.toFixed(2),
  },
  puente: {
    saldo_contable: saldoMayor, compras_exactas: comprasExact, devol_posted: devolPosted,
    cogs_posted: cogsPosted, vales_posted: valesPosted, ajuste_posted: ajustePosted,
    verificacion_reconstruccion: +checkSaldo.toFixed(2),
    diferencia_total: +D.toFixed(2), D_AB_adquisicion_vs_vigente: +D_AB.toFixed(2),
    D_A_mayor_vs_adquisicion: +D_A.toFixed(2),
    salidas_sin_asiento: { vales: +valesSinTotal.toFixed(2), ventas: +ventasSinTotal.toFixed(2), ajustes: +(-ajustesSinAsiento).toFixed(2) },
    reentradas_sin_asiento: +reversesTotal.toFixed(2),
    residual_salidas_contabilizadas_costo_inferior: +residual.toFixed(2),
  },
  por_producto: filas,
  hoja_conteo: productosEner.map(p => ({
    product_id: p.id, sku: p.sku, producto: p.name, um: p.um,
    existencia_sistema: p.stock_current, costo_vigente: p.cost_average,
    es_fvc: mapFvcUc.has(p.id), cantidad_fisica_contada: null, diferencia: null,
    responsable: null, fecha: null, observaciones: '',
  })),
}, null, 2));
console.log('\nevidencia → docs/audits/inventory-traceability-20261115/m034-fase5-valoraciones.json');
