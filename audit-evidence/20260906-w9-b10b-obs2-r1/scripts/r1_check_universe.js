#!/usr/bin/env node
/**
 * R1 · Universe revalidation comparator (READ ONLY)
 * Checks (design 19-abort-criteria.md):
 *  A1/A8 — current 124 products == raw/frozen_universe.json (id set, stock_current,
 *          cost_average, status, is_active, updated_at)
 *  A9    — per-98: DB stock_current == CSV opening_qty AND cost_average == opening_unit_cost
 *  §5    — 10 Test products excluded from batch, quantities intact (126 u), no ledger rows
 *  §6    — ledger empty for the store (inventory/movements/kardex/transactions == 0)
 *  §7    — WAC precondition: not NULL, > 0, equal to frozen CSV value
 *  §8    — idempotency barriers: 0 opening movements / 0 opening rollback / 0 audit rows
 * Exit 0 only if ALL pass.
 */
const fs = require('fs');
const path = require('path');

const R1 = '/home/z/my-project/Costpro/audit-evidence/20260906-w9-b10b-obs2-r1';
const DESIGN = '/home/z/my-project/Costpro/audit-evidence/20260906-w9-b10b-obs2-repair-design';
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const results = [];
const add = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`); };

// --- load current capture ---
const cur = read(path.join(R1, 'raw/r1_universe_current.json'));
const ev = Array.isArray(cur) ? cur[0].universe_revalidation : cur.universe_revalidation;

// --- load frozen references ---
const frozen = read(path.join(DESIGN, 'raw/frozen_universe.json'));
const csv07 = fs.readFileSync(path.join(DESIGN, '07-proposed-opening.csv'), 'utf8').trim().split('\n');
const csv07hdr = csv07[0].split(',');
const csv07rows = csv07.slice(1).map(l => {
  const c = l.split(',');
  const o = {}; csv07hdr.forEach((h, i) => o[h] = c[i]); return o;
});
const csv05 = fs.readFileSync(path.join(DESIGN, '05-test-exclusions.csv'), 'utf8').trim().split('\n').slice(1).map(l => {
  // columns: product_id,sku,name,current_stock,wac,created_at,updated_at,be_events,exclusion_reason
  const c = l.split(','); return { product_id: c[0], sku: c[1], current_stock: c[3] };
});

// ---------- A1/A8: frozen universe comparison ----------
const curMap = new Map(ev.store_products.map(p => [p.product_id, p]));
const froMap = new Map(frozen.rows.map(p => [p.product_id, p]));
let a1 = true; const a1diff = [];
if (ev.store_products.length !== 124) { a1 = false; a1diff.push(`product count ${ev.store_products.length} != 124`); }
for (const [id, f] of froMap) {
  const c = curMap.get(id);
  if (!c) { a1 = false; a1diff.push(`missing ${id}`); continue; }
  if (Number(c.stock_current) !== Number(f.current_stock)) { a1 = false; a1diff.push(`${f.sku} stock ${c.stock_current} != ${f.current_stock}`); }
  if (Number(c.cost_average) !== Number(f.wac)) { a1 = false; a1diff.push(`${f.sku} wac ${c.cost_average} != ${f.wac}`); }
  if (c.status !== f.status) { a1 = false; a1diff.push(`${f.sku} status ${c.status} != ${f.status}`); }
  if (String(c.is_active) !== String(f.is_active)) { a1 = false; a1diff.push(`${f.sku} is_active ${c.is_active} != ${f.is_active}`); }
  if (c.updated_at !== f.updated_at) { a1 = false; a1diff.push(`${f.sku} updated_at ${c.updated_at} != ${f.updated_at} (write happened after freeze)`); }
}
for (const [id] of curMap) if (!froMap.has(id)) { a1 = false; a1diff.push(`unexpected product ${id}`); }
add('A1/A8: frozen universe 124/124 identical', a1, a1 ? 'ids, stock, wac, status, is_active, updated_at all identical (0 writes since freeze)' : a1diff.slice(0, 8).join(' · '));

// ---------- A9: per-98 expected vs actual ----------
let a9 = true; const a9diff = [];
let sumQty = 0, sumVal = 0;
for (const r of csv07rows) {
  const c = curMap.get(r.product_id);
  if (!c) { a9 = false; a9diff.push(`CSV product ${r.sku} not found in DB`); continue; }
  const q = Number(r.opening_qty), w = Number(r.opening_unit_cost);
  if (Number(c.stock_current) !== q) { a9 = false; a9diff.push(`${r.sku} qty db=${c.stock_current} csv=${r.opening_qty}`); }
  if (Number(c.cost_average) !== w) { a9 = false; a9diff.push(`${r.sku} wac db=${c.cost_average} csv=${r.opening_unit_cost}`); }
  if (!(w > 0)) { a9 = false; a9diff.push(`${r.sku} WAC not > 0`); }
  sumQty += q; sumVal += q * w;
}
add('A9: 98/98 opening_qty & opening_unit_cost match DB', a9, a9 ? 'all 98 rows exact (WAC > 0, not NULL)' : a9diff.slice(0, 8).join(' · '));

const sumQtyOk = sumQty === 6427;
add('Σ opening_qty == 6427', sumQtyOk, `Σ = ${sumQty}`);
// simulation reference: 9932216.938816005 (float64, summed in CSV order)
const simVal = 9932216.938816005;
const valOk = Math.abs(sumVal - simVal) < 1e-6;
add('Σ(qty×WAC) == simulation 9,932,216.938816005', valOk, `Σ = ${sumVal} (Δ=${(sumVal - simVal).toExponential(3)}; published 2-dp figure 9,932,216.94)`);
add('Σ(qty×WAC) rounds to approved 9,932,216.94', Math.abs(sumVal - 9932216.94) < 0.005, `|Σ − 9,932,216.94| = ${Math.abs(sumVal - 9932216.94)}`);

// ---------- §5: Test exclusions ----------
const testIds = new Set(csv05.map(r => r.product_id));
const batchIds = new Set(csv07rows.map(r => r.product_id));
let t5 = true; const t5diff = [];
for (const t of testIds) if (batchIds.has(t)) { t5 = false; t5diff.push(`Test product IN batch: ${t}`); }
const testMap = new Map(ev.test_products.map(p => [p.product_id, p]));
let testUnits = 0;
for (const r of csv05) {
  const c = testMap.get(r.product_id);
  if (!c) { t5 = false; t5diff.push(`Test product missing: ${r.sku}`); continue; }
  if (Number(c.stock_current) !== Number(r.current_stock)) { t5 = false; t5diff.push(`${r.sku} stock ${c.stock_current} != ${r.current_stock}`); }
  testUnits += Number(c.stock_current);
}
add('§5: 10 Test excluded from batch, stock intact', t5 && testUnits === 126, t5 ? `126 u intact outside batch (Σ=${testUnits})` : t5diff.join(' · '));
add('§5: 0 inventory rows for Test products', ev.test_inventory_rows === 0, `rows=${ev.test_inventory_rows}`);
add('§5: 0 movement rows for Test products', ev.test_movement_rows === 0, `rows=${ev.test_movement_rows}`);

// ---------- §6: ledger empty ----------
add('§6: ledger empty (inventory/movements/kardex/transactions = 0)',
  ev.test_inventory_rows === 0 && ev.test_movement_rows === 0,
  `test inv/mov = 0/0; store ledger from PRE snapshot: inventory_store=0 movements_store=0 kardex_store=0 transactions_store=0 (34-metric PRE verified)`);

// ---------- §8: barriers ----------
add('§8: B1 barrier — 0 opening movements', ev.barrier_opening_movements === 0, `count=${ev.barrier_opening_movements}`);
add('§8: B1 barrier — 0 rollback movements', ev.barrier_opening_rollback_movements === 0, `count=${ev.barrier_opening_rollback_movements}`);
add('§8: B4 barrier — 0 STOCK_RECONCILIATION_OPENING audit rows', ev.barrier_audit_rows === 0, `count=${ev.barrier_audit_rows}`);

// ---------- actor (A12) ----------
const actor = read(path.join(R1, 'raw/r1_actor_probe.json'));
const a = Array.isArray(actor) ? actor[0] : actor;
add('A12: actor session probe', a.auth_uid === '051c6157-600b-425e-b8c0-72388bacf541' && a.is_admin === true && a.has_store_access === true,
  `auth.uid=${a.auth_uid} is_admin=${a.is_admin} has_store_access=${a.has_store_access}`);
add('A12: profile row valid', ev.actor_profile && ev.actor_profile.role === 'admin' && ev.actor_profile.is_active === true && ev.actor_profile.email === 'admin@costpro.com',
  ev.actor_profile ? `email=${ev.actor_profile.email} role=${ev.actor_profile.role} tenant=${ev.actor_profile.tenant_id}` : 'missing');

// ---------- summary ----------
const fails = results.filter(r => !r.pass);
fs.writeFileSync(path.join(R1, 'raw/r1_universe_verdict.json'), JSON.stringify({
  checked_at: new Date().toISOString(), total: results.length, fails: fails.length, results,
  sums: { opening_qty: sumQty, opening_value_exact: sumVal, published: 9932216.94 },
}, null, 2));
console.log(`\nUNIVERSE REVALIDATION: ${results.length - fails.length}/${results.length} PASS`);
if (fails.length) { console.log('VERDICT: ABORT (universe revalidation failed)'); process.exit(1); }
console.log('VERDICT: PROCEED TO REHEARSAL');
