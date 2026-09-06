-- GATE 5/9/10 · Evidencia viva: función reset_store_data (overloads), triggers vivos,
-- audit reset/restore global, restore_sessions, distribución updated_at (READ ONLY)
SELECT jsonb_build_object(
  'reset_function_overloads', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'identity', p.oid::regprocedure::text,
      'secdef', p.prosecdef,
      'owner', pg_get_userbyid(p.proowner),
      'def', pg_get_functiondef(p.oid))), '[]')
    FROM pg_proc p WHERE p.proname = 'reset_store_data'),
  'live_triggers', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'table', c.relname, 'trigger', t.tgname, 'enabled', t.tgenabled, 'func', pp.proname) ORDER BY c.relname, t.tgname), '[]')
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc pp ON pp.oid = t.tgfoid
    WHERE c.relname IN ('products','inventory','stock_movements','receipt_items','transaction_items','inventory_movements')
      AND NOT t.tgisinternal),
  'audit_actions_full', (SELECT COALESCE(jsonb_agg(jsonb_build_object('action', z.action, 'n', z.n) ORDER BY z.n DESC), '[]')
    FROM (SELECT action, count(*) n FROM audit_logs WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' GROUP BY 1) z),
  'audit_reset_restore_global', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', al.id, 'store_id', al.store_id, 'table_name', al.table_name, 'action', al.action,
      'created_at', al.created_at, 'user_id', al.user_id, 'metadata', al.metadata) ORDER BY al.created_at), '[]')
    FROM audit_logs al
    WHERE al.action ILIKE '%reset%' OR al.action ILIKE '%restore%' OR al.action ILIKE '%backup%'),
  'audit_stores_rows', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', al.id, 'action', al.action, 'created_at', al.created_at, 'user_id', al.user_id,
      'old_data', al.old_data, 'new_data', al.new_data, 'metadata', al.metadata) ORDER BY al.created_at), '[]')
    FROM audit_logs al WHERE al.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND al.table_name='stores'),
  'restore_sessions', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', rs.id, 'store_id', rs.store_id, 'status', rs.status, 'mode', rs.mode,
      'initiated_by', rs.initiated_by, 'initiated_at', rs.initiated_at, 'completed_at', rs.completed_at,
      'failed_at', rs.failed_at, 'failure_reason', rs.failure_reason,
      'tables_processed', rs.tables_processed, 'tables_failed', rs.tables_failed,
      'total_rows_processed', rs.total_rows_processed,
      'payload_bytes', length(rs.backup_payload::text)) ORDER BY rs.initiated_at), '[]')
    FROM restore_sessions rs),
  'restore_sessions_count', (SELECT count(*) FROM restore_sessions),
  'backup_registry_rows', (SELECT count(*) FROM backup_table_registry),
  'products_updated_by_day', (SELECT COALESCE(jsonb_agg(jsonb_build_object('day', q.d, 'n', q.n) ORDER BY q.d), '[]')
    FROM (SELECT date_trunc('day', updated_at) d, count(*) n FROM products
          WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' GROUP BY 1) q),
  'products_updated_burst_seconds', (SELECT COALESCE(jsonb_agg(jsonb_build_object('sec', q2.s, 'n', q2.n) ORDER BY q2.n DESC), '[]')
    FROM (SELECT date_trunc('second', updated_at) s, count(*) n FROM products
          WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' GROUP BY 1 HAVING count(*) > 2 ORDER BY n DESC LIMIT 15) q2),
  'products_updated_after_0818', (SELECT count(*) FROM products
    WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND updated_at > '2026-08-18T00:00:00Z'),
  'devolution_items_surviving', (SELECT count(*) FROM devolution_items di
    WHERE di.devolution_id IN (SELECT id FROM devolutions WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')),
  'sample_sale_audit_shape', (SELECT jsonb_build_object('action', al.action, 'created_at', al.created_at,
      'new_data_keys', (SELECT jsonb_object_keys_agg FROM (SELECT jsonb_agg(k) AS jsonb_object_keys_agg
        FROM jsonb_object_keys(COALESCE(al.new_data,'{}'::jsonb)) k) s),
      'new_data_items_present', (al.new_data ? 'items'), 'new_data_size', length(al.new_data::text))
    FROM audit_logs al WHERE al.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
      AND al.action IN ('CREATE_SALE_V2','CREATE_SALE') ORDER BY al.created_at DESC LIMIT 1)
) AS evidence;
