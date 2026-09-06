-- GATE 11 + purge forensics · pg_stat hints + sync_log + scan global (READ ONLY)
SELECT jsonb_build_object(
  'pg_stat_purged_tables', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'table', s.relname, 'live', s.n_live_tup, 'dead', s.n_dead_tup, 'del', s.n_tup_del,
      'ins', s.n_tup_ins, 'upd', s.n_tup_upd,
      'last_vacuum', s.last_vacuum, 'last_autovacuum', s.last_autovacuum,
      'last_analyze', s.last_analyze, 'last_autoanalyze', s.last_autoanalyze) ORDER BY s.relname), '[]')
    FROM pg_stat_user_tables s
    WHERE s.relname IN ('inventory','stock_movements','kardex_entries','transactions','transaction_items',
                        'receipts','receipt_items','payment_transactions','products','audit_logs','devolutions')),
  'db_stats_reset', (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()),
  'sync_log_cols', (SELECT jsonb_agg(c.column_name ORDER BY c.ordinal_position)
    FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='sync_log'),
  'sync_log_rows', (SELECT count(*) FROM sync_log),
  'stores_overview', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', left(st.id::text,8), 'name', st.name, 'is_active', st.is_active, 'is_archived', st.is_archived,
      'products', (SELECT count(*) FROM products p WHERE p.store_id=st.id),
      'stock_gt0', (SELECT count(*) FROM products p WHERE p.store_id=st.id AND p.stock_current>0),
      'stock_units', (SELECT COALESCE(SUM(p.stock_current),0) FROM products p WHERE p.store_id=st.id AND p.stock_current>0),
      'inventory_rows', (SELECT count(*) FROM inventory i WHERE i.store_id=st.id),
      'movements', (SELECT count(*) FROM stock_movements m WHERE m.store_id=st.id),
      'kardex', (SELECT count(*) FROM kardex_entries k WHERE k.store_id=st.id),
      'transactions', (SELECT count(*) FROM transactions t WHERE t.store_id=st.id)) ORDER BY st.created_at), '[]')
    FROM stores st)
) AS evidence;
