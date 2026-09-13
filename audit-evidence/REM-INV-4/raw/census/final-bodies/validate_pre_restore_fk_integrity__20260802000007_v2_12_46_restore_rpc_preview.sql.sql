-- DECLARED FINAL STATE (Git) de validate_pre_restore_fk_integrity
-- fuente: 20260802000007_v2_12_46_restore_rpc_preview.sql stmt#6

CREATE OR REPLACE FUNCTION public.validate_pre_restore_fk_integrity(
  p_store_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blockers JSONB := '[]'::jsonb;
  v_rec RECORD;
  v_row_count BIGINT;
  v_target_strategy TEXT;
BEGIN
  FOR v_rec IN
    SELECT
      cl2.relname AS target_table,
      cl.relname AS blocking_table,
      a.attname AS fk_column,
      con.conname AS fk_name,
      con.confdeltype AS delete_rule_code
    FROM pg_constraint con
    JOIN pg_class cl ON con.conrelid = cl.oid       -- blocking table (has FK)
    JOIN pg_class cl2 ON con.confrelid = cl2.oid    -- target table (referenced)
    JOIN pg_namespace n ON cl.relnamespace = n.oid
    JOIN pg_namespace n2 ON cl2.relnamespace = n2.oid
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
    WHERE n.nspname = 'public'
      AND n2.nspname = 'public'
      AND con.contype = 'f'
      -- Solo NO ACTION (a) o RESTRICT (r) — CASCADE (c), SET NULL (n), SET DEFAULT (d) no bloquean
      AND con.confdeltype IN ('a', 'r')
      -- target_table debe ser una tabla store-scoped en el registry (no excluida)
      AND cl2.relname IN (
        SELECT table_name FROM public.backup_table_registry
        WHERE excluded_from_restore = FALSE
          AND filter_strategy IN ('store_id', 'via_origin_dest', 'via_entity_id')
      )
      -- blocking_table NO debe estar en el registry activo
      -- (si estuviera, también se DELETEaría y su cascade resolvería)
      AND cl.relname NOT IN (
        SELECT table_name FROM public.backup_table_registry
        WHERE excluded_from_restore = FALSE
      )
    ORDER BY cl2.relname, cl.relname
  LOOP
    -- Determinar la estrategia de filtro del target
    SELECT filter_strategy INTO v_target_strategy
    FROM public.backup_table_registry
    WHERE table_name = v_rec.target_table;

    -- Contar filas blocking que referencian filas store-scoped
    BEGIN
      IF v_target_strategy = 'via_origin_dest' THEN
        -- transfers: origin_store_id OR destination_store_id
        EXECUTE format(
          'SELECT count(*) FROM public.%I b WHERE EXISTS (SELECT 1 FROM public.%I t WHERE t.id = b.%I AND (t.origin_store_id = $1 OR t.destination_store_id = $1))',
          v_rec.blocking_table, v_rec.target_table, v_rec.fk_column
        ) INTO v_row_count USING p_store_id;
      ELSIF v_target_strategy = 'via_entity_id' THEN
        -- business_events: entity_id = store_id::text
        EXECUTE format(
          'SELECT count(*) FROM public.%I b WHERE EXISTS (SELECT 1 FROM public.%I t WHERE t.id = b.%I AND t.entity_id = $1::text)',
          v_rec.blocking_table, v_rec.target_table, v_rec.fk_column
        ) INTO v_row_count USING p_store_id;
      ELSE
        -- store_id filter (default)
        EXECUTE format(
          'SELECT count(*) FROM public.%I b WHERE EXISTS (SELECT 1 FROM public.%I t WHERE t.id = b.%I AND t.store_id = $1)',
          v_rec.blocking_table, v_rec.target_table, v_rec.fk_column
        ) INTO v_row_count USING p_store_id;
      END IF;

      IF v_row_count > 0 THEN
        v_blockers := v_blockers || jsonb_build_object(
          'target_table', v_rec.target_table,
          'blocking_table', v_rec.blocking_table,
          'fk_column', v_rec.fk_column,
          'fk_name', v_rec.fk_name,
          'delete_rule', CASE v_rec.delete_rule_code
                           WHEN 'a' THEN 'NO ACTION'
                           WHEN 'r' THEN 'RESTRICT'
                         END,
          'blocking_row_count', v_row_count
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Si la query falla (ej: la tabla no tiene la columna esperada),
      -- reportar como warning pero no fallar
      v_blockers := v_blockers || jsonb_build_object(
        'target_table', v_rec.target_table,
        'blocking_table', v_rec.blocking_table,
        'fk_column', v_rec.fk_column,
        'fk_name', v_rec.fk_name,
        'error', SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'store_id', p_store_id,
    'checked_at', NOW(),
    'blockers', v_blockers,
    'blocker_count', jsonb_array_length(v_blockers),
    'can_proceed', jsonb_array_length(v_blockers) = 0
  );
END;
$$
