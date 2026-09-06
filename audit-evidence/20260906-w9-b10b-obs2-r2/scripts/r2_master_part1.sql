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

SET ROLE authenticated;
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
  'FB_stock', (SELECT stock_current FROM products WHERE id='983e5726-a068-44b0-98b8-fef76ac481f1'),
  'FB2_stock', (SELECT stock_current FROM products WHERE id='99885245-d370-46ea-99d9-176180574f77'),
  'FC_stock', (SELECT stock_current FROM products WHERE id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
  'FC_wac', (SELECT cost_average FROM products WHERE id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
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
  (SELECT cost_average FROM products WHERE id='e47421ea-f9aa-452b-b20b-4601ec12410f')::text = '489.99999999999994'
  AND (SELECT count(*) FROM wac_change_log WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') = 0
  AND (SELECT cost_average FROM products WHERE id='da1c4090-3e10-4120-a2bc-24da53cffe16')::text = '11.919422583856775',
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
