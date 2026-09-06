-- GATE 5 · Trigger function bodies (READ ONLY)
SELECT jsonb_build_object(
  'fns', (
    SELECT COALESCE(jsonb_object_agg(name, def), '{}'::jsonb) FROM (
      SELECT p.proname AS name, max(pg_get_functiondef(p.oid)) AS def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN (
        'auto_kardex_on_stock_movement','sync_product_stock','sync_products_stock_current',
        'prevent_direct_inventory_modification','prevent_negative_inventory',
        'w62_guard_wac_writer','audit_product_changes'
      ) GROUP BY p.proname
    ) t
  )
) AS evidence;
