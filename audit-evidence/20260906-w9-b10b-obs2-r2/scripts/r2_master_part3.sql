
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
