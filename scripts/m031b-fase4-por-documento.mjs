#!/usr/bin/env node
/**
 * M031b — FASE IV (profundización): CONCILIACIÓN POR DOCUMENTO DE ORIGEN de los
 * gaps de identidad de valor (ventas / vales / ajustes / reversiones).
 * READ-ONLY. Cuantifica por documento: valor según movimientos de inventario
 * vs valor registrado en el mayor CP-FIN → clasificable en Fase VII.
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

// ═══ 1. VENTAS: transacción → movimientos vs asiento ═════════════════════════
console.log('── VENTAS: conciliación por transacción ──');
const ventasMov = await q(`SELECT reference_id::text AS tx, store_id::text,
    count(*)::int AS n_items, sum(abs(quantity_change))::float8 AS unidades,
    sum(abs(quantity_change) * unit_cost)::float8 AS valor_movs
  FROM public.stock_movements WHERE movement_type='sale' AND reference_id IS NOT NULL
  GROUP BY 1,2`);
console.log(`transacciones con movimientos de venta: ${ventasMov.length}`);
const ventasEntry = await q(`SELECT fe.document_id::text AS tx, fe.store_id::text, fe.id::text AS entry,
    sum(CASE WHEN fm.category_code='GAS_COSTO_VENTAS' AND fm.sense='debito' THEN fm.amount_cup ELSE 0 END)::float8 AS cogs,
    sum(CASE WHEN fm.category_code='ING_VENTAS' AND fm.sense='credito' THEN fm.amount_cup ELSE 0 END)::float8 AS ingreso
  FROM public.fin_entries fe JOIN public.fin_movements fm ON fm.entry_id = fe.id
  WHERE fe.document_type='VENTA'
  GROUP BY fe.document_id, fe.store_id, fe.id`);
console.log(`transacciones con asiento VENTA: ${ventasEntry.length}`);
const mapEntry = new Map(ventasEntry.map(v => [v.tx, v]));
let conAmbos = 0, sinEntry = 0, valorSinEntry = 0, difConEntry = 0, valorDif = 0;
const difs = [], sinAsiento = [];
for (const vm of ventasMov) {
  const e = mapEntry.get(vm.tx);
  if (!e) { sinEntry++; valorSinEntry += vm.valor_movs; sinAsiento.push(vm); }
  else {
    conAmbos++;
    const d = +(vm.valor_movs - e.cogs).toFixed(2);
    if (Math.abs(d) > 0.01) { difConEntry++; valorDif += d; difs.push({ tx: vm.tx, valor_movs: vm.valor_movs, cogs_entry: e.cogs, dif: d }); }
  }
}
console.log(`  con asiento: ${conAmbos} | SIN asiento: ${sinEntry} (valor movs ${valorSinEntry.toFixed(2)})`);
console.log(`  con asiento pero dif≠0: ${difConEntry} (Σ dif ${valorDif.toFixed(2)})`);
console.log(`  Σ cogs asientos = ${ventasEntry.reduce((a,v)=>a+v.cogs,0).toFixed(2)} | Σ valor movs de ventas CON asiento = ${ventasMov.filter(v=>mapEntry.has(v.tx)).reduce((a,v)=>a+v.valor_movs,0).toFixed(2)}`);
// naturaleza de las transacciones sin asiento (¿legacy POS?)
const txSin = sinAsiento.slice(0, 8).map(s => s.tx);
if (txSin.length) {
  const info = await q(`SELECT t.id::text, t.status, t.created_at::text FROM public.transactions t WHERE t.id::text = ANY(ARRAY[${txSin.map(x=>`'${x}'`).join(',')}])`);
  console.log('  ejemplos sin asiento:', JSON.stringify(info.map(i => ({ id: i.id.slice(0,8), status: i.status, fecha: i.created_at?.slice(0,10) }))));
  // referencia textual de esos movimientos
  const refdocs = await q(`SELECT reference_doc, count(*)::int AS n FROM public.stock_movements
    WHERE movement_type='sale' AND reference_id IS NOT NULL AND reference_id::text = ANY(ARRAY[${txSin.map(x=>`'${x}'`).join(',')}])
    GROUP BY 1`);
  console.log('  reference_doc de los sin asiento:', JSON.stringify(refdocs));
}
// referencia_doc global de las ventas
const refAll = await q(`SELECT reference_doc, count(*)::int AS n, sum(abs(quantity_change)*unit_cost)::float8 AS valor
  FROM public.stock_movements WHERE movement_type='sale' GROUP BY 1`);
console.log('  ventas por reference_doc:', JSON.stringify(refAll));

// ═══ 2. VALES: vale → movimientos vs asiento ══════════════════════════════════
console.log('\n── VALES: conciliación por vale ──');
const valesMov = await q(`SELECT reference_id::text AS vale, store_id::text,
    count(*)::int AS n_items, sum(abs(quantity_change))::float8 AS unidades,
    sum(abs(quantity_change) * unit_cost)::float8 AS valor_movs
  FROM public.stock_movements WHERE movement_type='issue_slip_out' AND reference_id IS NOT NULL
  GROUP BY 1,2`);
const valesEntry = await q(`SELECT fe.document_id::text AS vale, fe.id::text AS entry,
    sum(CASE WHEN fm.category_code='GAS_VALES' AND fm.sense='debito' THEN fm.amount_cup ELSE 0 END)::float8 AS gasto
  FROM public.fin_entries fe JOIN public.fin_movements fm ON fm.entry_id = fe.id
  WHERE fe.document_type='VALE_SALIDA' GROUP BY fe.document_id, fe.id`);
const mapVale = new Map(valesEntry.map(v => [v.vale, v]));
let vCon = 0, vSin = 0, vSinValor = 0, vDifN = 0, vDifValor = 0;
const vDifs = [], vSinA = [];
for (const vm of valesMov) {
  const e = mapVale.get(vm.vale);
  if (!e) { vSin++; vSinValor += vm.valor_movs; vSinA.push(vm); }
  else { vCon++; const d = +(vm.valor_movs - e.gasto).toFixed(2); if (Math.abs(d) > 0.01) { vDifN++; vDifValor += d; vDifs.push({ vale: vm.vale, valor_movs: vm.valor_movs, gasto_entry: e.gasto, dif: d }); } }
}
console.log(`  vales con movimientos: ${valesMov.length} | con asiento: ${vCon} | SIN asiento: ${vSin} (valor ${vSinValor.toFixed(2)}) | dif≠0: ${vDifN} (Σ ${vDifValor.toFixed(2)})`);
// estado de los vales sin asiento
const vSinIds = vSinA.slice(0, 12).map(s => s.vale);
if (vSinIds.length) {
  const info = await q(`SELECT i.id::text, i.status, i.created_at::text, (SELECT count(*) FROM public.issue_slip_items WHERE slip_id=i.id)::int AS items
    FROM public.issue_slips i WHERE i.id::text = ANY(ARRAY[${vSinIds.map(x=>`'${x}'`).join(',')}])`);
  console.log('  vales sin asiento (muestra):', JSON.stringify(info.map(i => ({ id: i.id.slice(0,8), status: i.status, fecha: i.created_at?.slice(0,10), items: i.items }))));
  const st = await q(`SELECT i.status, count(*)::int AS n FROM public.issue_slips i GROUP BY 1`);
  console.log('  vales por estado:', JSON.stringify(st));
}

// ═══ 3. AJUSTES: movimientos vs único asiento ════════════════════════════════
console.log('\n── AJUSTES: movimientos vs asientos ──');
const ajustes = await q(`SELECT sm.reference_doc, count(*)::int AS n, sum(quantity_change)::float8 AS unidades,
    sum(quantity_change * unit_cost)::float8 AS valor
  FROM public.stock_movements sm WHERE movement_type='adjustment' GROUP BY 1 ORDER BY valor`);
for (const a of ajustes) console.log(`  "${(a.reference_doc||'').slice(0,60)}": n=${a.n} un=${a.unidades} valor=${a.valor}`);
const ajEntry = await q(`SELECT fe.id::text, fe.document_id::text, fe.description, fm.amount_cup::float8, fm.sense
  FROM public.fin_entries fe JOIN public.fin_movements fm ON fm.entry_id=fe.id
  WHERE fe.document_type='AJUSTE_INVENTARIO'`);
console.log('  asiento AJUSTE_INVENTARIO:', JSON.stringify(ajEntry));
const invAdj = await q(`SELECT count(*)::int AS n FROM public.inventory_adjustments`);
console.log('  tabla inventory_adjustments:', invAdj[0].n, 'filas');
if (invAdj[0].n > 0) {
  const iad = await q(`SELECT ia.id::text, ia.status, ia.created_at::text, (SELECT count(*) FROM public.inventory_adjustment_items WHERE adjustment_id=ia.id)::int AS items
    FROM public.inventory_adjustments ia ORDER BY ia.created_at DESC LIMIT 10`);
  for (const i of iad) console.log(`    ajuste ${i.id.slice(0,8)} status=${i.status} ${i.created_at?.slice(0,10)} items=${i.items}`);
}

// ═══ 4. REVERSIONES sin asiento ═══════════════════════════════════════════════
console.log('\n── REVERSIONES/VOIDS: valor de movimientos (¿asientos?) ──');
const revs = await q(`SELECT movement_type, count(*)::int AS n, sum(quantity_change * unit_cost)::float8 AS valor,
    sum(quantity_change)::float8 AS unidades
  FROM public.stock_movements WHERE movement_type IN ('sale_reverse','issue_slip_reverse','sale_void','purchase_reverse')
  GROUP BY 1`);
for (const r of revs) console.log(`  ${r.movement_type}: n=${r.n} unidades=${r.unidades} valor=${r.valor}`);
// ¿existen asientos de reversión en fin_entries? (reversal_of)
const revEntries = await q(`SELECT document_type, event, count(*)::int AS n FROM public.fin_entries
  WHERE reversal_of IS NOT NULL OR event ILIKE '%anulac%' OR event ILIKE '%revers%' GROUP BY 1,2`);
console.log('  entradas de reversión/anulación:', JSON.stringify(revEntries));

// ═══ 5. Evidencia ════════════════════════════════════════════════════════════
writeFileSync(resolve('docs/audits/inventory-traceability-20261115/m031b-fase4-por-documento.json'), JSON.stringify({
  generado: new Date().toISOString(), mision: 'CP-INVENTORY-TRACEABILITY-RECONCILIATION-001',
  fase: 'IV-b — conciliación por documento de origen',
  ventas: { transacciones_con_movs: ventasMov.length, con_asiento: conAmbos, sin_asiento: sinEntry,
    valor_movs_sin_asiento: +valorSinEntry.toFixed(2), con_asiento_dif: difConEntry, suma_dif: +valorDif.toFixed(2),
    detalle_difs: difs.slice(0, 100), detalle_sin_asiento: sinAsiento.slice(0, 100) },
  vales: { vales_con_movs: valesMov.length, con_asiento: vCon, sin_asiento: vSin,
    valor_sin_asiento: +vSinValor.toFixed(2), dif_n: vDifN, dif_valor: +vDifValor.toFixed(2),
    detalle_difs: vDifs.slice(0, 100) },
  ajustes: { movimientos_por_doc: ajustes, asientos: ajEntry },
  reversiones: revs, entradas_reversal: revEntries,
}, null, 2));
console.log('\nevidencia → docs/audits/inventory-traceability-20261115/m031b-fase4-por-documento.json');
