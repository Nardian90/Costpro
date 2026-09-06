#!/usr/bin/env node
/**
 * W9.5 B-10b-OBS-2 REPAIR DESIGN — GATE 2/3/4/7/8
 * Builds the repair universe (sets A/B/C) from frozen evidence:
 *  - raw/g2_universe.json  (fresh DB state, READ ONLY capture)
 *  - ../20260906-w9-b10b-obs2/raw/g10_payload.json (backup 2026-08-02 payload)
 * Outputs:
 *  - 03-repair-universe.csv / 04-post-backup-deltas.csv / 05-test-exclusions.csv
 *  - 06-wac-analysis.csv / 07-proposed-opening.csv
 *  - raw/frozen_universe.json (input for GATE 15 simulator + GATE 20 test)
 * NO DB ACCESS. Pure in-memory computation.
 */
const fs = require('fs');
const path = require('path');

const PACK = '/home/z/my-project/Costpro/audit-evidence/20260906-w9-b10b-obs2-repair-design';
const OLD = '/home/z/my-project/Costpro/audit-evidence/20260906-w9-b10b-obs2';
const STORE = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
const BACKUP_TS = '2026-08-02T02:25:31Z';

const uni = JSON.parse(fs.readFileSync(path.join(PACK, 'raw/g2_universe.json'), 'utf8'))[0].evidence;
const bk = JSON.parse(fs.readFileSync(path.join(OLD, 'raw/g10_payload.json'), 'utf8'))[0].evidence;

const products = uni.products;
const byPrefix = {};
for (const p of products) byPrefix[p.id.slice(0, 8)] = p;

// ---- business events: stock_movement only, ordered per product ----
const beByProduct = {};
for (const b of uni.business_events_for_products) {
  if (b.event_type !== 'stock_movement') continue;
  (beByProduct[b.entity_id] = beByProduct[b.entity_id] || []).push(b);
}
for (const k of Object.keys(beByProduct)) {
  beByProduct[k].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

// ---- backup map ----
const backupByPrefix = {};
for (const r of bk.per_product) backupByPrefix[r.id] = r;

// ---- test ids frozen from OBS-2 pack (07-ledger-reconstruction.csv UNKNOWN_ORIGIN) ----
const TEST_PREFIXES = ['7049d300','aa5e148b','94e53fd4','5bf782be','8f4e2708','185f1c6f','b7bd618c','7dbff68e','e9541bb4','530e198c'];
const isTestPrefix = (id8) => TEST_PREFIXES.includes(id8);

// ---- classify every product ----
const rows = [];
for (const p of products) {
  const id8 = p.id.slice(0, 8);
  const bkRow = backupByPrefix[id8];
  const beEvents = beByProduct[p.id] || [];
  const bePost = beEvents.filter(e => new Date(e.created_at) > new Date(BACKUP_TS));
  const bePostQty = bePost.reduce((s, e) => s + Number(e.payload && e.payload.qty || 0), 0);
  const beLast = beEvents.length ? beEvents[beEvents.length - 1] : null;
  const beLastNewQty = beLast && beLast.payload ? Number(beLast.payload.new_qty) : null;
  const beTypeCounts = {};
  for (const e of bePost) {
    const t = e.payload && e.payload.type || '?';
    beTypeCounts[t] = (beTypeCounts[t] || 0) + 1;
  }
  const cur = Number(p.stock_current);
  const wac = p.cost_average === null || p.cost_average === undefined ? null : Number(p.cost_average);

  let set, confidence, classification;
  if (!bkRow && isTestPrefix(id8)) {
    set = 'C'; confidence = 'CONFIRMED'; classification = 'TEST_RESIDUE';
  } else if (!bkRow) {
    set = 'B'; confidence = 'UNKNOWN'; classification = 'POST_BACKUP_CREATION';
  } else {
    const delta = cur - Number(bkRow.b_inv);
    if (delta === 0) {
      set = 'A'; confidence = 'CONFIRMED'; classification = 'FROZEN_MATCH';
    } else {
      set = 'B';
      const lastMatch = beLastNewQty !== null && Math.abs(beLastNewQty - cur) < 1e-9;
      const qtyMatch = Math.abs(bePostQty - delta) < 1e-9;
      if (qtyMatch && lastMatch) { confidence = 'CONFIRMED'; classification = 'DELTA_CONFIRMED_BY_EVENTS'; }
      else if (bePost.length > 0) { confidence = 'PROBABLE'; classification = 'DELTA_PARTIALLY_SUPPORTED'; }
      else { confidence = 'UNKNOWN'; classification = 'DELTA_UNEXPLAINED'; }
    }
  }
  rows.push({
    product_id: p.id, id8, sku: p.sku, name: p.name,
    set, classification, confidence,
    backup_qty: bkRow ? Number(bkRow.b_inv) : null,
    backup_upd: bkRow ? bkRow.b_upd : null,
    current_stock: cur,
    wac, wac_class: (wac === null || wac === undefined) ? 'WAC_UNKNOWN' : 'WAC_CONFIRMED',
    status: p.status, is_active: p.is_active,
    created_at: p.created_at, updated_at: p.updated_at,
    be_total: beEvents.length, be_post: bePost.length, be_post_qty: bePostQty,
    be_types: beTypeCounts, be_last_new_qty: beLastNewQty,
    be_last_at: beLast ? beLast.created_at : null,
    proposed_repair_qty: null, // filled at GATE 3
  });
}

// ---- GATE 3: proposed repair stock ----
// A: repair = current (= backup). B: repair = current ONLY if CONFIRMED, else 0 + HUMAN flag.
// C: excluded (0).
for (const r of rows) {
  if (r.set === 'A' && r.current_stock > 0) r.proposed_repair_qty = r.current_stock;
  else if (r.set === 'B' && r.confidence === 'CONFIRMED' && r.current_stock > 0) r.proposed_repair_qty = r.current_stock;
  else r.proposed_repair_qty = 0;
}

// ---- aggregates ----
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const setA = rows.filter(r => r.set === 'A');
const setB = rows.filter(r => r.set === 'B');
const setC = rows.filter(r => r.set === 'C');
const repairRows = rows.filter(r => r.proposed_repair_qty > 0);
const summary = {
  ts_capture: uni.ts, store: STORE, backup_ts: BACKUP_TS,
  products_total: products.length,
  backup_products: bk.per_product.length,
  backup_units: bk.inv_qty_sum,
  set_a_frozen: setA.length, set_a_units: sum(setA, r => r.current_stock),
  set_a_repair: repairRows.filter(r => r.set === 'A').length,
  set_b: setB.length, set_b_detail: setB.map(r => ({ id8: r.id8, sku: r.sku, name: r.name, backup: r.backup_qty, current: r.current_stock, delta: r.current_stock - r.backup_qty, be_post: r.be_post, be_post_qty: r.be_post_qty, be_types: r.be_types, be_last_new_qty: r.be_last_new_qty, confidence: r.confidence, classification: r.classification })),
  set_c_test: setC.length, set_c_units: sum(setC, r => r.current_stock),
  repair_products: repairRows.length,
  repair_units: sum(repairRows, r => r.proposed_repair_qty),
  repair_value: sum(repairRows, r => r.proposed_repair_qty * (r.wac || 0)),
  orphan_units_current: sum(rows.filter(r => r.current_stock > 0), r => r.current_stock),
  wac_unknown_in_repair: repairRows.filter(r => r.wac_class === 'WAC_UNKNOWN').length,
  be_stock_movement_total: Object.keys(beByProduct).length ? sum(Object.values(beByProduct), a => a.length) : 0,
};

// sanity: 6553 == A(units>0)+B(current>0)+C
console.log('=== SUMMARY ===');
console.log(JSON.stringify(summary, (k, v) => k === 'be_types' ? v : v, 2));

// ---- cross-validations (GATE 7/8/19 rigor) ----
const issues = [];
// V1: every set-A product must have net-zero post-backup BE quantity
for (const r of setA) {
  if (Math.abs(r.be_post_qty) > 1e-9) issues.push(`V1_FAIL setA net delta != 0: ${r.sku} (${r.id8}) be_post_qty=${r.be_post_qty}`);
}
// V2: no BE stock_movement event after purge window (2026-08-17 03:00Z) — evidence freeze
const PURGE_END = '2026-08-17T03:00:00Z';
let maxBe = null;
for (const [pid, evs] of Object.entries(beByProduct)) for (const e of evs) {
  if (!maxBe || String(e.created_at) > String(maxBe)) maxBe = e.created_at;
}
if (maxBe && new Date(maxBe) > new Date(PURGE_END)) issues.push(`V2_FAIL BE activity after purge window: last=${maxBe}`);
// V3 (informational): test products have few BE events (their test-session origination)
for (const r of setC) if (r.be_total !== 0) console.log(`V3_INFO test product has BE events (origination): ${r.sku} count=${r.be_total}`);
// V3b: frozen-chain per set (BE journal is PARTIAL: direct sale inserts bypass register_stock_movement)
const IMPORT_TS = '2026-07-30T03:00:32.744';
for (const r of rows.filter(r => r.current_stock > 0)) {
  if (r.set === 'A') {
    const preBackupLast = r.be_last_at && String(r.be_last_at) < BACKUP_TS;
    const matchBackup = r.backup_qty !== null && Math.abs(r.current_stock - r.backup_qty) < 1e-9;
    const lastEqCurrent = r.be_last_new_qty !== null && Math.abs(r.be_last_new_qty - r.current_stock) < 1e-9;
    if (!((preBackupLast && matchBackup) || lastEqCurrent))
      issues.push(`V3b_FAIL frozen-chain: ${r.sku} (${r.id8}) lastBE=${r.be_last_at} new_qty=${r.be_last_new_qty} backup=${r.backup_qty} current=${r.current_stock}`);
  } else if (r.set === 'B' && r.confidence !== 'CONFIRMED') {
    issues.push(`V3b_FAIL setB not confirmed: ${r.sku}`);
  }
}
// BE journal composition stats
const beAll = uni.business_events_for_products.filter(b => b.event_type === 'stock_movement');
const beImport = beAll.filter(b => String(b.created_at).startsWith('2026-07-30T03:00')).length;
const bePreBackupOther = beAll.filter(b => String(b.created_at) < BACKUP_TS && !String(b.created_at).startsWith('2026-07-30T03:00')).length;
const bePostBackup = beAll.filter(b => String(b.created_at) > BACKUP_TS).length;
console.log(`BE JOURNAL: total=${beAll.length} import_0730=${beImport} pre_backup_other=${bePreBackupOther} post_backup=${bePostBackup}`);
// V4: math identity 5495 + 932 == 6427 and 6553 - 126 == 6427
const g2Delta = sum(setB, r => r.current_stock - r.backup_qty);
if (bk.inv_qty_sum + g2Delta !== summary.repair_units) issues.push(`V4_FAIL backup+delta != repair: ${bk.inv_qty_sum}+${g2Delta} != ${summary.repair_units}`);
if (summary.orphan_units_current - summary.set_c_units !== summary.repair_units) issues.push(`V4_FAIL current-test != repair`);
// V5: no WAC_UNKNOWN among repair rows (else design must branch)
if (summary.wac_unknown_in_repair > 0) issues.push(`V5_WARN WAC_UNKNOWN in repair universe: ${summary.wac_unknown_in_repair}`);
// V6: repair universe equals orphans minus test
const orphanRows = rows.filter(r => r.current_stock > 0);
if (orphanRows.length !== repairRows.length + setC.filter(r => r.current_stock > 0).length) issues.push('V6_FAIL orphan decomposition mismatch');
// V7: inventory/movements/kardex/transactions still empty (universe unchanged vs PRE)
if (uni.inventory.length !== 0 || uni.stock_movements.length !== 0 || uni.kardex.length !== 0 || uni.transactions.length !== 0)
  issues.push('V7_FAIL ledger not empty — universe changed since OBS-2');
// V8: all repair rows WAC > 0 (zero-cost products need special treatment)
const zeroWac = repairRows.filter(r => !r.wac || r.wac <= 0);
if (zeroWac.length) issues.push(`V8_WARN zero/null WAC in repair rows: ${zeroWac.map(r => r.sku).join(',')}`);
console.log('=== CROSS-VALIDATIONS ===');
if (issues.length) { issues.forEach(i => console.log(i)); }
else console.log('ALL CHECKS PASS (V1-V8)');
console.log('max BE created_at:', maxBe);
const setCValue = sum(setC, r => r.current_stock * (r.wac || 0));
console.log('setC economic value (excluded):', setCValue.toFixed(2));
console.log('setA economic value:', sum(setA.filter(r=>r.current_stock>0), r => r.current_stock * (r.wac||0)).toFixed(2));
console.log('setB economic value:', sum(setB, r => r.current_stock * (r.wac||0)).toFixed(2));

// ---- CSVs ----
const csv = (file, header, rowsOut) => {
  const lines = [header.join(',')];
  for (const r of rowsOut) lines.push(header.map(h => {
    let v = typeof h === 'function' ? h(r) : r[h];
    if (v === null || v === undefined) v = '';
    v = String(v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }).join(','));
  fs.writeFileSync(path.join(PACK, file), lines.join('\n') + '\n');
  console.log('WROTE', file, (lines.length - 1) + ' rows');
};

const ruHeader = ['product_id','sku','name','set','classification','confidence','backup_qty','current_stock','delta','wac','wac_class','status','is_active','created_at','updated_at','be_total','be_post','be_post_qty','be_types_json','proposed_repair_qty','evidence_source'];
csv('03-repair-universe.csv', ruHeader, rows.map(r => ({
  ...r,
  delta: r.backup_qty === null ? '' : r.current_stock - r.backup_qty,
  be_types_json: JSON.stringify(r.be_types),
  evidence_source: r.set === 'A' ? 'backup_20260802_payload+FROZEN(stock_current==b_inv;0 writes post 2026-08-16T22:01Z)' :
    r.set === 'C' ? 'OBS2_07-ledger-reconstruction+created_post_backup+no_BE_events' :
    'business_events(survived purge)+backup delta',
})));

csv('04-post-backup-deltas.csv',
  ['product_id','sku','name','backup_qty','current_stock','delta','be_post_events','be_post_qty','be_types_json','be_last_new_qty','be_last_at','classification','confidence','treatment'],
  rows.filter(r => r.set === 'B' || (r.set === 'A' && false)).map(r => ({
    ...r, delta: r.current_stock - r.backup_qty,
    treatment: r.confidence === 'CONFIRMED' ? 'INCLUDE_AT_CURRENT' : 'HUMAN_DECISION_REQUIRED',
  })));

csv('05-test-exclusions.csv',
  ['product_id','sku','name','current_stock','wac','created_at','updated_at','be_events','exclusion_reason'],
  setC.map(r => ({
    ...r,
    be_events: r.be_total,
    exclusion_reason: 'TEST_RESIDUE: created 2026-08-07T01:54-02:26Z by test scripts (sku/name Test pattern); stock originated via test purchases recorded in business_events; never commercial inventory; classified TEST_DATA in OBS-2 07-ledger-reconstruction.csv (UNKNOWN_ORIGIN); WAC inflated by test design (TASA-EXT 1090908.00)',
  })));

csv('06-wac-analysis.csv',
  ['product_id','sku','name','wac','wac_class','wac_source','wac_backup_available','wac_change_log_rows','opening_unit_cost'],
  rows.map(r => ({
    ...r,
    wac_source: r.wac_class === 'WAC_CONFIRMED' ? 'products.cost_average (frozen pre-purge; single-writer guard w62; wac_change_log empty for store)' : 'NONE',
    wac_backup_available: 'NO (backup payload has no per-product WAC field)',
    wac_change_log_rows: 0,
    opening_unit_cost: r.proposed_repair_qty > 0 ? r.wac : '',
  })));

csv('07-proposed-opening.csv',
  ['product_id','sku','name','opening_qty','opening_unit_cost','opening_value','movement_type','reference_doc','date_policy','set','confidence'],
  repairRows.map(r => ({
    ...r,
    opening_qty: r.proposed_repair_qty,
    opening_unit_cost: r.wac,
    opening_value: (r.proposed_repair_qty * (r.wac || 0)).toFixed(2),
    movement_type: 'initial',
    reference_doc: 'B10B-OBS2-RECON-OPENING',
    date_policy: 'EXECUTION_TIMESTAMP (no retro-dating)',
  })));

// ---- frozen universe for simulator + permanent test ----
fs.writeFileSync(path.join(PACK, 'raw/frozen_universe.json'), JSON.stringify({
  captured_at: uni.ts, store: STORE, backup_ts: BACKUP_TS,
  summary, rows,
}, null, 1));
console.log('WROTE raw/frozen_universe.json');
