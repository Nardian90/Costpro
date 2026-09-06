#!/usr/bin/env node
/**
 * B-10b-OBS-2 · Generador de CSVs del evidence pack (solo lee raw/*.json de la investigación)
 * Uso: node scripts/gen_csvs.js   (cwd = raíz del pack)
 */
const fs = require('fs');
const path = require('path');
const P = __dirname; // pack root (script vive en pack/scripts)
const raw = f => JSON.parse(fs.readFileSync(path.join(P, '..', 'raw', f), 'utf8'));
const ev = (f, key = 'evidence') => {
  const j = raw(f);
  return Array.isArray(j) ? j[0][key] : j[key];
};
const csvCell = v => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const writeCsv = (name, header, rows) => {
  const out = [header.join(',')].concat(rows.map(r => r.map(csvCell).join(','))).join('\n') + '\n';
  fs.writeFileSync(path.join(P, '..', name), out);
  console.log(`${name}: ${rows.length} filas`);
};

// ── 02-store-universe.csv ─────────────────────────────────────────────
const u = ev('g1c_universe.json');
const universeRows = [
  ['store_id', 'TIENDA CENTRAL COSTPRO', 'id ' + u.store.id + ' tenant ' + u.store.tenant_id + ' creada ' + u.store.created_at, 'g1c'],
  ['U products_total', u.products_total, 'productos de la tienda', 'g1c'],
  ['U1 stock_gt0_count', u.u1_stock_gt0_count, 'productos con stock_current>0', 'g1c'],
  ['U1 stock_gt0_units', u.u1_stock_gt0_units, 'unidades declaradas sin ledger', 'g1c'],
  ['U1 stock_gt0_active', u.u1_stock_gt0_active, 'todos ACTIVE', 'g1c'],
  ['U1 stock_eq0', u.u1_stock_eq0, 'stock 0', 'g1c'],
  ['U1 stock_lt0', u.u1_stock_lt0, 'stock negativo', 'g1c'],
  ['U2 inventory_rows', u.u2_inventory_rows, 'INEXISTENTE', 'g1c'],
  ['U3 stock_movements', u.u3_stock_movements, 'INEXISTENTE', 'g1c'],
  ['U4 kardex_entries', u.u4_kardex_entries, 'INEXISTENTE', 'g1c'],
  ['U5 transactions', u.u5_transactions, 'INEXISTENTE', 'g1c'],
  ['U5 transaction_items', u.u5_transaction_items, 'INEXISTENTE', 'g1c'],
  ['U5 devolutions', u.u5_devolutions, 'SOBREVIVIERON al purge (13)', 'g1c'],
  ['U6 receipts', u.u6_receipts, 'INEXISTENTE', 'g1c'],
  ['U6 purchase_orders', u.u6_purchase_orders, 'INEXISTENTE', 'g1c'],
  ['U7 production_orders', u.u7_production_orders, 'INEXISTENTE', 'g1c'],
  ['U8 adjustments', u.u8_adjustments, '3 "Hot test adj" 08-06 (test)', 'g1c'],
  ['U8 physical_counts', u.u8_physical_counts, 'INEXISTENTE', 'g1c'],
  ['U9 transfers_origin', u.u9_transfers_origin, 'INEXISTENTE', 'g1c'],
  ['U9 transfers_dest', u.u9_transfers_dest, 'INEXISTENTE', 'g1c'],
  ['extra lots', u.lots, '0', 'g1c'],
  ['extra batches', u.batches, '0', 'g1c'],
  ['extra inventory_snapshots', u.inventory_snapshots, '0', 'g1c'],
  ['extra store_reset_snapshots', u.store_reset_snapshots, 'NINGUNO (global=0)', 'g1c'],
  ['extra audit_logs_store', u.audit_logs_store, 'sobrevivieron al purge', 'g1c'],
  ['extra audit_events_store', u.audit_events_store, '0', 'g1c'],
  ['extra warehouses', u.warehouses, 'sobrevivieron', 'g1c'],
  ['matrix with_inventory', u.u1_matrix.with_inventory, 'de los 108, productos CON inventory', 'g1c'],
  ['matrix with_movements', u.u1_matrix.with_movements, 'de los 108, CON movements', 'g1c'],
  ['matrix with_kardex', u.u1_matrix.with_kardex, 'de los 108, CON kardex', 'g1c'],
  ['matrix with_transactions', u.u1_matrix.with_transactions, 'de los 108, CON transacciones', 'g1c'],
  ['matrix with_receipts', u.u1_matrix.with_receipts, 'de los 108, CON recepciones', 'g1c'],
  ['matrix with_production', u.u1_matrix.with_production, 'de los 108, CON producción', 'g1c'],
  ['matrix with_adjustments', u.u1_matrix.with_adjustments, 'de los 108, CON ajustes', 'g1c'],
  ['matrix with_transfers', u.u1_matrix.with_transfers, 'de los 108, CON transferencias', 'g1c'],
  ['matrix with_physcounts', u.u1_matrix.with_physcounts, 'de los 108, CON conteos físicos', 'g1c'],
  ['matrix with_quotations', u.u1_matrix.with_quotations, 'de los 108, CON cotizaciones', 'g1c'],
  ['has_movements_flag gt0', JSON.stringify(u.u1_by_has_movements), 'los 108 tienen flag true con 0 movimientos reales', 'g1c'],
];
writeCsv('02-store-universe.csv', ['capa', 'valor', 'nota', 'fuente_raw'], universeRows);

// ── 03-product-snapshot.csv (GATE 2: 124 filas) ───────────────────────
const snap = raw('g2_snapshot.json');
const snapRows = (Array.isArray(snap) ? snap : snap.evidence).map(r => [
  r.id, r.sku, r.name, r.store_id, r.stock_current, r.cost_average,
  r.created_at, r.updated_at, r.status, r.is_active, r.has_movements,
  r.min_stock, r.price, r.cost_price,
  r.inventory_quantity === null ? 'MISSING' : r.inventory_quantity,
  r.inventory_updated_at || '', r.movements_cnt, r.kardex_cnt, r.sale_items_cnt,
]);
writeCsv('03-product-snapshot.csv',
  ['product_id','sku','name','store_id','stock_current','cost_average','created_at','updated_at','status','is_active','has_movements','min_stock','price','cost_price','inventory_quantity','inventory_updated_at','movements_cnt','kardex_cnt','sale_items_cnt'],
  snapRows);

// ── 04-temporal-analysis.csv ──────────────────────────────────────────
const t = ev('g3_temporal.json');
const t5 = ev('g5_reset_restore.json');
const rows04 = [];
rows04.push(['evento', '2026-07-16T12:00:00Z', 'movement_date/updated_at FIJOS de mediodía en datos importados (firma seed externo)', 'g10 sm_date_range min / g5 burst']);
rows04.push(['evento', '2026-07-30T03:00:03Z', 'IMPORT masivo: 114 products creados en 29s (created_at 03:00:03-03:00:32)', 'g3 products_by_created_day + g10 prod_created_range']);
rows04.push(['evento', '2026-07-30T03:00:32Z', 'primer audit_log de la tienda + burst 66 products updated_at EXACTO en ese segundo', 'g3/g5']);
t.products_by_created_day.forEach(d => rows04.push(['products_created', d.day, d.n, 'g3']));
t5.products_updated_by_day.forEach(d => rows04.push(['products_updated', d.day, d.n, 'g5']));
t.audit_logs_by_day.forEach(d => rows04.push(['audit_logs', d.day, d.n, 'g3']));
rows04.push(['evento', '2026-08-02T02:25:31Z', 'STORE_BACKUP_EXPORT de d1c4ba0e (payload 650KB, ledger consistente 114/114/242/242/20)', 'g9 meta']);
rows04.push(['evento', '2026-08-02T02:40:25Z', 'restore DRY_RUN (preview) con ese payload — única sesión; NUNCA ejecutada', 'g9 sessions']);
rows04.push(['evento', '2026-08-06/07', 'sesión de pruebas: 13 devoluciones, 3 Hot test adj, 10 productos Test creados', 'g3']);
rows04.push(['evento', '2026-08-09..08-11', 'resets AUDITADOS (keep_catalog=false) de OTRA tienda 5e6fe821 ×7', 'g9 audit_store_reset_events']);
rows04.push(['evento', '2026-08-16T22:01Z', 'última modificación de products de la tienda (5 productos)', 'g5 products_updated_by_day']);
rows04.push(['evento', '2026-08-16T23:15Z', 'reset AUDITADO de OTRA tienda 43a4dabc (keep_catalog=false)', 'g9']);
rows04.push(['evento', '2026-08-17T02:36-37Z', 'autovacuum receipts/receipt_items tras borrado masivo (del=80/2433) → ventana del PURGE', 'g11 pg_stat']);
rows04.push(['evento', '2026-08-17T02:48:46Z', 'último audit_log de la tienda — después: silencio total', 'g3 audit_logs_range']);
rows04.push(['evento', 'post-08-17', 'PURGE SQL directo store-scoped: inventory/movements/kardex/transactions/items/receipts/transfers/payments borrados; products+stock_current/devolutions/audit/warehouses/commission_rules PRESERVADOS', 'g13 survival + pg_stat']);
rows04.push(['evento', '2026-08-20', 'migración repo 20260820000004 (sync global stock=inventory) NO tocó estos productos (updated_at ≤ 08-16)', 'g5 + código']);
rows04.push(['evento', '2026-09-05', 'OBS-1 documenta la tienda huérfana como SEPARATE_FINDING', 'OBS-1/16-final-verdict.md']);
writeCsv('04-temporal-analysis.csv', ['tipo', 'momento_utc', 'detalle', 'fuente'], rows04);

// ── 07-ledger-reconstruction.csv + 08-origin-analysis.csv ─────────────
const pl = ev('g10_payload.json');
const per = pl.per_product || [];
const notIn = pl.today_products_not_in_backup || [];
const byId = {};
snapRows.forEach(r => { byId[r[0]] = r; });
const rows07 = [], rows08 = [];
per.forEach(r => {
  const fullId = (byId[r.id] ? byId[r.id][0] : r.id);
  const today = byId[r.id];
  const stock = today ? today[4] : r.t_stock;
  const cls07 = Number(stock) > 0 ? 'MISSING_LEDGER' : 'NO_STOCK';
  rows07.push([fullId, r.sku, r.name, stock, '', '0', Number(stock) - 0,
    (r.stock_frozen ? 'backup_20260802_payload(exacto)' : 'backup+ops_post_08-02(parcial)'),
    cls07, r.stock_frozen ? 'MATCH_BACKUP' : 'LEDGER_CONFLICT_POST_BACKUP']);
  rows08.push([fullId, r.sku, r.name, stock,
    r.stock_frozen ? 'bulk_import_20260730_ledger_backfill' : 'bulk_import_20260730 + ops_post_08-02',
    r.b_stock, r.b_inv, r.stock_frozen ? 'FROZEN_FROM_BACKUP' : 'MUTATED_POST_BACKUP',
    Number(stock) > 0 ? 'REAL_STOCK_SUPPORTED' : 'NO_STOCK',
    r.stock_frozen ? 'stock_current == backup.products.stock_current == backup.inventory.quantity' : 'delta post-08-02 no reconstruible (audit sin items)']);
});
notIn.forEach(r => {
  const fullId = (byId[r.id] ? byId[r.id][0] : r.id);
  rows07.push([fullId, r.sku, r.name, r.t_stock, '', '0', r.t_stock, 'ninguno', 'MISSING_LEDGER', 'UNKNOWN_ORIGIN']);
  rows08.push([fullId, r.sku, r.name, r.t_stock, 'test_scripts_20260807', '', '', 'TEST_PRODUCT_POST_BACKUP', 'TEST_DATA',
    'creados por seed/test scripts con stock directo service_role (ver 05-stock-writers.md §TEST)']);
});
writeCsv('07-ledger-reconstruction.csv',
  ['product_id','sku','name','stock_current','inventory_qty','ledger_qty','difference','evidence_source','classification','match_status'],
  rows07);
writeCsv('08-origin-analysis.csv',
  ['product_id','sku','name','stock_current','origin','backup_stock_0802','backup_inventory_0802','origin_class','stock_reality','evidence'],
  rows08);

// ── 09-audit-analysis.csv ─────────────────────────────────────────────
const rows09 = [];
t.audit_logs_by_day.forEach(d => rows09.push(['store_audit_by_day', d.day, '', d.n]));
t.audit_logs_by_table.forEach(x => rows09.push(['store_audit_by_table', '', x.table_name, x.n]));
t.audit_logs_by_action.forEach(x => rows09.push(['store_audit_by_action', '', x.action, x.n]));
const g5 = ev('g5_reset_restore.json');
(g5.audit_reset_restore_global || []).forEach(a =>
  rows09.push(['global_reset_restore_event', a.created_at, a.action + ' store=' + (a.store_id ? String(a.store_id).slice(0,8) : 'null') + ' user=' + String(a.user_id).slice(0,8), 1]));
writeCsv('09-audit-analysis.csv', ['seccion', 'momento_o_dia', 'clave', 'conteo'], rows09);

// ── 10-global-orphan-scan.csv ─────────────────────────────────────────
const g13 = ev('g13_residual.json');
const anom = g13.global_anomalies || [];
writeCsv('10-global-orphan-scan.csv',
  ['store_id','product_id','sku','name','stock_current','inventory_qty','movs_sum','movs_n','classification'],
  anom.map(r => [r.store, r.product, r.sku, r.name, r.stock, r.inv_qty < 0 ? 'MISSING' : r.inv_qty, r.movs_sum, r.movs_n, r.cls]));

// ── 12-economic-impact.csv ────────────────────────────────────────────
const originMap = {};
rows08.forEach(r => { originMap[r[0]] = r; });
const rows12 = [];
let totalVal = 0, totalUnits = 0;
snapRows.forEach(r => {
  const stock = Number(r[4]);
  if (stock <= 0) return;
  const cost = r[5] === '' || r[5] === null ? 0 : Number(r[5]);
  const val = stock * cost;
  totalVal += val; totalUnits += stock;
  const o = originMap[r[0]] || {};
  rows12.push([r[0], r[1], r[2], stock, cost, val.toFixed(2), 'ESTIMATED',
    o[7] || '', 'cost_average(WAC) del sistema al corte; sin cost_at_sale/purchase_cost verificable por unidad']);
});
writeCsv('12-economic-impact.csv',
  ['product_id','sku','name','units_orphan','cost_average','estimated_value','valuation_label','origin_class','cost_evidence'],
  rows12);
console.log(`12-economic-impact.csv TOTAL: ${totalUnits} u, valor estimado ${totalVal.toFixed(2)} (ESTIMATED)`);

// Cross-checks duros
const orphans07 = rows07.filter(r => r[8] === 'MISSING_LEDGER').length;
console.log(`CHECK: MISSING_LEDGER rows = ${orphans07} (esperado 108)`);
const frozen = per.filter(r => r.stock_frozen).length;
console.log(`CHECK: frozen vs backup = ${frozen}/114; backup stock sum=${pl.prod_stock_sum} inv sum=${pl.inv_qty_sum} sm sum=${pl.sm_sum}`);
