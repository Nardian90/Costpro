#!/usr/bin/env node
/**
 * R1 · Execution SQL builder
 * Generates the canonical single-transaction repair scripts from the FROZEN
 * design pack (authority of execution: 07-proposed-opening.csv; notes source:
 * 03-repair-universe.csv). Emits:
 *   scripts/r1_rehearsal.sql  (identical, ends in ROLLBACK)
 *   scripts/r1_execute.sql    (ends in COMMIT)
 *   raw/r1_batch_id.txt
 * Structure per design 12-atomicity.md + 18-execution-checklist.md:
 *   BEGIN -> advisory lock -> FOR UPDATE(98, ORDER BY id) -> validations (B1/B4,
 *   ledger empty, universe drift, test residue) -> SET LOCAL ROLE authenticated
 *   + JWT claims -> 98 x register_stock_movement('initial') -> RESET ROLE ->
 *   in-transaction invariants (I1-I16 + financial neutrality) -> audit row ->
 *   report -> COMMIT/ROLLBACK.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const R1 = '/home/z/my-project/Costpro/audit-evidence/20260906-w9-b10b-obs2-r1';
const DESIGN = '/home/z/my-project/Costpro/audit-evidence/20260906-w9-b10b-obs2-repair-design';

const STORE = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
const ACTOR = '051c6157-600b-425e-b8c0-72388bacf541';
const PACK = '20260906-w9-b10b-obs2-repair-design';
const POSITION_DATE = '2026-08-16T22:01:13Z';
const BACKUP_TS = '2026-08-02T02:25:31Z';

// ---------- batch id (design 11-idempotency.md format) ----------
const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'); // 20260906T205900Z
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let rand = '';
for (let i = 0; i < 4; i++) rand += alphabet[crypto.randomInt(alphabet.length)];
const BATCH_PATH = path.join(R1, 'raw/r1_batch_id.txt');
const BATCH = fs.existsSync(BATCH_PATH)
  ? fs.readFileSync(BATCH_PATH, 'utf8').trim()
  : `B10B-OBS2-RECON-OPENING:${ts}-${rand}`;
fs.writeFileSync(BATCH_PATH, BATCH);

// ---------- frozen inputs ----------
const csv07 = fs.readFileSync(path.join(DESIGN, '07-proposed-opening.csv'), 'utf8').trim().split('\n');
const hdr = csv07[0].split(',');
const rows = csv07.slice(1).map(l => { const c = l.split(','); const o = {}; hdr.forEach((h, i) => o[h] = c[i]); return o; });
if (rows.length !== 98) { console.error(`FATAL: expected 98 rows in 07 CSV, got ${rows.length}`); process.exit(2); }

// exact decimal texts from DB (authority for SQL literals; the frozen CSV remains
// the authority for the approved VALUES at float64 precision — equality asserted
// row by row below). Rationale: products.cost_average is SQL numeric with up to
// 16 decimal places; the design CSV recorded its float64 (JSON) representation.
// design G1 (09-wac-model.md §2.4) demands p_unit_cost == cost_average EXACTLY,
// so literals are built from the DB's exact decimal text.
const exactRows = JSON.parse(fs.readFileSync(path.join(R1, 'raw/r1_exact_decimals.json'), 'utf8'))[0].exact_rows;
const exactMap = new Map(exactRows.map(r => [r.product_id, r]));
for (const r of rows) {
  const e = exactMap.get(r.product_id);
  if (!e) { console.error(`FATAL: no exact decimal row for ${r.sku}`); process.exit(2); }
  if (Number(e.wac_text) !== Number(r.opening_unit_cost)) { console.error(`FATAL: WAC float64 mismatch ${r.sku}: ${e.wac_text} vs ${r.opening_unit_cost}`); process.exit(2); }
  if (Number(e.stock_text) !== Number(r.opening_qty)) { console.error(`FATAL: qty float64 mismatch ${r.sku}: ${e.stock_text} vs ${r.opening_qty}`); process.exit(2); }
  r.qty_literal = e.stock_text; r.wac_literal = e.wac_text;
}
const backupQty = new Map();
fs.readFileSync(path.join(DESIGN, '03-repair-universe.csv'), 'utf8').trim().split('\n').slice(1).forEach(l => {
  const c = l.split(','); backupQty.set(c[0], c[6]); // column 7 = backup_qty
});
const testRows = fs.readFileSync(path.join(DESIGN, '05-test-exclusions.csv'), 'utf8').trim().split('\n').slice(1)
  .map(l => { const c = l.split(','); return { id: c[0], sku: c[1], stock: c[3] }; });

// frozen global baselines (PRE snapshot, design pack 20-zero-mutation.md)
const FROZEN = { payments_all: 366, transactions_all: 520, transaction_items_all: 555, commissions_all: 0, devolutions_store: 13, receipts_store: 0, inventory_other: 141, movements_other: 702, kardex_other: 702 };

const sumQty = rows.reduce((a, r) => a + Number(r.opening_qty), 0);
const sumVal = rows.reduce((a, r) => a + Number(r.opening_qty) * Number(r.opening_unit_cost), 0);
if (sumQty !== 6427) { console.error(`FATAL: Σ qty ${sumQty} != 6427`); process.exit(2); }

// ---------- SQL fragments ----------
const uuidList = rows.map(r => `'${r.product_id}'::uuid`).join(', ');
const valuesList = rows.map(r => `('${r.product_id}'::uuid, ${r.qty_literal}::numeric, ${r.wac_literal}::numeric)`).join(',\n    ');
const testValues = testRows.map(r => `('${r.id}'::uuid, ${r.stock}::numeric)`).join(',\n    ');
const claims = `{"sub":"${ACTOR}","role":"authenticated","email":"admin@costpro.com"}`;

const rpcCalls = rows.map(r => {
  const notes = JSON.stringify({
    batch: BATCH, pack: PACK, set: r.set, confidence: r.confidence,
    backup_qty: Number(backupQty.get(r.product_id)), position_date: POSITION_DATE,
  });
  return `SELECT public.register_stock_movement(
  p_product_id         => '${r.product_id}'::uuid,
  p_store_id           => '${STORE}'::uuid,
  p_quantity           => ${r.qty_literal}::numeric,
  p_movement_type      => 'initial',
  p_reason             => '${BATCH}',
  p_user_id            => '${ACTOR}'::uuid,
  p_variant_id         => NULL,
  p_sale_id            => NULL,
  p_unit_cost          => ${r.wac_literal}::numeric,
  p_notes              => '${notes}',
  p_operation_date     => now(),
  p_skip_access_check  => false
);`;
}).join('\n');

const template = (finalClause) => `-- =====================================================================
-- W9.5 B-10b-OBS-2-R1 · CONTROLLED ORPHAN INVENTORY REPAIR EXECUTION
-- Model D = B + C · store ${STORE} · TIENDA CENTRAL COSTPRO
-- repair_batch_id: ${BATCH}
-- universe: 98 products / 6427 units / value 9932216.938816005 (published 9932216.94)
-- excluded test: 10 products / 126 units (EXCLUDED_FROM_REPAIR)
-- actor (RECONCILIATION_EXECUTOR): ${ACTOR} · admin@costpro.com
-- design pack: ${PACK} (SHA256SUMS 45/45 OK) · human authorization: R1 execution order
-- generated by scripts/r1_build_execution_sql.js at ${new Date().toISOString()}
-- final clause: ${finalClause}
-- =====================================================================

BEGIN;

-- hard stop if any single statement blocks > 15s (abort criteria A17)
SET LOCAL lock_timeout = '15s';

-- ============================================================
-- PHASE A · LOCKS (design 12-atomicity.md)
-- ============================================================
SELECT pg_advisory_xact_lock(hashtextextended('b10b-obs2-recon:${STORE}', 0)) AS advisory_lock;
SELECT id, stock_current, cost_average FROM products
WHERE id IN (
  ${uuidList}
)
ORDER BY id FOR UPDATE;

-- ============================================================
-- PHASE B · PRE-MUTATION VALIDATIONS (full visibility, admin context)
-- design 19-abort-criteria.md A1/A3-A5/A8/A9/A14 + §5/§6/§7/§8
-- ============================================================
DO $r1_pre$
DECLARE
  v numeric; v_cnt int; v_w numeric;
  r record;
BEGIN
  -- B1 idempotency barrier (prefix-constant, global scope)
  SELECT count(*) INTO v FROM stock_movements WHERE reference_doc LIKE 'B10B-OBS2-RECON-OPENING:%';
  IF v > 0 THEN RAISE EXCEPTION 'ERR_RECON_ALREADY_APPLIED: opening already present (%)', v; END IF;

  -- rollback marker must not exist either
  SELECT count(*) INTO v FROM stock_movements WHERE reference_doc LIKE 'B10B-OBS2-RECON-ROLLBACK:%';
  IF v > 0 THEN RAISE EXCEPTION 'ERR_ROLLBACK_MARKER_PRESENT (%)', v; END IF;

  -- B4 audit barrier
  SELECT count(*) INTO v FROM audit_logs WHERE action = 'STOCK_RECONCILIATION_OPENING';
  IF v > 0 THEN RAISE EXCEPTION 'ERR_RECON_AUDIT_EXISTS (%)', v; END IF;

  -- ledger must be empty for the store (A3/A4/A5/A6)
  SELECT count(*) INTO v FROM inventory WHERE store_id = '${STORE}';
  IF v <> 0 THEN RAISE EXCEPTION 'ERR_LEDGER_NOT_EMPTY inventory=%', v; END IF;
  SELECT count(*) INTO v FROM stock_movements WHERE store_id = '${STORE}';
  IF v <> 0 THEN RAISE EXCEPTION 'ERR_LEDGER_NOT_EMPTY movements=%', v; END IF;
  SELECT count(*) INTO v FROM kardex_entries WHERE store_id = '${STORE}';
  IF v <> 0 THEN RAISE EXCEPTION 'ERR_LEDGER_NOT_EMPTY kardex=%', v; END IF;
  SELECT count(*) INTO v FROM transactions WHERE store_id = '${STORE}';
  IF v <> 0 THEN RAISE EXCEPTION 'ERR_LEDGER_NOT_EMPTY transactions=%', v; END IF;

  -- universe integrity: exactly 98 batch products exist and store has exactly 124
  SELECT count(*) INTO v_cnt FROM products WHERE id IN (${uuidList});
  IF v_cnt <> 98 THEN RAISE EXCEPTION 'ERR_UNIVERSE_CHANGED: batch products = % (expected 98)', v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM products WHERE store_id = '${STORE}';
  IF v_cnt <> 124 THEN RAISE EXCEPTION 'ERR_UNIVERSE_CHANGED: store products = % (expected 124)', v_cnt; END IF;

  -- per-row drift check (A9): stock_current and cost_average == frozen CSV
  FOR r IN
    SELECT * FROM (VALUES
    ${valuesList}
    ) AS t(pid, q, w)
  LOOP
    SELECT stock_current, cost_average INTO v, v_w FROM products WHERE id = r.pid;
    IF v IS DISTINCT FROM r.q OR v_w IS DISTINCT FROM r.w THEN
      RAISE EXCEPTION 'ERR_UNIVERSE_DRIFT: % stock=%(exp %) wac=%(exp %)', r.pid, v, r.q, v_w, r.w;
    END IF;
  END LOOP;

  -- test residue intact (§5): 10 products, exact frozen stocks, zero ledger
  FOR r IN
    SELECT * FROM (VALUES
    ${testValues}
    ) AS t(tid, s)
  LOOP
    SELECT stock_current INTO v FROM products WHERE id = r.tid;
    IF v IS DISTINCT FROM r.s THEN
      RAISE EXCEPTION 'ERR_TEST_RESIDUE_CHANGED: % stock=%(exp %)', r.tid, v, r.s;
    END IF;
    SELECT count(*) INTO v FROM inventory WHERE product_id = r.tid;
    IF v <> 0 THEN RAISE EXCEPTION 'ERR_TEST_RESIDUE_LEDGER: inventory rows for %', r.tid; END IF;
    SELECT count(*) INTO v FROM stock_movements WHERE product_id = r.tid;
    IF v <> 0 THEN RAISE EXCEPTION 'ERR_TEST_RESIDUE_LEDGER: movements for %', r.tid; END IF;
  END LOOP;
END
$r1_pre$;

-- ============================================================
-- PHASE C · CANONICAL MUTATION — 98 x register_stock_movement('initial')
-- design 10-opening-design.md §1.1/§1.2 · p_skip_access_check = false
-- EXECUTION NOTE (documented deviation, evidence raw/r1_acl.json):
-- EXECUTE on register_stock_movement is granted to postgres+service_role only
-- (production calls it server-side). We execute over the privileged connection
-- with request.jwt.claims set so that auth.uid() = ${ACTOR} and the canonical
-- access check runs (has_store_access -> is_admin -> true). created_by and the
-- audit context come from p_user_id + claims = the signer.
-- ============================================================
SELECT set_config('request.jwt.claims', '${claims}', true) AS jwt_claims_set;

${rpcCalls}

-- ============================================================
-- PHASE D · POST-MUTATION INVARIANTS INSIDE TRANSACTION
-- mandate §18 I1-I16 + §19 financial neutrality (RAISE on any failure)
-- ============================================================
DO $r1_post$
DECLARE
  v numeric; v_cnt int; v_cnt2 int; v_w numeric;
  r record;
BEGIN
  -- I12/I13: exactly one batch, exactly 98 opening movements, Σ = 6427 (I2)
  SELECT count(*), count(DISTINCT reference_doc) INTO v_cnt, v_cnt2
  FROM stock_movements WHERE reference_doc = '${BATCH}';
  IF v_cnt <> 98 OR v_cnt2 <> 1 THEN
    RAISE EXCEPTION 'ERR_INVARIANT_BATCH_SHAPE: movements=% distinct_batch=%', v_cnt, v_cnt2;
  END IF;
  SELECT count(*) INTO v_cnt FROM stock_movements WHERE reference_doc LIKE 'B10B-OBS2-RECON-OPENING:%';
  IF v_cnt <> 98 THEN RAISE EXCEPTION 'ERR_INVARIANT_BATCH_FAMILY: % rows with prefix', v_cnt; END IF;
  SELECT COALESCE(SUM(quantity_change),0) INTO v FROM stock_movements WHERE reference_doc = '${BATCH}';
  IF v <> 6427 THEN RAISE EXCEPTION 'ERR_INVARIANT_I2: Σ=% (expected 6427)', v; END IF;

  -- I1/I3/I4/I6 per product: triada canonica + WAC preserved
  FOR r IN
    SELECT * FROM (VALUES
    ${valuesList}
    ) AS t(pid, q, w)
  LOOP
    SELECT quantity INTO v FROM inventory WHERE product_id = r.pid AND store_id = '${STORE}';
    IF v IS DISTINCT FROM r.q THEN RAISE EXCEPTION 'ERR_INVARIANT_I4: inventory % = % (exp %)', r.pid, v, r.q; END IF;
    SELECT stock_current, cost_average INTO v, v_w FROM products WHERE id = r.pid;
    IF v IS DISTINCT FROM r.q THEN RAISE EXCEPTION 'ERR_INVARIANT_I3: stock_current % = % (exp %)', r.pid, v, r.q; END IF;
    IF v_w IS DISTINCT FROM r.w THEN RAISE EXCEPTION 'ERR_INVARIANT_I6: WAC % = % (exp %)', r.pid, v_w, r.w; END IF;
    SELECT COALESCE(SUM(quantity_change),0), count(*) INTO v, v_cnt
    FROM stock_movements WHERE product_id = r.pid AND store_id = '${STORE}';
    IF v <> r.q OR v_cnt <> 1 THEN RAISE EXCEPTION 'ERR_INVARIANT_I1: movements % Σ=% n=% (exp %,1)', r.pid, v, v_cnt, r.q; END IF;
    -- kardex 1:1 (I5): exactly one 'in' entry referencing the movement.
    -- NOTE: kardex_entries numeric columns are numeric(12,2) (canonical frozen
    -- typmod, evidence raw/r1_typmods.json) -> compare at the column's scale.
    -- The EXACT WAC/value lives in stock_movements.unit_cost (unbounded numeric)
    -- and products.cost_average (unbounded) — checked above.
    SELECT count(*) INTO v_cnt
    FROM kardex_entries k JOIN stock_movements m ON m.id = k.reference_id
    WHERE m.reference_doc = '${BATCH}' AND m.product_id = r.pid
      AND k.movement_type = 'in' AND k.quantity = round(r.q, 2)
      AND k.balance_quantity = round(r.q, 2) AND k.balance_unit_cost = round(r.w, 2)
      AND k.total_value = round(r.q * r.w, 2)
      AND k.reference_description = '${BATCH}';
    IF v_cnt <> 1 THEN RAISE EXCEPTION 'ERR_INVARIANT_I5: kardex % rows=% (exp 1)', r.pid, v_cnt; END IF;
    -- business_events (design I9): one 'initial' event with new_qty = q
    SELECT count(*) INTO v_cnt FROM business_events
    WHERE entity_id = r.pid AND payload->>'type' = 'initial'
      AND (payload->>'new_qty')::numeric = r.q AND payload->>'store_id' = '${STORE}';
    IF v_cnt <> 1 THEN RAISE EXCEPTION 'ERR_INVARIANT_BE: % events=% (exp 1)', r.pid, v_cnt; END IF;
  END LOOP;

  -- I14: no Test product included
  SELECT count(*) INTO v_cnt FROM stock_movements m
  WHERE m.reference_doc = '${BATCH}' AND m.product_id IN (${testRows.map(r => `'${r.id}'::uuid`).join(', ')});
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'ERR_INVARIANT_I14: test products in batch (%)', v_cnt; END IF;

  -- I15: actor correct on every movement
  SELECT count(*) INTO v_cnt FROM stock_movements
  WHERE reference_doc = '${BATCH}' AND (created_by IS DISTINCT FROM '${ACTOR}'::uuid);
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'ERR_INVARIANT_I15: wrong created_by on % rows', v_cnt; END IF;

  -- I16: reference traceable end-to-end (movement -> kardex -> audit pending)
  SELECT count(*) INTO v_cnt FROM kardex_entries WHERE reference_description = '${BATCH}';
  IF v_cnt <> 98 THEN RAISE EXCEPTION 'ERR_INVARIANT_I16: kardex traceable rows=%', v_cnt; END IF;

  -- inventory shape: exactly 98 rows in store; others untouched (I11)
  SELECT count(*) INTO v_cnt FROM inventory WHERE store_id = '${STORE}';
  IF v_cnt <> 98 THEN RAISE EXCEPTION 'ERR_INVARIANT_INVENTORY_STORE: % rows (exp 98)', v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM inventory WHERE store_id <> '${STORE}';
  IF v_cnt <> ${FROZEN.inventory_other} THEN RAISE EXCEPTION 'ERR_INVARIANT_I11: other-store inventory % (exp ${FROZEN.inventory_other})', v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM stock_movements WHERE store_id <> '${STORE}';
  IF v_cnt <> ${FROZEN.movements_other} THEN RAISE EXCEPTION 'ERR_INVARIANT_I11: other-store movements % (exp ${FROZEN.movements_other})', v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM kardex_entries WHERE store_id <> '${STORE}';
  IF v_cnt <> ${FROZEN.kardex_other} THEN RAISE EXCEPTION 'ERR_INVARIANT_I11: other-store kardex % (exp ${FROZEN.kardex_other})', v_cnt; END IF;

  -- §19 FINANCIAL NEUTRALITY (frozen PRE baselines)
  SELECT count(*) INTO v_cnt FROM transactions WHERE store_id = '${STORE}';
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'ERR_FINANCIAL_I7: store transactions %', v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM transactions;
  IF v_cnt <> ${FROZEN.transactions_all} THEN RAISE EXCEPTION 'ERR_FINANCIAL_I10: global transactions % (exp ${FROZEN.transactions_all})', v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM transaction_items;
  IF v_cnt <> ${FROZEN.transaction_items_all} THEN RAISE EXCEPTION 'ERR_FINANCIAL_I10: global transaction_items % (exp ${FROZEN.transaction_items_all})', v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM payment_transactions;
  IF v_cnt <> ${FROZEN.payments_all} THEN RAISE EXCEPTION 'ERR_FINANCIAL_I8: global payments % (exp ${FROZEN.payments_all})', v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM commission_payments;
  IF v_cnt <> ${FROZEN.commissions_all} THEN RAISE EXCEPTION 'ERR_FINANCIAL_I9: commissions % (exp ${FROZEN.commissions_all})', v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM receipts WHERE store_id = '${STORE}';
  IF v_cnt <> ${FROZEN.receipts_store} THEN RAISE EXCEPTION 'ERR_FINANCIAL: store receipts % (exp ${FROZEN.receipts_store})', v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM devolutions WHERE store_id = '${STORE}';
  IF v_cnt <> ${FROZEN.devolutions_store} THEN RAISE EXCEPTION 'ERR_FINANCIAL: store devolutions % (exp ${FROZEN.devolutions_store})', v_cnt; END IF;
END
$r1_post$;

-- ============================================================
-- PHASE E · BATCH AUDIT ROW (design 10-opening-design.md §1.1 audit_action)
-- ============================================================
INSERT INTO audit_logs (user_id, action, table_name, record_id, new_data, metadata, store_id, trace_id)
VALUES (
  '${ACTOR}'::uuid,
  'STOCK_RECONCILIATION_OPENING',
  'stock_movements',
  NULL,
  jsonb_build_object(
    'batch_id', '${BATCH}',
    'movements', 98,
    'units', 6427,
    'estimated_value', 9932216.938816005,
    'estimated_value_published', 9932216.94
  ),
  jsonb_build_object(
    'model', 'D = B + C (formal audited opening + Test exclusion)',
    'store', '${STORE}',
    'actor_role', 'RECONCILIATION_EXECUTOR',
    'historical_movements_reconstructed', false,
    'evidence_pack', '${PACK}',
    'pack_sha256sums', '45/45 OK',
    'position_date', '${POSITION_DATE}',
    'backup_ts', '${BACKUP_TS}',
    'excluded_test', '10 products / 126 units EXCLUDED_FROM_REPAIR',
    'human_authorization', 'R1 execution order (session web-c98ecee2-ae4b-4463-b4c1-135e982ca7ed, 2026-09-06)',
    'movement_type', 'initial',
    'date_policy', 'EXECUTION_TIMESTAMP (no retro-dating)'
  ),
  '${STORE}'::uuid,
  'B10B-OBS2-RECON-OPENING-R1'
);

-- ============================================================
-- PHASE F · IN-TRANSACTION REPORT (single row, becomes acta input)
-- ============================================================
SELECT jsonb_build_object(
  'phase', '${finalClause === 'COMMIT;' ? 'EXECUTION' : 'REHEARSAL'}',
  'repair_batch_id', '${BATCH}',
  'final_clause', '${finalClause}',
  'txn_started_at', transaction_timestamp(),
  'stmt_now', now(),
  'movements_created', (SELECT count(*) FROM stock_movements WHERE reference_doc = '${BATCH}'),
  'units_opened', (SELECT COALESCE(SUM(quantity_change),0) FROM stock_movements WHERE reference_doc = '${BATCH}'),
  'value_opened', (SELECT COALESCE(SUM(quantity_change * unit_cost),0) FROM stock_movements WHERE reference_doc = '${BATCH}'),
  'inventory_rows_store', (SELECT count(*) FROM inventory WHERE store_id = '${STORE}'),
  'kardex_rows_batch', (SELECT count(*) FROM kardex_entries WHERE reference_description = '${BATCH}'),
  'business_events_batch', (SELECT count(*) FROM business_events WHERE payload->>'store_id' = '${STORE}' AND payload->>'type' = 'initial'),
  'stock_current_sum_store', (SELECT COALESCE(SUM(stock_current),0) FROM products WHERE store_id = '${STORE}'),
  'actor', '${ACTOR}'
) AS r1_report;

${finalClause}
`;

fs.writeFileSync(path.join(R1, 'scripts/r1_execute.sql'), template('COMMIT;'));
fs.writeFileSync(path.join(R1, 'scripts/r1_rehearsal.sql'), template('ROLLBACK;'));

console.log(`batch_id: ${BATCH}`);
console.log(`rows: ${rows.length} · Σqty: ${sumQty} · Σvalue: ${sumVal}`);
console.log('wrote scripts/r1_execute.sql (COMMIT) and scripts/r1_rehearsal.sql (ROLLBACK)');
