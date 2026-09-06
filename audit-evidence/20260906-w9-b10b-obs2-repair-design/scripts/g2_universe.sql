-- GATE 2 · Repair universe + evidence (READ ONLY)
SELECT jsonb_build_object(
  'ts', now(),
  'products', (
    SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.sku, p.id), '[]'::jsonb)
    FROM products p WHERE p.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
  ),
  'inventory', (
    SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.product_id), '[]'::jsonb)
    FROM inventory i WHERE i.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
  ),
  'stock_movements', (
    SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.movement_date, m.created_at), '[]'::jsonb)
    FROM stock_movements m WHERE m.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
  ),
  'kardex', (
    SELECT COALESCE(jsonb_agg(to_jsonb(k) ORDER BY k.created_at), '[]'::jsonb)
    FROM kardex_entries k WHERE k.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
  ),
  'transactions', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'status',t.status,'created_at',t.created_at) ORDER BY t.created_at), '[]'::jsonb)
    FROM transactions t WHERE t.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
  ),
  'transaction_items_by_product', (
    SELECT COALESCE(jsonb_object_agg(x.product_id, x.c), '{}'::jsonb) FROM (
      SELECT ti.product_id, count(*)::int AS c
      FROM transaction_items ti JOIN transactions t ON t.id = ti.transaction_id
      WHERE t.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
      GROUP BY ti.product_id
    ) x
  ),
  'receipt_items_by_product', (
    SELECT COALESCE(jsonb_object_agg(x.product_id, x.c), '{}'::jsonb) FROM (
      SELECT ri.product_id, count(*)::int AS c
      FROM receipt_items ri JOIN receipts r ON r.id = ri.receipt_id
      WHERE r.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
      GROUP BY ri.product_id
    ) x
  ),
  'devolution_items_by_product', (
    SELECT COALESCE(jsonb_object_agg(x.product_id, x.c), '{}'::jsonb) FROM (
      SELECT di.product_id, count(*)::int AS c
      FROM devolution_items di JOIN devolutions d ON d.id = di.devolution_id
      WHERE d.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
      GROUP BY di.product_id
    ) x
  ),
  'warehouses', (
    SELECT COALESCE(jsonb_agg(to_jsonb(w) ORDER BY w.created_at), '[]'::jsonb)
    FROM warehouses w WHERE w.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
  ),
  'warehouse_stock', (
    SELECT COALESCE(jsonb_agg(to_jsonb(ws) ORDER BY ws.product_id), '[]'::jsonb)
    FROM warehouse_stock ws WHERE ws.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
  ),
  'business_events_for_products', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',b.id,'event_type',b.event_type,'entity_id',b.entity_id,'payload',b.payload,'created_at',b.created_at) ORDER BY b.created_at, b.id), '[]'::jsonb)
    FROM business_events b
    WHERE b.entity_id IN (SELECT id FROM products WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')
  ),
  'audit_window', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',a.id,'user_id',a.user_id,'action',a.action,'table_name',a.table_name,'record_id',a.record_id,'old_data',a.old_data,'new_data',a.new_data,'metadata',a.metadata,'store_id',a.store_id,'created_at',a.created_at) ORDER BY a.created_at, a.id), '[]'::jsonb)
    FROM audit_logs a
    WHERE a.created_at >= '2026-07-29' AND a.created_at < '2026-08-19'
      AND a.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
  ),
  'memberships', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'status',m.status,'email',p.email,'full_name',p.full_name,'is_active',p.is_active) ORDER BY m.created_at), '[]'::jsonb)
    FROM user_store_memberships m LEFT JOIN profiles p ON p.id = m.user_id
    WHERE m.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
  ),
  'inventory_reservations', (
    SELECT COALESCE(jsonb_agg(to_jsonb(ir) ORDER BY ir.created_at), '[]'::jsonb)
    FROM inventory_reservations ir WHERE ir.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
  ),
  'idempotency_registry_recent', (
    SELECT count(*)::int FROM idempotency_registry
    WHERE operation ILIKE '%recon%' OR idempotency_key ILIKE '%B10B-OBS2%'
  )
) AS evidence;
