
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
      'audit', (SELECT jsonb_build_object('action', a.action, 'operation', a.metadata->>'operation') FROM audit_logs a WHERE a.record_id = v_tx::text AND a.action='VOID_SALE' LIMIT 1)));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO r2_results VALUES ('P7_VOID_tx1', false, jsonb_build_object('sqlerrm', SQLERRM, 'sqlstate', SQLSTATE));
END $do$;

-- P8 · stock_after_void == stock_before_sale exactamente
INSERT INTO r2_results (step, ok, detail)
SELECT 'P8_stock_restored_void',
  (SELECT stock_current FROM products WHERE id='e47421ea-f9aa-452b-b20b-4601ec12410f') = 19
  AND (SELECT quantity FROM inventory WHERE product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') = 19
  AND (SELECT stock_current FROM products WHERE id='e47421ea-f9aa-452b-b20b-4601ec12410f') = (SELECT quantity FROM inventory WHERE product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')
  AND (SELECT COALESCE(SUM(quantity_change),0) FROM stock_movements WHERE product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') = 19,
  jsonb_build_object('ledger_derived', (SELECT COALESCE(SUM(quantity_change),0) FROM stock_movements WHERE product_id='e47421ea-f9aa-452b-b20b-4601ec12410f' AND store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'), 'expected', 'initial(19) -2 +2 = 19 == stock_before_sale');

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
-- reverse_transaction_v2 ACL = postgres+service_role → se ejecuta como postgres
-- (conexión privilegiada R1) manteniendo JWT claims → auth.role()='authenticated',
-- auth.uid()=actor — identidad por claims, NO por p_user_id.
-- ---------------------------------------------------------------
RESET ROLE;

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
      'audit', (SELECT jsonb_build_object('action', a.action, 'operation', a.metadata->>'operation') FROM audit_logs a WHERE a.record_id = v_tx::text AND a.action='REVERSE_TRANSACTION_V2' LIMIT 1)));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO r2_results VALUES ('P10_ADMIN_REVERSE', false, jsonb_build_object('sqlerrm', SQLERRM, 'sqlstate', SQLSTATE));
END $do$;

SET ROLE authenticated;

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
