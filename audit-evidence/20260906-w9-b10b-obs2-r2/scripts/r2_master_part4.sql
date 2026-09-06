
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
  'steps', (SELECT jsonb_agg(jsonb_build_object('step', step, 'ok', ok, 'detail', detail) ORDER BY step)),
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
RESET ROLE;
