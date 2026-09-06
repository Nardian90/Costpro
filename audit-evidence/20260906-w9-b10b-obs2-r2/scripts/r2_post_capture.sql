-- R2 · POST capture — zero residue verification (identical shape to GATE 1)
SELECT jsonb_build_object(
  'captured_at', now(),
  'batch', jsonb_build_object(
    'movements', (SELECT count(*) FROM stock_movements WHERE reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'units', (SELECT COALESCE(SUM(quantity_change),0) FROM stock_movements WHERE reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'value_exact', (SELECT COALESCE(SUM(quantity_change * unit_cost),0) FROM stock_movements WHERE reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'inventory_rows', (SELECT count(*) FROM inventory WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'inventory_sum', (SELECT COALESCE(SUM(quantity),0) FROM inventory WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'kardex_rows', (SELECT count(*) FROM kardex_entries WHERE reference_description = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'),
    'business_events', (SELECT count(*) FROM business_events WHERE payload->>'store_id' = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND payload->>'type' = 'initial'),
    'audit_rows', (SELECT count(*) FROM audit_logs WHERE action = 'STOCK_RECONCILIATION_OPENING' AND COALESCE(metadata->>'batch_id', new_data->>'batch_id') = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW')
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
  ),
  'initial_movement_fingerprints', (
    SELECT COALESCE(jsonb_object_agg(m.product_id, md5(concat(m.id::text, m.quantity_change::text, m.unit_cost::text, m.reference_doc, m.reference_id, m.created_at::text, m.created_by::text, m.movement_type::text))), '{}'::jsonb)
    FROM stock_movements m WHERE m.reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'
  ),
  'store_reconciliation', jsonb_build_object(
    'mismatch_products', (
      SELECT count(*) FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id AND i.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
      WHERE p.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND COALESCE(i.quantity, 0) <> COALESCE(p.stock_current, 0)
    ),
    'sum_inventory_store', (SELECT COALESCE(SUM(quantity),0) FROM inventory WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'sum_stock_store', (SELECT COALESCE(SUM(stock_current),0) FROM products WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')
  )
) AS post;
