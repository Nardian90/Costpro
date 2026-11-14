#!/usr/bin/env node
/**
 * M031 — CP-INVENTORY-TRACEABILITY-RECONCILIATION-001 FASE IV:
 * RECONSTRUCCIÓN DEL MAYOR ACT_INVENTARIO + verificación de identidades de
 * valor entre stock_movements y fin_movements. READ-ONLY.
 *
 * Mayor: saldo inicial (fin_opening_balances) + débitos (recepciones,
 * devoluciones que restituyen, ajustes positivos) − créditos (COGS, vales,
 * ajustes negativos, anulaciones de recepciones, otras salidas) = saldo final.
 *
 * Dimensión de producto: el motor NO la conserva en fin_movements (1000/1000
 * con product_id NULL) → reconstrucción INDIRECTA por documento fuente
 * (receipt_items / transaction_items / issue_slip_items / devolution_items /
 * inventory_adjustments) verificada contra Σ(|q|×unit_cost) de stock_movements.
 * Uso: node scripts/m031-fase4-mayor.mjs
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
const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';

// ═══ 1. MAYOR AGREGADO (autoritario, desde fin_movements) ═══════════════════
console.log('════ M031 FASE IV — MAYOR ACT_INVENTARIO ════\n');
const saldoInicial = await q(`SELECT coalesce(sum(amount_cup),0)::float8 AS n FROM public.fin_opening_balances`);
const porTipo = await q(`SELECT fe.document_type, fe.event, fm.sense, count(DISTINCT fe.id)::int AS n_asientos,
    count(*)::int AS n_movs, sum(fm.amount_cup)::float8 AS total
  FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id = fm.entry_id
  WHERE fm.category_code='ACT_INVENTARIO'
  GROUP BY fe.document_type, fe.event, fm.sense ORDER BY fe.document_type, fm.sense`);
const debitos = porTipo.filter(r => r.sense === 'debito').reduce((a, r) => a + r.total, 0);
const creditos = porTipo.filter(r => r.sense === 'credito').reduce((a, r) => a + r.total, 0);
const saldoFinal = +saldoInicial[0].n + debitos - creditos;
console.log('Mayor por document_type/event/sense:');
for (const r of porTipo) console.log(`  ${r.document_type}/${r.event} ${r.sense}: asientos=${r.n_asientos} movs=${r.n_movs} Σ=${r.total}`);
console.log(`\nSALDO INICIAL=${saldoInicial[0].n} | DÉBITOS=${debitos.toFixed(2)} | CRÉDITOS=${creditos.toFixed(2)} | SALDO CONTABLE FINAL=${saldoFinal.toFixed(2)}`);

// por tienda
const porTienda = await q(`SELECT fm.store_id, s.name, sum(CASE WHEN fm.sense='debito' THEN fm.amount_cup ELSE 0 END)::float8 AS debitos,
    sum(CASE WHEN fm.sense='credito' THEN fm.amount_cup ELSE 0 END)::float8 AS creditos
  FROM public.fin_movements fm LEFT JOIN public.stores s ON s.id=fm.store_id
  WHERE fm.category_code='ACT_INVENTARIO' GROUP BY fm.store_id, s.name`);
console.log('\nSaldo por tienda:');
for (const t of porTienda) console.log(`  ${t.name}: débitos=${t.debitos.toFixed(2)} créditos=${t.creditos.toFixed(2)} saldo=${(t.debitos - t.creditos).toFixed(2)}`);

// por mes
const porMes = await q(`SELECT date_trunc('month', fm.economic_date)::date AS mes,
    sum(CASE WHEN fm.sense='debito' THEN fm.amount_cup ELSE 0 END)::float8 AS debitos,
    sum(CASE WHEN fm.sense='credito' THEN fm.amount_cup ELSE 0 END)::float8 AS creditos
  FROM public.fin_movements fm WHERE fm.category_code='ACT_INVENTARIO' GROUP BY 1 ORDER BY 1`);
console.log('\nPor mes (economic_date): débitos/créditos');
let run = 0; const serie = [];
for (const m of porMes) { run += m.debitos - m.creditos; serie.push({ mes: m.mes, debitos: m.debitos, creditos: m.creditos, saldo_acum: +run.toFixed(2) }); }
for (const s of serie) console.log(`  ${s.mes}: +${s.debitos.toFixed(2)} / −${s.creditos.toFixed(2)} → saldo ${s.saldo_acum.toFixed(2)}`);

// por documento de origen (todas las recepciones)
const porDoc = await q(`SELECT fe.document_number, fe.document_id::text, fe.event, fm.amount_cup::float8, fm.sense, fe.economic_date::text,
    s.name AS tienda
  FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
  LEFT JOIN public.stores s ON s.id=fm.store_id
  WHERE fm.category_code='ACT_INVENTARIO' AND fe.document_type='RECEPCION'
  ORDER BY fm.amount_cup DESC`);

// ═══ 2. IDENTIDADES DE VALOR (movimientos vs mayor) ══════════════════════════
console.log('\n── Identidades de valor: Σ(|q|×unit_cost) de stock_movements vs mayor ──');
const valPorTipo = await q(`SELECT movement_type, store_id,
    sum(abs(quantity_change) * unit_cost)::float8 AS valor_abs,
    sum(CASE WHEN quantity_change > 0 THEN quantity_change * unit_cost ELSE 0 END)::float8 AS valor_pos,
    sum(CASE WHEN quantity_change < 0 THEN quantity_change * unit_cost ELSE 0 END)::float8 AS valor_neg
  FROM public.stock_movements GROUP BY movement_type, store_id ORDER BY movement_type`);
const agg = {};
for (const r of valPorTipo) {
  agg[r.movement_type] = agg[r.movement_type] || { valor_abs: 0, valor_pos: 0, valor_neg: 0 };
  agg[r.movement_type].valor_abs += +r.valor_abs; agg[r.movement_type].valor_pos += +r.valor_pos; agg[r.movement_type].valor_neg += +r.valor_neg;
}
const ledger = {
  recepciones_debito: porTipo.find(r => r.document_type === 'RECEPCION' && r.event === 'reconocimiento' && r.sense === 'debito')?.total,
  cogs_credito: porTipo.find(r => r.document_type === 'VENTA' && r.sense === 'credito')?.total,
  vales_credito: porTipo.find(r => r.document_type === 'VALE_SALIDA' && r.sense === 'credito')?.total,
  devol_debito: porTipo.find(r => r.document_type === 'DEVOLUCION_VENTA' && r.sense === 'debito')?.total,
  ajuste_credito: porTipo.find(r => r.document_type === 'AJUSTE_INVENTARIO' && r.sense === 'credito')?.total,
  anulacion_credito: porTipo.find(r => r.document_type === 'RECEPCION' && r.event === 'anulacion' && r.sense === 'credito')?.total,
};
console.log(`  purchase(movs) Σ q×uc      = ${agg.purchase?.valor_pos.toFixed(2)}  vs RECEPCION débito = ${ledger.recepciones_debito?.toFixed(2)}  → dif=${(agg.purchase?.valor_pos - ledger.recepciones_debito).toFixed(2)}`);
console.log(`  sale(movs) Σ |q|×uc        = ${agg.sale?.valor_abs.toFixed(2)}  vs COGS crédito     = ${ledger.cogs_credito?.toFixed(2)}  → dif=${(agg.sale?.valor_abs - ledger.cogs_credito).toFixed(2)}`);
console.log(`  issue_slip_out Σ |q|×uc    = ${agg.issue_slip_out?.valor_abs.toFixed(2)}  vs VALES crédito     = ${ledger.vales_credito?.toFixed(2)}  → dif=${(agg.issue_slip_out?.valor_abs - ledger.vales_credito).toFixed(2)}`);
console.log(`  return Σ q×uc              = ${agg.return?.valor_pos.toFixed(2)}  vs DEVOL débito     = ${ledger.devol_debito?.toFixed(2)}  → dif=${(agg.return?.valor_pos - ledger.devol_debito).toFixed(2)}`);
console.log(`  adjustment Σ (−q)×uc       = ${agg.adjustment?.valor_neg.toFixed(2)}  vs AJUSTE crédito    = ${ledger.ajuste_credito?.toFixed(2)}  → dif=${(agg.adjustment?.valor_neg - ledger.ajuste_credito).toFixed(2)}`);
console.log(`  purchase_reverse Σ |q|×uc  = ${agg.purchase_reverse?.valor_abs.toFixed(2)}  vs ANULACIÓN créd.  = ${ledger.anulacion_credito?.toFixed(2)}  → dif=${(agg.purchase_reverse?.valor_abs - ledger.anulacion_credito).toFixed(2)}`);
console.log(`  sale_reverse Σ q×uc        = ${agg.sale_reverse?.valor_pos.toFixed(2)}  | sale_void Σ q×uc  = ${agg.sale_void?.valor_pos.toFixed(2)}  | issue_slip_reverse = ${agg.issue_slip_reverse?.valor_pos.toFixed(2)}`);
// saldo de movimientos (valor neto) vs saldo contable
const saldoMovs = await q(`SELECT sum(quantity_change * unit_cost)::float8 AS v FROM public.stock_movements`);
console.log(`\n  Σ(quantity_change × unit_cost) TODOS los movimientos = ${saldoMovs[0].v.toFixed(2)} vs saldo contable = ${saldoFinal.toFixed(2)} → dif=${(saldoMovs[0].v - saldoFinal).toFixed(2)}`);

// ═══ 3. CONTEOS FÍSICOS (para Fase V.C) ═════════════════════════════════════
console.log('\n── Conteos físicos registrados (Fase V.C) ──');
const conteos = await q(`SELECT count(*)::int AS n FROM public.physical_counts`);
console.log(`  physical_counts filas: ${conteos[0].n}`);
if (conteos[0].n > 0) {
  const pcs = await q(`SELECT pc.id::text, pc.store_id, s.name, pc.status, pc.count_date::text, pc.created_at::text,
    (SELECT count(*) FROM public.physical_count_items WHERE count_id=pc.id)::int AS items
    FROM public.physical_counts pc LEFT JOIN public.stores s ON s.id=pc.store_id ORDER BY pc.count_date DESC LIMIT 20`);
  for (const p of pcs) console.log(`    ${p.name}: ${p.count_date} status=${p.status} items=${p.items}`);
}
const pinv = await q(`SELECT count(*)::int AS n FROM public.physical_inventories`);
console.log(`  physical_inventories filas: ${pinv[0].n}`);
if (pinv[0].n > 0) {
  const pis = await q(`SELECT id::text, status, created_at::text FROM public.physical_inventories ORDER BY created_at DESC LIMIT 10`);
  for (const p of pis) console.log(`    ${p.id.slice(0,8)} status=${p.status} ${p.created_at?.slice(0,10)}`);
}

// ═══ 4. Evidencia ════════════════════════════════════════════════════════════
writeFileSync(resolve('docs/audits/inventory-traceability-20261115/m031-fase4-mayor.json'), JSON.stringify({
  generado: new Date().toISOString(), mision: 'CP-INVENTORY-TRACEABILITY-RECONCILIATION-001',
  fase: 'IV — mayor ACT_INVENTARIO',
  saldo_inicial: saldoInicial[0].n, debitos, creditos, saldo_contable_final: saldoFinal,
  por_tipo: porTipo, por_tienda: porTienda, serie_mensual: serie, recepciones_por_documento: porDoc,
  identidades_valor: {
    purchase_vs_recepciones: { movimientos: agg.purchase?.valor_pos, ledger: ledger.recepciones_debito },
    sale_vs_cogs: { movimientos: agg.sale?.valor_abs, ledger: ledger.cogs_credito },
    vales_vs_gastos: { movimientos: agg.issue_slip_out?.valor_abs, ledger: ledger.vales_credito },
    return_vs_devoluciones: { movimientos: agg.return?.valor_pos, ledger: ledger.devol_debito },
    adjustment_vs_ajuste: { movimientos: agg.adjustment?.valor_neg, ledger: ledger.ajuste_credito },
    purchase_reverse_vs_anulacion: { movimientos: agg.purchase_reverse?.valor_abs, ledger: ledger.anulacion_credito },
    sale_reverse: agg.sale_reverse?.valor_pos, sale_void: agg.sale_void?.valor_pos,
    issue_slip_reverse: agg.issue_slip_reverse?.valor_pos,
    saldo_movimientos_valor: saldoMovs[0].v,
  },
  dimension_producto_fin_movements: 'NULL en 1000/1000 — reconstrucción indirecta obligatoria (misión §6)',
  conteos_fisicos: { physical_counts: conteos[0].n, physical_inventories: pinv[0].n },
}, null, 2));
console.log('\nevidencia → docs/audits/inventory-traceability-20261115/m031-fase4-mayor.json');
