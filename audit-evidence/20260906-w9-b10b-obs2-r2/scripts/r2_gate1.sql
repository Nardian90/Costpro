-- R2 · GATE 1 — REPAIR BASELINE verification (READ ONLY)
-- Batch B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW must be exactly as R1 left it.
SELECT jsonb_build_object(
  'captured_at', now(),
  'batch', jsonb_build_object(
    'movements', (SELECT count(*) FROM stock_movements WHERE reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'units', (SELECT COALESCE(SUM(quantity_change),0) FROM stock_movements WHERE reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'value_exact', (SELECT COALESCE(SUM(quantity_change * unit_cost),0) FROM stock_movements WHERE reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'distinct_products', (SELECT count(DISTINCT product_id) FROM stock_movements WHERE reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'movement_types', (SELECT jsonb_agg(DISTINCT movement_type) FROM stock_movements WHERE reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'inventory_rows', (SELECT count(*) FROM inventory WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'inventory_sum', (SELECT COALESCE(SUM(quantity),0) FROM inventory WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'kardex_rows', (SELECT count(*) FROM kardex_entries WHERE reference_description = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'kardex_value_2dp', (SELECT COALESCE(SUM(total_value),0) FROM kardex_entries WHERE reference_description = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'business_events', (SELECT count(*) FROM business_events WHERE payload->>'store_id' = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND payload->>'type' = 'initial'),
    'audit_rows', (SELECT count(*) FROM audit_logs WHERE action = 'STOCK_RECONCILIATION_OPENING' AND COALESCE(metadata->>'batch_id', new_data->>'batch_id') = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'created_by_distinct', (SELECT jsonb_agg(DISTINCT created_by) FROM stock_movements WHERE reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW')
  ),
  'mismatches', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('pid', x.pid, 'stock', x.stock, 'inv', x.inv, 'msum', x.msum, 'mn', x.mn) ORDER BY x.pid), '[]'::jsonb)
    FROM (
      SELECT sm.product_id AS pid, p.stock_current AS stock, i.quantity AS inv,
             (SELECT COALESCE(SUM(quantity_change),0) FROM stock_movements s2 WHERE s2.product_id = sm.product_id AND s2.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') AS msum,
             (SELECT count(*) FROM stock_movements s3 WHERE s3.product_id = sm.product_id AND s3.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') AS mn
      FROM stock_movements sm
      JOIN products p ON p.id = sm.product_id
      JOIN inventory i ON i.product_id = sm.product_id AND i.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
      WHERE sm.reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'
      GROUP BY sm.product_id, p.stock_current, i.quantity
      HAVING p.stock_current <> i.quantity
          OR i.quantity <> (SELECT COALESCE(SUM(quantity_change),0) FROM stock_movements s2 WHERE s2.product_id = sm.product_id AND s2.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')
          OR (SELECT count(*) FROM stock_movements s3 WHERE s3.product_id = sm.product_id AND s3.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') <> 1
    ) x
  ),
  'global_baseline', jsonb_build_object(
    'products_all', (SELECT count(*) FROM products),
    'products_store', (SELECT count(*) FROM products WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'products_store_stock', (SELECT COALESCE(SUM(stock_current),0) FROM products WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'products_store_cost', (SELECT COALESCE(SUM(cost_average),0) FROM products WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'inventory_all', (SELECT count(*) FROM inventory),
    'inventory_sum', (SELECT COALESCE(SUM(quantity),0) FROM inventory),
    'stock_movements_all', (SELECT count(*) FROM stock_movements),
    'stock_movements_sum', (SELECT COALESCE(SUM(quantity_change),0) FROM stock_movements),
    'kardex_all', (SELECT count(*) FROM kardex_entries),
    'business_events_all', (SELECT count(*) FROM business_events),
    'audit_logs_all', (SELECT count(*) FROM audit_logs),
    'audit_logs_store', (SELECT count(*) FROM audit_logs WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'transactions_all', (SELECT count(*) FROM transactions),
    'transactions_store', (SELECT count(*) FROM transactions WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'transaction_items_all', (SELECT count(*) FROM transaction_items),
    'payments_all', (SELECT count(*) FROM payment_transactions),
    'commissions_all', (SELECT count(*) FROM commission_payments),
    'wac_log_all', (SELECT count(*) FROM wac_change_log),
    'devolutions_store', (SELECT count(*) FROM devolutions WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'receipts_store', (SELECT count(*) FROM receipts WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'transfers_all', (SELECT count(*) FROM transfers),
    'inventory_other', (SELECT count(*) FROM inventory WHERE store_id <> 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'movements_other', (SELECT count(*) FROM stock_movements WHERE store_id <> 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'kardex_other', (SELECT count(*) FROM kardex_entries WHERE store_id <> 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')
  )
) AS gate1;
