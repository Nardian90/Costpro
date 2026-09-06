-- =====================================================================
-- W9.5 B-10b-OBS-2-R2 · POST-REPAIR OPERATIONAL INTEGRITY · MASTER TEST
-- Modelo A (BEGIN/ROLLBACK) · store d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576
-- repair batch: B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW (98/6427)
-- fixtures: A=e47421ea(CAT-0001,19,@490,price350) B=983e5726(CAT-0087,95.5,@2835,price4.5)
--           C=da1c4090(CAT-0002,966,@11.9194...,price350) B2=99885245(CAT-0088,91.5)
-- actor: 051c6157-600b-425e-b8c0-72388bacf541 (admin@costpro.com, profile admin)
-- pipeline canónico: create_sale_v2 → register_stock_movement('sale') → triggers
--                    void_transaction (POS undo, Modelo C N1) / reverse_transaction_v2 (N2)
-- final clause: ROLLBACK; (zero residue)
-- =====================================================================

-- =====================================================================
-- EJECUCIÓN COMO postgres + JWT claims (desviación documentada R1):
-- auth.uid()/auth.role() provienen de request.jwt.claims → identidad del actor
-- preservada en TODOS los access checks internos (has_store_access_as,
-- can_pos_undo_transaction, can_admin_reverse_transaction).
-- SET ROLE authenticated NO es viable: authenticated carece de SELECT sobre
-- wac_change_log y de EXECUTE sobre reverse_transaction_v2 (ACL B-8).
-- =====================================================================
SELECT set_config('request.jwt.claims', '{"sub":"051c6157-600b-425e-b8c0-72388bacf541","role":"authenticated","email":"admin@costpro.com"}', false);

BEGIN;
SET LOCAL lock_timeout = '15s';

CREATE TEMP TABLE r2_results (step text, ok boolean, detail jsonb);

-- ---------------------------------------------------------------
-- P0 · in-transaction baseline (fixtures + store counters)
-- ---------------------------------------------------------------
INSERT INTO r2_results (step, ok, detail)
SELECT 'P0_baseline', true, jsonb_build_object(
  'current_user', current_user, 'auth_uid', auth.uid(), 'auth_role', auth.role(),
  'FA_stock', (SELECT stock_current FROM products WHERE id='e47421ea-f9aa-452b-b20b-4601ec12410f'),
  'FA_wac', (SELECT cost_average FROM products WHERE id='e47421ea-f9aa-452b-b20b-4601ec12410f'),
  'FA_wac_text', (SELECT cost_average::text FROM products WHERE id='e47421ea-f9aa-452b-b20b-4601ec12410f'),
  'FB_stock', (SELECT stock_current FROM products WHERE id='983e5726-a068-44b0-98b8-fef76ac481f1'),
  'FB2_stock', (SELECT stock_current FROM products WHERE id='99885245-d370-46ea-99d9-176180574f77'),
  'FC_stock', (SELECT stock_current FROM products WHERE id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
  'FC_wac', (SELECT cost_average FROM products WHERE id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
  'FC_wac_text', (SELECT cost_average::text FROM products WHERE id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
  'FA_moves', (SELECT count(*) FROM stock_movements WHERE product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'FB_moves', (SELECT count(*) FROM stock_movements WHERE product_id='983e5726-a068-44b0-98b8-fef76ac481f1' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'FC_moves', (SELECT count(*) FROM stock_movements WHERE product_id='da1c4090-3e10-4120-a2bc-24da53cffe16' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'tx_store', (SELECT count(*) FROM transactions WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'mov_store', (SELECT count(*) FROM stock_movements WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'kardex_store', (SELECT count(*) FROM kardex_entries WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'audit_store', (SELECT count(*) FROM audit_logs WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'wac_log_store', (SELECT count(*) FROM wac_change_log WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')
);

-- ---------------------------------------------------------------
-- P1 · GATE 5 — synthetic sale via create_sale_v2 (Fixture A, cash 2×350=700)
-- ---------------------------------------------------------------
DO $do$
DECLARE v_res jsonb; v_tx uuid;
BEGIN
  v_res := public.create_sale_v2(
    p_store_id := 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
    p_seller_id := '051c6157-600b-425e-b8c0-72388bacf541',
    p_items := '[{"product_id":"e47421ea-f9aa-452b-b20b-4601ec12410f","quantity":2,"price_at_sale":350}]'::jsonb,
    p_payment_method := 'cash',
    p_discount_type := 'fixed', p_discount_value := 0,
    p_applied_taxes := '[]'::jsonb, p_tax_amount := 0,
    p_total_amount := 700, p_subtotal := 700,
    p_sale_currency := 'CUP', p_sale_exchange_rate := 1
  );
  v_tx := (v_res->>'transaction_id')::uuid;
  INSERT INTO r2_results VALUES ('P1_SALE_FA_cash700', v_res->>'status' = 'success' AND (v_res->>'calculated_total')::numeric = 700,
    jsonb_build_object('res', v_res, 'tx_id', v_tx));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO r2_results VALUES ('P1_SALE_FA_cash700', false, jsonb_build_object('sqlerrm', SQLERRM, 'sqlstate', SQLSTATE));
END $do$;

-- ---------------------------------------------------------------
-- P2 · GATE 6 — stock integrity after sale (before rollback/void)
-- ---------------------------------------------------------------
INSERT INTO r2_results (step, ok, detail)
SELECT 'P2_stock_after_sale',
  (SELECT stock_current FROM products WHERE id='e47421ea-f9aa-452b-b20b-4601ec12410f') = 17
  AND (SELECT quantity FROM inventory WHERE product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') = 17
  AND (SELECT version FROM inventory WHERE product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') = 2
  AND (SELECT COALESCE(SUM(quantity_change),0) FROM stock_movements WHERE product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') = 17,
  jsonb_build_object(
    'stock_current', (SELECT stock_current FROM products WHERE id='e47421ea-f9aa-452b-b20b-4601ec12410f'),
    'inventory_qty', (SELECT quantity FROM inventory WHERE product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'inventory_version', (SELECT version FROM inventory WHERE product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'ledger_derived_sum', (SELECT COALESCE(SUM(quantity_change),0) FROM stock_movements WHERE product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'last_movement', (SELECT jsonb_build_object('id', m.id, 'qty', m.quantity_change, 'type', m.movement_type, 'balance_after', m.balance_after, 'ref_doc', m.reference_doc, 'ref_id', m.reference_id, 'unit_cost', m.unit_cost, 'created_by', m.created_by)
      FROM stock_movements m WHERE m.product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND m.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' ORDER BY m.created_at DESC, m.id DESC LIMIT 1),
    'expected', jsonb_build_object('stock_after', '19-2=17', 'match', true)
  );

-- ---------------------------------------------------------------
-- P3 · GATE 7 — kardex coherence for the sale movement
-- ---------------------------------------------------------------
INSERT INTO r2_results (step, ok, detail)
SELECT 'P3_kardex_sale',
  k.movement_type = 'out' AND k.quantity = 2 AND k.unit_cost = 490 AND k.total_value = 980
  AND k.balance_quantity = 17 AND k.reference_description = 'Venta POS v2'
  AND k.reference_id = (SELECT id FROM stock_movements WHERE product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND movement_type='sale' ORDER BY created_at DESC LIMIT 1)
  AND k.created_by = '051c6157-600b-425e-b8c0-72388bacf541',
  jsonb_build_object(
    'kardex_row', jsonb_build_object('id', k.id, 'type', k.movement_type, 'qty', k.quantity, 'unit_cost', k.unit_cost, 'total_value', k.total_value, 'bal_qty', k.balance_quantity, 'bal_unit_cost', k.balance_unit_cost, 'bal_value', k.balance_total_value, 'ref_type', k.reference_type, 'ref_id', k.reference_id, 'ref_desc', k.reference_description, 'created_by', k.created_by),
    'note', 'sale_void kardex classification captured later at P7 (potential finding: CASE maps sale_void→out)'
  )
FROM kardex_entries k
WHERE k.product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND k.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
  AND k.reference_description = 'Venta POS v2'
ORDER BY k.created_at DESC LIMIT 1;

-- ---------------------------------------------------------------
-- P4 · GATE 8 — WAC semantics: sale must NOT alter WAC
-- ---------------------------------------------------------------
INSERT INTO r2_results (step, ok, detail)
SELECT 'P4_wac_after_sale',
  (SELECT cost_average::text FROM products WHERE id='e47421ea-f9aa-452b-b20b-4601ec12410f') = (SELECT detail->>'FA_wac_text' FROM r2_results WHERE step='P0_baseline')
  AND (SELECT count(*) FROM wac_change_log WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') = 0
  AND (SELECT cost_average::text FROM products WHERE id='da1c4090-3e10-4120-a2bc-24da53cffe16') = (SELECT detail->>'FC_wac_text' FROM r2_results WHERE step='P0_baseline'),
  jsonb_build_object(
    'FA_wac_after_sale', (SELECT cost_average FROM products WHERE id='e47421ea-f9aa-452b-b20b-4601ec12410f'),
    'FC_wac_after_sale', (SELECT cost_average FROM products WHERE id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
    'wac_change_log_store', (SELECT count(*) FROM wac_change_log WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'semantics', 'A2 hotfix: register_stock_movement no recalcula WAC; venta usa WAC_prev como cost_at_sale (DF-02). WAC_bit_for_bit_preserved = true',
    'initial_not_mixed', 'movement sale(-2, unit_cost=489.99999999999994) es fila nueva; initial(19) intacto — ver P4b'
  );

-- P4b · initial movement fingerprint in-transaction (compare vs PRE offline)
INSERT INTO r2_results (step, ok, detail)
SELECT 'P4b_initial_fingerprints_in_tx', true, jsonb_build_object(
  'FA_initial', (SELECT md5(concat(m.id::text, m.quantity_change::text, m.unit_cost::text, coalesce(m.reference_doc,''), coalesce(m.reference_id,''), m.created_at::text, m.created_by::text, m.movement_type::text)) FROM stock_movements m WHERE m.product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND m.reference_doc='B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
  'FB_initial', (SELECT md5(concat(m.id::text, m.quantity_change::text, m.unit_cost::text, coalesce(m.reference_doc,''), coalesce(m.reference_id,''), m.created_at::text, m.created_by::text, m.movement_type::text)) FROM stock_movements m WHERE m.product_id='983e5726-a068-44b0-98b8-fef76ac481f1' AND m.reference_doc='B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
  'FC_initial', (SELECT md5(concat(m.id::text, m.quantity_change::text, m.unit_cost::text, coalesce(m.reference_doc,''), coalesce(m.reference_id,''), m.created_at::text, m.created_by::text, m.movement_type::text)) FROM stock_movements m WHERE m.product_id='da1c4090-3e10-4120-a2bc-24da53cffe16' AND m.reference_doc='B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW')
);

-- ---------------------------------------------------------------
-- P5 · GATE 9 — payment invariant: SUM(amount_cup) == total_amount
-- ---------------------------------------------------------------
INSERT INTO r2_results (step, ok, detail)
SELECT 'P5_payment_cash',
  (SELECT total_amount FROM transactions WHERE id = (SELECT (detail->>'tx_id')::uuid FROM r2_results WHERE step='P1_SALE_FA_cash700')) = 700
  AND (SELECT COALESCE(SUM(amount_cup),0) FROM payment_transactions WHERE transaction_id = (SELECT (detail->>'tx_id')::uuid FROM r2_results WHERE step='P1_SALE_FA_cash700')) = 700
  AND (SELECT count(*) FROM payment_transactions WHERE transaction_id = (SELECT (detail->>'tx_id')::uuid FROM r2_results WHERE step='P1_SALE_FA_cash700')) = 1,
  jsonb_build_object(
    'tx', (SELECT jsonb_build_object('id', t.id, 'total', t.total_amount, 'status', t.status, 'method', t.payment_method, 'currency', t.sale_currency, 'rate', t.sale_exchange_rate, 'seller', t.seller_id, 'idem', t.idempotency_key) FROM transactions t WHERE t.id = (SELECT (detail->>'tx_id')::uuid FROM r2_results WHERE step='P1_SALE_FA_cash700')),
    'items', (SELECT COALESCE(jsonb_agg(jsonb_build_object('qty', i.quantity, 'price', i.price_at_sale, 'cost', i.cost_at_sale, 'price_cup', i.price_at_sale_cup)), '[]'::jsonb) FROM transaction_items i WHERE i.transaction_id = (SELECT (detail->>'tx_id')::uuid FROM r2_results WHERE step='P1_SALE_FA_cash700')),
    'payments', (SELECT COALESCE(jsonb_agg(jsonb_build_object('amount', p.amount, 'cup', p.amount_cup, 'cur', p.currency, 'rate', p.exchange_rate, 'method', p.payment_method, 'idem', p.idempotency_key)), '[]'::jsonb) FROM payment_transactions p WHERE p.transaction_id = (SELECT (detail->>'tx_id')::uuid FROM r2_results WHERE step='P1_SALE_FA_cash700')),
    'invariant', 'SUM(amount_cup)=700 == total_amount=700 · cost_at_sale=server WAC (DF-02) · sin doble conversión'
  );

-- ---------------------------------------------------------------
-- P6 · zelle probe — no double USD conversion (W9.4.8 semantics)
-- ---------------------------------------------------------------
DO $do$
DECLARE v_res jsonb; v_tx uuid;
BEGIN
  v_res := public.create_sale_v2(
    p_store_id := 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
    p_seller_id := '051c6157-600b-425e-b8c0-72388bacf541',
    p_items := '[{"product_id":"e47421ea-f9aa-452b-b20b-4601ec12410f","quantity":1,"price_at_sale":350}]'::jsonb,
    p_payment_method := 'zelle',
    p_total_amount := 350, p_subtotal := 350,
    p_sale_currency := 'USD', p_sale_exchange_rate := 440
  );
  v_tx := (v_res->>'transaction_id')::uuid;
  INSERT INTO r2_results VALUES ('P6_SALE_FA_zelle350', v_res->>'status' = 'success' AND (v_res->>'calculated_total')::numeric = 350,
    jsonb_build_object('res', v_res, 'tx_id', v_tx,
      'payments', (SELECT COALESCE(jsonb_agg(jsonb_build_object('amount', p.amount, 'cup', p.amount_cup, 'cur', p.currency, 'rate', p.exchange_rate, 'method', p.payment_method)), '[]'::jsonb) FROM payment_transactions p WHERE p.transaction_id = v_tx),
      'sum_amount_cup', (SELECT COALESCE(SUM(amount_cup),0) FROM payment_transactions WHERE transaction_id = v_tx),
      'note', 'amount almacenado en moneda original (350/440 USD), amount_cup GENERATED = amount*rate ≈ 350 — NO double conversion (W9.4.8)'));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO r2_results VALUES ('P6_SALE_FA_zelle350', false, jsonb_build_object('sqlerrm', SQLERRM, 'sqlstate', SQLSTATE));
END $do$;

-- ---------------------------------------------------------------
-- P7 · GATE 10 — POS void (Modelo C Nivel 1): same seller, ≤30s, admin profile
-- ---------------------------------------------------------------
DO $do$
DECLARE v_res jsonb; v_tx uuid; v_ts timestamptz;
BEGIN
  SELECT (detail->>'tx_id')::uuid INTO v_tx FROM r2_results WHERE step='P1_SALE_FA_cash700';
  v_res := public.void_transaction(p_transaction_id := v_tx, p_reason := 'R2 POS undo synthetic (rollback sandbox)');
  INSERT INTO r2_results VALUES ('P7_VOID_tx1', v_res->>'status' = 'success',
    jsonb_build_object('res', v_res, 'tx_id', v_tx,
      'tx_after', (SELECT jsonb_build_object('status', t.status, 'void_reason', t.void_reason, 'cancelled_at', t.cancelled_at) FROM transactions t WHERE t.id = v_tx),
      'stock_after_void', (SELECT stock_current FROM products WHERE id='e47421ea-f9aa-452b-b20b-4601ec12410f'),
      'inventory_after_void', (SELECT quantity FROM inventory WHERE product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'inventory_version_after', (SELECT version FROM inventory WHERE product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'void_movement', (SELECT jsonb_build_object('qty', m.quantity_change, 'type', m.movement_type, 'balance_after', m.balance_after, 'ref_doc', m.reference_doc, 'ref_id', m.reference_id, 'notes', m.notes, 'unit_cost', m.unit_cost) FROM stock_movements m WHERE m.product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND m.movement_type='sale_void' ORDER BY m.created_at DESC LIMIT 1),
      'void_kardex', (SELECT jsonb_build_object('type', k.movement_type, 'qty', k.quantity, 'ref_desc', k.reference_description) FROM kardex_entries k WHERE k.product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND k.reference_description='Void de venta' ORDER BY k.created_at DESC LIMIT 1),
      'audit', (SELECT jsonb_build_object('action', a.action, 'operation', a.metadata->>'operation') FROM audit_logs a WHERE a.record_id = v_tx AND a.action='VOID_SALE' LIMIT 1)));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO r2_results VALUES ('P7_VOID_tx1', false, jsonb_build_object('sqlerrm', SQLERRM, 'sqlstate', SQLSTATE));
END $do$;

-- P8 · restauración exacta de tx1: stock_after_void == stock_antes_del_void_tx1 + 2,
-- y netting de tx1 (sale -2 + sale_void +2) == 0. Estado FA = 19 -2(tx1) -1(tx2 zelle pendiente) +2(void) = 18
INSERT INTO r2_results (step, ok, detail)
SELECT 'P8_stock_restored_void',
  (SELECT stock_current FROM products WHERE id='e47421ea-f9aa-452b-b20b-4601ec12410f') = 18
  AND (SELECT quantity FROM inventory WHERE product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') = 18
  AND (SELECT stock_current FROM products WHERE id='e47421ea-f9aa-452b-b20b-4601ec12410f') = (SELECT quantity FROM inventory WHERE product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')
  AND (SELECT COALESCE(SUM(quantity_change),0) FROM stock_movements WHERE product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') = 18
  AND (SELECT COALESCE(SUM(m.quantity_change),0) FROM stock_movements m WHERE m.product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND (m.reference_id = (SELECT (detail->>'tx_id')::uuid FROM r2_results WHERE step='P1_SALE_FA_cash700')::text OR m.notes = (SELECT (detail->>'tx_id')::text FROM r2_results WHERE step='P1_SALE_FA_cash700'))) = 0,
  jsonb_build_object('ledger_derived', (SELECT COALESCE(SUM(quantity_change),0) FROM stock_movements WHERE product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'expected', '19 initial -2(tx1 sale) -1(tx2 zelle pendiente) +2(tx1 void) = 18',
  'tx1_netting', 'SUM(movements ref tx1) = -2 +2 = 0 → compensación exacta de tx1');

-- ---------------------------------------------------------------
-- P9 · GATE 12 — double compensation rejected: void again + reverse on voided
-- ---------------------------------------------------------------
DO $do$
DECLARE v_res jsonb; v_tx uuid; v_moves_before int; v_moves_after int;
BEGIN
  SELECT (detail->>'tx_id')::uuid INTO v_tx FROM r2_results WHERE step='P1_SALE_FA_cash700';
  SELECT count(*) INTO v_moves_before FROM stock_movements WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
  BEGIN
    v_res := public.void_transaction(p_transaction_id := v_tx, p_reason := 'R2 double-void probe (must reject)');
    INSERT INTO r2_results VALUES ('P9a_double_void', false, jsonb_build_object('unexpected_success', v_res));
  EXCEPTION WHEN OTHERS THEN
    SELECT count(*) INTO v_moves_after FROM stock_movements WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
    INSERT INTO r2_results VALUES ('P9a_double_void', SQLERRM LIKE 'ERR_ALREADY_VOIDED%' AND v_moves_after = v_moves_before,
      jsonb_build_object('sqlerrm', SQLERRM, 'moves_before', v_moves_before, 'moves_after', v_moves_after, 'verdict', 'REJECTED by state guard — 0 additional movement'));
  END;
  BEGIN
    v_res := public.reverse_transaction_v2(p_transaction_id := v_tx, p_reason := 'R2 reverse-on-voided probe');
    SELECT count(*) INTO v_moves_after FROM stock_movements WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
    INSERT INTO r2_results VALUES ('P9b_reverse_on_voided', v_res->>'status' = 'idempotent' AND v_moves_after = v_moves_before,
      jsonb_build_object('res', v_res, 'moves_after', v_moves_after, 'verdict', 'idempotent no-op — 0 additional movement'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r2_results VALUES ('P9b_reverse_on_voided', false, jsonb_build_object('sqlerrm', SQLERRM));
  END;
END $do$;

-- ---------------------------------------------------------------
-- P10 · GATE 11 — admin reverse (Modelo C Nivel 2) sobre venta zelle completada
-- reverse_transaction_v2 ACL = postgres+service_role → current_user=postgres
-- + JWT claims → auth.role()='authenticated', auth.uid()=actor
-- ---------------------------------------------------------------

DO $do$
DECLARE v_res jsonb; v_tx uuid; v_stock_before numeric;
BEGIN
  SELECT (detail->>'tx_id')::uuid INTO v_tx FROM r2_results WHERE step='P6_SALE_FA_zelle350';
  SELECT stock_current INTO v_stock_before FROM products WHERE id='e47421ea-f9aa-452b-b20b-4601ec12410f'; -- 19
  v_res := public.reverse_transaction_v2(p_transaction_id := v_tx, p_reason := 'R2 admin reverse synthetic (rollback sandbox)');
  INSERT INTO r2_results VALUES ('P10_ADMIN_REVERSE', v_res->>'status' = 'success' AND (v_res->>'units_restored')::numeric = 1,
    jsonb_build_object('res', v_res, 'tx_id', v_tx,
      'tx_after', (SELECT jsonb_build_object('status', t.status, 'updated_at', t.updated_at) FROM transactions t WHERE t.id = v_tx),
      'stock_after_reverse', (SELECT stock_current FROM products WHERE id='e47421ea-f9aa-452b-b20b-4601ec12410f'),
      'inventory_after_reverse', (SELECT quantity FROM inventory WHERE product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'reverse_movement', (SELECT jsonb_build_object('qty', m.quantity_change, 'type', m.movement_type, 'balance_after', m.balance_after, 'ref_doc', m.reference_doc, 'ref_id', m.reference_id, 'unit_cost', m.unit_cost) FROM stock_movements m WHERE m.product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND m.movement_type='sale_reverse' ORDER BY m.created_at DESC LIMIT 1),
      'reverse_kardex', (SELECT jsonb_build_object('type', k.movement_type, 'qty', k.quantity, 'ref_desc', k.reference_description) FROM kardex_entries k WHERE k.product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND k.reference_description='Reverso de venta' ORDER BY k.created_at DESC LIMIT 1),
      'audit', (SELECT jsonb_build_object('action', a.action, 'operation', a.metadata->>'operation') FROM audit_logs a WHERE a.record_id = v_tx AND a.action='REVERSE_TRANSACTION_V2' LIMIT 1)));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO r2_results VALUES ('P10_ADMIN_REVERSE', false, jsonb_build_object('sqlerrm', SQLERRM, 'sqlstate', SQLSTATE));
END $do$;

-- P10b · void sobre transacción revertida → rechazado
DO $do$
DECLARE v_res jsonb; v_tx uuid; v_moves_before int; v_moves_after int;
BEGIN
  SELECT (detail->>'tx_id')::uuid INTO v_tx FROM r2_results WHERE step='P6_SALE_FA_zelle350';
  SELECT count(*) INTO v_moves_before FROM stock_movements WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
  BEGIN
    v_res := public.void_transaction(p_transaction_id := v_tx, p_reason := 'R2 void-on-reversed probe (must reject)');
    INSERT INTO r2_results VALUES ('P10b_void_on_reversed', false, jsonb_build_object('unexpected_success', v_res));
  EXCEPTION WHEN OTHERS THEN
    SELECT count(*) INTO v_moves_after FROM stock_movements WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
    INSERT INTO r2_results VALUES ('P10b_void_on_reversed', SQLERRM LIKE 'ERR_%' AND v_moves_after = v_moves_before,
      jsonb_build_object('sqlerrm', SQLERRM, 'moves_before', v_moves_before, 'moves_after', v_moves_after, 'verdict', 'REJECTED — 0 additional movement'));
  END;
END $do$;

-- ---------------------------------------------------------------
-- P11 · GATE 14 — negative stock: venta qty > stock → REJECT, 0 mutation
-- ---------------------------------------------------------------
DO $do$
DECLARE v_res jsonb; v_moves_b int; v_stock_b numeric; v_inv_b numeric; v_inv_v_b bigint; v_tx_b int; v_moves_a int; v_stock_a numeric; v_inv_a numeric; v_inv_v_a bigint; v_tx_a int;
BEGIN
  SELECT count(*), (SELECT stock_current FROM products WHERE id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
         (SELECT quantity FROM inventory WHERE product_id='da1c4090-3e10-4120-a2bc-24da53cffe16' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
         (SELECT version FROM inventory WHERE product_id='da1c4090-3e10-4120-a2bc-24da53cffe16' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
         (SELECT count(*) FROM transactions WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')
    INTO v_moves_b, v_stock_b, v_inv_b, v_inv_v_b, v_tx_b
    FROM stock_movements WHERE product_id='da1c4090-3e10-4120-a2bc-24da53cffe16' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
  BEGIN
    v_res := public.create_sale_v2(
      p_store_id := 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
      p_seller_id := '051c6157-600b-425e-b8c0-72388bacf541',
      p_items := '[{"product_id":"da1c4090-3e10-4120-a2bc-24da53cffe16","quantity":1000,"price_at_sale":350}]'::jsonb,
      p_payment_method := 'cash',
      p_total_amount := 350000, p_subtotal := 350000
    );
    INSERT INTO r2_results VALUES ('P11_negative_stock', false, jsonb_build_object('unexpected_success', v_res));
  EXCEPTION WHEN OTHERS THEN
    SELECT count(*), (SELECT stock_current FROM products WHERE id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
           (SELECT quantity FROM inventory WHERE product_id='da1c4090-3e10-4120-a2bc-24da53cffe16' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
           (SELECT version FROM inventory WHERE product_id='da1c4090-3e10-4120-a2bc-24da53cffe16' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
           (SELECT count(*) FROM transactions WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')
      INTO v_moves_a, v_stock_a, v_inv_a, v_inv_v_a, v_tx_a
      FROM stock_movements WHERE product_id='da1c4090-3e10-4120-a2bc-24da53cffe16' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
    INSERT INTO r2_results VALUES ('P11_negative_stock', SQLERRM LIKE 'ERR_INSUFFICIENT_STOCK%' AND v_moves_a=v_moves_b AND v_stock_a=v_stock_b AND v_inv_a=v_inv_b AND v_inv_v_a=v_inv_v_b AND v_tx_a=v_tx_b,
      jsonb_build_object('sqlerrm', SQLERRM,
        'before', jsonb_build_object('moves', v_moves_b, 'stock', v_stock_b, 'inv', v_inv_b, 'inv_version', v_inv_v_b, 'tx', v_tx_b),
        'after', jsonb_build_object('moves', v_moves_a, 'stock', v_stock_a, 'inv', v_inv_a, 'inv_version', v_inv_v_a, 'tx', v_tx_a),
        'verdict', 'REJECT con 0 mutation (products/inventory/movements/transactions intactos)'));
  END;
END $do$;

-- ---------------------------------------------------------------
-- P12 · GATE 15 — decimal stock: 95.5 - 1.5 = 94.0 exacto (numeric(12,4))
-- ---------------------------------------------------------------
DO $do$
DECLARE v_res jsonb; v_tx uuid;
BEGIN
  v_res := public.create_sale_v2(
    p_store_id := 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
    p_seller_id := '051c6157-600b-425e-b8c0-72388bacf541',
    p_items := '[{"product_id":"983e5726-a068-44b0-98b8-fef76ac481f1","quantity":1.5,"price_at_sale":4.5}]'::jsonb,
    p_payment_method := 'cash',
    p_total_amount := 6.75, p_subtotal := 6.75
  );
  v_tx := (v_res->>'transaction_id')::uuid;
  INSERT INTO r2_results VALUES ('P12_SALE_FB_decimal', v_res->>'status' = 'success',
    jsonb_build_object('res', v_res, 'tx_id', v_tx,
      'stock_after', (SELECT stock_current::text FROM products WHERE id='983e5726-a068-44b0-98b8-fef76ac481f1'),
      'inventory_after', (SELECT quantity::text FROM inventory WHERE product_id='983e5726-a068-44b0-98b8-fef76ac481f1' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'balance_after', (SELECT balance_after::text FROM stock_movements WHERE product_id='983e5726-a068-44b0-98b8-fef76ac481f1' AND movement_type='sale' ORDER BY created_at DESC LIMIT 1),
      'is_exact_94', (SELECT stock_current = 94 AND round(stock_current,4) = stock_current FROM products WHERE id='983e5726-a068-44b0-98b8-fef76ac481f1'),
      'note', '95.5 - 1.5 = 94.0000 exacto — sin 93.999… ni 94.0000000001'));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO r2_results VALUES ('P12_SALE_FB_decimal', false, jsonb_build_object('sqlerrm', SQLERRM));
END $do$;

DO $do$
DECLARE v_res jsonb; v_tx uuid;
BEGIN
  SELECT (detail->>'tx_id')::uuid INTO v_tx FROM r2_results WHERE step='P12_SALE_FB_decimal';
  v_res := public.void_transaction(p_transaction_id := v_tx, p_reason := 'R2 decimal undo (rollback sandbox)');
  INSERT INTO r2_results VALUES ('P12b_VOID_decimal', v_res->>'status' = 'success'
    AND (SELECT stock_current::text FROM products WHERE id='983e5726-a068-44b0-98b8-fef76ac481f1') = '95.5000'
    AND (SELECT quantity::text FROM inventory WHERE product_id='983e5726-a068-44b0-98b8-fef76ac481f1' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') = '95.5000',
    jsonb_build_object('res', v_res, 'tx_id', v_tx,
      'stock_restored', (SELECT stock_current::text FROM products WHERE id='983e5726-a068-44b0-98b8-fef76ac481f1'),
      'inventory_restored', (SELECT quantity::text FROM inventory WHERE product_id='983e5726-a068-44b0-98b8-fef76ac481f1' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'precision_ok', true));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO r2_results VALUES ('P12b_VOID_decimal', false, jsonb_build_object('sqlerrm', SQLERRM));
END $do$;

-- ---------------------------------------------------------------
-- P13 · GATE 16 — high stock (da1c4090, 966): op pequeña reversible
-- ---------------------------------------------------------------
DO $do$
DECLARE v_res jsonb; v_tx uuid;
BEGIN
  v_res := public.create_sale_v2(
    p_store_id := 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
    p_seller_id := '051c6157-600b-425e-b8c0-72388bacf541',
    p_items := '[{"product_id":"da1c4090-3e10-4120-a2bc-24da53cffe16","quantity":1,"price_at_sale":350}]'::jsonb,
    p_payment_method := 'cash',
    p_total_amount := 350, p_subtotal := 350
  );
  v_tx := (v_res->>'transaction_id')::uuid;
  INSERT INTO r2_results VALUES ('P13_SALE_FC_high966', v_res->>'status' = 'success'
    AND (SELECT stock_current FROM products WHERE id='da1c4090-3e10-4120-a2bc-24da53cffe16') = 965,
    jsonb_build_object('res', v_res, 'tx_id', v_tx,
      'stock_after', (SELECT stock_current FROM products WHERE id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
      'kardex', (SELECT jsonb_build_object('type', k.movement_type, 'qty', k.quantity, 'unit_cost', k.unit_cost, 'total_value', k.total_value, 'bal_qty', k.balance_quantity, 'bal_unit_cost', k.balance_unit_cost, 'bal_value', k.balance_total_value) FROM kardex_entries k WHERE k.product_id='da1c4090-3e10-4120-a2bc-24da53cffe16' AND k.reference_description='Venta POS v2' ORDER BY k.created_at DESC LIMIT 1),
      'wac_unchanged', (SELECT cost_average::text FROM products WHERE id='da1c4090-3e10-4120-a2bc-24da53cffe16')));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO r2_results VALUES ('P13_SALE_FC_high966', false, jsonb_build_object('sqlerrm', SQLERRM));
END $do$;

DO $do$
DECLARE v_res jsonb; v_tx uuid;
BEGIN
  SELECT (detail->>'tx_id')::uuid INTO v_tx FROM r2_results WHERE step='P13_SALE_FC_high966';
  v_res := public.void_transaction(p_transaction_id := v_tx, p_reason := 'R2 high-stock undo (rollback sandbox)');
  INSERT INTO r2_results VALUES ('P13b_VOID_high966', v_res->>'status' = 'success'
    AND (SELECT stock_current FROM products WHERE id='da1c4090-3e10-4120-a2bc-24da53cffe16') = 966,
    jsonb_build_object('res', v_res, 'tx_id', v_tx,
      'stock_restored', (SELECT stock_current FROM products WHERE id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
      'no_overflow', (SELECT stock_current BETWEEN 0 AND 999999999 FROM products WHERE id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
      'wac_final', (SELECT cost_average::text FROM products WHERE id='da1c4090-3e10-4120-a2bc-24da53cffe16')));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO r2_results VALUES ('P13b_VOID_high966', false, jsonb_build_object('sqlerrm', SQLERRM));
END $do$;

-- ---------------------------------------------------------------
-- P14 · ownership / forged identity probe (claims override transaction-local)
-- ---------------------------------------------------------------
DO $do$
DECLARE v_res jsonb; v_tx uuid; v_moves_b int; v_moves_a int;
BEGIN
  v_res := public.create_sale_v2(
    p_store_id := 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
    p_seller_id := '051c6157-600b-425e-b8c0-72388bacf541',
    p_items := '[{"product_id":"99885245-d370-46ea-99d9-176180574f77","quantity":1,"price_at_sale":4.5}]'::jsonb,
    p_payment_method := 'cash',
    p_total_amount := 4.5, p_subtotal := 4.5
  );
  v_tx := (v_res->>'transaction_id')::uuid;
  INSERT INTO r2_results VALUES ('P14_SALE_FB2', v_res->>'status' = 'success', jsonb_build_object('res', v_res, 'tx_id', v_tx));

  SELECT count(*) INTO v_moves_b FROM stock_movements WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
  -- forged identity: sub aleatorio, role authenticated (transaction-local override)
  PERFORM set_config('request.jwt.claims', '{"sub":"9f1c0000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  BEGIN
    v_res := public.void_transaction(p_transaction_id := v_tx, p_reason := 'R2 forged identity probe (must reject)');
    INSERT INTO r2_results VALUES ('P14b_forged_void', false, jsonb_build_object('unexpected_success', v_res));
  EXCEPTION WHEN OTHERS THEN
    SELECT count(*) INTO v_moves_a FROM stock_movements WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
    INSERT INTO r2_results VALUES ('P14b_forged_void', SQLERRM LIKE 'ERR_UNAUTHORIZED%' AND v_moves_a = v_moves_b,
      jsonb_build_object('sqlerrm', SQLERRM, 'moves_before', v_moves_b, 'moves_after', v_moves_a, 'verdict', 'actor forjado RECHAZADO — 0 movement'));
  END;
  -- restaurar claims del actor
  PERFORM set_config('request.jwt.claims', '{"sub":"051c6157-600b-425e-b8c0-72388bacf541","role":"authenticated","email":"admin@costpro.com"}', true);

  v_res := public.void_transaction(p_transaction_id := v_tx, p_reason := 'R2 FB2 undo (rollback sandbox)');
  INSERT INTO r2_results VALUES ('P14c_VOID_FB2', v_res->>'status' = 'success'
    AND (SELECT stock_current::text FROM products WHERE id='99885245-d370-46ea-99d9-176180574f77') = '91.5000',
    jsonb_build_object('res', v_res, 'tx_id', v_tx, 'stock_restored', (SELECT stock_current::text FROM products WHERE id='99885245-d370-46ea-99d9-176180574f77')));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO r2_results VALUES ('P14_block', false, jsonb_build_object('sqlerrm', SQLERRM));
END $do$;

-- ---------------------------------------------------------------
-- P15 · in-tx reconciliation final de fixtures (GATE 21/22 preview)
-- ---------------------------------------------------------------
INSERT INTO r2_results (step, ok, detail)
SELECT 'P15_fixtures_reconciled', bool_and(x.pass), jsonb_agg(jsonb_build_object('sku', x.sku, 'stock', x.stock, 'inv', x.inv, 'ledger_sum', x.lsum, 'moves', x.moves, 'kardex', x.kar, 'pass', x.pass))
FROM (
  SELECT p.sku, p.stock_current AS stock, i.quantity AS inv,
    (SELECT COALESCE(SUM(m.quantity_change),0) FROM stock_movements m WHERE m.product_id=p.id AND m.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') AS lsum,
    (SELECT count(*) FROM stock_movements m WHERE m.product_id=p.id AND m.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') AS moves,
    (SELECT count(*) FROM kardex_entries k WHERE k.product_id=p.id AND k.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') AS kar,
    (p.stock_current = i.quantity AND i.quantity = (SELECT COALESCE(SUM(m.quantity_change),0) FROM stock_movements m WHERE m.product_id=p.id AND m.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')
     AND (SELECT count(*) FROM kardex_entries k WHERE k.product_id=p.id AND k.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') = (SELECT count(*) FROM stock_movements m WHERE m.product_id=p.id AND m.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')) AS pass
  FROM products p
  JOIN inventory i ON i.product_id = p.id AND i.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
  WHERE p.id IN ('e47421ea-f9aa-452b-b20b-4601ec12410f','983e5726-a068-44b0-98b8-fef76ac481f1','99885245-d370-46ea-99d9-176180574f77','da1c4090-3e10-4120-a2bc-24da53cffe16')
) x;

-- ---------------------------------------------------------------
-- FINAL REPORT (single row) + ROLLBACK
-- ---------------------------------------------------------------
SELECT jsonb_build_object(
  'phase', 'R2_MASTER_OPERATIONAL_TEST',
  'store', 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
  'batch', 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW',
  'actor', '051c6157-600b-425e-b8c0-72388bacf541',
  'model', 'A — BEGIN/ROLLBACK sandbox (zero residue)',
  'txn_started_at', transaction_timestamp(),
  'stmt_now', now(),
  'current_user', current_user,
  'steps', (SELECT jsonb_agg(jsonb_build_object('step', r.step, 'ok', r.ok, 'detail', r.detail) ORDER BY r.step) FROM r2_results r),
  'all_ok', (SELECT bool_and(ok) FROM r2_results),
  'failed_steps', (SELECT coalesce(jsonb_agg(step), '[]'::jsonb) FROM r2_results WHERE NOT ok),
  'final_state', jsonb_build_object(
    'FA_stock', (SELECT stock_current FROM products WHERE id='e47421ea-f9aa-452b-b20b-4601ec12410f'),
    'FB_stock', (SELECT stock_current FROM products WHERE id='983e5726-a068-44b0-98b8-fef76ac481f1'),
    'FB2_stock', (SELECT stock_current FROM products WHERE id='99885245-d370-46ea-99d9-176180574f77'),
    'FC_stock', (SELECT stock_current FROM products WHERE id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
    'tx_store', (SELECT count(*) FROM transactions WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'mov_store', (SELECT count(*) FROM stock_movements WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'batch_movements', (SELECT count(*) FROM stock_movements WHERE reference_doc='B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'wac_log_store', (SELECT count(*) FROM wac_change_log WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')
  )
) AS r2_report;

ROLLBACK;
