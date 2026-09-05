-- W9.5-B8 · Sentinelas PRE (antes del fixture) — integridad de datos reales
SELECT jsonb_build_object(
  'ts', now(),
  't_transactions',      (SELECT jsonb_build_object('n', count(*), 'md5', md5(coalesce(string_agg(id::text, ',' ORDER BY id),'')), 'sum_total', sum(total_amount)) FROM transactions),
  't_tx_items',          (SELECT jsonb_build_object('n', count(*), 'md5', md5(coalesce(string_agg(id::text, ',' ORDER BY id),''))) FROM transaction_items),
  't_payments',          (SELECT jsonb_build_object('n', count(*), 'md5', md5(coalesce(string_agg(id::text, ',' ORDER BY id),'')), 'sum_amt', sum(amount)) FROM payment_transactions),
  't_stock_movements',   (SELECT jsonb_build_object('n', count(*), 'md5', md5(coalesce(string_agg(id::text, ',' ORDER BY id),''))) FROM stock_movements),
  't_inventory',         (SELECT jsonb_build_object('n', count(*), 'md5', md5(coalesce(string_agg(product_id::text || store_id::text, ',' ORDER BY product_id, store_id),'')), 'sum_qty', sum(quantity)) FROM inventory),
  't_products',          (SELECT jsonb_build_object('n', count(*), 'md5', md5(coalesce(string_agg(id::text, ',' ORDER BY id),'')), 'sum_stock', sum(stock_current), 'sum_wac', sum(cost_average)) FROM products),
  't_stores',            (SELECT jsonb_build_object('n', count(*), 'md5', md5(coalesce(string_agg(id::text, ',' ORDER BY id),''))) FROM stores),
  't_profiles',          (SELECT jsonb_build_object('n', count(*), 'md5', md5(coalesce(string_agg(id::text, ',' ORDER BY id),''))) FROM profiles),
  't_memberships',       (SELECT jsonb_build_object('n', count(*), 'md5', md5(coalesce(string_agg(id::text, ',' ORDER BY id),''))) FROM user_store_memberships),
  't_audit_logs',        (SELECT jsonb_build_object('n', count(*), 'md5', md5(coalesce(string_agg(id::text, ',' ORDER BY id),''))) FROM audit_logs),
  't_commissions',       (SELECT jsonb_build_object('n', count(*), 'md5', md5(coalesce(string_agg(id::text, ',' ORDER BY id),''))) FROM commission_payments),
  't_business_events',   (SELECT jsonb_build_object('n', count(*), 'md5', md5(coalesce(string_agg((event_type||entity_id::text), ',' ORDER BY entity_id, event_type),''))) FROM business_events),
  'kardex_exists',       (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='kardex_entries'),
  'movement_types',      (SELECT jsonb_agg(enumlabel ORDER BY enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='movement_type')
) AS sentinels;
