-- GATE 3 · Temporalidad: productos, audit_logs, adjustments, devolutions, resets globales (READ ONLY)
SELECT jsonb_build_object(
  'products_created_range', (SELECT jsonb_build_object('min', min(created_at), 'max', max(created_at), 'max_updated', max(updated_at))
                              FROM products WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'products_by_created_day', (SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d, 'n', n) ORDER BY d), '[]')
                               FROM (SELECT date_trunc('day', created_at) d, count(*) n
                                     FROM products WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
                                     GROUP BY 1 ORDER BY 1) x),
  'products_updated_range', (SELECT jsonb_build_object('min', min(updated_at), 'max', max(updated_at))
                              FROM products WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'audit_logs_by_table', (SELECT COALESCE(jsonb_agg(jsonb_build_object('table_name', tn, 'n', n) ORDER BY n DESC), '[]')
                           FROM (SELECT table_name tn, count(*) n FROM audit_logs
                                 WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' GROUP BY 1) y),
  'audit_logs_by_action', (SELECT COALESCE(jsonb_agg(jsonb_build_object('action', z.action, 'n', z.n) ORDER BY z.n DESC), '[]')
                            FROM (SELECT action, count(*) n FROM audit_logs
                                  WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' GROUP BY 1) z),
  'audit_logs_by_day', (SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d, 'n', n) ORDER BY d), '[]')
                         FROM (SELECT date_trunc('day', created_at) d, count(*) n FROM audit_logs
                               WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
                               GROUP BY 1 ORDER BY 1) w),
  'audit_logs_range', (SELECT jsonb_build_object('min', min(created_at), 'max', max(created_at))
                        FROM audit_logs WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'adjustments_detail', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                           'id', a.id, 'created_at', a.created_at, 'status', a.status, 'reason', a.reason,
                           'notes', a.notes, 'confirmed_at', a.confirmed_at, 'created_by', a.created_by,
                           'items', (SELECT count(*) FROM inventory_adjustment_items ai WHERE ai.adjustment_id=a.id)
                           ) ORDER BY a.created_at), '[]')
                          FROM inventory_adjustments a WHERE a.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'adjustments_items_qty', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                             'adjustment_id', ai.adjustment_id, 'product_id', ai.product_id,
                             'expected_quantity', ai.expected_quantity, 'counted_quantity', ai.counted_quantity,
                             'difference', ai.difference) ORDER BY ai.adjustment_id), '[]')
                             FROM inventory_adjustment_items ai
                             WHERE ai.adjustment_id IN (SELECT id FROM inventory_adjustments
                               WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')),
  'devolutions_detail', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                           'id', dv.id, 'number', dv.devolution_number, 'created_at', dv.created_at,
                           'status', dv.status, 'total', dv.total_amount, 'reversed_at', dv.reversed_at)
                           ORDER BY dv.created_at), '[]')
                          FROM devolutions dv WHERE dv.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'reset_snapshots_all_stores', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                   'id', r.id, 'store_id', r.store_id, 'initiated_by', r.initiated_by,
                                   'keep_catalog', r.keep_catalog, 'created_at', r.created_at,
                                   'expires_at', r.expires_at, 'snapshot_bytes', length(r.snapshot::text))
                                   ORDER BY r.created_at), '[]')
                                  FROM store_reset_snapshots r),
  'bulk_ops_touching_store', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                 'id', b.id, 'action', b.action, 'status', b.status,
                                 'initiated_at', b.initiated_at, 'completed_at', b.completed_at,
                                 'store_count', b.store_count, 'store_ids', b.store_ids, 'reason', b.reason)
                                 ORDER BY b.initiated_at), '[]')
                               FROM bulk_ops_log b
                               WHERE b.store_ids::text LIKE '%d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576%'
                                  OR b.store_ids::text LIKE '%d1c4ba0e%'),
  'w62_zero_cost_flags_store', (SELECT count(*) FROM w62_zero_cost_flags WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'migration_snapshots_products', (SELECT count(*) FROM migration_history_snapshots
                                    WHERE table_name='products' AND data::text LIKE '%d1c4ba0e%')
) AS evidence;
