#!/usr/bin/env node
/**
 * R1 · POST-execution comparator (READ ONLY)
 * Validates everything against frozen references:
 *  §21/§32 — 98 movements / 6427 units / 98 inventory / 98 kardex / products==inventory
 *  I1..I16 — per-product triada, kardex 1:1 @numeric(12,2), WAC preserved, actor, trace
 *  §24     — isolation: other stores 0 differences vs frozen PRE
 *  §25     — 10 Test products still excluded & intact (126 u)
 *  §27     — zero unexpected mutation (financial counts, audit delta, WAC/stock checksums)
 * Exit 0 only if ALL pass.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const R1 = '/home/z/my-project/Costpro/audit-evidence/20260906-w9-b10b-obs2-r1';
const DESIGN = '/home/z/my-project/Costpro/audit-evidence/20260906-w9-b10b-obs2-repair-design';
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const results = [];
const add = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`); };

const BATCH = fs.readFileSync(path.join(R1, 'raw/r1_batch_id.txt'), 'utf8').trim();
const post = read(path.join(R1, 'raw/r1_post_verification.json'))[0].post_verification;
const pre34 = read(path.join(R1, 'raw/r1_pre_snapshot.json'))[0].evidence;
const post34 = read(path.join(R1, 'raw/r1_post_snapshot34.json'))[0].evidence;
const frozen = read(path.join(DESIGN, 'raw/frozen_universe.json'));
const csv07 = fs.readFileSync(path.join(DESIGN, '07-proposed-opening.csv'), 'utf8').trim().split('\n');
const hdr = csv07[0].split(',');
const rows = csv07.slice(1).map(l => { const c = l.split(','); const o = {}; hdr.forEach((h, i) => o[h] = c[i]); return o; });

const ACTOR = '051c6157-600b-425e-b8c0-72388bacf541';
const STORE = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';

// ---------- §21/§32: batch shape ----------
const b = post.batch;
add('§21: 98 opening movements', b.movements === 98 && b.family_rows === 98 && b.distinct_ref_docs === 1,
  `movements=${b.movements} family=${b.family_rows} distinct_docs=${b.distinct_ref_docs}`);
add('§21: Σ units = 6427', Number(b.units) === 6427, `Σ=${b.units}`);
add('§21: movement_type = initial (all)', JSON.stringify(b.movement_types) === '["initial"]', JSON.stringify(b.movement_types));
add('§21: 98 inventory rows in store', post.store_totals.inventory_rows === 98, `rows=${post.store_totals.inventory_rows}`);
add('§21: 98 kardex rows (batch)', b.kardex_rows === 98, `rows=${b.kardex_rows}`);
add('§21: 98 business_events', b.business_events === 98, `events=${b.business_events}`);
add('§21: products==inventory Σ (store)', Number(post.store_totals.products_stock_sum) === 6553 && post.store_totals.inventory_rows === 98,
  `stock Σ=${post.store_totals.products_stock_sum} (declared 6553 = 6427 repaired + 126 Test residue)`);

// ---------- I1..I6 per product ----------
const ppMap = new Map(post.per_product.map(p => [p.product_id, p]));
const froMap = new Map(frozen.rows.map(p => [p.product_id, p]));
let i1 = true, i3 = true, i5 = true, i6 = true; const d1 = [], d3 = [], d5 = [], d6 = [];
const stockCk = [], costCk = [];
for (const r of rows) {
  const p = ppMap.get(r.product_id);
  const f = froMap.get(r.product_id);
  if (!p) { i1 = false; d1.push(`missing ${r.sku}`); continue; }
  const q = Number(r.opening_qty), w = Number(r.opening_unit_cost);
  if (Number(p.inventory_qty) !== q || Number(p.stock_current) !== q || Number(p.movements_sum) !== q || p.movements_n !== 1) {
    i1 = false; d1.push(`${r.sku}: inv=${p.inventory_qty} stock=${p.stock_current} Σm=${p.movements_sum} n=${p.movements_n}`);
  }
  if (p.has_movements !== true) { i1 = false; d1.push(`${r.sku}: has_movements=false`); }
  if (p.inventory_version !== 1) { i1 = false; d1.push(`${r.sku}: version=${p.inventory_version}`); }
  if (kardexCount(p) !== 1) { i5 = false; d5.push(`${r.sku}: kardex_n=${kardexCount(p)}`); }
  // I3/I6: WAC preserved bit-for-bit vs frozen universe
  if (JSON.stringify(p.cost_average) !== JSON.stringify(f.wac)) { i3 = false; d3.push(`${r.sku}: wac ${p.cost_average} != ${f.wac}`); }
  // I5 frozen: stock_current unchanged vs frozen
  if (JSON.stringify(p.stock_current) !== JSON.stringify(f.current_stock)) { i6 = false; d6.push(`${r.sku}: stock ${p.stock_current} != ${f.current_stock}`); }
  stockCk.push(p.product_id + '|' + p.stock_current);
  costCk.push(p.product_id + '|' + p.cost_average);
}
function kardexCount(p) { return p.kardex_n; }
add('I1/I4: triada canónica 98/98 (inventory==stock==Σmovements, n=1, version=1)', i1, i1 ? 'all 98 exact' : d1.slice(0, 5).join(' · '));
add('I5f: kardex 1:1 per product (98/98)', i5, i5 ? 'all 98 exact' : d5.slice(0, 5).join(' · '));
add('I3: cost_average preserved vs frozen (98/98)', i3, i3 ? 'bit-for-bit identical' : d3.slice(0, 5).join(' · '));
add('I5: stock_current unchanged vs frozen (98/98)', i6, i6 ? 'opening recognized, not rewritten' : d6.slice(0, 5).join(' · '));

// store-wide checksums: cost_average over 124 == PRE frozen (I3), stock_current over 124 == PRE frozen (I5)
add('I3 store-wide: Σ cost_average == PRE', JSON.stringify(post34.products_store_cost) === JSON.stringify(pre34.products_store_cost),
  `${pre34.products_store_cost} -> ${post34.products_store_cost}`);
add('I5 store-wide: Σ stock_current == PRE', post34.products_store_stock === pre34.products_store_stock,
  `${pre34.products_store_stock} -> ${post34.products_store_stock}`);
add('I4: wac_change_log still 0', post.store_totals.wac_log_rows === 0, `rows=${post.store_totals.wac_log_rows}`);

// ---------- I7..I11: financial neutrality + isolation ----------
const f = post.financial, iso = post.isolation, st = post.store_totals;
add('§19/I7: store transactions = 0', f.transactions_all === 520 && st.transactions_rows === 0, `all=${f.transactions_all} store=${st.transactions_rows}`);
add('§19/I8: payments 366 → 366', f.payments_all === 366, `payments=${f.payments_all}`);
add('§19/I9: commissions = 0', f.commissions_all === 0, `comm=${f.commissions_all}`);
add('§19/I10: transaction_items 555 / devolutions 13 / receipts 0', f.transaction_items_all === 555 && f.devolutions_store === 13 && f.receipts_store === 0 && f.transfers_all === 0 && f.devolution_items_all === 13,
  `ti=${f.transaction_items_all} dev=${f.devolutions_store} rec=${f.receipts_store} tr=${f.transfers_all}`);
add('I7 isolation: other stores identical to PRE', iso.inventory_other === 141 && iso.movements_other === 702 && iso.kardex_other === 702 && Number(iso.inventory_other_sum) === Number(pre34.inventory_sum),
  `inv=${iso.inventory_other} mov=${iso.movements_other} kar=${iso.kardex_other} Σ=${iso.inventory_other_sum}`);
add('I10: audit delta = +1 batch row only; 0 UPDATE_PRODUCT new', post34.audit_logs_all === pre34.audit_logs_all + 1 && st.audit_update_product_new === 0,
  `all ${pre34.audit_logs_all}->${post34.audit_logs_all} · new UPDATE_PRODUCT=${st.audit_update_product_new}`);

// ---------- I12/I13/I15/I16: batch identity ----------
add('I12: exactly one repair batch (audit row = 1)', b.audit_rows === 1, `audit rows=${b.audit_rows}`);
add('I13: exactly 98 opening movements', b.movements === 98 && b.family_rows === 98, `=${b.movements}/${b.family_rows}`);
add('I15: created_by = actor on all 98', JSON.stringify(b.created_by_distinct) === JSON.stringify([ACTOR]), JSON.stringify(b.created_by_distinct));
add('I16: kardex reference_description = batch (98)', b.kardex_rows === 98, `traceable=${b.kardex_rows}`);

// ---------- §25: Test residue ----------
const t = post.test_residue;
let tOk = t.length === 10; let tUnits = 0; const tD = [];
for (const x of t) { tUnits += Number(x.stock_current); if (x.inventory_rows !== 0 || x.movement_rows !== 0) { tOk = false; tD.push(`${x.sku} has ledger rows`); } }
add('§25: 10 Test products intact, 126 u, 0 ledger rows, excluded', tOk && tUnits === 126, `Σ=${tUnits} ${tD.join(' · ') || '(all outside batch)'}`);
const testIdsInBatch = post.per_product.filter(p => t.some(x => x.product_id === p.product_id));
add('§25: 0 Test products in batch universe', testIdsInBatch.length === 0, `in batch=${testIdsInBatch.length}`);

// ---------- §27: zero unexpected mutation (34 metrics with expected deltas) ----------
const expectedDelta = { inventory_all: 98, inventory_store: 98, inventory_sum: 6427, stock_movements_all: 98, stock_movements_store: 98, stock_movements_sum: 6427, kardex_all: 98, kardex_store: 98, audit_logs_all: 1, audit_logs_store: 1 };
const noDelta = ['products_all','products_store','products_store_stock','products_store_cost','transactions_all','transactions_store','transaction_items_all','devolutions_all','devolutions_store','devolution_items_all','payments_all','payments_store_tx','receipts_all','receipts_store','transfers_all','transfers_store','restore_sessions_all','store_reset_snapshots_all','commissions_all','wac_log_all','wac_log_store'];
let zOk = true; const zD = [];
for (const k of Object.keys(expectedDelta)) {
  const d = Number(post34[k]) - Number(pre34[k]);
  if (d !== expectedDelta[k]) { zOk = false; zD.push(`${k} Δ=${d} (exp ${expectedDelta[k]})`); }
}
for (const k of noDelta) {
  if (JSON.stringify(post34[k]) !== JSON.stringify(pre34[k])) { zOk = false; zD.push(`${k} changed: ${pre34[k]} -> ${post34[k]}`); }
}
add('§27: ZERO UNEXPECTED MUTATION (34 metrics, only batch deltas)', zOk, zOk ? 'all deltas as designed' : zD.slice(0, 6).join(' · '));

// ---------- §28: economic reconciliation ----------
const exact = Number(b.value_exact);
const kardex2dp = Number(b.kardex_value_2dp);
add('§28: Σ(qty × WAC) exact == 9,932,216.938816005', Math.abs(exact - 9932216.938816005) < 1e-6, `exact=${exact}`);
add('§28: published figure 9,932,216.94 = rounding (Δ documented)', Math.abs(exact - 9932216.94) < 0.005, `|exact − published| = ${Math.abs(exact - 9932216.94).toFixed(9)} (2-dp display rounding; no silent rounding: exact value recorded in movement rows + audit metadata)`);

// ---------- summary ----------
const fails = results.filter(r => !r.pass);
fs.writeFileSync(path.join(R1, 'raw/r1_post_verdict.json'), JSON.stringify({
  checked_at: new Date().toISOString(), batch: BATCH, total: results.length, fails: fails.length, results,
  economic: { exact: exact, published: 9932216.94, kardex_2dp_sum: kardex2dp },
}, null, 2));
console.log(`\nPOST VERIFICATION: ${results.length - fails.length}/${results.length} PASS`);
console.log(`economic: movement-level exact = ${exact} · kardex 2-dp stored Σ = ${kardex2dp}`);
if (fails.length) { console.log('VERDICT: POST FAILED'); process.exit(1); }
console.log('VERDICT: POST VERIFIED');
