-- GATE 2/11 · Column discovery (READ ONLY)
SELECT jsonb_build_object(
  'cols', (
    SELECT COALESCE(jsonb_object_agg(table_name, cols), '{}'::jsonb) FROM (
      SELECT table_name, jsonb_agg(column_name ORDER BY ordinal_position) AS cols
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name IN (
        'business_events','transaction_items','receipt_items','devolution_items','warehouse_stock',
        'warehouses','idempotency_keys','idempotency_registry','user_store_memberships','profiles',
        'products','inventory_reservations','inventory_batches'
      ) GROUP BY table_name
    ) x
  )
) AS evidence;
