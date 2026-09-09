/**
 * REM-F4-03 TEST SUITE — Production withdrawal canonical server-side cost
 * Gate: 20260908-rem-f4-03 | Baseline: b94ca369 (REM-F4-04 PASS)
 *
 * Blocks:
 *  P0  preconditions (login, v3 def/ACL post-migration, F4-04 alive)
 *  P1  F4-03.1 valid production withdrawal (REAL HTTP PATH) + server-side cost
 *  P2  F4-03.2 cost authority == products.cost_average (server-side)
 *  P3  F4-03.3 forged LOW cost (p_unit_cost=0.01) ignored
 *  P4  F4-03.4 forged HIGH cost (p_unit_cost=999999999) ignored
 *  P5  F4-03.5 cross-store DENY (clerk of STORE A vs order in STORE B)
 *  P6  F4-03.6 non-member DENY (authenticated w/o membership, sub-zero JWT)
 *  P7  F4-03.7 anonymous DENY (HTTP 401 + RPC anon permission denied)
 *  P8  F4-03.8 quantity invariant stock_after = stock_before - qty
 *  P9  F4-03.9 accounting invariant (movement/item/audit use server-side WAC)
 *  P10 F4-03.10 idempotency (official registry contract, no double effects)
 *  P11 F4-03.11 concurrency (parallel withdrawals, FOR UPDATE serialization)
 *  P12 F4-03.12 overconsumption guard (budgeted ceiling enforced)
 *
 * All mutations on AUDIT F4E1 STORE A / STORE B fixtures ONLY (zero-touch prod).
 * Service harness: INSERT production_orders/production_order_items documented,
 * same pattern as RECON/F4-04 pending-receipt fixtures.
 */
const SUPABASE_URL = 'https://wthkddeleylijmonclxg.supabase.co';
const ANON_KEY = 'sb_publishable__wm5ULYU2FT_Cwq663dP5g_Ycg8AlXr';
const MGMT_URL = 'https://api.supabase.com/v1/projects/wthkddeleylijmonclxg/database/query';
const MGMT_TOKEN = process.env.SUPABASE_MGMT_TOKEN || ''; // secret — env only, never commit
const API = 'http://localhost:3000';
const STORE_A = 'f91b0e17-ac23-42ba-b08e-8159a6b57d83';
const STORE_B = '9e308fcd-391f-4b91-9866-f0155d8d5cbe';
const ADMIN_UID = 'a1111111-1111-1111-1111-111111111111';
const CLERK_UID = '9adf2009-9828-4d82-b923-f84d77f63a44';
const EV = new URL('../evidence/', import.meta.url).pathname;
const OUT = [];
const RESULTS = {};
const TOL = 1e-6;
const RUN = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 15);

const log = (s) => { OUT.push(s); console.log(s); };
const fs = await import('node:fs');

async function mgmt(sql) {
  const r = await fetch(MGMT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: r.status, data, text };
}
async function mgmtOne(sql) {
  const { status, data, text } = await mgmt(sql);
  if (status !== 201 || !Array.isArray(data)) throw new Error(`mgmt failed (${status}): ${text.slice(0, 300)}`);
  return data;
}
async function login(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('login failed: ' + JSON.stringify(j).slice(0, 120));
  return j.access_token;
}
async function apiPost(path, body, token) {
  const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json: j, text };
}
function assertEq(label, actual, expected, tol = 0) {
  const ok = tol ? Math.abs(actual - expected) <= tol : actual === expected;
  log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}${tol ? ` (tol ${tol})` : ''}`);
  if (!ok) RESULTS.fail = (RESULTS.fail || 0) + 1;
}
function assertTrue(label, cond, detail = '') {
  log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) RESULTS.fail = (RESULTS.fail || 0) + 1;
}
const prodState = (id) => mgmtOne(`SELECT stock_current::text, cost_average::text FROM products WHERE id='${id}';`)
  .then(r => ({ stock: parseFloat(r[0].stock_current), wac: parseFloat(r[0].cost_average) }));

async function realReception(token, productId, qty, cost, tag) {
  return apiPost(`/api/inventory/receptions?storeId=${STORE_A}`, {
    p_store_id: STORE_A,
    p_supplier: `REM-F4-03 ${tag}`,
    p_reception_date: new Date().toISOString(),
    p_invoice_number: `${tag}-${RUN}`,
    p_items: [{ product_id: productId, quantity: qty, unit_cost: cost, moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0 }],
    p_po_id: null,
  }, token);
}
async function insertProduct(name, sku, price, storeId = STORE_A, stock = 0, wac = 0) {
  const existing = await mgmtOne(`SELECT id FROM products WHERE store_id='${storeId}' AND sku='${sku}' LIMIT 1;`);
  if (existing.length) return existing[0].id;
  const rows = await mgmtOne(
    `INSERT INTO products (store_id,name,sku,stock_current,cost_average,price,unit_of_measure,category,is_active)
     VALUES ('${storeId}','${name}','${sku}',${stock},${wac},${price},'unidad','fixture-audit',true)
     RETURNING id;`);
  return rows[0].id;
}
async function createOrderItem(storeId, productId, budgetedQty, createdBy) {
  const ord = await mgmtOne(
    `INSERT INTO production_orders (store_id, order_number, order_type, status, budget_total, created_by, description)
     VALUES ('${storeId}','F403-${RUN}-${storeId.slice(0,4)}-${Math.floor(Math.random()*1e6)}','service','in_progress',0,'${createdBy}','REM-F4-03 fixture')
     RETURNING id;`);
  const orderId = ord[0].id;
  const it = await mgmtOne(
    `INSERT INTO production_order_items (order_id, product_id, budgeted_qty, budgeted_unit_cost, status)
     VALUES ('${orderId}','${productId}',${budgetedQty},0,'pending') RETURNING id;`);
  return { orderId, itemId: it[0].id };
}
const withdrawPath = (orderId) => `/api/production-orders/${orderId}/withdraw`;

try {
  // ---- P0: preconditions --------------------------------------------------
  log('# F4-03 TEST SUITE RUN ' + new Date().toISOString());
  log('# Baseline: production withdrawal must use server-side cost authority (client p_unit_cost must never reach accounting)\n');
  const TOKEN = await login('admin@demo.com', 'demo123');
  assertTrue('P0 admin login ok', !!TOKEN);
  const v3 = await mgmtOne(
    `SELECT p.prosecdef, pg_get_userbyid(p.proowner) AS owner, p.proconfig::text AS cfg,
            has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
            has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
            has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='withdraw_production_item_v3'
       AND lower(regexp_replace(pg_get_function_identity_arguments(p.oid),'\\s+',' ','g'))
           = 'p_item_id uuid, p_qty numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text, p_reference_id uuid, p_reference_doc text';`);
  assertTrue('P0 v3 exists with exact 7-arg signature', v3.length === 1);
  assertTrue('P0 v3 SECURITY DEFINER owned by postgres', v3[0].prosecdef && v3[0].owner === 'postgres', `owner=${v3[0].owner}`);
  assertTrue('P0 v3 search_path pinned', /search_path=public,\s*extensions/.test(v3[0].cfg || ''));
  assertTrue('P0 v3 ACL post-migration: auth=EXECUTE, anon=NO, svc=EXECUTE', v3[0].auth_exec && !v3[0].anon_exec && v3[0].svc_exec);
  const f404 = await mgmtOne(`SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('fn_recalc_wac','register_reception');`);
  assertEq('P0 REM-F4-04 functions still present (no F4-04 regression)', f404[0].n, 2);

  // ---- P1 (F4-03.1): valid withdrawal via REAL HTTP PATH -------------------
  log('\n== P1. F4-03.1 valid withdrawal (REAL HTTP PATH) + server-side cost ==');
  const mat = await insertProduct(`AUDIT F403 Material ${RUN}`, `F403-${RUN}-MAT`, 500);
  await realReception(TOKEN, mat, 10, 100, 'MAT-SEED');
  const st0 = await prodState(mat);
  assertEq('P1 seed WAC == 100 (server-side via canonical reception)', st0.wac, 100, TOL);
  assertEq('P1 seed stock == 10', st0.stock, 10);
  const { orderId: ORD1, itemId: ITEM1 } = await createOrderItem(STORE_A, mat, 5, ADMIN_UID);
  log(`  fixture order=${ORD1} item=${ITEM1} (budgeted_qty=5)`);
  const w1 = await apiPost(withdrawPath(ORD1), { item_id: ITEM1, qty: 1, unit_cost: 0.01 }, TOKEN);
  assertTrue('P1 withdraw HTTP 2xx', w1.status >= 200 && w1.status < 300, `status=${w1.status} body=${w1.text.slice(0, 160)}`);
  const w1res = w1.json && w1.json.result;
  assertTrue('P1 result.unit_cost_used present (server-side)', w1res && w1res.unit_cost_used != null, JSON.stringify(w1res));
  assertEq('P1 unit_cost_used == 100 (WAC, NOT client 0.01)', parseFloat(w1res.unit_cost_used), 100, TOL);
  const it1 = await mgmtOne(`SELECT actual_qty::text, actual_unit_cost::text, status, withdrawn_at IS NOT NULL AS w FROM production_order_items WHERE id='${ITEM1}';`);
  assertEq('P1 item actual_qty == 1', parseFloat(it1[0].actual_qty), 1);
  assertEq('P1 item actual_unit_cost == 100 (server-side)', parseFloat(it1[0].actual_unit_cost), 100, TOL);
  assertTrue('P1 item withdrawn_at set', it1[0].w);
  const mv1 = await mgmtOne(`SELECT movement_type, quantity_change::text, unit_cost::text FROM stock_movements WHERE product_id='${mat}' AND movement_type='production_out' ORDER BY created_at DESC LIMIT 1;`);
  assertTrue('P1 movement production_out recorded', mv1.length === 1, JSON.stringify(mv1));
  assertEq('P1 movement quantity_change == -1', parseFloat(mv1[0].quantity_change), -1);
  assertEq('P1 movement unit_cost == 100 (server-side, NOT 0.01)', parseFloat(mv1[0].unit_cost), 100, TOL);
  const st1 = await prodState(mat);
  assertEq('P1 stock 10 → 9', st1.stock, 9);
  RESULTS.P1 = 'PASS';

  // ---- P2 (F4-03.2): cost authority == products.cost_average ---------------
  log('\n== P2. F4-03.2 cost authority == server-side products.cost_average ==');
  const cur = await mgmtOne(`SELECT cost_average::text FROM products WHERE id='${mat}';`);
  assertEq('P2 result.unit_cost_used == products.cost_average (1:1)', parseFloat(w1res.unit_cost_used), parseFloat(cur[0].cost_average), TOL);
  RESULTS.P2 = 'PASS';

  // ---- P3 (F4-03.3): forged LOW cost ---------------------------------------
  log('\n== P3. F4-03.3 forged LOW cost (unit_cost=0.01 in body) ignored ==');
  const w2 = await apiPost(withdrawPath(ORD1), { item_id: ITEM1, qty: 1, unit_cost: 0.01 }, TOKEN);
  assertTrue('P3 withdraw HTTP 2xx (with forged 0.01)', w2.status >= 200 && w2.status < 300, `status=${w2.status}`);
  assertEq('P3 unit_cost_used STILL 100 (client cost ignored)', parseFloat(w2.json.result.unit_cost_used), 100, TOL);
  const mv2 = await mgmtOne(`SELECT unit_cost::text FROM stock_movements WHERE product_id='${mat}' AND movement_type='production_out' ORDER BY created_at DESC LIMIT 1;`);
  assertEq('P3 newest movement unit_cost == 100 (NOT 0.01)', parseFloat(mv2[0].unit_cost), 100, TOL);
  const zeroCostMoves = await mgmtOne(`SELECT count(*)::int AS n FROM stock_movements WHERE product_id='${mat}' AND movement_type='production_out' AND unit_cost = 0.01;`);
  assertEq('P3 zero movements carry forged cost 0.01', zeroCostMoves[0].n, 0);
  RESULTS.P3 = 'PASS';

  // ---- P4 (F4-03.4): forged HIGH cost --------------------------------------
  log('\n== P4. F4-03.4 forged HIGH cost (unit_cost=999999999 in body) ignored ==');
  const w3 = await apiPost(withdrawPath(ORD1), { item_id: ITEM1, qty: 1, unit_cost: 999999999 }, TOKEN);
  assertTrue('P4 withdraw HTTP 2xx (with forged 999999999)', w3.status >= 200 && w3.status < 300, `status=${w3.status}`);
  assertEq('P4 unit_cost_used STILL 100 (client cost ignored)', parseFloat(w3.json.result.unit_cost_used), 100, TOL);
  const mv3 = await mgmtOne(`SELECT unit_cost::text FROM stock_movements WHERE product_id='${mat}' AND movement_type='production_out' ORDER BY created_at DESC LIMIT 1;`);
  assertEq('P4 newest movement unit_cost == 100 (NOT 999999999)', parseFloat(mv3[0].unit_cost), 100, TOL);
  const hugeCostMoves = await mgmtOne(`SELECT count(*)::int AS n FROM stock_movements WHERE product_id='${mat}' AND movement_type='production_out' AND unit_cost >= 999999999;`);
  assertEq('P4 zero movements carry forged cost 999999999', hugeCostMoves[0].n, 0);
  RESULTS.P4 = 'PASS';

  // ---- P5 (F4-03.5): cross-store DENY (clerk STORE A vs order STORE B) -----
  log('\n== P5. F4-03.5 cross-store: clerk of STORE A attempts withdrawal on STORE B order ==');
  const CLERK = await login('audit-clerk-4f0d1e@costpro.test', 'demo123');
  assertTrue('P5 clerk login ok', !!CLERK);
  const clerkProfile = await mgmtOne(`SELECT active_store_id::text FROM profiles WHERE id='${CLERK_UID}';`);
  if (!clerkProfile[0].active_store_id || clerkProfile[0].active_store_id !== STORE_A) {
    await mgmtOne(`UPDATE profiles SET active_store_id='${STORE_A}' WHERE id='${CLERK_UID}';`);
    log('  (fixture: clerk active_store_id set to STORE A — documented service harness)');
  }
  const matB = await insertProduct(`AUDIT F403 MatB ${RUN}`, `F403-${RUN}-MATB`, 300, STORE_B, 10, 50);
  const { orderId: ORDB, itemId: ITEMB } = await createOrderItem(STORE_B, matB, 5, ADMIN_UID);
  const bBefore = await prodState(matB);
  const bMovesBefore = await mgmtOne(`SELECT count(*)::int AS n FROM stock_movements WHERE product_id='${matB}';`);
  const wB = await apiPost(withdrawPath(ORDB), { item_id: ITEMB, qty: 1, unit_cost: 0.01 }, CLERK);
  assertTrue('P5 cross-store withdrawal DENIED (403)', wB.status === 403, `status=${wB.status} body=${wB.text.slice(0, 140)}`);
  const bAfter = await prodState(matB);
  assertEq('P5 STORE B stock unchanged', bAfter.stock, bBefore.stock);
  assertEq('P5 STORE B WAC unchanged', bAfter.wac, bBefore.wac, TOL);
  const bMovesAfter = await mgmtOne(`SELECT count(*)::int AS n FROM stock_movements WHERE product_id='${matB}';`);
  assertEq('P5 STORE B ledger unchanged (0 new movements)', bMovesAfter[0].n - bMovesBefore[0].n, 0);
  const itB = await mgmtOne(`SELECT actual_qty::text FROM production_order_items WHERE id='${ITEMB}';`);
  assertEq('P5 STORE B item actual_qty unchanged', parseFloat(itB[0].actual_qty), 0);
  RESULTS.P5 = 'PASS';

  // ---- P6 (F4-03.6): non-member DENY (sub-zero authenticated JWT) ----------
  log('\n== P6. F4-03.6 non-member authenticated (no membership) DENIED ==');
  const zero = '00000000-0000-0000-0000-000000000000';
  const aBefore = await prodState(mat);
  const deny = await mgmt(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"${zero}","role":"authenticated"}';
    SELECT public.withdraw_production_item_v3(p_item_id => '${ITEM1}'::uuid, p_qty => 1, p_store_id => '${STORE_A}'::uuid, p_user_id => NULL, p_idempotency_key => NULL, p_reference_id => NULL, p_reference_doc => NULL); ROLLBACK;`);
  assertTrue('P6 non-member withdraw DENIED (ERR_UNAUTHORIZED)', deny.status >= 400 && /ERR_UNAUTHORIZED/.test(deny.text), `status=${deny.status} text=${deny.text.slice(0, 160)}`);
  const aAfter6 = await prodState(mat);
  assertEq('P6 STORE A stock unchanged after deny', aAfter6.stock, aBefore.stock);
  const itD = await mgmtOne(`SELECT actual_qty::text FROM production_order_items WHERE id='${ITEM1}';`);
  assertEq('P6 item actual_qty unchanged after deny', parseFloat(itD[0].actual_qty), 3);
  RESULTS.P6 = 'PASS';

  // ---- P7 (F4-03.7): anonymous DENY ----------------------------------------
  log('\n== P7. F4-03.7 anonymous DENY (no auth) ==');
  const anon = await apiPost(withdrawPath(ORD1), { item_id: ITEM1, qty: 1 }, null);
  assertTrue('P7 anon HTTP withdraw DENIED (401/403)', [401, 403].includes(anon.status), `status=${anon.status}`);
  const anonRpc = await mgmt(`BEGIN; SET LOCAL ROLE anon; SET LOCAL request.jwt.claims = '{"role":"anon"}';
    SELECT public.withdraw_production_item_v3(p_item_id => '${ITEM1}'::uuid, p_qty => 1, p_store_id => '${STORE_A}'::uuid, p_user_id => NULL, p_idempotency_key => NULL, p_reference_id => NULL, p_reference_doc => NULL); ROLLBACK;`);
  assertTrue('P7 anon RPC DENIED (no EXECUTE privilege)', anonRpc.status >= 400 && /permission denied/i.test(anonRpc.text), `status=${anonRpc.status} text=${anonRpc.text.slice(0, 160)}`);
  RESULTS.P7 = 'PASS';

  // ---- P8 (F4-03.8): quantity invariant ------------------------------------
  log('\n== P8. F4-03.8 quantity invariant: stock_after = stock_before - qty ==');
  const st8pre = await prodState(mat); // after P1+P3+P4: 10-3 = 7
  const w8 = await apiPost(withdrawPath(ORD1), { item_id: ITEM1, qty: 2 }, TOKEN);
  assertTrue('P8 withdraw qty=2 HTTP 2xx', w8.status >= 200 && w8.status < 300, `status=${w8.status}`);
  const st8 = await prodState(mat);
  assertEq('P8 stock_after == stock_before - 2', st8.stock, st8pre.stock - 2);
  const it8 = await mgmtOne(`SELECT actual_qty::text, status FROM production_order_items WHERE id='${ITEM1}';`);
  assertEq('P8 item actual_qty == 5 (1+1+1+2)', parseFloat(it8[0].actual_qty), 5);
  assertEq('P8 item status == completed (actual >= budgeted)', it8[0].status, 'completed');
  RESULTS.P8 = 'PASS';

  // ---- P9 (F4-03.9): accounting invariant ----------------------------------
  log('\n== P9. F4-03.9 accounting invariant: every accounting row uses server-side WAC ==');
  const allMoves = await mgmtOne(`SELECT unit_cost::text, quantity_change::text FROM stock_movements WHERE product_id='${mat}' AND movement_type='production_out' ORDER BY created_at;`);
  assertEq('P9 four production_out movements recorded', allMoves.length, 4);
  let allServerSide = true;
  for (const m of allMoves) { if (Math.abs(parseFloat(m.unit_cost) - 100) > TOL) allServerSide = false; }
  assertTrue('P9 ALL movement unit_cost == 100 (server-side WAC)', allServerSide, JSON.stringify(allMoves));
  const invSum = await mgmtOne(`SELECT sum(abs(quantity_change))::text AS q FROM stock_movements WHERE product_id='${mat}' AND movement_type='production_out';`);
  assertEq('P9 total withdrawn == 5', parseFloat(invSum[0].q), 5);
  const wacAfter = await prodState(mat);
  assertEq('P9 WAC unchanged by withdrawals (100 — withdrawals do not re-price)', wacAfter.wac, 100, TOL);
  const wcl = await mgmtOne(`SELECT count(*)::int AS n FROM wac_change_log WHERE product_id='${mat}';`);
  assertEq('P9 wac_change_log == 1 (only the seed reception; withdrawals contribute none)', wcl[0].n, 1);
  const audits = await mgmtOne(`SELECT metadata FROM audit_logs WHERE action='PRODUCTION_ITEM_WITHDRAWN' AND (metadata->>'order_id') = '${ORD1}' ORDER BY created_at;`);
  assertEq('P9 audit_logs PRODUCTION_ITEM_WITHDRAWN == 4', audits.length, 4);
  let allCostAuthority = true;
  for (const a of audits) { if (a.metadata && a.metadata.cost_authority !== 'server_side_wac_v3') allCostAuthority = false; }
  assertTrue('P9 ALL audits declare cost_authority=server_side_wac_v3', allCostAuthority);
  let auditCostsMatch = true;
  for (const a of audits) { if (Math.abs(parseFloat(a.metadata.unit_cost_used) - 100) > TOL) auditCostsMatch = false; }
  assertTrue('P9 ALL audits unit_cost_used == 100 (procedencia server-side)', auditCostsMatch);
  RESULTS.P9 = 'PASS';

  // ---- P10 (F4-03.10): idempotency (official registry contract) ------------
  log('\n== P10. F4-03.10 idempotency: same idempotency_key replays same result, zero double effects ==');
  const mat2 = await insertProduct(`AUDIT F403 Idep ${RUN}`, `F403-${RUN}-IDEP`, 700);
  await realReception(TOKEN, mat2, 6, 250, 'IDEP-SEED');
  const { orderId: ORD2, itemId: ITEM2 } = await createOrderItem(STORE_A, mat2, 4, ADMIN_UID);
  const IDEM = `F403-${RUN}-IDEM-KEY-1`;
  const id1 = await apiPost(withdrawPath(ORD2), { item_id: ITEM2, qty: 1, unit_cost: 0.01, idempotency_key: IDEM }, TOKEN);
  assertTrue('P10 first withdraw HTTP 2xx', id1.status >= 200 && id1.status < 300, `status=${id1.status}`);
  const id1res = id1.json.result;
  const st10a = await prodState(mat2);
  const mvCount1 = await mgmtOne(`SELECT count(*)::int AS n FROM stock_movements WHERE product_id='${mat2}' AND movement_type='production_out';`);
  const reg1 = await mgmtOne(`SELECT count(*)::int AS n FROM idempotency_registry WHERE idempotency_key='${IDEM}' AND operation='withdraw_v3';`);
  assertEq('P10 idempotency_registry row registered', reg1[0].n, 1);
  const id2 = await apiPost(withdrawPath(ORD2), { item_id: ITEM2, qty: 1, unit_cost: 0.01, idempotency_key: IDEM }, TOKEN);
  assertTrue('P10 retry with same key HTTP 2xx (replayed)', id2.status >= 200 && id2.status < 300, `status=${id2.status}`);
  assertTrue('P10 retry returns SAME result payload', JSON.stringify(id2.json.result) === JSON.stringify(id1res), `${JSON.stringify(id2.json.result)} vs ${JSON.stringify(id1res)}`);
  const st10b = await prodState(mat2);
  assertEq('P10 no double stock decrement', st10b.stock, st10a.stock);
  const mvCount2 = await mgmtOne(`SELECT count(*)::int AS n FROM stock_movements WHERE product_id='${mat2}' AND movement_type='production_out';`);
  assertEq('P10 no double movement', mvCount2[0].n - mvCount1[0].n, 0);
  const it10 = await mgmtOne(`SELECT actual_qty::text FROM production_order_items WHERE id='${ITEM2}';`);
  assertEq('P10 item actual_qty still 1 (no double consumption)', parseFloat(it10[0].actual_qty), 1);
  const regDup = await mgmtOne(`SELECT count(*)::int AS n FROM idempotency_registry WHERE idempotency_key='${IDEM}' AND operation='withdraw_v3';`);
  assertEq('P10 registry still has exactly 1 row for key', regDup[0].n, 1);
  RESULTS.P10 = 'PASS';

  // ---- P11 (F4-03.11): concurrency (FOR UPDATE serialization) --------------
  log('\n== P11. F4-03.11 concurrency: two parallel withdrawals over budgeted ceiling ==');
  const mat3 = await insertProduct(`AUDIT F403 Conc ${RUN}`, `F403-${RUN}-CONC`, 900);
  await realReception(TOKEN, mat3, 10, 400, 'CONC-SEED');
  const { orderId: ORD3, itemId: ITEM3 } = await createOrderItem(STORE_A, mat3, 2, ADMIN_UID);
  const st11pre = await prodState(mat3);
  const [c1, c2] = await Promise.all([
    apiPost(withdrawPath(ORD3), { item_id: ITEM3, qty: 2, unit_cost: 0.01, idempotency_key: `F403-${RUN}-C1` }, TOKEN),
    apiPost(withdrawPath(ORD3), { item_id: ITEM3, qty: 2, unit_cost: 0.01, idempotency_key: `F403-${RUN}-C2` }, TOKEN),
  ]);
  const oks = [c1, c2].filter(r => r.status >= 200 && r.status < 300);
  const errs = [c1, c2].filter(r => r.status >= 400);
  assertEq('P11 exactly 1 of 2 parallel withdrawals succeeded', oks.length, 1);
  assertEq('P11 exactly 1 of 2 parallel withdrawals denied', errs.length, 1);
  assertTrue('P11 denial is overconsumption/budget guard', errs.length === 1 && /excede|OVERCONSUM/i.test(errs[0].text), errs.length ? errs[0].text.slice(0, 120) : '');
  const it11 = await mgmtOne(`SELECT actual_qty::text FROM production_order_items WHERE id='${ITEM3}';`);
  assertEq('P11 item actual_qty == 2 (budgeted ceiling, no lost update)', parseFloat(it11[0].actual_qty), 2);
  const st11 = await prodState(mat3);
  assertEq('P11 stock decremented exactly 2 (no double consumption)', st11.stock, st11pre.stock - 2);
  const mv11 = await mgmtOne(`SELECT count(*)::int AS n FROM stock_movements WHERE product_id='${mat3}' AND movement_type='production_out';`);
  assertEq('P11 exactly 1 production_out movement', mv11[0].n, 1);
  RESULTS.P11 = 'PASS';

  // ---- P12: overconsumption guard (budget ceiling explicit) ----------------
  log('\n== P12. F4-03.12 overconsumption guard explicit (qty beyond budgeted) ==');
  const w12 = await apiPost(withdrawPath(ORD3), { item_id: ITEM3, qty: 1, unit_cost: 0.01 }, TOKEN);
  assertTrue('P12 withdraw beyond budgeted DENIED (400)', w12.status === 400, `status=${w12.status} body=${w12.text.slice(0, 140)}`);
  assertTrue('P12 error mentions budget ceiling', /excede/i.test(w12.text), w12.text.slice(0, 120));
  const it12 = await mgmtOne(`SELECT actual_qty::text FROM production_order_items WHERE id='${ITEM3}';`);
  assertEq('P12 item actual_qty unchanged (2)', parseFloat(it12[0].actual_qty), 2);
  RESULTS.P12 = 'PASS';

  // ---- SUMMARY --------------------------------------------------------------
  log('\n== SUMMARY ==');
  const summary = {
    run_at: new Date().toISOString(),
    exit_clean: !RESULTS.fail,
    failures: RESULTS.fail || 0,
    results: { P1: RESULTS.P1, P2: RESULTS.P2, P3: RESULTS.P3, P4: RESULTS.P4, P5: RESULTS.P5, P6: RESULTS.P6, P7: RESULTS.P7, P8: RESULTS.P8, P9: RESULTS.P9, P10: RESULTS.P10, P11: RESULTS.P11, P12: RESULTS.P12 },
  };
  log(JSON.stringify(summary, null, 2));
  fs.writeFileSync(EV + 'remf403-test-suite-output.txt', OUT.join('\n') + '\n');
  fs.writeFileSync(EV + 'remf403-test-suite-results.json', JSON.stringify({ log: OUT.join('\n'), ...summary }, null, 2));
  process.exit(RESULTS.fail ? 1 : 0);
} catch (e) {
  log('\n== SUITE ERROR ==');
  log(String(e && e.stack || e));
  const fs2 = await import('node:fs');
  fs2.writeFileSync(EV + 'remf403-test-suite-output.txt', OUT.join('\n') + '\n');
  process.exit(1);
}
