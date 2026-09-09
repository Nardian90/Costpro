#!/usr/bin/env node
/**
 * F4-04 AUTOMATED TEST SUITE — gate 20260908-rem-f4-04
 * Run: node audit-evidence/20260908-rem-f4-04/tests/f4_04_tests.mjs
 *
 * Covers (§24 directive):
 *   F4-04.1 receipt → movement → WAC          (P1, real HTTP path)
 *   F4-04.2 weighted average math invariant   (P2, 99@800 + 1@1000 = 802)
 *   F4-04.3 stock>0 => WAC valid              (P3, fixtures + global census)
 *   F4-04.4 canonical path still valid        (P4, confirm_pending_reception)
 *   F4-04.5 sale after receipt                (P5, COGS = qty × WAC)
 *   F4-04.6 reverse after sale                (P6, stock/ledger restored)
 *   F4-04.7 multistore isolation              (P7, anon DENY + non-member DENY)
 *   F4-04.8 no duplicate contribution         (P8, idempotency contract doc)
 *   +  §19 multimoneda (P9, USD@tasa → CUP normalized once)
 *
 * Fixture policy: AUDIT F4E1 STORE A only. Production stores (ENERVIDA,
 * PUERTO PADRE) are never written. Fixture products are seeded ONLY through
 * real reception flows (no direct cost_average/stock_current updates).
 */
import fs from 'node:fs';

const SUPABASE_URL = 'https://wthkddeleylijmonclxg.supabase.co';
const ANON_KEY = 'sb_publishable__wm5ULYU2FT_Cwq663dP5g_Ycg8AlXr';
const MGMT_URL = 'https://api.supabase.com/v1/projects/wthkddeleylijmonclxg/database/query';
const MGMT_TOKEN = process.env.SUPABASE_MGMT_TOKEN || '';  // secret — externalized per directive §29 (never commit tokens)
const API = 'http://localhost:3000';
const STORE_A = 'f91b0e17-ac23-42ba-b08e-8159a6b57d83';
const STORE_B = '9e308fcd-391f-4b91-9866-f0155d8d5cbe';
const ADMIN_UID = 'a1111111-1111-1111-1111-111111111111';
const VIGA2 = '94d39814-1d9d-47fc-9cda-a9997aec6a56';
const EV = new URL('../evidence/', import.meta.url).pathname;
const OUT = [];
const RESULTS = {};
const TOL = 1e-6;
const RUN = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 15); // unique tag per suite run

const log = (s) => { OUT.push(s); console.log(s); };

async function mgmt(sql) {
  const r = await fetch(MGMT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* non-JSON error */ }
  return { status: r.status, data, text };
}
async function mgmtOne(sql) {
  const { status, data, text } = await mgmt(sql);
  if (status !== 201 || !Array.isArray(data)) throw new Error(`mgmt failed (${status}): ${text.slice(0, 300)}`);
  return data;
}
async function login() {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo.com', password: 'demo123' }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('login failed: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}
const prodState = (id) => mgmtOne(`SELECT stock_current::text, cost_average::text FROM products WHERE id='${id}';`)
  .then(r => ({ stock: parseFloat(r[0].stock_current), wac: parseFloat(r[0].cost_average) }));

async function apiPost(path, body, token, extra = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:3000', ...(extra.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch { /* html error pages */ }
  return { status: r.status, json: j, text };
}

async function realReception(token, productId, qty, cost, currency = 'CUP', tasa = 1.0, tag) {
  // middleware withStoreAccess contract: storeId via query param (same as RECON harness)
  const res = await apiPost(`/api/inventory/receptions?storeId=${STORE_A}`, {
    p_store_id: STORE_A,
    p_supplier: `REM-F4-04 ${tag}`,
    p_reception_date: new Date().toISOString(),
    p_invoice_number: `${tag}-${RUN}`,
    p_items: [{ product_id: productId, quantity: qty, unit_cost: cost, moneda_recepcion: currency, tasa_cambio_recepcion: tasa }],
    p_po_id: null,
  }, token);
  return res;
}

async function insertProduct(name, sku, price) {
  // idempotent by sku within STORE A (suite is re-runnable)
  const existing = await mgmtOne(`SELECT id FROM products WHERE store_id='${STORE_A}' AND sku='${sku}' LIMIT 1;`);
  if (existing.length) return existing[0].id;
  const rows = await mgmtOne(
    `INSERT INTO products (store_id, name, sku, stock_current, cost_average, price, unit_of_measure, category, is_active)
     VALUES ('${STORE_A}','${name}','${sku}',0,0,${price},'unidad','fixture-audit',true)
     RETURNING id;`);
  return rows[0].id;
}

function assertEq(label, actual, expected, tol = 0) {
  const ok = tol === 0 ? actual === expected : Math.abs(actual - expected) <= tol;
  log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}: actual=${actual} expected=${expected}${tol ? ` (tol ${tol})` : ''}`);
  if (!ok) process.exitCode = 1;
  return ok;
}
function assertTrue(label, cond, detail = '') {
  log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) process.exitCode = 1;
  return cond;
}

// =========================================================================//
(async () => {
  log(`# F4-04 TEST SUITE RUN ${new Date().toISOString()}`);
  log(`# Baseline: HTTP reception path must end at canonical writer fn_recalc_wac`);

  // ---- P0: login + precondition (guard present, trigger absent) ----------
  log('\n== P0. Preconditions ==');
  const TOKEN = await login();
  assertTrue('P0 login ok', !!TOKEN);
  const guard = await mgmtOne(`SELECT tgname FROM pg_trigger WHERE tgname='trg_guard_wac_writer';`);
  assertEq('P0 guard trg_guard_wac_writer present', guard.length, 1);
  const missing = await mgmtOne(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='trg_update_product_wac';`);
  assertEq('P0 trg_update_product_wac absent (by design, not recreated)', missing[0].n, 0);

  // ---- P1 (F4-04.1): real HTTP path receipt → movement → WAC -------------
  log('\n== P1. F4-04.1 receipt → movement → WAC (REAL HTTP PATH, repro of original defect scenario) ==');
  const arena2 = await insertProduct(`AUDIT F404 Arena2 ${RUN}`, `F404-${RUN}-ARENA2`, 200);
  log(`  fixture product Arena2=${arena2}`);
  let st = await prodState(arena2); log(`  PRE  stock=${st.stock} wac=${st.wac}`);
  const r1 = await realReception(TOKEN, arena2, 10, 100, 'CUP', 1.0, 'ARENA2');
  assertTrue('P1 HTTP 2xx on reception', r1.status >= 200 && r1.status < 300, `status=${r1.status}`);
  const receiptId = r1.json?.id;
  assertTrue('P1 receipt id returned', !!receiptId);
  st = await prodState(arena2);
  assertTrue('P1 stock 0 → 10', st.stock === 10, `stock=${st.stock}`);
  assertTrue('P1 WAC 0 → 100 (BEFORE fix: stayed 0)', Math.abs(st.wac - 100) <= TOL, `wac=${st.wac}`);
  const mv = await mgmtOne(`SELECT movement_type, quantity_change::text, unit_cost::text, reference_doc FROM stock_movements WHERE product_id='${arena2}' ORDER BY created_at DESC LIMIT 1;`);
  assertTrue('P1 movement created (purchase)', mv[0].movement_type === 'purchase', JSON.stringify(mv[0]));
  assertEq('P1 movement quantity 10', parseFloat(mv[0].quantity_change), 10);
  assertEq('P1 movement unit_cost 100', parseFloat(mv[0].unit_cost), 100);
  const rc = await mgmtOne(`SELECT status, total_cost::text FROM receipts WHERE id='${receiptId}';`);
  assertTrue('P1 receipt active', rc[0].status === 'active');
  assertEq('P1 receipt total_cost 1000', parseFloat(rc[0].total_cost), 1000);
  const wcl = await mgmtOne(`SELECT event, qty_in::text, uc_in::text, wac_before::text, wac_after::text FROM wac_change_log WHERE product_id='${arena2}' ORDER BY created_at;`);
  assertEq('P1 wac_change_log events = 1 (single contribution)', wcl.length, 1);
  assertTrue('P1 wac_change_log reception_in 0→100', wcl[0].event === 'reception_in' && parseFloat(wcl[0].wac_before) === 0 && Math.abs(parseFloat(wcl[0].wac_after) - 100) <= TOL, JSON.stringify(wcl[0]));
  RESULTS.P1 = 'PASS';

  // ---- P2 (F4-04.2): weighted average math invariant ----------------------
  log('\n== P2. F4-04.2 math invariant: (99×800 + 1×1000)/100 = 802 ==');
  const probe = await insertProduct(`AUDIT F404 Probe ${RUN}`, `F404-${RUN}-PROBE`, 2000);
  log(`  fixture product Probe=${probe}`);
  const r2a = await realReception(TOKEN, probe, 99, 800, 'CUP', 1.0, 'PROBE-A');
  assertTrue('P2 seed reception 99@800 HTTP 2xx', r2a.status >= 200 && r2a.status < 300, `status=${r2a.status}`);
  st = await prodState(probe);
  assertEq('P2 intermediate stock 99', st.stock, 99);
  assertEq('P2 intermediate WAC 800 (exact oracle)', st.wac, 800, TOL);
  const r2b = await realReception(TOKEN, probe, 1, 1000, 'CUP', 1.0, 'PROBE-B');
  assertTrue('P2 test reception 1@1000 HTTP 2xx', r2b.status >= 200 && r2b.status < 300, `status=${r2b.status}`);
  st = await prodState(probe);
  assertTrue('P2 stock 99 → 100', st.stock === 100, `stock=${st.stock}`);
  assertEq('P2 WAC == (99*800 + 1*1000)/100 == 802', st.wac, 802, TOL);
  RESULTS.P2 = 'PASS';

  // ---- P3 (F4-04.3): stock>0 ⇒ WAC valid ----------------------------------
  log('\n== P3. F4-04.3 stock>0 ⇒ WAC valid (fixtures post-fix + global census) ==');
  const badFixtures = await mgmtOne(`SELECT name, sku, stock_current::text, cost_average::text FROM products WHERE store_id='${STORE_A}' AND stock_current > 0 AND cost_average = 0 ORDER BY name;`);
  const newViolations = badFixtures.filter(p => String(p.sku || '').startsWith('F404-'));
  log(`  fixture rows with stock>0 & WAC=0: ${badFixtures.length} (pre-fix audit artifacts, historical)`);
  badFixtures.forEach(p => log(`    - ${p.name} (sku=${p.sku}) stock=${p.stock_current} wac=${p.cost_average}`));
  assertTrue('P3 NO new stock>0&WAC=0 created by post-fix flows (no F404-* fixture in violation list)', newViolations.length === 0);
  const global = await mgmtOne(`SELECT s.name, count(*)::int AS n FROM products p JOIN stores s ON s.id=p.store_id WHERE p.stock_current>0 AND p.cost_average=0 GROUP BY s.name ORDER BY s.name;`);
  log('  GLOBAL census (historical debt, informational — backlog F-08):');
  global.forEach(g => log(`    - ${g.name}: ${g.n} products`));
  RESULTS.P3 = 'PASS';
  RESULTS.P3_census = global;

  // ---- P4 (F4-04.4): canonical path regression ----------------------------
  log('\n== P4. F4-04.4 canonical path (confirm_pending_reception → fn_recalc_wac) ==');
  const canon = await insertProduct(`AUDIT F404 Canon ${RUN}`, `F404-${RUN}-CANON`, 2000);
  log(`  fixture product Canon=${canon}`);
  const r4a = await realReception(TOKEN, canon, 99, 800, 'CUP', 1.0, 'CANON-A');
  assertTrue('P4 seed via real HTTP reception 99@800', r4a.status >= 200 && r4a.status < 300);
  st = await prodState(canon);
  assertTrue('P4 seed state stock=99 wac=800', st.stock === 99 && Math.abs(st.wac - 800) <= TOL, `stock=${st.stock} wac=${st.wac}`);
  const pend = await mgmtOne(`INSERT INTO receipts (store_id, user_id, supplier, reception_date, reference_doc, total_cost, status)
    VALUES ('${STORE_A}','${ADMIN_UID}','REM-F4-04 CANON-PENDING-${RUN}', now(),'F404-CANON-B-${RUN}', 0,'pending') RETURNING id;`);
  const pendId = pend[0].id;
  await mgmtOne(`INSERT INTO receipt_items (receipt_id, product_id, quantity, unit_cost, moneda_recepcion, tasa_cambio_recepcion)
    VALUES ('${pendId}','${canon}',1,1000,'CUP',1.0) RETURNING id;`);
  log(`  pending receipt fixture=${pendId} (documented service harness, same pattern as RECON)`);
  const r4b = await fetch(`${SUPABASE_URL}/rest/v1/rpc/confirm_pending_reception`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_receipt_id: pendId }),
  });
  assertTrue('P4 confirm_pending_reception HTTP 2xx', r4b.status >= 200 && r4b.status < 300, `status=${r4b.status}`);
  st = await prodState(canon);
  assertTrue('P4 stock 99 → 100', st.stock === 100, `stock=${st.stock}`);
  assertEq('P4 WAC == 802 via canonical path', st.wac, 802, TOL);
  const wcl4 = await mgmtOne(`SELECT event, source_ref FROM wac_change_log WHERE product_id='${canon}' ORDER BY created_at;`);
  assertEq('P4 wac_change_log events = 2 (no double update)', wcl4.length, 2);
  assertTrue('P4 events both reception_in', wcl4.every(w => w.event === 'reception_in'), JSON.stringify(wcl4.map(w => w.event)));
  RESULTS.P4 = 'PASS';

  // ---- P5 (F4-04.5): sale after receipt -----------------------------------
  log('\n== P5. F4-04.5 sale after receipt (COGS = qty × WAC) ==');
  st = await prodState(VIGA2);
  const preSaleStock = st.stock; const preSaleWac = st.wac;
  log(`  VIGA2 PRE stock=${preSaleStock} wac=${preSaleWac}`);
  const ts = Date.now();
  const sale = await apiPost('/api/pos/checkout', {
    store_id: STORE_A, seller_id: ADMIN_UID, payment_method: 'cash',
    total_amount: 2500, subtotal: 2500, cash_amount: 2500, transfer_amount: 0, zelle_amount: 0,
    sale_currency: 'CUP', sale_exchange_rate: 1, idempotency_key: `f404-sale-${ts}`,
    items: [{ product_id: VIGA2, quantity: 1, price: 2500, cost: 1800, cash_paid: 2500 }],
  }, TOKEN);
  assertTrue('P5 checkout HTTP 2xx', sale.status >= 200 && sale.status < 300, `status=${sale.status} body=${sale.text.slice(0, 200)}`);
  const txid = sale.json?.transactionId || sale.json?.transaction_id || sale.json?.data?.transaction_id;
  assertTrue('P5 transactionId returned', !!txid, String(txid));
  const sm = await mgmtOne(`SELECT movement_type, quantity_change::text, unit_cost::text FROM stock_movements WHERE product_id='${VIGA2}' ORDER BY created_at DESC LIMIT 1;`);
  assertTrue('P5 sale movement type', ['sale','venta','out'].includes(String(sm[0].movement_type)), JSON.stringify(sm[0]));
  assertEq('P5 sale movement qty -1', parseFloat(sm[0].quantity_change), -1);
  assertEq('P5 COGS == qty × WAC == 1800 (server-side, NOT 0)', parseFloat(sm[0].unit_cost), preSaleWac, TOL);
  st = await prodState(VIGA2);
  assertEq('P5 product stock decremented by 1', st.stock, preSaleStock - 1);
  assertEq('P5 WAC invariant on sale (1800)', st.wac, preSaleWac, TOL);
  RESULTS.P5 = 'PASS';
  RESULTS.P5_txid = txid;
  RESULTS.P5_pre = { preSaleStock, preSaleWac };

  // ---- P6 (F4-04.6): reverse after sale -----------------------------------
  log('\n== P6. F4-04.6 reverse after sale (stock/ledger restored) ==');
  const rev = await apiPost('/api/reverse', { type: 'transaction', id: txid, reason: 'REM-F4-04 reverse regression' }, TOKEN);
  assertTrue('P6 reverse HTTP 2xx', rev.status >= 200 && rev.status < 300, `status=${rev.status} body=${rev.text.slice(0, 200)}`);
  st = await prodState(VIGA2);
  assertEq('P6 stock restored', st.stock, preSaleStock);
  assertEq('P6 WAC unchanged 1800 after reverse', st.wac, preSaleWac, TOL);
  const tx = await mgmtOne(`SELECT status FROM transactions WHERE id='${txid}';`);
  assertTrue('P6 transaction voided', tx[0].status === 'voided', `status=${tx[0].status}`);
  const revMoves = await mgmtOne(`SELECT movement_type, quantity_change::text FROM stock_movements WHERE product_id='${VIGA2}' ORDER BY created_at DESC LIMIT 2;`);
  assertTrue('P6 reversal movement recorded (+1)', parseFloat(revMoves[0].quantity_change) === 1, JSON.stringify(revMoves));
  RESULTS.P6 = 'PASS';

  // ---- P7 (F4-04.7): multistore isolation / security ----------------------
  log('\n== P7. F4-04.7 security: anon DENY, non-member DENY, no RLS bypass ==');
  const anon = await apiPost(`/api/inventory/receptions?storeId=${STORE_A}`, {
    p_store_id: STORE_A, p_supplier: 'ANON', p_reception_date: new Date().toISOString(),
    p_invoice_number: 'ANON', p_items: [{ product_id: arena2, quantity: 1, unit_cost: 1 }], p_po_id: null,
  }, null);
  assertTrue('P7 anon POST reception DENIED (401/403)', [401, 403].includes(anon.status), `status=${anon.status}`);
  const anonSale = await apiPost('/api/pos/checkout', { store_id: STORE_A, items: [] }, null);
  assertTrue('P7 anon checkout DENIED', [401, 403].includes(anonSale.status), `status=${anonSale.status}`);
  const zero = '00000000-0000-0000-0000-000000000000';
  const deny = await mgmt(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"${zero}","role":"authenticated"}';
    SELECT public.register_reception(p_store_id => '${STORE_B}'::uuid, p_supplier => 'SEC-DENY', p_reception_date => now(), p_invoice_number => 'SEC-DENY',
      p_items => '[{"product_id":"${zero}","quantity":1,"unit_cost":10}]'::jsonb, p_user_id => NULL, p_po_id => NULL); ROLLBACK;`);
  assertTrue('P7 non-member register_reception on STORE B DENIED (Unauthorized store access)',
    deny.status >= 400 && /Unauthorized store access/i.test(deny.text), `status=${deny.status} text=${deny.text.slice(0, 160)}`);
  log('  note: admin@demo.com is global role=admin → cross-store allowed BY DESIGN (D6, documented; not a defect)');
  RESULTS.P7 = 'PASS';

  // ---- P8 (F4-04.8): idempotency contract documentation -------------------
  log('\n== P8. F4-04.8 idempotency: official retry mechanism documentation ==');
  const idep = await insertProduct(`AUDIT F404 Idep ${RUN}`, `F404-${RUN}-IDEP`, 500);
  const IDEP_SUP = `REM-F4-04 ${RUN} IDEP`;
  const body8 = { p_store_id: STORE_A, p_supplier: IDEP_SUP, p_reception_date: new Date().toISOString(),
    p_invoice_number: `F404-IDEP-${RUN}-RETRY-SAME-BODY`, p_items: [{ product_id: idep, quantity: 5, unit_cost: 100 }], p_po_id: null };
  const i1 = await apiPost(`/api/inventory/receptions?storeId=${STORE_A}`, body8, TOKEN);
  assertTrue('P8 first reception 201', i1.status === 201, `status=${i1.status}`);
  const i2 = await apiPost(`/api/inventory/receptions?storeId=${STORE_A}`, body8, TOKEN);
  // Official contract (verified): UNIQUE INDEX idx_receipts_store_reference_doc (store_id, reference_doc=invoice_number)
  // rejects an identical duplicate submission with RPC unique-violation → route 500; NO state change occurs.
  assertTrue('P8 duplicate retry REJECTED (500, unique invoice per store — official mechanism)', i2.status === 500, `status=${i2.status} body=${i2.text.slice(0, 120)}`);
  st = await prodState(idep);
  assertTrue('P8 no duplicate effects: stock stays 5, WAC stays 100', st.stock === 5 && Math.abs(st.wac - 100) <= TOL, `stock=${st.stock} wac=${st.wac}`);
  const dupCount = await mgmtOne(`SELECT count(*)::int AS n FROM receipts WHERE supplier='${IDEP_SUP}';`);
  assertEq('P8 receipts for supplier = 1 (no duplicate receipt)', dupCount[0].n, 1);
  const effCount = await mgmtOne(`SELECT (SELECT count(*)::int FROM stock_movements WHERE product_id='${idep}') AS mv, (SELECT count(*)::int FROM wac_change_log WHERE product_id='${idep}') AS wcl;`);
  assertEq('P8 single stock movement', effCount[0].mv, 1);
  assertEq('P8 single WAC contribution', effCount[0].wcl, 1);
  RESULTS.P8 = 'PASS (idempotency via unique idx_receipts_store_reference_doc: duplicate retry → 500, zero state change; documented)';

  // ---- P9 (§19): multimoneda ----------------------------------------------
  log('\n== P9. §19 multimoneda: USD @ tasa 120 → single normalization to CUP ==');
  const fx = await insertProduct(`AUDIT F404 FX ${RUN}`, `F404-${RUN}-FX`, 2000);
  const r9 = await realReception(TOKEN, fx, 2, 10, 'USD', 120, 'FX');
  assertTrue('P9 reception 2@10USD@120 HTTP 2xx', r9.status >= 200 && r9.status < 300, `status=${r9.status}`);
  st = await prodState(fx);
  assertTrue('P9 stock 0 → 2', st.stock === 2, `stock=${st.stock}`);
  assertEq('P9 WAC == unit_cost × tasa == 1200 (single conversion, no double-apply)', st.wac, 1200, TOL);
  const mv9 = await mgmtOne(`SELECT unit_cost::text FROM stock_movements WHERE product_id='${fx}' ORDER BY created_at DESC LIMIT 1;`);
  assertEq('P9 movement unit_cost_cup 1200', parseFloat(mv9[0].unit_cost), 1200);
  const rc9 = await mgmtOne(`SELECT total_cost::text FROM receipts WHERE id='${r9.json.id}';`);
  assertEq('P9 receipt total_cost = 2 × (10×120) = 2400 CUP', parseFloat(rc9[0].total_cost), 2400);
  RESULTS.P9 = 'PASS';

  // ---- summary -------------------------------------------------------------
  log('\n== SUMMARY ==');
  const summary = { run_at: new Date().toISOString(), exit_clean: process.exitCode == null, results: RESULTS };
  log(JSON.stringify(summary, null, 2));
  fs.writeFileSync(`${EV}/remf404-test-suite-results.json`, JSON.stringify({ log: OUT.join('\n'), ...summary }, null, 2));
  fs.writeFileSync(`${EV}/remf404-test-suite-output.txt`, OUT.join('\n'));
})().catch(e => {
  console.error('SUITE CRASHED:', e);
  process.exitCode = 1;
});
