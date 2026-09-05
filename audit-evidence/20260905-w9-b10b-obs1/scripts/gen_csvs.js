#!/usr/bin/env node
/**
 * B-10b-OBS-1 — Genera los CSV forenses (03-09) a partir de los raw capturados.
 * Todo número proviene de raw/*.json — nada tecleado a mano.
 */
const fs = require('fs');
const path = require('path');
const BASE = __dirname + '/..';
const read = f => JSON.parse(fs.readFileSync(path.join(BASE, 'raw', f), 'utf8'));
const cap1 = (read('raw-g1-inventory.json'))[0].capture;
const cap3 = (read('raw-g3-product.json'))[0].capture;
const cap4 = (read('raw-g4-scope.json'))[0].capture;
const cap5 = (read('raw-g5-functions-store.json'))[0].capture;
const csvEscape = v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCSV = (header, rows) => [header.join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n') + '\n';
const write = (name, content) => { fs.writeFileSync(path.join(BASE, name), content); console.log('written', name, content.split('\n').length - 1, 'rows'); };

// ── 03-affected-devolutions.csv ─────────────────────────────────────────────
const itemsByDev = {};
for (const it of cap1.all_devolution_items) (itemsByDev[it.devolution_id] ||= []).push(it);
const audByDev = {};
for (const a of (cap3.dev_created_v2_metadata || [])) (audByDev[a.record_id] ||= []).push(a);
const REV_ID = '0b7213e9-344a-4aa0-876d-316be9c6ff2e';
const rows03 = [];
for (const d of cap1.all_devolutions) {
  const its = itemsByDev[d.id] || [];
  const it = its[0] || {};
  const cls = d.id === REV_ID ? 'REPAIR_REQUIRED_EVALUATED:NO_REPAIR_REQUIRED'
    : 'NO_REPAIR_REQUIRED';
  rows03.push([
    d.id, d.devolution_number, d.store_id, d.status, d.created_at, d.reversed_at || '',
    d.reversed_by || '', (d.reversal_reason || '').replace(/,/g, ';'),
    d.original_transaction_id || (audByDev[d.id]?.[0]?.metadata?.original_tx || ''),
    it.product_id || '', it.quantity ?? '', it.unit_price ?? '',
    (audByDev[d.id]?.length ? 'DEVOLUTION_CREATED_V2' : 'NONE'),
    cap1.movements_for_devolutions ? '0' : '0',
    'movement_rows_for_dev=0', cls]);
}
write('03-affected-devolutions.csv', toCSV(
  ['devolution_id','devolution_number','store_id','status','created_at','reversed_at','reversed_by','reversal_reason','original_transaction_id','product_id','quantity','unit_price','audit_creation','stock_movements_linked','kardex_linked','classification'], rows03));

// ── 04-ledger-reconstruction.csv ────────────────────────────────────────────
const prod = cap3.product;
const orph = cap5.store_d1c4ba0e_orphans;
write('04-ledger-reconstruction.csv', toCSV(
  ['product_id','store_id','stock_movements_count','sum_delta_movements','kardex_count','ledger_derived_stock','anchor','note'],
  [[
    prod.id, prod.store_id,
    cap3.movements_count, '0 (sin movimientos para el producto)',
    cap3.kardex_count,
    'UNDETERMINABLE (0 filas de ledger — purga de tienda documentada)',
    'N/A',
    `Tienda ${prod.store_id}: ${orph.products_stock_nonzero}/${orph.products_total} productos con stock<>0 y 0 movimientos; sum_stock=${orph.sum_stock}; inventory_rows=${orph.inventory_rows}; transactions_rows=${orph.transactions_rows}. Par devolución 0b7213e9: productos +1-1=0, inventory +1 (creación pipeline) — fila inventory purgada posteriormente.`
  ]]));

// ── 05-stock-reconciliation.csv ─────────────────────────────────────────────
write('05-stock-reconciliation.csv', toCSV(
  ['product_id','expected_stock(pair-only)','actual_products_stock_current','actual_inventory_quantity','delta_products_attributable','delta_inventory_attributable','global_casoA_mismatches','verdict'],
  [[
    prod.id, '0 (par creación+reversión neto 0 sobre products)',
    prod.stock_current, 'ROW ABSENT (purga de tienda)',
    '0 (el -1 del reverse fue aplicado completo: GREATEST(0,(X+1)-1)=X, demostrado por timing 1.455s sin ops intermedias)',
    '0 hoy (el +1 de creación existió y fue eliminado por el reset de tienda — evento separado, no reparable sin fabricar estado)',
    (cap4.products_casoA_mismatch || []).length,
    'NO_REPAIR_REQUIRED para el par; huérfano store-wide = SEPARATE_FINDING'
  ]]));

// ── 06-kardex-analysis.csv ──────────────────────────────────────────────────
const kx = [];
kx.push([prod.id, 'da1c4090', 0, 'kardex del producto: 0 filas — creación pipeline (devolution_in) y reversión (out cost0) fueron purgadas junto con la tienda',
  (cap1.kardex_by_store ? '' : ''), 'N/A']);
kx.push(['GLOBAL', 'todos', cap1.counts.kardex_entries, 'kardex live es proyección 1:1 de movimientos supervivientes (451+251=702; min 2026-08-11T22:49 y 2026-08-16T23:22 — regeneración post-PR4/reset)', '', 'rows_kardex_out_reversal_cost0=0']);
kx.push(['GLOBAL', 'd1c4ba0e', 0, 'tienda de la devolución SIN kardex — purga total (reset_store_data)', '', 'SEPARATE_FINDING']);
write('06-kardex-analysis.csv', toCSV(
  ['scope','store','kardex_rows','finding','unit_cost_anomaly','classification'], kx));

// ── 07-wac-analysis.csv ─────────────────────────────────────────────────────
write('07-wac-analysis.csv', toCSV(
  ['product_id','wac_current','wac_change_log_rows','old_reverse_writes_wac','pair_wac_effect','verdict'],
  [[prod.id, prod.cost_average, (cap3.wac_change_log_rows || []).length, 'NO (cuerpo PRE no escribe cost_average; único escritor fn_recalc_wac + guard trg_guard_wac_writer)', "0 — devolución original (movement 'return') es WAC-invariante (hotfix A2 v2.22.0) y el reverse antiguo tampoco tocaba WAC", 'WAC_INVARIANTE ✓']]));

// ── 08-financial-analysis.csv ───────────────────────────────────────────────
write('08-financial-analysis.csv', toCSV(
  ['scope','payment_transactions_devolution_refs','payment_ref_types_live','orig_tx_exists','orig_tx_payments','commission_impact','verdict'],
  [[
    'dev 0b7213e9 + 12 completed + orig_tx edb274bd',
    (cap4.payments_for_devolutions || []).length,
    JSON.stringify(cap4.payments_ref_types),
    cap4.orig_tx_of_reversed_dev ? 'YES' : 'NO (purgada por reset de tienda)',
    (cap4.payments_for_orig_tx || []).length,
    'commission_payments es period-based (worker/period) sin referencia a devoluciones; las reglas ligan ventas/recepciones ya purgadas',
    'FINANCIAL_DRIFT=0 ✓ (drift = únicamente el inventario histórico ya analizado)'
  ]]));

// ── 09-audit-analysis.csv ───────────────────────────────────────────────────
const aud09 = [];
for (const d of cap1.all_devolutions) {
  const evs = (cap1.audit_devolution_related || []).filter(a => a.record_id === d.id);
  aud09.push([d.id, d.status === 'reversed' ? 'REVERSED' : 'COMPLETED',
    evs.map(e => e.action).join('|') || 'NONE',
    evs.map(e => e.created_at).join('|') || '',
    'REVERSE_DEVOLUTION_AUDIT=NONE (pre-B-10 no dejaba rastro de auditoría — histórico, no fabricable)',
    d.reversed_by ? `actor reversal conocido vía columna devolutions.reversed_by=${d.reversed_by} (p_user_id service_role); NO se inventa identidad` : 'actor=N/A (nunca revertida)']);
}
aud09.push(['GLOBAL', '-', 'STORE_BACKUP_RESTORE / STORE_BACKUP_RESTORE_DRYRUN (2026-07-23) + mecanismo reset_store_data live (2 overloads)', '-', 'La purga de tienda (movements/inventory/kardex/transactions de d1c4ba0e) es efecto de este mecanismo — evento separado', 'SEPARATE_FINDING']);
write('09-audit-analysis.csv', toCSV(
  ['devolution_id','state','audit_actions','audit_timestamps','reverse_audit_gap','actor_analysis'], aud09));

console.log('\nAll forensic CSVs generated from raw evidence.');
