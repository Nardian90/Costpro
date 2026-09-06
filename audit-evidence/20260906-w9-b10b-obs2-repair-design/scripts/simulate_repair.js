#!/usr/bin/env node
/**
 * W9.5 B-10b-OBS-2 REPAIR DESIGN — GATE 15 · Full in-memory simulation
 * Emulates the canonical pipeline EXACTLY as the DB triggers/RPC define it
 * (sources: raw/g5_funcdefs.json, raw/g5_triggerfns.json — frozen):
 *
 *   register_stock_movement(p_product_id, p_store_id, p_quantity, 'initial',
 *     p_reason=<reference_doc>, p_user_id, p_unit_cost=<cost_average>,
 *     p_operation_date=<execution ts>)
 *     → INSERT stock_movements
 *     → BEFORE tr_sync_inventory_after_movement → fn_sync_inventory_on_movement:
 *         inventory absent + q>0 → INSERT inventory(quantity=q), balance_after=q
 *     → AFTER trg_auto_kardex → kardex 'in' (qty=|q|, uc, total=q*uc,
 *         balance_quantity=products.stock_current@trigger-time,
 *         balance_unit_cost=products.cost_average)
 *     → AFTER trg_sync_product_stock → products.stock_current = latest balance_after
 *     → RPC body: UPDATE products SET stock_current = balance_after (absolute)
 *     → INSERT business_events('stock_movement', payload{qty,type,new_qty})
 *   NOTE: WAC is NOT recalculated inside register_stock_movement (A2 hotfix);
 *   blend D-01 invariance is proven separately (uc == ca_prev ⇒ ca_new == ca_prev).
 *
 * NO DB ACCESS — pure in-memory.
 */
const fs = require('fs');
const path = require('path');
const PACK = '/home/z/my-project/Costpro/audit-evidence/20260906-w9-b10b-obs2-repair-design';

const frozen = JSON.parse(fs.readFileSync(path.join(PACK, 'raw/frozen_universe.json'), 'utf8'));
const { store, backup_ts, summary, rows } = frozen;

const EXEC_TS = '2026-09-07T00:00:00Z(SIMULATED)'; // execution uses real now()
const BATCH_ID = 'B10B-OBS2-RECON-OPENING:20260907T000000Z-SIM1';
const USER_ID = '051c6157-600b-425e-b8c0-72388bacf541 (ADMIN_SIGNER_PLACEHOLDER)';

// in-memory DB state (scoped to store)
const db = {
  products: new Map(rows.map(r => [r.product_id, {
    id: r.product_id, sku: r.sku, name: r.name,
    stock_current: r.current_stock, cost_average: r.wac, updated_at: r.updated_at,
    set: r.set, confidence: r.confidence, proposed: r.proposed_repair_qty,
  }])),
  inventory: new Map(),      // product_id -> {quantity, version}
  stock_movements: [],       // rows
  kardex_entries: [],
  business_events: [],
  audit_logs: [],
  wac_change_log: [],
  referenceDocs: new Set(),  // idempotency barrier
};

const EPS = 1e-9;
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= EPS;

function assertPreconditions() {
  const errors = [];
  // universe checks (GATE 12 validate step)
  if (db.inventory.size !== 0) errors.push('PRE_FAIL inventory not empty');
  if (db.stock_movements.length !== 0) errors.push('PRE_FAIL movements not empty');
  if (db.kardex_entries.length !== 0) errors.push('PRE_FAIL kardex not empty');
  // per-product expected values from frozen design
  for (const r of rows) {
    const p = db.products.get(r.product_id);
    if (!p) { errors.push(`PRE_FAIL missing product ${r.sku}`); continue; }
    if (Math.abs(p.stock_current - r.current_stock) > EPS) errors.push(`PRE_FAIL stock drift ${r.sku}: ${p.stock_current} != ${r.current_stock}`);
    if (r.wac !== null && Math.abs(p.cost_average - r.wac) > EPS) errors.push(`PRE_FAIL WAC drift ${r.sku}`);
  }
  // idempotency barrier
  for (const doc of db.referenceDocs) if (doc.startsWith('B10B-OBS2-RECON-OPENING:')) errors.push(`PRE_FAIL idempotency barrier: ${doc} already applied`);
  return errors;
}

function registerStockMovement(r, execTs, batchDoc) {
  const p = db.products.get(r.product_id);
  if (!p) throw new Error(`ERR_PRODUCT_NOT_FOUND ${r.sku}`);
  const Q = r.proposed_repair_qty;
  if (!Number.isFinite(Q) || Q <= 0) return { skipped: true };
  // fn_sync_inventory_on_movement (BEFORE)
  let inv = db.inventory.get(r.product_id);
  let balanceAfter;
  if (!inv) {
    if (Q < 0) throw new Error(`ERR_INSUFFICIENT_STOCK ${r.sku}`);
    inv = { quantity: Q, version: 1 };
    db.inventory.set(r.product_id, inv);
    balanceAfter = Q;
  } else {
    inv.quantity += Q; inv.version += 1;
    if (inv.quantity < 0) throw new Error(`ERR_INSUFFICIENT_STOCK ${r.sku}`);
    balanceAfter = inv.quantity;
  }
  // movement row (balance_after set by BEFORE trigger)
  const mv = {
    product_id: r.product_id, store_id: store, quantity_change: Q,
    movement_type: 'initial', reference_id: null, reference_doc: batchDoc,
    unit_cost: r.wac, movement_date: execTs, created_by: USER_ID, balance_after: balanceAfter,
  };
  db.stock_movements.push(mv);
  // AFTER trg_auto_kardex (fires BEFORE register_stock_movement's own UPDATE;
  // reads products.stock_current at trigger time)
  db.kardex_entries.push({
    product_id: r.product_id, store_id: store, movement_type: 'in',
    quantity: Math.abs(Q), unit_cost: r.wac, total_value: Q * r.wac,
    balance_quantity: p.stock_current, balance_unit_cost: p.cost_average,
    balance_total_value: p.stock_current * p.cost_average,
    reference_type: 'stock_movement', reference_description: batchDoc,
  });
  // AFTER trg_sync_product_stock → stock_current = latest balance_after
  p.stock_current = balanceAfter;
  // RPC body UPDATE products SET stock_current = v_new_qty (absolute, same value)
  p.updated_at = execTs;
  // business_events
  db.business_events.push({ event_type: 'stock_movement', entity_id: r.product_id, payload: { store_id: store, qty: Q, type: 'initial', new_qty: balanceAfter } });
  db.referenceDocs.add(batchDoc);
  return { skipped: false, balanceAfter };
}

function runRepair(batchDoc) {
  const results = [];
  for (const r of rows) {
    if (r.proposed_repair_qty > 0) results.push({ sku: r.sku, ...registerStockMovement(r, EXEC_TS, batchDoc) });
  }
  return results;
}

// ============ RUN 1 ============
let preErrors = assertPreconditions();
if (preErrors.length) { console.error('PRECONDITION FAILURES:', preErrors); process.exit(1); }
console.log('PRE: universe validated (124 products frozen; ledger empty; barrier clear)');
const run1 = runRepair(BATCH_ID);
console.log(`RUN1: ${run1.filter(x => !x.skipped).length} opening movements applied`);

// batch audit row (explicit, canonical columns)
db.audit_logs.push({
  user_id: USER_ID, action: 'STOCK_RECONCILIATION_OPENING', table_name: 'stock_movements',
  record_id: null, store_id: store,
  metadata: { batch_id: BATCH_ID, products: summary.repair_products, units: summary.repair_units,
    estimated_value: summary.repair_value, evidence_pack: '20260906-w9-b10b-obs2-repair-design',
    backup_ts, position_date: '2026-08-16T22:01:13Z (last BE / last products write)' },
});

// ============ RUN 2 (idempotency demonstration) ============
const preErrors2 = assertPreconditions();
const run2Rejected = preErrors2.filter(e => e.startsWith('PRE_FAIL idempotency'));

// ============ POST invariants (GATE 13) ============
const inv = [];
for (const r of rows.filter(r => r.proposed_repair_qty > 0)) {
  const p = db.products.get(r.product_id);
  const i = db.inventory.get(r.product_id);
  const mvs = db.stock_movements.filter(m => m.product_id === r.product_id);
  const sumQ = mvs.reduce((s, m) => s + m.quantity_change, 0);
  const kdx = db.kardex_entries.filter(k => k.product_id === r.product_id);
  if (close(i.quantity, p.stock_current) && close(sumQ, p.stock_current) && mvs.length === 1) { /* ok */ }
  else inv.push(`I1_FAIL ${r.sku}: inv=${i.quantity} stock=${p.stock_current} sum=${sumQ} mvts=${mvs.length}`);
  if (kdx.length !== mvs.length) inv.push(`I2_FAIL ${r.sku}: kardex=${kdx.length} mvts=${mvs.length}`);
  if (!close(p.cost_average, r.wac)) inv.push(`I3_FAIL ${r.sku}: WAC changed`);
  const k = kdx[0];
  if (!close(k.balance_quantity, p.stock_current) || !close(k.balance_unit_cost, r.wac))
    inv.push(`I2b_FAIL ${r.sku}: kardex balance inconsistent`);
}
for (const r of rows.filter(r => r.set === 'C' || r.proposed_repair_qty === 0)) {
  if (db.inventory.has(r.product_id)) inv.push(`I6_FAIL ${r.sku}: unexpected inventory`);
  const p = db.products.get(r.product_id);
  if (!close(p.stock_current, r.current_stock)) inv.push(`I6_FAIL ${r.sku}: stock touched`);
}
if (db.wac_change_log.length !== 0) inv.push('I4_FAIL wac_change_log not empty');
if (db.stock_movements.length !== summary.repair_products) inv.push(`I9_FAIL movements ${db.stock_movements.length}`);
if (db.inventory.size !== summary.repair_products) inv.push(`I9_FAIL inventory ${db.inventory.size}`);
if (db.kardex_entries.length !== summary.repair_products) inv.push(`I9_FAIL kardex ${db.kardex_entries.length}`);
if (db.business_events.length !== summary.repair_products) inv.push(`I9_FAIL BE ${db.business_events.length}`);
if (db.audit_logs.length !== 1) inv.push(`I10_FAIL audit rows ${db.audit_logs.length}`);
// store isolation
for (const m of db.stock_movements) if (m.store_id !== store) inv.push('I11_FAIL cross-store movement');

// ============ WAC blend invariance proof (GATE 6) ============
const blendProof = [];
for (const r of rows.filter(r => r.proposed_repair_qty > 0).slice(0, 3)) {
  const S = r.current_stock;      // orphan stock_current (pre-repair, as read by fn_recalc_wac)
  const ca = r.wac, q = r.proposed_repair_qty, uc = r.wac;
  const caNew = (S * ca + q * uc) / (S + q);
  blendProof.push({ sku: r.sku, S, ca, q, uc, ca_new: caNew, invariant: Math.abs(caNew - ca) < 1e-6 });
}

// ============ totals (GATE 15) ============
const repairRows = rows.filter(r => r.proposed_repair_qty > 0);
const totals = {
  TOTAL_BEFORE_DECLARED: summary.orphan_units_current,
  TOTAL_BEFORE_RECOGNIZED_LEDGER: 0,
  TOTAL_REPAIR_UNITS: repairRows.reduce((s, r) => s + r.proposed_repair_qty, 0),
  TOTAL_REPAIR_VALUE_ESTIMATED: repairRows.reduce((s, r) => s + r.proposed_repair_qty * r.wac, 0),
  TOTAL_AFTER_LEDGER_UNITS: [...db.inventory.values()].reduce((s, i) => s + i.quantity, 0),
  TOTAL_AFTER_DECLARED: [...db.products.values()].reduce((s, p) => s + p.stock_current, 0),
  TEST_RESIDUE_EXCLUDED_UNITS: summary.set_c_units,
  TEST_RESIDUE_EXCLUDED_VALUE: rows.filter(r => r.set === 'C').reduce((s, r) => s + r.current_stock * (r.wac || 0), 0),
};

const perProduct = repairRows.map(r => {
  const p = db.products.get(r.product_id);
  return {
    product_id: r.product_id, sku: r.sku, name: r.name, set: r.set, confidence: r.confidence,
    before_qty: r.current_stock, repair_qty: r.proposed_repair_qty, after_qty: p.stock_current,
    before_wac: r.wac, repair_cost: r.wac, after_wac: p.cost_average,
    economic_value: r.proposed_repair_qty * r.wac,
  };
});

const result = {
  simulated_at: EXEC_TS, batch_id: BATCH_ID, user_id: USER_ID,
  pre_validated: true, movements_applied: run1.filter(x => !x.skipped).length,
  idempotency: { second_run_rejected: run2Rejected.length > 0, barrier_signal: run2Rejected[0] || null },
  invariants_violations: inv,
  invariants_pass: inv.length === 0,
  wac_blend_invariance_proof: blendProof,
  totals,
  expected_db_deltas: {
    stock_movements: '+98', inventory: '+98 (0→98 rows)', kardex_entries: '+98',
    business_events: '+98', audit_logs: '+1 (batch row)', wac_change_log: '+0',
    products_rows: '+0 (98 rows: updated_at changes only; stock_current & cost_average UNCHANGED)',
    transactions: '+0', payments: '+0', commissions: '+0', devolutions: '+0', receipts: '+0',
  },
  per_product: perProduct,
};
fs.writeFileSync(path.join(PACK, 'raw/simulation_result.json'), JSON.stringify(result, null, 1));

console.log('=== GATE 15 SIMULATION ===');
console.log('movements applied:', result.movements_applied);
console.log('invariants pass:', result.invariants_pass, inv.length ? inv : '');
console.log('idempotency 2nd run rejected:', result.idempotency.second_run_rejected);
console.log('WAC blend invariance:', blendProof.map(b => `${b.sku}:${b.invariant}`).join(' '));
console.log('TOTALS:', JSON.stringify(totals, null, 1));
