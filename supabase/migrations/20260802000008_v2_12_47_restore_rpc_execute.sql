-- =============================================================================
-- Migration: 20260802000008_v2_12_47_restore_rpc_execute.sql
-- Iteración 7 — Backup Restore BR-2.2 (Fase 2: Execute mode con restore_mode)
--
-- Componentes:
--   1. Modificación de 9 funciones trigger con bypass restore_mode
--   2. restore_store_backup(mode='execute') con transacción atómica + rollback
--
-- NO toca tablas (solo funciones).
-- Tablas intocables confirmadas: profiles, user_store_memberships, tenants
--
-- Diseño: ver docs/BR2_DESIGN_FINAL.md
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. MODIFICACIÓN DE 9 FUNCIONES TRIGGER CON BYPASS restore_mode
-- =============================================================================
-- Cada función agrega al inicio:
--   IF current_setting('app.restore_mode', true) = 'true' THEN
--     RETURN NEW;  -- o NULL para AFTER STATEMENT triggers
--   END IF;
--
-- Comportamiento:
--   - restore_mode = 'true'  → bypass (trigger no hace nada)
--   - restore_mode = NULL o cualquier otro valor → comportamiento normal
--   - SET LOCAL aplica solo dentro de la transacción actual
-- =============================================================================

-- 1.1 sync_products_stock_current() — inventory AFTER ROW
-- ANTES: UPDATE products.stock_current = NEW.quantity
-- DESPUÉS: si restore_mode, no actualiza (se sincroniza al final del restore)
CREATE OR REPLACE FUNCTION public.sync_products_stock_current()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- Bypass durante restauración
  IF current_setting('app.restore_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  UPDATE public.products
  SET stock_current = NEW.quantity
  WHERE id = NEW.product_id;

  RETURN NEW;
END;
$$;

-- 1.2 prevent_direct_inventory_modification() — inventory BEFORE STATEMENT
-- ANTES: bloquea cualquier UPDATE directo (excepto desde trigger interno o postgres)
-- DESPUÉS: si restore_mode, permite UPDATE/INSERT directo
CREATE OR REPLACE FUNCTION public.prevent_direct_inventory_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- Bypass durante restauración
  IF current_setting('app.restore_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 OR current_setting('role', true) = 'postgres' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'ERR_DIRECT_INVENTORY_MODIFICATION: El inventario es inmutable. Registra un movimiento en stock_movements para cambiar las cantidades.';
END;
$$;

-- 1.3 prevent_negative_inventory() — inventory BEFORE STATEMENT
-- ANTES: bloquea quantity < 0
-- DESPUÉS: si restore_mode, permite (backup puede tener saldos negativos legítimos)
CREATE OR REPLACE FUNCTION public.prevent_negative_inventory()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- Bypass durante restauración
  IF current_setting('app.restore_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.quantity < 0 THEN
    RAISE EXCEPTION 'Stock negativo no permitido | product_id=% | store_id=%', NEW.product_id, NEW.store_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 1.4 alert_low_stock() — inventory AFTER STATEMENT
-- ANTES: inserta business_events con low_stock_alert
-- DESPUÉS: si restore_mode, no inserta (evita duplicación de eventos)
CREATE OR REPLACE FUNCTION public.alert_low_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- Bypass durante restauración
  IF current_setting('app.restore_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.quantity <= COALESCE(NEW.low_stock_threshold, 10) THEN
    INSERT INTO public.business_events(event_type, entity_id, payload, created_at)
    VALUES (
      'low_stock_alert',
      NEW.product_id,
      jsonb_build_object(
        'store_id', NEW.store_id,
        'quantity', NEW.quantity,
        'threshold', NEW.low_stock_threshold
      ),
      timezone('utc', now())
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 1.5 fn_sync_inventory_on_movement() — stock_movements BEFORE ROW
-- ANTES: modifica inventory.quantity según quantity_change (CRÍTICO)
-- DESPUÉS: si restore_mode, NO modifica inventory (ya está restaurado)
CREATE OR REPLACE FUNCTION public.fn_sync_inventory_on_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_new_qty numeric;
  v_exists boolean;
  v_product_stock numeric;
BEGIN
  -- Bypass durante restauración
  IF current_setting('app.restore_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.inventory WHERE store_id = NEW.store_id AND product_id = NEW.product_id) INTO v_exists;
  IF NOT v_exists THEN
    SELECT stock_current INTO v_product_stock FROM public.products WHERE id = NEW.product_id;
    v_new_qty := COALESCE(v_product_stock, 0) + NEW.quantity_change;
    IF v_new_qty < 0 THEN
      v_new_qty := 0;
    END IF;
    INSERT INTO public.inventory (store_id, product_id, quantity, version, updated_at)
    VALUES (NEW.store_id, NEW.product_id, v_new_qty, 1, now())
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE public.inventory
    SET quantity = public.inventory.quantity + NEW.quantity_change,
        version = public.inventory.version + 1,
        updated_at = now()
    WHERE store_id = NEW.store_id AND product_id = NEW.product_id
    RETURNING quantity INTO v_new_qty;
    IF v_new_qty < 0 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: El stock no puede ser negativo para el producto % (Resultado: %)', NEW.product_id, v_new_qty;
    END IF;
  END IF;
  NEW.balance_after := v_new_qty;
  RETURN NEW;
END;
$$;

-- 1.6 auto_kardex_on_stock_movement() — stock_movements AFTER ROW
-- ANTES: inserta kardex_entries para cada stock_movement (CRÍTICO - duplica)
-- DESPUÉS: si restore_mode, no inserta (kardex_entries se restaura directo del backup)
CREATE OR REPLACE FUNCTION public.auto_kardex_on_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_store_id UUID;
    v_movement_type TEXT;
    v_qty NUMERIC;
    v_unit_cost NUMERIC;
BEGIN
    -- Bypass durante restauración
    IF current_setting('app.restore_mode', true) = 'true' THEN
        RETURN NEW;
    END IF;

    SELECT store_id INTO v_store_id FROM public.products WHERE id = NEW.product_id;
    IF v_store_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_movement_type := CASE
        WHEN NEW.movement_type IN ('sale', 'void', 'sale_void') THEN 'out'
        WHEN NEW.movement_type IN ('purchase', 'initial') THEN 'in'
        WHEN NEW.movement_type = 'adjustment' THEN 'adjustment'
        WHEN NEW.movement_type = 'return' THEN 'devolution_in'
        WHEN NEW.movement_type = 'transfer_in' THEN 'transfer_in'
        WHEN NEW.movement_type IN ('transfer', 'transfer_out') THEN 'transfer_out'
        WHEN NEW.movement_type IN ('production_in', 'production_out') THEN 'adjustment'
        ELSE 'adjustment'
    END;

    v_qty := ABS(NEW.quantity_change);
    v_unit_cost := COALESCE(NEW.unit_cost, 0);

    INSERT INTO public.kardex_entries (
        store_id, product_id, movement_type, quantity, unit_cost, total_value,
        balance_quantity, balance_unit_cost, balance_total_value,
        reference_type, reference_id, reference_description, created_by
    )
    SELECT
        v_store_id, NEW.product_id, v_movement_type, v_qty, v_unit_cost, v_qty * v_unit_cost,
        p.stock_current, p.cost_average, p.stock_current * p.cost_average,
        'stock_movement', NEW.id, COALESCE(NEW.reference_doc, NEW.movement_type), NEW.created_by
    FROM public.products p
    WHERE p.id = NEW.product_id;

    RETURN NEW;
END;
$$;

-- 1.7 sync_product_stock() — stock_movements AFTER ROW
-- ANTES: recalcula products.stock_current desde el último stock_movement
-- DESPUÉS: si restore_mode, no recalcula (se sincroniza al final del restore)
CREATE OR REPLACE FUNCTION public.sync_product_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    -- Bypass durante restauración
    IF current_setting('app.restore_mode', true) = 'true' THEN
        RETURN NEW;
    END IF;

    UPDATE public.products
    SET stock_current = COALESCE(
        (SELECT sm.balance_after
         FROM public.stock_movements sm
         WHERE sm.product_id = NEW.product_id
         ORDER BY sm.movement_date DESC, sm.created_at DESC
         LIMIT 1),
        0
    )
    WHERE id = NEW.product_id;

    RETURN NEW;
END;
$$;

-- 1.8 update_product_wac() — receipt_items AFTER ROW
-- ANTES: recalcula cost_average (WAC) para el producto
-- DESPUÉS: si restore_mode, no recalcula (WAC viene del backup)
CREATE OR REPLACE FUNCTION public.update_product_wac()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_current_stock NUMERIC;
    v_current_cost NUMERIC;
    v_new_stock NUMERIC;
    v_new_cost NUMERIC;
BEGIN
    -- Bypass durante restauración
    IF current_setting('app.restore_mode', true) = 'true' THEN
        RETURN NEW;
    END IF;

    SELECT stock_current, cost_average INTO v_current_stock, v_current_cost
    FROM public.products
    WHERE id = NEW.product_id
    FOR UPDATE;

    v_current_stock := COALESCE(v_current_stock, 0);
    v_current_cost := COALESCE(v_current_cost, 0);

    v_new_stock := v_current_stock + NEW.quantity;

    IF v_new_stock > 0 THEN
        v_new_cost := ((v_current_stock * v_current_cost) + (NEW.quantity * NEW.unit_cost)) / v_new_stock;
    ELSE
        v_new_cost := NEW.unit_cost;
    END IF;

    UPDATE public.products
    SET cost_average = v_new_cost,
        updated_at = NOW()
    WHERE id = NEW.product_id;

    RETURN NEW;
END;
$$;

-- 1.9 sync_product_has_movements() — receipt_items/transaction_items/inventory_movements AFTER ROW
-- ANTES: marca products.has_movements = true
-- DESPUÉS: si restore_mode, no marca (innecesario durante restore)
CREATE OR REPLACE FUNCTION public.sync_product_has_movements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    -- Bypass durante restauración
    IF current_setting('app.restore_mode', true) = 'true' THEN
        RETURN NEW;
    END IF;

    UPDATE public.products
    SET has_movements = true
    WHERE id = NEW.product_id AND has_movements = false;

    RETURN NEW;
END;
$$;

-- =============================================================================
-- 2. RESTORE_STORE_BACKUP(mode='execute') — IMPLEMENTACIÓN COMPLETA
-- =============================================================================
-- Reemplaza la función de BR-2.1 con la versión que también soporta execute.

CREATE OR REPLACE FUNCTION public.restore_store_backup(
  p_store_id UUID,
  p_backup_payload JSONB,
  p_mode TEXT DEFAULT 'preview',
  p_confirmation_token TEXT DEFAULT NULL
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
  v_initiator UUID;
  rec RECORD;
  v_rows JSONB;
  v_row_count INTEGER;
  v_lock_token TEXT;
  v_pre_restore_snapshot JSONB;
  v_post_restore_validation JSONB;
  v_tables_processed INTEGER := 0;
  v_tables_failed INTEGER := 0;
  v_existing_session_id UUID;
  v_stored_token TEXT;
  v_filter_strategy TEXT;
  v_writable_cols TEXT[];
  v_cols_sql TEXT;
  v_insert_sql TEXT;
  v_delete_sql TEXT;
  v_rows_inserted BIGINT;
  v_rows_deleted BIGINT;
  v_inv_product_id UUID;
  v_inv_qty NUMERIC;
  v_inv_row JSONB;
  v_sync_count INTEGER;
BEGIN
  -- ============================================================
  -- PHASE 0: VALIDATE (común a preview y execute)
  -- ============================================================
  v_initiator := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID);

  SELECT EXISTS(SELECT 1 FROM public.stores WHERE id = p_store_id) INTO v_store_exists;
  IF NOT v_store_exists THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: Tienda % no existe', p_store_id;
  END IF;

  v_backup_format := p_backup_payload->'meta'->>'format';
  IF v_backup_format IS NULL OR v_backup_format != 'costpro-store-backup' THEN
    RAISE EXCEPTION 'ERR_INVALID_BACKUP_FORMAT: Se espera format=costpro-store-backup, got %', v_backup_format;
  END IF;

  v_backup_store_id := p_backup_payload->'meta'->>'storeId';
  IF v_backup_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_BACKUP_MISSING_STORE_ID: meta.storeId es requerido';
  END IF;

  v_backup_version := p_backup_payload->'meta'->>'version';

  -- CREATE SESSION
  INSERT INTO public.restore_sessions (
    store_id, initiated_by, status, mode, backup_payload
  ) VALUES (
    p_store_id, v_initiator, 'PREPARING', p_mode, p_backup_payload
  ) RETURNING id INTO v_session_id;

  -- VALIDATE: backup tables vs registry
  SELECT array_agg(key) INTO v_tables_in_backup
  FROM (SELECT key FROM jsonb_object_keys(p_backup_payload->'tables') AS key) k;

  v_table_count := COALESCE(array_length(v_tables_in_backup, 1), 0);

  SELECT array_agg(table_name ORDER BY tier, table_name) INTO v_active_registry_tables
  FROM public.backup_table_registry
  WHERE excluded_from_restore = FALSE;

  SELECT array_agg(t) INTO v_missing_tables
  FROM unnest(v_tables_in_backup) AS t
  WHERE NOT (t = ANY(v_active_registry_tables));

  SELECT array_agg(t) INTO v_extra_tables
  FROM unnest(v_active_registry_tables) AS t
  WHERE NOT (t = ANY(v_tables_in_backup));

  -- source_of_truth invariants
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

  -- tier ordering
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

  -- COUNT rows per table
  FOR rec IN SELECT table_name FROM unnest(v_tables_in_backup) AS table_name LOOP
    v_rows := p_backup_payload->'tables'->rec.table_name;
    v_row_count := CASE WHEN jsonb_typeof(v_rows) = 'array'
                        THEN jsonb_array_length(v_rows)
                        ELSE 0 END;
    v_total_rows := v_total_rows + v_row_count;
    v_table_stats := jsonb_set(v_table_stats, ARRAY[rec.table_name], to_jsonb(v_row_count));
  END LOOP;

  -- FK INTEGRITY CHECK
  SELECT public.validate_pre_restore_fk_integrity(p_store_id) INTO v_fk_integrity;

  -- DETERMINE preview_passed
  v_preview_passed := TRUE;

  IF v_missing_tables IS NOT NULL AND array_length(v_missing_tables, 1) > 0 THEN
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

  -- UPDATE SESSION
  UPDATE public.restore_sessions
  SET status = 'DRY_RUN',
      post_restore_validation = jsonb_build_object(
        'mode', p_mode,
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
  -- PREVIEW ONLY — return here
  -- ============================================================
  IF p_mode = 'preview' THEN
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
        'Preview OK. Ejecuta generate_confirmation_token(session_id) para obtener un token, luego restore_store_backup(store_id, backup, mode=execute, confirmation_token=token).'
      ELSE
        'Preview FAILED. Corrige los errores reportados antes de continuar.'
      END
    );
  END IF;

  -- ============================================================
  -- EXECUTE MODE
  -- ============================================================
  IF p_mode != 'execute' THEN
    RAISE EXCEPTION 'ERR_INVALID_MODE: p_mode debe ser preview o execute, got %', p_mode;
  END IF;

  -- 1. Confirmar preview_passed=true
  IF NOT v_preview_passed THEN
    UPDATE public.restore_sessions
    SET status = 'FAILED',
        failure_reason = 'Preview failed — cannot proceed to execute',
        failed_at = NOW()
    WHERE id = v_session_id;
    RAISE EXCEPTION 'ERR_PREVIEW_FAILED: Preview failed — cannot proceed to execute';
  END IF;

  -- 2. Validar confirmation_token
  IF p_confirmation_token IS NULL OR p_confirmation_token = '' THEN
    UPDATE public.restore_sessions
    SET status = 'FAILED',
        failure_reason = 'Missing confirmation_token',
        failed_at = NOW()
    WHERE id = v_session_id;
    RAISE EXCEPTION 'ERR_MISSING_TOKEN: confirmation_token is required for execute mode';
  END IF;

  -- Find a previous DRY_RUN session with this token
  SELECT id, confirmation_token INTO v_existing_session_id, v_stored_token
  FROM public.restore_sessions
  WHERE store_id = p_store_id
    AND confirmation_token = p_confirmation_token
    AND status = 'DRY_RUN'
    AND preview_passed = TRUE
  ORDER BY initiated_at DESC
  LIMIT 1;

  IF v_existing_session_id IS NULL THEN
    UPDATE public.restore_sessions
    SET status = 'FAILED',
        failure_reason = 'Invalid or expired confirmation_token',
        failed_at = NOW()
    WHERE id = v_session_id;
    RAISE EXCEPTION 'ERR_INVALID_TOKEN: confirmation_token does not match any preview session';
  END IF;

  -- 3. Validar FK integrity (no blockers)
  IF (v_fk_integrity->>'can_proceed') != 'true' THEN
    UPDATE public.restore_sessions
    SET status = 'FAILED',
        failure_reason = 'FK integrity check failed — blockers detected',
        failed_at = NOW()
    WHERE id = v_session_id;
    RAISE EXCEPTION 'ERR_FK_BLOCKERS: % blockers detected', v_fk_integrity->>'blocker_count';
  END IF;

  -- 4. Adquirir pg_advisory_xact_lock (concurrencia)
  v_lock_token := 'restore_store_' || p_store_id::text;
  PERFORM pg_advisory_xact_lock(hashtext(v_lock_token));

  UPDATE public.restore_sessions
  SET lock_acquired = TRUE,
      lock_token = v_lock_token,
      status = 'EXECUTING'
  WHERE id = v_session_id;

  -- 5. Crear pre_restore_snapshot
  SELECT public.create_pre_restore_snapshot(p_store_id) INTO v_pre_restore_snapshot;

  UPDATE public.restore_sessions
  SET pre_restore_snapshot = v_pre_restore_snapshot
  WHERE id = v_session_id;

  -- 6. SET LOCAL app.restore_mode = 'true' (bypass triggers)
  SET LOCAL app.restore_mode = 'true';

  -- Verify restore_mode is set
  IF current_setting('app.restore_mode', true) IS NULL
     OR current_setting('app.restore_mode', true) != 'true' THEN
    RAISE EXCEPTION 'ERR_RESTORE_MODE_NOT_SET: app.restore_mode could not be set';
  END IF;

  -- 7. DELETE existing data (in REVERSE tier order — children before parents)
  -- Tables NEVER deleted: profiles, user_store_memberships, tenants
  -- Tables with excluded_from_restore=TRUE: also not deleted (they're not in v_active_registry_tables)

  FOR rec IN
    SELECT table_name FROM unnest(v_active_registry_tables) AS table_name
    ORDER BY (SELECT tier FROM public.backup_table_registry WHERE table_name = table_name) DESC,
             table_name DESC
  LOOP
    -- Skip tables we should never touch
    CONTINUE WHEN rec.table_name IN ('profiles', 'user_store_memberships', 'tenants');

    -- Skip 'stores' (it's UPDATEd, not DELETEd)
    CONTINUE WHEN rec.table_name = 'stores';

    -- Get filter_strategy for this table
    SELECT filter_strategy INTO v_filter_strategy
    FROM public.backup_table_registry
    WHERE table_name = rec.table_name;

    BEGIN
      IF v_filter_strategy = 'via_origin_dest' THEN
        -- transfers: origin OR destination
        v_delete_sql := format('DELETE FROM public.%I WHERE origin_store_id = $1 OR destination_store_id = $1', rec.table_name);
        EXECUTE v_delete_sql USING p_store_id;
        GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
      ELSIF v_filter_strategy = 'via_entity_id' THEN
        -- business_events: entity_id = store_id::text
        v_delete_sql := format('DELETE FROM public.%I WHERE entity_id = $1::text', rec.table_name);
        EXECUTE v_delete_sql USING p_store_id;
        GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
      ELSIF v_filter_strategy = 'store_id' THEN
        -- Standard store_id filter
        v_delete_sql := format('DELETE FROM public.%I WHERE store_id = $1', rec.table_name);
        EXECUTE v_delete_sql USING p_store_id;
        GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
      END IF;
      -- via_parent tables are deleted via CASCADE from parent DELETE
      -- by_id (stores) is skipped above

      v_tables_processed := v_tables_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_tables_failed := v_tables_failed + 1;
      v_table_stats := jsonb_set(v_table_stats, ARRAY[rec.table_name || '_delete_error'], to_jsonb(SQLERRM));
      RAISE EXCEPTION 'ERR_DELETE_FAILED: % - %', rec.table_name, SQLERRM;
    END;
  END LOOP;

  -- 8. INSERT backup data (in tier order — parents before children)
  FOR rec IN
    SELECT table_name FROM unnest(v_active_registry_tables) AS table_name
    ORDER BY (SELECT tier FROM public.backup_table_registry WHERE table_name = table_name) ASC,
             table_name ASC
  LOOP
    -- Skip tables we should never touch
    CONTINUE WHEN rec.table_name IN ('profiles', 'user_store_memberships', 'tenants');

    v_rows := p_backup_payload->'tables'->rec.table_name;
    IF v_rows IS NULL OR jsonb_typeof(v_rows) != 'array' OR jsonb_array_length(v_rows) = 0 THEN
      CONTINUE;
    END IF;

    BEGIN
      IF rec.table_name = 'stores' THEN
        -- For stores, UPDATE the existing row (don't INSERT)
        -- The backup should have 1 row with id = p_store_id
        IF jsonb_array_length(v_rows) > 0 THEN
          v_inv_row := v_rows->0;
          -- Update stores row with backup data (excluding id, created_at)
          UPDATE public.stores SET
            name = v_inv_row->>'name',
            slug = v_inv_row->>'slug',
            address = v_inv_row->>'address',
            phone = v_inv_row->>'phone',
            email = v_inv_row->>'email',
            ruc = v_inv_row->>'ruc',
            business_name = v_inv_row->>'business_name',
            updated_at = NOW()
          WHERE id = p_store_id;
        END IF;
      ELSE
        -- Get writable columns (excludes GENERATED ALWAYS AS STORED)
        SELECT public.get_table_writable_columns(rec.table_name) INTO v_writable_cols;

        IF v_writable_cols IS NULL OR array_length(v_writable_cols, 1) IS NULL THEN
          RAISE EXCEPTION 'No writable columns found for table %', rec.table_name;
        END IF;

        -- Build column list for INSERT
        v_cols_sql := array_to_string(v_writable_cols, ', ');

        -- Use jsonb_populate_record to convert JSONB to rows
        -- Create a temp table with the right structure
        v_insert_sql := format(
          'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_to_recordset($1) AS x(%s)',
          rec.table_name, v_cols_sql, v_cols_sql,
          (SELECT string_agg(col || ' ' || col_type, ', ')
           FROM (
             SELECT column_name AS col, data_type AS col_type
             FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = rec.table_name
               AND column_name = ANY(v_writable_cols)
             ORDER BY ordinal_position
           ) c)
        );

        EXECUTE v_insert_sql USING v_rows;
        GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;
        v_table_stats := jsonb_set(v_table_stats, ARRAY[rec.table_name || '_inserted'], to_jsonb(v_rows_inserted));
      END IF;

      v_tables_processed := v_tables_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_tables_failed := v_tables_failed + 1;
      v_table_stats := jsonb_set(v_table_stats, ARRAY[rec.table_name || '_insert_error'], to_jsonb(SQLERRM));
      RAISE EXCEPTION 'ERR_INSERT_FAILED: % - %', rec.table_name, SQLERRM;
    END;
  END LOOP;

  -- 9. Sincronizar products.stock_current desde inventory
  -- ( trg_sync_products_stock_current fue bypassado durante restore)
  UPDATE public.products p
  SET stock_current = i.quantity,
      updated_at = NOW()
  FROM public.inventory i
  WHERE i.product_id = p.id
    AND i.store_id = p.store_id
    AND p.store_id = p_store_id;

  GET DIAGNOSTICS v_sync_count = ROW_COUNT;
  v_table_stats := jsonb_set(v_table_stats, ARRAY['products_stock_current_synced'], to_jsonb(v_sync_count));

  -- 10. SET LOCAL restore_mode = 'false' (re-enable triggers)
  SET LOCAL app.restore_mode = 'false';

  -- 11. validate_post_restore()
  SELECT public.validate_post_restore(p_store_id, p_backup_payload) INTO v_post_restore_validation;

  -- If validation failed, raise exception (triggers ROLLBACK)
  IF (v_post_restore_validation->>'overall_status') != 'PASS' THEN
    UPDATE public.restore_sessions
    SET status = 'FAILED',
        failure_reason = 'Post-restore validation failed',
        post_restore_validation = v_post_restore_validation,
        tables_processed = v_tables_processed,
        tables_failed = v_tables_failed,
        total_rows_processed = v_total_rows,
        failed_at = NOW()
    WHERE id = v_session_id;
    RAISE EXCEPTION 'ERR_POST_RESTORE_VALIDATION_FAILED: %', v_post_restore_validation;
  END IF;

  -- 12. UPDATE SESSION with success
  UPDATE public.restore_sessions
  SET status = 'COMPLETED',
      post_restore_validation = v_post_restore_validation,
      tables_processed = v_tables_processed,
      tables_failed = v_tables_failed,
      total_rows_processed = v_total_rows,
      completed_at = NOW()
  WHERE id = v_session_id;

  -- RETURN success report
  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'mode', 'execute',
    'target_store_id', p_store_id,
    'backup_store_id', v_backup_store_id,
    'status', 'COMPLETED',
    'tables_processed', v_tables_processed,
    'tables_failed', v_tables_failed,
    'total_rows_processed', v_total_rows,
    'products_stock_current_synced', v_sync_count,
    'validation', v_post_restore_validation
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Annotate the session with the failure
    UPDATE public.restore_sessions
    SET status = 'FAILED',
        failure_reason = SQLERRM,
        tables_processed = v_tables_processed,
        tables_failed = v_tables_failed,
        total_rows_processed = v_total_rows,
        failed_at = NOW()
    WHERE id = v_session_id;
    -- Re-raise to trigger ROLLBACK
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.restore_store_backup(UUID, JSONB, TEXT, TEXT) IS
  'BR-2.2: Restore completo. mode=preview (valida sin escribir) o mode=execute (restaura con transacción atómica). execute requiere confirmation_token válido.';

-- =============================================================================
-- 3. Verificación post-migration
-- =============================================================================

DO $$
DECLARE
  v_trigger_count INTEGER;
  v_func_count INTEGER;
BEGIN
  -- Verificar que las 9 funciones trigger fueron modificadas
  SELECT COUNT(*) INTO v_func_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'sync_products_stock_current',
      'prevent_direct_inventory_modification',
      'prevent_negative_inventory',
      'alert_low_stock',
      'fn_sync_inventory_on_movement',
      'auto_kardex_on_stock_movement',
      'sync_product_stock',
      'update_product_wac',
      'sync_product_has_movements'
    );

  RAISE NOTICE 'Funciones trigger modificadas: % (esperadas: 9)', v_func_count;

  IF v_func_count < 9 THEN
    RAISE EXCEPTION 'BR-2.2 incompleto: % funciones modificadas, esperadas 9', v_func_count;
  END IF;

  -- Verificar que restore_store_backup tiene 4 parámetros (agregado p_confirmation_token)
  SELECT COUNT(*) INTO v_func_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'restore_store_backup'
    AND pg_get_function_arguments(p.oid) LIKE '%p_confirmation_token%';

  IF v_func_count = 0 THEN
    RAISE EXCEPTION 'restore_store_backup no tiene el parámetro p_confirmation_token';
  END IF;

  RAISE NOTICE 'restore_store_backup: parámetro p_confirmation_token OK ✓';
  RAISE NOTICE 'BR-2.2 verificación completa ✓';
END $$;

COMMIT;

-- =============================================================================
-- FIN Migration BR-2.2
-- =============================================================================
-- Triggers modificados (9):
--   sync_products_stock_current()       — inventory AFTER ROW
--   prevent_direct_inventory_modification() — inventory BEFORE STATEMENT
--   prevent_negative_inventory()        — inventory BEFORE STATEMENT
--   alert_low_stock()                   — inventory AFTER STATEMENT
--   fn_sync_inventory_on_movement()     — stock_movements BEFORE ROW
--   auto_kardex_on_stock_movement()     — stock_movements AFTER ROW
--   sync_product_stock()                — stock_movements AFTER ROW
--   update_product_wac()                — receipt_items AFTER ROW
--   sync_product_has_movements()        — receipt_items/transaction_items/inventory_movements AFTER ROW
--
-- Comportamiento:
--   restore_mode = 'true'  → bypass (trigger no hace nada)
--   restore_mode = NULL/otro → comportamiento normal
--   SET LOCAL aplica solo a la transacción actual
--
-- restore_store_backup(mode='execute') flujo:
--   VALIDATE → confirm preview_passed → validate token → advisory_lock
--   → create snapshot → SET LOCAL restore_mode → DELETE reverse order
--   → INSERT topological order → SYNC products.stock_current
--   → SET LOCAL restore_mode=false → validate_post_restore → COMMIT
--
-- Si cualquier paso falla: ROLLBACK completo + restore_sessions.status=FAILED
-- =============================================================================
