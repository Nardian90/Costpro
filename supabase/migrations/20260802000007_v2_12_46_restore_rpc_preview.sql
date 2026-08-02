-- =============================================================================
-- Migration: 20260802000007_v2_12_46_restore_rpc_preview.sql
-- Iteración 7 — Backup Restore BR-2.1 (Fase 1: Preview, sin escritura destructiva)
--
-- Componentes:
--   1. ALTER restore_sessions — agregar confirmation_token, fk_integrity_check, preview_passed
--   2. validate_pre_restore_fk_integrity() — detectar FK que bloquearían DELETE
--   3. create_pre_restore_snapshot() — snapshot híbrido (obligatorio + opcional)
--   4. validate_post_restore() — ampliado con 3 checks (inventory vs backup, trigger consistency, legacy discrepancies)
--   5. restore_store_backup(mode='preview') — solo parsing y validación, NO escribe datos
--   6. generate_confirmation_token() — token requerido para execute mode (BR-2.2)
--   7. get_table_writable_columns() — helper para excluir columnas generadas
--
-- NO modifica triggers ni funciones de negocio existentes.
-- NO implementa mode='execute' (eso es BR-2.2).
--
-- Diseño: ver docs/BR2_DESIGN_FINAL.md
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. ALTER restore_sessions — nuevas columnas
-- =============================================================================

ALTER TABLE public.restore_sessions
  ADD COLUMN IF NOT EXISTS confirmation_token TEXT,
  ADD COLUMN IF NOT EXISTS fk_integrity_check JSONB,
  ADD COLUMN IF NOT EXISTS preview_passed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pre_restore_snapshot_storage_url TEXT;

COMMENT ON COLUMN public.restore_sessions.confirmation_token IS
  'Token criptográfico generado después de un preview exitoso. Requerido para autorizar mode=execute en BR-2.2.';
COMMENT ON COLUMN public.restore_sessions.fk_integrity_check IS
  'Resultado de validate_pre_restore_fk_integrity(). Lista FKs que bloquearían el DELETE.';
COMMENT ON COLUMN public.restore_sessions.preview_passed IS
  'TRUE si el preview validó estructura, FK, source_of_truth sin errores.';
COMMENT ON COLUMN public.restore_sessions.pre_restore_snapshot_storage_url IS
  'Si el snapshot supera 100MB, se guarda en Supabase Storage y aquí se almacena la URL.';

-- =============================================================================
-- 2. validate_pre_restore_fk_integrity(p_store_id)
-- =============================================================================
-- Detecta FKs que impedirían el DELETE de datos de la tienda.
-- Solo reporta FKs con ON DELETE NO ACTION o ON DELETE RESTRICT (no CASCADE).
-- Solo reporta tablas blocking_table que NO están en el registry (excluded o no presentes)
-- y que tienen filas que referencian filas store-scoped de la tienda.

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
$$;

COMMENT ON FUNCTION public.validate_pre_restore_fk_integrity(UUID) IS
  'Detecta FKs (NO ACTION o RESTRICT) que impedirían el DELETE de datos de la tienda. Solo reporta tablas blocking_table que no están en el registry activo y que tienen filas que referencian filas store-scoped.';

-- =============================================================================
-- 3. create_pre_restore_snapshot(p_store_id) — snapshot híbrido
-- =============================================================================

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
$$;

COMMENT ON FUNCTION public.create_pre_restore_snapshot(UUID) IS
  'Crea un snapshot híbrido antes del restore. OBLIGATORIO: metadata, conteos, inventory completo, products.stock_current, transfers pendientes, inventory_reservations activas, checksums de tablas críticas. Si el snapshot supera 100MB, en BR-2.2 se moverá a Supabase Storage.';

-- =============================================================================
-- 4. validate_post_restore(p_store_id, p_backup_payload) — ampliado
-- =============================================================================
-- Reemplaza el esqueleto de Migration 1 con la versión completa.
-- 3 checks:
--   CHECK 1 (CRÍTICO): inventory.quantity restaurado == backup
--   CHECK 2 (HIGH): products.stock_current == inventory.quantity
--   CHECK 3 (WARN): inventory != SUM(stock_movements) — esperado para legacy

CREATE OR REPLACE FUNCTION public.validate_post_restore(
  p_store_id UUID,
  p_backup_payload JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_inventory_count INTEGER;
  v_movements_count INTEGER;
  v_products_count INTEGER;
  v_kardex_count INTEGER;
  v_inventory_mismatches INTEGER := 0;
  v_trigger_failures INTEGER := 0;
  v_legacy_discrepancies INTEGER := 0;
  v_backup_inventory_count INTEGER := 0;
  v_backup_products_count INTEGER := 0;
  v_inventory_backup_jsonb JSONB;
  v_product_id UUID;
  v_backup_qty NUMERIC;
  v_actual_qty NUMERIC;
  v_row JSONB;
BEGIN
  -- Conteos actuales post-restore
  SELECT COUNT(*) INTO v_inventory_count
  FROM public.inventory WHERE store_id = p_store_id;

  SELECT COUNT(*) INTO v_movements_count
  FROM public.stock_movements WHERE store_id = p_store_id;

  SELECT COUNT(*) INTO v_products_count
  FROM public.products WHERE store_id = p_store_id;

  SELECT COUNT(*) INTO v_kardex_count
  FROM public.kardex_entries WHERE store_id = p_store_id;

  -- Si se proporciona el backup, validar consistencia
  IF p_backup_payload IS NOT NULL THEN
    v_inventory_backup_jsonb := COALESCE(p_backup_payload->'tables'->'inventory', '[]'::jsonb);
    v_backup_inventory_count := jsonb_array_length(v_inventory_backup_jsonb);

    v_backup_products_count := jsonb_array_length(
      COALESCE(p_backup_payload->'tables'->'products', '[]'::jsonb)
    );

    -- CHECK 1 (CRÍTICO): inventory.quantity restaurado == backup
    -- Para cada fila en inventory, verificar que existe en el backup con la misma quantity
    FOR v_row IN SELECT * FROM jsonb_array_elements(v_inventory_backup_jsonb) LOOP
      v_product_id := (v_row->>'product_id')::UUID;
      v_backup_qty := (v_row->>'quantity')::NUMERIC;

      SELECT quantity INTO v_actual_qty
      FROM public.inventory
      WHERE store_id = p_store_id AND product_id = v_product_id;

      IF v_actual_qty IS NULL THEN
        -- Fila del backup no existe en inventory restaurado
        v_inventory_mismatches := v_inventory_mismatches + 1;
      ELSIF v_actual_qty != v_backup_qty THEN
        -- Cantidad no coincide
        v_inventory_mismatches := v_inventory_mismatches + 1;
      END IF;
    END LOOP;

    -- También verificar filas en inventory restaurado que NO están en el backup
    SELECT count(*) INTO v_inventory_mismatches
    FROM public.inventory i
    WHERE i.store_id = p_store_id
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_inventory_backup_jsonb) AS b
        WHERE (b->>'product_id')::UUID = i.product_id
          AND (b->>'quantity')::NUMERIC = i.quantity
      );

    -- CHECK 2 (HIGH): products.stock_current == inventory.quantity
    SELECT COUNT(*) INTO v_trigger_failures
    FROM public.products p
    JOIN public.inventory i ON i.product_id = p.id AND i.store_id = p.store_id
    WHERE p.store_id = p_store_id
      AND p.stock_current != i.quantity;

    -- CHECK 3 (WARN): inventory != SUM(stock_movements)
    -- Esperado para datos legacy (4 productos en Puerto Padre)
    SELECT COUNT(*) INTO v_legacy_discrepancies
    FROM (
      SELECT i.product_id, i.quantity as inv_qty,
             COALESCE(SUM(sm.quantity_change), 0) as mov_sum
      FROM public.inventory i
      LEFT JOIN public.stock_movements sm
        ON sm.product_id = i.product_id AND sm.store_id = i.store_id
      WHERE i.store_id = p_store_id
      GROUP BY i.product_id, i.quantity
    ) t
    WHERE inv_qty != mov_sum;
  END IF;

  v_result := jsonb_build_object(
    'validated_at', NOW(),
    'store_id', p_store_id,
    'counts', jsonb_build_object(
      'inventory', v_inventory_count,
      'stock_movements', v_movements_count,
      'products', v_products_count,
      'kardex_entries', v_kardex_count
    ),
    'backup_counts', jsonb_build_object(
      'inventory', v_backup_inventory_count,
      'products', v_backup_products_count
    ),
    'checks', jsonb_build_object(
      'inventory_matches_backup', jsonb_build_object(
        'status', CASE WHEN v_inventory_mismatches = 0 THEN 'PASS' ELSE 'FAIL' END,
        'mismatches', v_inventory_mismatches,
        'severity', 'CRITICAL',
        'description', 'inventory.quantity restaurado debe coincidir con el backup'
      ),
      'products_stock_current_consistency', jsonb_build_object(
        'status', CASE WHEN v_trigger_failures = 0 THEN 'PASS' ELSE 'FAIL' END,
        'failures', v_trigger_failures,
        'severity', 'HIGH',
        'description', 'products.stock_current debe ser igual a inventory.quantity'
      ),
      'inventory_movements_legacy_discrepancies', jsonb_build_object(
        'status', 'WARN',
        'discrepancies', v_legacy_discrepancies,
        'severity', 'INFO',
        'description', 'inventory.quantity != SUM(stock_movements) — esperado para datos legacy'
      )
    ),
    'overall_status', CASE
      WHEN v_inventory_mismatches > 0 THEN 'FAIL'
      WHEN v_trigger_failures > 0 THEN 'FAIL'
      ELSE 'PASS'
    END
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.validate_post_restore(UUID, JSONB) IS
  'Validación post-restore completa. CHECK 1 (CRÍTICO): inventory == backup. CHECK 2 (HIGH): products.stock_current == inventory.quantity. CHECK 3 (WARN): inventory != SUM(stock_movements) esperado para legacy.';

-- =============================================================================
-- 5. restore_store_backup(p_store_id, p_backup_payload, p_mode) — PREVIEW ONLY
-- =============================================================================
-- En BR-2.1 solo se permite mode='preview'. mode='execute' se implementa en BR-2.2.

CREATE OR REPLACE FUNCTION public.restore_store_backup(
  p_store_id UUID,
  p_backup_payload JSONB,
  p_mode TEXT DEFAULT 'preview'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
  v_store_exists BOOLEAN;
  v_backup_format TEXT;
  v_backup_store_id TEXT;
  v_backup_version TEXT;
  v_tables_in_backup TEXT[];
  v_active_registry_tables TEXT[];
  v_table_count INTEGER;
  v_missing_tables TEXT[];
  v_extra_tables TEXT[];
  v_tier_violations JSONB;
  v_source_of_truth_violations JSONB;
  v_total_rows INTEGER := 0;
  v_table_stats JSONB := '{}'::jsonb;
  v_fk_integrity JSONB;
  v_preview_passed BOOLEAN;
  t RECORD;
  v_rows JSONB;
  v_row_count INTEGER;
  v_tier_map JSONB;
  v_backup_tier_map JSONB;
BEGIN
  -- ============================================================
  -- BR-2.1: SOLO preview. execute se implementa en BR-2.2.
  -- ============================================================
  IF p_mode != 'preview' THEN
    RAISE EXCEPTION 'ERR_MODE_NOT_SUPPORTED_IN_BR_2_1: BR-2.1 solo soporta mode=preview. mode=% estará disponible en BR-2.2', p_mode;
  END IF;

  -- ============================================================
  -- VALIDATE: store exists
  -- ============================================================
  SELECT EXISTS(SELECT 1 FROM public.stores WHERE id = p_store_id) INTO v_store_exists;
  IF NOT v_store_exists THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: Tienda % no existe', p_store_id;
  END IF;

  -- ============================================================
  -- VALIDATE: backup format and store_id
  -- ============================================================
  v_backup_format := p_backup_payload->'meta'->>'format';
  IF v_backup_format IS NULL OR v_backup_format != 'costpro-store-backup' THEN
    RAISE EXCEPTION 'ERR_INVALID_BACKUP_FORMAT: Se espera format=costpro-store-backup, got %', v_backup_format;
  END IF;

  v_backup_store_id := p_backup_payload->'meta'->>'storeId';
  IF v_backup_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_BACKUP_MISSING_STORE_ID: meta.storeId es requerido';
  END IF;

  v_backup_version := p_backup_payload->'meta'->>'version';

  -- ============================================================
  -- CREATE SESSION
  -- ============================================================
  INSERT INTO public.restore_sessions (
    store_id, initiated_by, status, mode, backup_payload
  ) VALUES (
    p_store_id, auth.uid(), 'PREPARING', p_mode, p_backup_payload
  ) RETURNING id INTO v_session_id;

  -- ============================================================
  -- VALIDATE: backup tables vs registry
  -- ============================================================
  SELECT array_agg(key) INTO v_tables_in_backup
  FROM (SELECT key FROM jsonb_object_keys(p_backup_payload->'tables') AS key) t;

  v_table_count := COALESCE(array_length(v_tables_in_backup, 1), 0);

  SELECT array_agg(table_name ORDER BY tier, table_name) INTO v_active_registry_tables
  FROM public.backup_table_registry
  WHERE excluded_from_restore = FALSE;

  -- Tables in backup but NOT in active registry
  SELECT array_agg(t) INTO v_missing_tables
  FROM unnest(v_tables_in_backup) AS t
  WHERE NOT (t = ANY(v_active_registry_tables));

  -- Tables in active registry but NOT in backup (informational, not blocking)
  SELECT array_agg(t) INTO v_extra_tables
  FROM unnest(v_active_registry_tables) AS t
  WHERE NOT (t = ANY(v_tables_in_backup));

  -- ============================================================
  -- VALIDATE: source_of_truth invariants
  -- ============================================================
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table_name', table_name,
    'expected_source_of_truth', expected_sot,
    'actual_source_of_truth', source_of_truth
  )), '[]'::jsonb) INTO v_source_of_truth_violations
  FROM (VALUES
    ('inventory', 'primary'),
    ('stock_movements', 'audit'),
    ('kardex_entries', 'audit'),
    ('products', 'primary')
  ) AS v(table_name, expected_sot)
  JOIN public.backup_table_registry r USING (table_name)
  WHERE r.source_of_truth != v.expected_sot;

  -- ============================================================
  -- VALIDATE: tier ordering in backup matches FK dependencies
  -- ============================================================
  -- For each table with a parent_table, verify parent appears BEFORE child in backup
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'child_table', r.table_name,
    'parent_table', r.parent_table,
    'issue', 'parent not found before child in backup ordering'
  )), '[]'::jsonb) INTO v_tier_violations
  FROM public.backup_table_registry r
  WHERE r.excluded_from_restore = FALSE
    AND r.parent_table IS NOT NULL
    AND r.table_name = ANY(v_tables_in_backup)
    AND NOT EXISTS (
      SELECT 1 FROM unnest(v_tables_in_backup) WITH ORDINALITY AS o(t, ord)
      WHERE o.t = r.parent_table
        AND o.ord < (
          SELECT MIN(ord) FROM unnest(v_tables_in_backup) WITH ORDINALITY AS o2(t, ord)
          WHERE o2.t = r.table_name
        )
    );

  -- ============================================================
  -- COUNT rows per table
  -- ============================================================
  FOR t IN SELECT table_name FROM unnest(v_tables_in_backup) AS table_name LOOP
    v_rows := p_backup_payload->'tables'->t.table_name;
    v_row_count := CASE WHEN jsonb_typeof(v_rows) = 'array'
                        THEN jsonb_array_length(v_rows)
                        ELSE 0 END;
    v_total_rows := v_total_rows + v_row_count;
    v_table_stats := jsonb_set(v_table_stats, ARRAY[t.table_name], to_jsonb(v_row_count));
  END LOOP;

  -- ============================================================
  -- FK INTEGRITY CHECK (per user requirement)
  -- ============================================================
  SELECT public.validate_pre_restore_fk_integrity(p_store_id) INTO v_fk_integrity;

  -- ============================================================
  -- DETERMINE preview_passed
  -- ============================================================
  v_preview_passed := TRUE;

  -- Missing tables is informational (backup can have fewer tables than registry)
  -- but tables in backup NOT in registry IS a problem (we don't know how to restore them)
  IF v_missing_tables IS NOT NULL AND array_length(v_missing_tables, 1) > 0 THEN
    -- Only fail if missing tables are NOT in registry at all (excluded tables in backup are OK)
    -- Actually, missing_tables already excludes tables in active registry.
    -- If a table is in backup but not in active registry, it could be:
    --   a) An excluded table (excluded_from_restore=TRUE) — OK, we just skip it
    --   b) A table not in registry at all — FAIL
    -- We need to check which case it is
    PERFORM 1 FROM unnest(v_missing_tables) AS mt
    WHERE NOT EXISTS (
      SELECT 1 FROM public.backup_table_registry r WHERE r.table_name = mt
    );
    IF FOUND THEN
      v_preview_passed := FALSE;
    END IF;
  END IF;

  IF v_tier_violations != '[]'::jsonb THEN
    v_preview_passed := FALSE;
  END IF;

  IF v_source_of_truth_violations != '[]'::jsonb THEN
    v_preview_passed := FALSE;
  END IF;

  -- FK blockers are informational (they would block execute, but preview can still pass)
  -- However, if blockers exist, we should warn the user

  -- ============================================================
  -- UPDATE SESSION
  -- ============================================================
  UPDATE public.restore_sessions
  SET status = 'DRY_RUN',
      post_restore_validation = jsonb_build_object(
        'mode', 'preview',
        'backup_store_id', v_backup_store_id,
        'backup_version', v_backup_version,
        'target_store_id', p_store_id,
        'table_count_in_backup', v_table_count,
        'active_tables_in_registry', array_length(v_active_registry_tables, 1),
        'missing_tables_in_registry', COALESCE(v_missing_tables, ARRAY[]::TEXT[]),
        'extra_tables_in_registry', COALESCE(v_extra_tables, ARRAY[]::TEXT[]),
        'tier_violations', v_tier_violations,
        'source_of_truth_violations', v_source_of_truth_violations,
        'total_rows_in_backup', v_total_rows,
        'table_stats', v_table_stats,
        'fk_integrity', v_fk_integrity
      ),
      fk_integrity_check = v_fk_integrity,
      preview_passed = v_preview_passed
  WHERE id = v_session_id;

  -- ============================================================
  -- RETURN preview report
  -- ============================================================
  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'mode', 'preview',
    'target_store_id', p_store_id,
    'backup_store_id', v_backup_store_id,
    'backup_version', v_backup_version,
    'table_count_in_backup', v_table_count,
    'active_tables_in_registry', array_length(v_active_registry_tables, 1),
    'missing_tables_in_registry', COALESCE(v_missing_tables, ARRAY[]::TEXT[]),
    'extra_tables_in_registry', COALESCE(v_extra_tables, ARRAY[]::TEXT[]),
    'tier_violations', v_tier_violations,
    'source_of_truth_violations', v_source_of_truth_violations,
    'total_rows_in_backup', v_total_rows,
    'table_stats', v_table_stats,
    'fk_integrity', v_fk_integrity,
    'preview_passed', v_preview_passed,
    'next_step', CASE WHEN v_preview_passed THEN
      'Preview OK. Ejecuta generate_confirmation_token(session_id) para obtener un token, luego restore_store_backup(store_id, backup, mode=execute, confirmation_token=token) en BR-2.2.'
    ELSE
      'Preview FAILED. Corrige los errores reportados antes de continuar.'
    END
  );
END;
$$;

COMMENT ON FUNCTION public.restore_store_backup(UUID, JSONB, TEXT) IS
  'BR-2.1: Solo mode=preview. Valida parsing, orden de tablas, dependencias FK, source_of_truth y bloqueos FK. NO escribe datos. mode=execute se implementa en BR-2.2.';

-- =============================================================================
-- 6. generate_confirmation_token(p_session_id)
-- =============================================================================
-- Genera un token criptográfico después de un preview exitoso.
-- Este token será requerido por restore_store_backup(mode='execute') en BR-2.2.

CREATE OR REPLACE FUNCTION public.generate_confirmation_token(
  p_session_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
  v_store_id UUID;
  v_preview_passed BOOLEAN;
BEGIN
  -- Verify session exists, is in DRY_RUN status, and preview passed
  SELECT store_id, preview_passed INTO v_store_id, v_preview_passed
  FROM public.restore_sessions
  WHERE id = p_session_id AND status = 'DRY_RUN';

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_SESSION_NOT_FOUND: Sesión % no existe o no está en estado DRY_RUN', p_session_id;
  END IF;

  IF NOT v_preview_passed THEN
    RAISE EXCEPTION 'ERR_PREVIEW_NOT_PASSED: Preview falló. Corrige los errores antes de generar el token.';
  END IF;

  -- Generate random token (using gen_random_uuid for cryptographic randomness)
  v_token := 'rst_' || replace(gen_random_uuid()::text, '-', '');

  UPDATE public.restore_sessions
  SET confirmation_token = v_token
  WHERE id = p_session_id;

  RETURN v_token;
END;
$$;

COMMENT ON FUNCTION public.generate_confirmation_token(UUID) IS
  'Genera un token criptográfico después de un preview exitoso. Requerido para autorizar mode=execute en BR-2.2.';

-- =============================================================================
-- 7. get_table_writable_columns(p_table_name) — helper para BR-2.2
-- =============================================================================
-- Retorna solo las columnas escribibles (excluye GENERATED ALWAYS AS STORED).
-- Será usado por BR-2.2 para filtrar columnas al hacer INSERT.

CREATE OR REPLACE FUNCTION public.get_table_writable_columns(
  p_table_name TEXT
)
RETURNS TEXT[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT array_agg(column_name ORDER BY ordinal_position)
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = p_table_name
    AND is_generated = 'NEVER'
    AND is_updatable = 'YES';
$$;

COMMENT ON FUNCTION public.get_table_writable_columns(TEXT) IS
  'Retorna columnas escribibles (excluye GENERATED ALWAYS AS STORED). Usado por BR-2.2 para INSERT dinámico.';

-- =============================================================================
-- 8. RLS updates
-- =============================================================================

-- restore_sessions: ya tiene RLS de Migration 1.
-- Las nuevas columnas heredan las policies existentes.

-- Permitir a un usuario leer su propia confirmation_token
-- (la policy existente "restore_sessions_store_access" ya cubre esto
-- porque usa has_store_access(store_id))

-- =============================================================================
-- 9. Verificación post-migration
-- =============================================================================

DO $$
DECLARE
  v_func_count INTEGER;
BEGIN
  -- Verificar que todas las funciones fueron creadas
  SELECT COUNT(*) INTO v_func_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'validate_pre_restore_fk_integrity',
      'create_pre_restore_snapshot',
      'validate_post_restore',
      'restore_store_backup',
      'generate_confirmation_token',
      'get_table_writable_columns'
    );

  RAISE NOTICE 'Funciones BR-2.1 creadas: % (esperadas: 6)', v_func_count;

  IF v_func_count < 6 THEN
    RAISE EXCEPTION 'BR-2.1 incompleto: % funciones creadas, esperadas 6', v_func_count;
  END IF;

  -- Verificar que restore_sessions tiene las nuevas columnas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'restore_sessions'
      AND column_name = 'confirmation_token'
  ) THEN
    RAISE EXCEPTION 'restore_sessions.confirmation_token no fue creado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'restore_sessions'
      AND column_name = 'preview_passed'
  ) THEN
    RAISE EXCEPTION 'restore_sessions.preview_passed no fue creado';
  END IF;

  RAISE NOTICE 'restore_sessions: nuevas columnas OK ✓';
  RAISE NOTICE 'BR-2.1 verificación completa ✓';
END $$;

COMMIT;

-- =============================================================================
-- FIN Migration BR-2.1
-- =============================================================================
-- Próximos pasos:
--   1. Aplicar esta migration a Supabase (vía Management API o SQL Editor)
--   2. Ejecutar validaciones de estructura:
--      SELECT * FROM validate_pre_restore_fk_integrity('d1c4ba0e-...');
--      SELECT * FROM create_pre_restore_snapshot('d1c4ba0e-...');
--      SELECT * FROM validate_post_restore('d1c4ba0e-...', NULL);
--   3. Probar restore_store_backup(mode='preview') con un backup real
--   4. Si todo OK → implementar BR-2.2 (triggers + execute mode)
-- =============================================================================
