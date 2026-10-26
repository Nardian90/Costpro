-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN INVENTARIO FÍSICO / SUPERADMIN (2026-10-26) — Autorización coherente
-- del módulo Inventario Físico con la RLS de su propia tabla.
--
-- DEFECTO (3 capas, causa raíz demostrada contra BD viva):
--   El SuperAdmin de plataforma (admin@demo.com, profiles.role='superadmin')
--   NO lleva membresías de tienda POR DISEÑO (§6 de la migración
--   20260826120000: la activación de plataforma borra sus membresías). Pero:
--     · Capa 1 (app): CreatePhysicalInventoryModal construía el selector SOLO
--       con user.memberships → «Sin Tiendas Autorizadas» (corregido en app).
--     · Capa 2 (middleware): withStoreAccess solo reconocía role='admin' →
--       403 para superadmin en /api/physical-inventory (corregido en app).
--     · Capa 3 (ESTA MIGRACIÓN): las RPCs de escritura del módulo PI autorizan
--       SOLO con has_store_role (membresías), contradiciendo la RLS de SUS
--       PROPIAS tablas — physical_inventories_select/insert/update ya usan
--       «is_admin() OR has_store_access/has_store_role(...)" e is_admin()
--       incluye 'superadmin' desde 20261026120000 §2. Resultado vivo:
--       ERR_UNAUTHORIZED_CREATE_PI para el SuperAdmin aunque la RLS lo
--       autorice (verificado 2026-10-26 contra producción).
--
-- CORRECCIÓN (patrón del PROPIO módulo — register_physical_inventory_sheet y
-- get_physical_inventory_reconciliation ya usan «is_admin() OR has_store_role"):
--   Cada gate de escritura pasa de
--       IF NOT public.has_store_role(v_caller_uid, ...) THEN
--   a
--       IF NOT (public.is_admin_check(v_caller_uid)
--               OR public.has_store_role(v_caller_uid, ...)) THEN
--   · is_admin_check(p_user_id) existe desde 20261026120000 §3 e incluye
--     'admin' Y 'superadmin' — es la variante por user_id explícito correcta
--     para el patrón anti-spoofing H-7 (v_caller_uid resuelto: auth.uid()
--     para authenticated; p_user_id solo para service_role).
--   · NO se toca has_store_role ni has_store_access_as (compartidas por todo
--     el sistema): la corrección es quirúrgica al módulo PI.
--   · Roles operativos (manager/encargado/warehouse/clerk/usuario): SIN
--     cambios — siguen requiriendo membresía activa con el rol de tienda.
--   · Fail-closed: sin rol de tienda Y sin nivel administrativo → excepción.
--
-- Las 12 funciones se recrean byte-idénticas al original salvo el gate
-- (generadas con scripts/mision-pi-generar-migracion.ts, que verificó la
-- igualdad contra las definiciones VIVAS antes de emitir este archivo).
-- Idempotente (CREATE OR REPLACE; los GRANT/REVOKE existentes se conservan).
-- ═══════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- create_physical_inventory
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_physical_inventory(
  p_store_id UUID,
  p_cutoff_date TIMESTAMPTZ,
  p_description TEXT DEFAULT NULL,
  p_responsible_name TEXT DEFAULT NULL,
  p_scope_type TEXT DEFAULT 'full',
  p_categories TEXT[] DEFAULT NULL,
  p_product_ids UUID[] DEFAULT NULL,
  p_blind_mode BOOLEAN DEFAULT false,
  p_observations TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_pi_id UUID;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, p_store_id, ARRAY['admin','manager','encargado']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_CREATE_PI';
  END IF;
  IF p_cutoff_date IS NULL OR p_cutoff_date > NOW() THEN
    RAISE EXCEPTION 'ERR_INVALID_CUTOFF_DATE: la fecha de corte no puede ser futura';
  END IF;
  IF p_scope_type NOT IN ('full','category','selection') THEN
    RAISE EXCEPTION 'ERR_INVALID_SCOPE';
  END IF;
  IF p_scope_type = 'category' AND (p_categories IS NULL OR array_length(p_categories, 1) = 0) THEN
    RAISE EXCEPTION 'ERR_SCOPE_CATEGORIES_REQUIRED';
  END IF;
  IF p_scope_type = 'selection' AND (p_product_ids IS NULL OR array_length(p_product_ids, 1) = 0) THEN
    RAISE EXCEPTION 'ERR_SCOPE_PRODUCTS_REQUIRED';
  END IF;

  INSERT INTO public.physical_inventories (
    store_id, cutoff_date, description, responsible_name,
    scope_type, scope_category_names, scope_products, blind_mode, observations, created_by
  ) VALUES (
    p_store_id, p_cutoff_date, p_description, p_responsible_name,
    p_scope_type, p_categories, p_product_ids, p_blind_mode, p_observations, v_caller_uid
  ) RETURNING id INTO v_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_CREATED', 'physical_inventories', v_pi_id,
          jsonb_build_object('pi_number', (SELECT pi_number FROM public.physical_inventories WHERE id = v_pi_id),
                             'cutoff_date', p_cutoff_date, 'scope_type', p_scope_type,
                             'blind_mode', p_blind_mode), p_store_id);

  RETURN v_pi_id;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- prepare_physical_inventory
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prepare_physical_inventory(
  p_pi_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_recent BOOLEAN;
  v_drift_count INTEGER := 0;
  v_source_text TEXT;
  v_inserted INTEGER;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;

  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'draft' THEN
    RAISE EXCEPTION 'ERR_NOT_DRAFT: solo un borrador puede prepararse (estado actual: %)', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager','encargado']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_PREPARE_PI';
  END IF;

  -- ¿El corte es "ahora"? (ventana de 5 min) → usar inventory (fuente primaria).
  v_recent := v_pi.cutoff_date >= NOW() - INTERVAL '5 minutes';

  -- Generación de líneas con instantánea de existencias teóricas:
  --  * corte reciente: inventory.quantity (primary truth model)
  --  * corte histórico: Σ stock_movements.quantity_change (created_at <= corte)
  --    + verificación de coherencia ledger↔inventory (drift → advertencia)
  INSERT INTO public.physical_inventory_items (
    pi_id, line_number, product_id,
    theoretical_qty, theoretical_unit_cost, theoretical_source
  )
  SELECT
    p_pi_id,
    ROW_NUMBER() OVER (ORDER BY p.name, p.sku NULLS LAST),
    p.id,
    CASE WHEN v_recent THEN COALESCE(inv.quantity, 0)
         ELSE COALESCE(ms.sum_cutoff, 0) END::numeric,
    COALESCE(p.cost_average, 0)::numeric,
    CASE WHEN v_recent THEN 'inventory'
         WHEN ROUND(COALESCE(ms.sum_now, 0)::numeric, 4) = ROUND(COALESCE(inv.quantity, 0)::numeric, 4)
           THEN 'ledger'
         ELSE 'ledger_drift' END
  FROM public.products p
  LEFT JOIN public.inventory inv
    ON inv.product_id = p.id AND inv.store_id = v_pi.store_id
  LEFT JOIN LATERAL (
    SELECT SUM(sm.quantity_change) FILTER (WHERE sm.created_at <= v_pi.cutoff_date) AS sum_cutoff,
           SUM(sm.quantity_change) AS sum_now
    FROM public.stock_movements sm
    WHERE sm.product_id = p.id AND sm.store_id = v_pi.store_id
  ) ms ON TRUE
  WHERE p.store_id = v_pi.store_id
    AND p.is_active = true
    AND COALESCE(p.is_service, false) = false
    AND (v_pi.scope_type = 'full'
         OR (v_pi.scope_type = 'category' AND p.category = ANY(v_pi.scope_category_names))
         OR (v_pi.scope_type = 'selection' AND p.id = ANY(v_pi.scope_products)));

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_SCOPE: el alcance no incluye ningún producto activo de la tienda';
  END IF;

  SELECT COUNT(*) INTO v_drift_count
  FROM public.physical_inventory_items
  WHERE pi_id = p_pi_id AND theoretical_source = 'ledger_drift';

  v_source_text := CASE WHEN v_recent THEN 'inventory' ELSE 'ledger' END;
  UPDATE public.physical_inventories
    SET status = 'prepared',
        snapshot_meta = jsonb_build_object(
          'prepared_at', NOW(),
          'prepared_by', v_caller_uid,
          'cutoff_date', v_pi.cutoff_date,
          'theoretical_method', v_source_text,
          'ledger_drift_products', v_drift_count,
          'lines_generated', v_inserted
        )
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_PREPARED', 'physical_inventories', p_pi_id,
          jsonb_build_object('lines', v_inserted, 'method', v_source_text,
                             'drift_products', v_drift_count), v_pi.store_id);

  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id,
                            'lines', v_inserted, 'ledger_drift_products', v_drift_count,
                            'theoretical_method', v_source_text);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- start_physical_inventory_count
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_physical_inventory_count(
  p_pi_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'prepared' THEN
    RAISE EXCEPTION 'ERR_NOT_PREPARED (estado actual: %)', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id,
       ARRAY['admin','manager','encargado','warehouse','clerk']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_COUNT';
  END IF;

  UPDATE public.physical_inventories
    SET status = 'in_progress', count_started_at = NOW(), count_started_by = v_caller_uid
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_COUNT_STARTED', 'physical_inventories',
          p_pi_id, jsonb_build_object('pi_number', v_pi.pi_number), v_pi.store_id);
  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id, 'new_status', 'in_progress');
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- record_physical_inventory_counts
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_physical_inventory_counts(
  p_pi_id UUID,
  p_items JSONB,
  p_source TEXT DEFAULT 'manual',
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_item public.physical_inventory_items%ROWTYPE;
  v_elem JSONB;
  v_item_id UUID; v_qty NUMERIC; v_expected_ts TIMESTAMPTZ;
  v_applied INT := 0;
  v_conflicts JSONB := '[]'::jsonb;
  v_not_found JSONB := '[]'::jsonb;
  v_invalid JSONB := '[]'::jsonb;
  v_new_status TEXT;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  IF p_source NOT IN ('manual','excel') THEN RAISE EXCEPTION 'ERR_INVALID_SOURCE'; END IF;

  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'in_progress' THEN
    RAISE EXCEPTION 'ERR_NOT_COUNTING: el conteo solo puede registrarse en estado in_progress (estado actual: %)', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id,
       ARRAY['admin','manager','encargado','warehouse','clerk']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_COUNT';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_id := (v_elem->>'item_id')::uuid;
    v_expected_ts := NULLIF(v_elem->>'expected_updated_at','')::timestamptz;
    BEGIN
      v_qty := CASE WHEN jsonb_typeof(v_elem->'counted_qty') = 'null' OR (v_elem->>'counted_qty') = ''
                    THEN NULL ELSE (v_elem->>'counted_qty')::numeric END;
    EXCEPTION WHEN OTHERS THEN
      v_invalid := v_invalid || jsonb_build_object('item_id', v_item_id, 'error', 'ERR_QTY_NOT_NUMERIC');
      CONTINUE;
    END;

    SELECT * INTO v_item FROM public.physical_inventory_items
    WHERE id = v_item_id AND pi_id = p_pi_id FOR UPDATE;

    IF v_item IS NULL OR v_item.id IS NULL THEN
      v_not_found := v_not_found || jsonb_build_object('item_id', v_item_id, 'error', 'ERR_ITEM_NOT_IN_PI');
      CONTINUE;
    END IF;

    -- Bloqueo optimista: si otro usuario contó esta línea desde que el
    -- cliente la cargó, NO se sobrescribe silenciosamente → conflicto 409.
    IF v_expected_ts IS NOT NULL AND v_item.updated_at <> v_expected_ts AND v_item.counted_at IS NOT NULL THEN
      v_conflicts := v_conflicts || jsonb_build_object(
        'item_id', v_item_id,
        'error', 'ERR_CONCURRENT_UPDATE',
        'current_counted_qty', v_item.counted_qty,
        'current_counted_by', v_item.counted_by,
        'current_updated_at', v_item.updated_at);
      CONTINUE;
    END IF;

    IF v_qty IS NOT NULL AND v_qty < 0 THEN
      v_invalid := v_invalid || jsonb_build_object('item_id', v_item_id, 'error', 'ERR_QTY_NEGATIVE');
      CONTINUE;
    END IF;

    v_new_status := CASE WHEN v_qty IS NULL THEN 'pending' ELSE 'counted' END;
    UPDATE public.physical_inventory_items
      SET counted_qty = v_qty,
          status = v_new_status,
          counted_by = CASE WHEN v_qty IS NULL THEN NULL ELSE v_caller_uid END,
          counted_at = CASE WHEN v_qty IS NULL THEN NULL ELSE NOW() END,
          updated_by = v_caller_uid,
          updated_at = NOW()
    WHERE id = v_item_id;

    INSERT INTO public.physical_inventory_count_log (
      pi_id, item_id, product_id, action, old_counted_qty, new_counted_qty, source, user_id)
    VALUES (
      p_pi_id, v_item_id, v_item.product_id,
      CASE WHEN v_qty IS NULL THEN 'clear' WHEN p_source = 'excel' THEN 'import' ELSE 'count' END,
      v_item.counted_qty, v_qty, p_source, v_caller_uid);

    v_applied := v_applied + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success', 'pi_id', p_pi_id,
    'applied', v_applied,
    'conflicts', v_conflicts, 'not_found', v_not_found, 'invalid', v_invalid
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- complete_physical_inventory_count
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_physical_inventory_count(
  p_pi_id UUID,
  p_accept_pending BOOLEAN DEFAULT false,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_pending INT;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'in_progress' THEN
    RAISE EXCEPTION 'ERR_NOT_COUNTING (estado actual: %)', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id,
       ARRAY['admin','manager','encargado','warehouse','clerk']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_COUNT';
  END IF;

  SELECT COUNT(*) INTO v_pending FROM public.physical_inventory_items
  WHERE pi_id = p_pi_id AND counted_qty IS NULL;

  IF v_pending > 0 AND NOT p_accept_pending THEN
    RAISE EXCEPTION 'ERR_PENDING_LINES: quedan % línea(s) sin contar; registre su cantidad física (incluido cero) o confirme la aceptación explícita', v_pending;
  END IF;

  UPDATE public.physical_inventories
    SET status = 'counted', count_completed_at = NOW(), count_completed_by = v_caller_uid
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_COUNT_COMPLETED', 'physical_inventories', p_pi_id,
          jsonb_build_object('pending_lines', v_pending, 'accepted_pending', p_accept_pending), v_pi.store_id);
  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id, 'pending_lines', v_pending);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- submit_physical_inventory_reconciliation
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_physical_inventory_reconciliation(
  p_pi_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_pending INT;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'counted' THEN
    RAISE EXCEPTION 'ERR_NOT_COUNTED (estado actual: %)', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id,
       ARRAY['admin','manager','encargado']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_RECONCILE';
  END IF;
  SELECT COUNT(*) INTO v_pending FROM public.physical_inventory_items
  WHERE pi_id = p_pi_id AND counted_qty IS NULL;
  IF v_pending > 0 THEN
    RAISE EXCEPTION 'ERR_PENDING_LINES: un inventario con líneas pendientes no puede conciliarse (% pendientes)', v_pending;
  END IF;

  UPDATE public.physical_inventories
    SET status = 'in_reconciliation', submitted_at = NOW(), submitted_by = v_caller_uid
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_RECONCILIATION_STARTED', 'physical_inventories',
          p_pi_id, jsonb_build_object('pi_number', v_pi.pi_number), v_pi.store_id);
  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id, 'new_status', 'in_reconciliation');
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- review_physical_inventory_item
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.review_physical_inventory_item(
  p_pi_id UUID,
  p_item_id UUID,
  p_review_notes TEXT,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status NOT IN ('in_reconciliation','pending_authorization') THEN
    RAISE EXCEPTION 'ERR_NOT_IN_RECONCILIATION (estado actual: %)', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager','encargado']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_REVIEW';
  END IF;

  UPDATE public.physical_inventory_items
    SET review_notes = p_review_notes, status = 'review',
        reviewed_by = v_caller_uid, reviewed_at = NOW(),
        updated_by = v_caller_uid, updated_at = NOW()
  WHERE id = p_item_id AND pi_id = p_pi_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ITEM_NOT_IN_PI'; END IF;

  INSERT INTO public.physical_inventory_count_log (
    pi_id, item_id, product_id, action, old_counted_qty, new_counted_qty, source, user_id)
  SELECT p_pi_id, p_item_id, product_id, 'review', counted_qty, counted_qty, 'manual', v_caller_uid
  FROM public.physical_inventory_items WHERE id = p_item_id;

  RETURN jsonb_build_object('status', 'success', 'item_id', p_item_id);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- submit_physical_inventory_authorization
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_physical_inventory_authorization(
  p_pi_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'in_reconciliation' THEN
    RAISE EXCEPTION 'ERR_NOT_IN_RECONCILIATION (estado actual: %)', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager','encargado']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_SUBMIT';
  END IF;

  UPDATE public.physical_inventories SET status = 'pending_authorization' WHERE id = p_pi_id;
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_SUBMITTED_FOR_AUTHORIZATION', 'physical_inventories',
          p_pi_id, jsonb_build_object('pi_number', v_pi.pi_number), v_pi.store_id);
  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id, 'new_status', 'pending_authorization');
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- generate_adjustments_from_physical_inventory
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_adjustments_from_physical_inventory(
  p_pi_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_line RECORD;
  v_adj_id UUID;
  v_expected NUMERIC;
  v_short_count INT := 0;
  v_surplus_count INT := 0;
  v_adj_short_id UUID;
  v_adj_surplus_id UUID;
  v_current_stock NUMERIC;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;

  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'pending_authorization' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING_AUTHORIZATION (estado actual: %)', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager','encargado']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_GENERATE_ADJUSTMENTS';
  END IF;
  IF EXISTS (SELECT 1 FROM public.physical_inventory_adjustments WHERE pi_id = p_pi_id) THEN
    RAISE EXCEPTION 'ERR_ADJUSTMENTS_ALREADY_GENERATED';
  END IF;

  -- 3.9.a Documento de FALTANTES (salida por STOCKTAKE_SHRINKAGE)
  FOR v_line IN
    SELECT i.*, p.sku, p.name
    FROM public.physical_inventory_items i
    JOIN public.products p ON p.id = i.product_id
    WHERE i.pi_id = p_pi_id
      AND i.counted_qty IS NOT NULL
      AND COALESCE(i.counted_qty, 0) < i.theoretical_qty
    ORDER BY i.line_number
  LOOP
    SELECT COALESCE(inv.quantity, 0) INTO v_current_stock
    FROM public.inventory inv
    WHERE inv.product_id = v_line.product_id AND inv.store_id = v_pi.store_id
    FOR UPDATE;
    IF v_current_stock IS NULL THEN v_current_stock := 0; END IF;

    IF v_adj_short_id IS NULL THEN
      INSERT INTO public.inventory_adjustments (
        store_id, created_by, status, reason, notes, source_physical_inventory_id
      ) VALUES (
        v_pi.store_id, v_caller_uid, 'pending', 'STOCKTAKE_SHRINKAGE',
        'Faltantes del inventario físico ' || v_pi.pi_number, p_pi_id
      ) RETURNING id INTO v_adj_short_id;
    END IF;

    INSERT INTO public.inventory_adjustment_items (
      adjustment_id, product_id, expected_quantity, counted_quantity
    ) VALUES (
      v_adj_short_id, v_line.product_id, v_current_stock, v_line.counted_qty
    );
    v_short_count := v_short_count + 1;
  END LOOP;

  -- 3.9.b Documento de SOBRANTES (entrada por STOCKTAKE_SURPLUS)
  FOR v_line IN
    SELECT i.*, p.sku, p.name
    FROM public.physical_inventory_items i
    JOIN public.products p ON p.id = i.product_id
    WHERE i.pi_id = p_pi_id
      AND i.counted_qty IS NOT NULL
      AND COALESCE(i.counted_qty, 0) > i.theoretical_qty
    ORDER BY i.line_number
  LOOP
    SELECT COALESCE(inv.quantity, 0) INTO v_current_stock
    FROM public.inventory inv
    WHERE inv.product_id = v_line.product_id AND inv.store_id = v_pi.store_id
    FOR UPDATE;
    IF v_current_stock IS NULL THEN v_current_stock := 0; END IF;

    IF v_adj_surplus_id IS NULL THEN
      INSERT INTO public.inventory_adjustments (
        store_id, created_by, status, reason, notes, source_physical_inventory_id
      ) VALUES (
        v_pi.store_id, v_caller_uid, 'pending', 'STOCKTAKE_SURPLUS',
        'Sobrantes del inventario físico ' || v_pi.pi_number, p_pi_id
      ) RETURNING id INTO v_adj_surplus_id;
    END IF;

    INSERT INTO public.inventory_adjustment_items (
      adjustment_id, product_id, expected_quantity, counted_quantity
    ) VALUES (
      v_adj_surplus_id, v_line.product_id, v_current_stock, v_line.counted_qty
    );
    v_surplus_count := v_surplus_count + 1;
  END LOOP;

  -- 3.9.c Vínculos PI ↔ documentos + conciliación del inventario
  IF v_adj_short_id IS NOT NULL THEN
    INSERT INTO public.physical_inventory_adjustments (pi_id, adjustment_id, kind, items_count, generated_by)
    VALUES (p_pi_id, v_adj_short_id, 'shortfall', v_short_count, v_caller_uid);
  END IF;
  IF v_adj_surplus_id IS NOT NULL THEN
    INSERT INTO public.physical_inventory_adjustments (pi_id, adjustment_id, kind, items_count, generated_by)
    VALUES (p_pi_id, v_adj_surplus_id, 'surplus', v_surplus_count, v_caller_uid);
  END IF;

  UPDATE public.physical_inventories
    SET status = 'conciliated', authorized_at = NOW(), authorized_by = v_caller_uid
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_ADJUSTMENTS_GENERATED', 'physical_inventories', p_pi_id,
          jsonb_build_object('pi_number', v_pi.pi_number,
                             'shortfall_adjustment_id', v_adj_short_id,
                             'shortfall_items', v_short_count,
                             'surplus_adjustment_id', v_adj_surplus_id,
                             'surplus_items', v_surplus_count), v_pi.store_id);

  RETURN jsonb_build_object(
    'status', 'success', 'pi_id', p_pi_id, 'new_status', 'conciliated',
    'shortfall_adjustment_id', v_adj_short_id, 'shortfall_items', v_short_count,
    'surplus_adjustment_id', v_adj_surplus_id, 'surplus_items', v_surplus_count
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- close_physical_inventory
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_physical_inventory(
  p_pi_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_pending_adj INT;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'conciliated' THEN
    RAISE EXCEPTION 'ERR_NOT_CONCILIATED (estado actual: %)', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_CLOSE';
  END IF;

  SELECT COUNT(*) INTO v_pending_adj
  FROM public.physical_inventory_adjustments l
  JOIN public.inventory_adjustments a ON a.id = l.adjustment_id
  WHERE l.pi_id = p_pi_id AND a.status = 'pending';

  IF v_pending_adj > 0 THEN
    RAISE EXCEPTION 'ERR_ADJUSTMENTS_PENDING: hay % ajuste(s) pendiente(s) de confirmar; el inventario no puede cerrarse', v_pending_adj;
  END IF;

  UPDATE public.physical_inventories
    SET status = 'closed', closed_at = NOW(), closed_by = v_caller_uid
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_CLOSED', 'physical_inventories', p_pi_id,
          jsonb_build_object('pi_number', v_pi.pi_number), v_pi.store_id);
  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id, 'new_status', 'closed');
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- void_physical_inventory
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_physical_inventory(
  p_pi_id UUID,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 3 THEN
    RAISE EXCEPTION 'ERR_VOID_REASON_REQUIRED';
  END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status IN ('conciliated','closed','voided') THEN
    RAISE EXCEPTION 'ERR_CANNOT_VOID_STATE: un inventario % no puede anularse; utilice la reversión de los ajustes generados', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager','encargado']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_VOID';
  END IF;

  UPDATE public.physical_inventories
    SET status = 'voided', voided_at = NOW(), voided_by = v_caller_uid, void_reason = p_reason
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_VOIDED', 'physical_inventories', p_pi_id,
          jsonb_build_object('pi_number', v_pi.pi_number, 'reason', p_reason,
                             'previous_status', v_pi.status), v_pi.store_id);
  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id, 'new_status', 'voided');
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- confirm_inventory_adjustment
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_inventory_adjustment(
  p_adjustment_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_adj RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_new_stock NUMERIC;
  v_count INTEGER := 0;
  v_pi_number TEXT;
  v_reason TEXT;
BEGIN
  SELECT * INTO v_adj FROM public.inventory_adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF v_adj IS NULL THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;
  IF v_adj.status != 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden confirmar ajustes pendientes (estado actual: %)', v_adj.status;
  END IF;

  -- Autorización por tienda (fail-closed: sin usuario autenticado no se confirma)
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_access_as(v_caller_uid, v_adj.store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Trazabilidad: si el ajuste proviene de un inventario físico, el kardex
  -- lo referencia explícitamente (campo persistido, no texto manual).
  SELECT pi.pi_number INTO v_pi_number
  FROM public.physical_inventories pi
  WHERE pi.id = v_adj.source_physical_inventory_id;
  v_reason := CASE WHEN v_pi_number IS NOT NULL
                   THEN 'Ajuste por inventario físico ' || v_pi_number
                   ELSE 'Ajuste documental confirmado' END;

  -- Aplicar cada item: actualizar stock + kardex
  FOR v_item IN
    SELECT product_id, expected_quantity, counted_quantity
    FROM public.inventory_adjustment_items
    WHERE adjustment_id = p_adjustment_id
  LOOP
    -- Actualizar stock del producto (atómico)
    UPDATE public.products
      SET stock_current = v_item.counted_quantity,
          updated_at = NOW()
      WHERE id = v_item.product_id AND store_id = v_adj.store_id
      RETURNING stock_current INTO v_new_stock;

    -- Registrar movimiento en kardex
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_adj.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_item.counted_quantity - v_item.expected_quantity,
      p_movement_type := 'adjustment',
      p_unit_cost := 0,
      p_reason := v_reason,
      p_operation_date := NOW(),
      p_skip_access_check := TRUE  -- ya validamos con has_store_access_as
    );

    v_count := v_count + 1;
  END LOOP;

  -- Marcar como confirmed
  UPDATE public.inventory_adjustments
    SET status = 'confirmed',
        confirmed_at = NOW(),
        confirmed_by = v_caller_uid
    WHERE id = p_adjustment_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'id', p_adjustment_id,
    'items_applied', v_count
  );
END;
$$;
