-- DECLARED FINAL STATE (Git) de create_pre_restore_snapshot
-- fuente: 20260802000007_v2_12_46_restore_rpc_preview.sql stmt#8

CREATE OR REPLACE FUNCTION public.create_pre_restore_snapshot(
  p_store_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot JSONB;
  v_table_counts JSONB;
  v_inventory JSONB;
  v_products_stock JSONB;
  v_transfers JSONB;
  v_reservations JSONB;
  v_checksums JSONB;
  t RECORD;
  v_count BIGINT;
  v_md5 TEXT;
  v_total_size BIGINT := 0;
BEGIN
  -- 1. Conteos por tabla (pg_stat_user_tables da n_live_tup)
  SELECT jsonb_object_agg(tablename, n_live_tup) INTO v_table_counts
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
    AND relname IN (
      SELECT table_name FROM public.backup_table_registry
      WHERE excluded_from_restore = FALSE
    );

  -- 2. Inventory completo (obligatorio — es la fuente primaria de verdad)
  SELECT jsonb_agg(to_jsonb(i) ORDER BY i.product_id) INTO v_inventory
  FROM public.inventory i
  WHERE i.store_id = p_store_id;

  -- 3. products.stock_current (obligatorio — consistencia post-restore)
  SELECT jsonb_agg(jsonb_build_object(
    'id', p.id, 'sku', p.sku, 'stock_current', p.stock_current,
    'cost_average', p.cost_average, 'updated_at', p.updated_at
  ) ORDER BY p.id) INTO v_products_stock
  FROM public.products p
  WHERE p.store_id = p_store_id;

  -- 4. transfers pendientes (obligatorio — affectan inventory_reservations)
  SELECT jsonb_agg(to_jsonb(t) ORDER BY t.created_at) INTO v_transfers
  FROM public.transfers t
  WHERE t.origin_store_id = p_store_id OR t.destination_store_id = p_store_id;

  -- 5. inventory_reservations activas (obligatorio — estado actual)
  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at) INTO v_reservations
  FROM public.inventory_reservations r
  WHERE r.store_id = p_store_id AND r.status = 'ACTIVE';

  -- 6. Checksums de tablas críticas (primary + audit)
  v_checksums := '{}'::jsonb;
  FOR t IN
    SELECT table_name, filter_strategy FROM public.backup_table_registry
    WHERE source_of_truth IN ('primary', 'audit')
      AND excluded_from_restore = FALSE
    ORDER BY table_name
  LOOP
    BEGIN
      IF t.filter_strategy = 'via_origin_dest' THEN
        EXECUTE format(
          'SELECT count(*) FROM public.%I WHERE origin_store_id = $1 OR destination_store_id = $1',
          t.table_name
        ) INTO v_count USING p_store_id;
        EXECUTE format(
          'SELECT COALESCE(md5(string_agg(id::text, '','' ORDER BY id)), '''') FROM public.%I WHERE origin_store_id = $1 OR destination_store_id = $1',
          t.table_name
        ) INTO v_md5 USING p_store_id;
      ELSIF t.filter_strategy = 'via_entity_id' THEN
        EXECUTE format(
          'SELECT count(*) FROM public.%I WHERE entity_id = $1::text',
          t.table_name
        ) INTO v_count USING p_store_id;
        EXECUTE format(
          'SELECT COALESCE(md5(string_agg(id::text, '','' ORDER BY id)), '''') FROM public.%I WHERE entity_id = $1::text',
          t.table_name
        ) INTO v_md5 USING p_store_id;
      ELSE
        EXECUTE format(
          'SELECT count(*) FROM public.%I WHERE store_id = $1',
          t.table_name
        ) INTO v_count USING p_store_id;
        EXECUTE format(
          'SELECT COALESCE(md5(string_agg(id::text, '','' ORDER BY id)), '''') FROM public.%I WHERE store_id = $1',
          t.table_name
        ) INTO v_md5 USING p_store_id;
      END IF;
      v_checksums := jsonb_set(v_checksums, ARRAY[t.table_name],
                               jsonb_build_object('count', v_count, 'checksum', v_md5));
    EXCEPTION WHEN OTHERS THEN
      v_checksums := jsonb_set(v_checksums, ARRAY[t.table_name],
                               jsonb_build_object('count', v_count, 'checksum', NULL, 'error', SQLERRM));
    END;
  END LOOP;

  v_snapshot := jsonb_build_object(
    'snapshot_at', NOW(),
    'store_id', p_store_id,
    'snapshot_type', 'hybrid',
    'table_counts', COALESCE(v_table_counts, '{}'::jsonb),
    'inventory', COALESCE(v_inventory, '[]'::jsonb),
    'products_stock_current', COALESCE(v_products_stock, '[]'::jsonb),
    'transfers', COALESCE(v_transfers, '[]'::jsonb),
    'inventory_reservations_active', COALESCE(v_reservations, '[]'::jsonb),
    'checksums', v_checksums
  );

  RETURN v_snapshot;
END;
$$
