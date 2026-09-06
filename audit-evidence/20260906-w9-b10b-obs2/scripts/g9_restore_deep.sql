-- GATE 9/10 · Deep restore: sesiones de la tienda, payload del backup, eventos store_reset (READ ONLY)
SELECT jsonb_build_object(
  'sessions_this_store', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', rs.id, 'mode', rs.mode, 'status', rs.status, 'initiated_at', rs.initiated_at,
      'completed_at', rs.completed_at, 'failed_at', rs.failed_at, 'failure_reason', rs.failure_reason,
      'tables_processed', rs.tables_processed, 'tables_failed', rs.tables_failed,
      'total_rows_processed', rs.total_rows_processed,
      'payload_bytes', length(rs.backup_payload::text),
      'pre_snapshot_bytes', length(rs.pre_restore_snapshot::text)) ORDER BY rs.initiated_at), '[]')
    FROM restore_sessions rs WHERE rs.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'sessions_by_store_status', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'store_id', q.store_id, 'status', q.status, 'n', q.n) ORDER BY q.store_id, q.status), '[]')
    FROM (SELECT store_id::text store_id, status, count(*) n FROM restore_sessions GROUP BY 1,2) q),
  'payload_top_keys', (SELECT COALESCE(
      (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys((SELECT rs2.backup_payload
        FROM restore_sessions rs2 WHERE rs2.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
        ORDER BY rs2.initiated_at DESC LIMIT 1)) k), '[]')),
  'payload_products_meta', (SELECT COALESCE((
      SELECT jsonb_build_object(
        'is_array', jsonb_typeof(rs.backup_payload) = 'array',
        'products_type', jsonb_typeof(COALESCE(rs.backup_payload->'products', rs.backup_payload->'tables'->'products', 'null'::jsonb)),
        'products_count', CASE
          WHEN jsonb_typeof(rs.backup_payload->'products') = 'array' THEN jsonb_array_length(rs.backup_payload->'products')
          WHEN jsonb_typeof(rs.backup_payload->'tables'->'products') = 'array' THEN jsonb_array_length(rs.backup_payload->'tables'->'products')
          ELSE -1 END,
        'inventory_count', CASE
          WHEN jsonb_typeof(rs.backup_payload->'inventory') = 'array' THEN jsonb_array_length(rs.backup_payload->'inventory')
          WHEN jsonb_typeof(rs.backup_payload->'tables'->'inventory') = 'array' THEN jsonb_array_length(rs.backup_payload->'tables'->'inventory')
          ELSE -1 END,
        'stock_movements_count', CASE
          WHEN jsonb_typeof(rs.backup_payload->'stock_movements') = 'array' THEN jsonb_array_length(rs.backup_payload->'stock_movements')
          WHEN jsonb_typeof(rs.backup_payload->'tables'->'stock_movements') = 'array' THEN jsonb_array_length(rs.backup_payload->'tables'->'stock_movements')
          ELSE -1 END,
        'transactions_count', CASE
          WHEN jsonb_typeof(rs.backup_payload->'transactions') = 'array' THEN jsonb_array_length(rs.backup_payload->'transactions')
          WHEN jsonb_typeof(rs.backup_payload->'tables'->'transactions') = 'array' THEN jsonb_array_length(rs.backup_payload->'tables'->'transactions')
          ELSE -1 END,
        'kardex_count', CASE
          WHEN jsonb_typeof(rs.backup_payload->'kardex_entries') = 'array' THEN jsonb_array_length(rs.backup_payload->'kardex_entries')
          WHEN jsonb_typeof(rs.backup_payload->'tables'->'kardex_entries') = 'array' THEN jsonb_array_length(rs.backup_payload->'tables'->'kardex_entries')
          ELSE -1 END)
      FROM restore_sessions rs
      WHERE rs.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
      ORDER BY rs.initiated_at DESC LIMIT 1), '[]')),
  'audit_store_reset_events', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', al.id, 'action', al.action, 'created_at', al.created_at, 'store_id', al.store_id,
      'user_id', al.user_id, 'trace_id', al.trace_id, 'metadata', al.metadata) ORDER BY al.created_at), '[]')
    FROM audit_logs al WHERE al.action ILIKE 'store_reset%'),
  'audit_backup_counts', (SELECT COALESCE(jsonb_agg(jsonb_build_object('action', q.action, 'n', q.n) ORDER BY q.n DESC), '[]')
    FROM (SELECT action, count(*) n FROM audit_logs WHERE action ILIKE '%BACKUP%' OR action ILIKE '%RESTORE%' GROUP BY 1) q),
  'audit_backup_after_aug', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'action', al.action, 'created_at', al.created_at, 'store_id', al.store_id) ORDER BY al.created_at), '[]')
    FROM audit_logs al
    WHERE (al.action ILIKE '%BACKUP%' OR al.action ILIKE '%RESTORE%') AND al.created_at > '2026-08-01T00:00:00Z'),
  'sample_sale_metadata', (SELECT jsonb_build_object('metadata', al.metadata,
      'new_data_size', length(COALESCE(al.new_data::text,'')), 'old_data_size', length(COALESCE(al.old_data::text,'')))
    FROM audit_logs al WHERE al.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
      AND al.action='CREATE_SALE_V2' ORDER BY al.created_at DESC LIMIT 1)
) AS evidence;
