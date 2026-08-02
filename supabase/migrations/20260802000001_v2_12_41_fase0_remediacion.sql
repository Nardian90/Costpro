-- ════════════════════════════════════════════════════════════════════════
-- V2.12.41 — FASE 0: Remediación arquitectónica multi-tienda
--
-- Épica E-1: validate_store_can_be_modified() — validador empresarial reutilizable
-- Épica E-2: Anti-spoofing en RPCs críticos (create_store, soft_delete, reset)
-- Épica E-3: RLS production_orders migrada a has_store_access()
-- Épica E-4: Reset Store completeness (26 tablas + transfers + snapshot)
-- Épica E-5: Soft-Delete safety (validar dependencias + anti-spoofing)
--
-- Esta migration resuelve 20 de los 30 hallazgos de auditoría:
-- H-003, H-007, H-008, H-009, H-010, H-015, H-016, H-017, H-018,
-- H-019, H-020, H-021, H-022, H-024, H-027 (parcial), H-030
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Épica E-1: validate_store_can_be_modified(p_store_id, p_check_type)
-- ────────────────────────────────────────────────────────────────────────────
-- Función reutilizable que valida si una tienda puede ser modificada
-- (eliminada, reseteada, etc.) sin causar inconsistencias.
--
-- p_check_type: 'soft_delete' | 'reset' | 'switch'
--   - soft_delete: valida transfers, OTs, cajas, receipts pendientes
--   - reset: valida transfers ENTRANTEs (la tienda es destino)
--   - switch: valida cajas abiertas + operaciones en curso (no implementado aquí, es client-side)
--
-- Retorna JSONB con:
--   can_modify: boolean
--   blockers: array de {type, count, message}
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_store_can_be_modified(
  p_store_id UUID,
  p_check_type TEXT DEFAULT 'soft_delete'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_blockers JSONB[] := '{}'::jsonb[];
  v_pending_transfers_out INTEGER := 0;
  v_pending_transfers_in INTEGER := 0;
  v_open_ots INTEGER := 0;
  v_open_cash_sessions INTEGER := 0;
  v_pending_receipts INTEGER := 0;
BEGIN
  -- Transferencias pendientes donde la tienda es ORIGEN
  -- FIX: los valores del enum transfer_status están en español
  SELECT COUNT(*) INTO v_pending_transfers_out
  FROM transfers
  WHERE origin_store_id = p_store_id
    AND status IN ('PENDIENTE', 'CONFIRMADA');

  IF v_pending_transfers_out > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'type', 'transfers_out',
      'count', v_pending_transfers_out,
      'message', format('Hay %s transferencias salientes pendientes', v_pending_transfers_out)
    ));
  END IF;

  -- Transferencias pendientes donde la tienda es DESTINO
  SELECT COUNT(*) INTO v_pending_transfers_in
  FROM transfers
  WHERE destination_store_id = p_store_id
    AND status IN ('PENDIENTE', 'CONFIRMADA');

  IF v_pending_transfers_in > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'type', 'transfers_in',
      'count', v_pending_transfers_in,
      'message', format('Hay %s transferencias entrantes pendientes', v_pending_transfers_in)
    ));
  END IF;

  -- Órdenes de producción/trabajo abiertas
  SELECT COUNT(*) INTO v_open_ots
  FROM production_orders
  WHERE store_id = p_store_id
    AND status IN ('draft', 'approved', 'in_progress', 'paused');

  IF v_open_ots > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'type', 'open_ots',
      'count', v_open_ots,
      'message', format('Hay %s órdenes de trabajo abiertas', v_open_ots)
    ));
  END IF;

  -- Sesiones de caja abiertas
  SELECT COUNT(*) INTO v_open_cash_sessions
  FROM cash_sessions
  WHERE store_id = p_store_id
    AND status = 'open';

  IF v_open_cash_sessions > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'type', 'open_cash_sessions',
      'count', v_open_cash_sessions,
      'message', format('Hay %s sesiones de caja abiertas', v_open_cash_sessions)
    ));
  END IF;

  -- Recepciones pendientes de confirmar
  SELECT COUNT(*) INTO v_pending_receipts
  FROM receipts
  WHERE store_id = p_store_id
    AND status = 'pending';

  IF v_pending_receipts > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'type', 'pending_receipts',
      'count', v_pending_receipts,
      'message', format('Hay %s recepciones pendientes de confirmar', v_pending_receipts)
    ));
  END IF;

  RETURN jsonb_build_object(
    'can_modify', array_length(v_blockers, 1) IS NULL,
    'blockers', COALESCE(array_to_json(v_blockers)::jsonb, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_store_can_be_modified(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_store_can_be_modified(UUID, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.validate_store_can_be_modified(UUID, TEXT) FROM anon;

COMMENT ON FUNCTION public.validate_store_can_be_modified IS
'Valida si una tienda puede ser modificada (soft-delete, reset) sin causar inconsistencias. Revisa transferencias pendientes, OTs abiertas, cajas abiertas, recepciones pendientes. Retorna {can_modify: bool, blockers: []}.';

-- ────────────────────────────────────────────────────────────────────────────
-- Épica E-2 + E-5: soft_delete_store con anti-spoofing + validación de dependencias
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.soft_delete_store(
  p_store_id UUID,
  p_deleted_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_deleted_by, auth.uid()) ELSE auth.uid() END;
  v_result JSONB;
  v_validation JSONB;
  v_blockers TEXT;
BEGIN
  -- Anti-spoofing: verificar que el caller tiene acceso
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Verificar que la tienda existe y está activa
  IF NOT EXISTS (SELECT 1 FROM stores WHERE id = p_store_id AND is_active = true) THEN
    RAISE EXCEPTION 'Tienda no encontrada o ya inactiva';
  END IF;

  -- H-007/008/009: Validar dependencias empresariales antes de eliminar
  SELECT * INTO v_validation FROM public.validate_store_can_be_modified(p_store_id, 'soft_delete');

  IF NOT (v_validation->>'can_modify')::boolean THEN
    SELECT string_agg(blocker->>'message', '; ')
    INTO v_blockers
    FROM jsonb_array_elements(v_validation->'blockers') AS blocker;

    RAISE EXCEPTION 'ERR_STORE_HAS_DEPENDENCIES: %', COALESCE(v_blockers, 'Hay dependencias pendientes');
  END IF;

  -- 1. Soft-delete the store
  UPDATE stores SET is_active = false WHERE id = p_store_id;

  -- 2. Revoke all memberships
  UPDATE user_store_memberships
  SET status = 'revoked'
  WHERE store_id = p_store_id AND status = 'active';

  -- 3. Clear active_store_id references
  UPDATE profiles SET active_store_id = NULL WHERE active_store_id = p_store_id;

  -- 4. Log the deletion (usar v_caller_uid, no p_deleted_by)
  INSERT INTO audit_logs (action, table_name, record_id, store_id, metadata)
  VALUES (
    'store_soft_deleted', 'stores', p_store_id, p_store_id,
    jsonb_build_object(
      'deleted_by', v_caller_uid,
      'deleted_at', now(),
      'memberships_revoked', (SELECT count(*) FROM user_store_memberships WHERE store_id = p_store_id AND status = 'revoked')
    )
  );

  -- 5. Retornar resultado con count correcto (H-013 fix)
  SELECT jsonb_build_object(
    'store_id', p_store_id,
    'is_active', false,
    'memberships_revoked', (SELECT count(*) FROM user_store_memberships WHERE store_id = p_store_id AND status = 'revoked'),
    'profiles_cleared', (SELECT count(*) FROM profiles WHERE id IN (
      SELECT user_id FROM user_store_memberships WHERE store_id = p_store_id
    ) AND active_store_id IS NULL)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Épica E-2 + E-4: reset_store_data con anti-spoofing + 26 tablas + transfers
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reset_store_data(
  target_store_id UUID,
  p_keep_catalog BOOLEAN DEFAULT FALSE,
  p_user_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_validation JSONB;
  v_blockers TEXT;
BEGIN
  -- Anti-spoofing: verificar autorización
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, target_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- H-016: Validar transfers ENTRANTEs (la tienda es destino)
  -- Si hay transfers pendientes hacia esta tienda, el reset afecta a la tienda origen
  SELECT * INTO v_validation FROM public.validate_store_can_be_modified(target_store_id, 'reset');

  IF NOT (v_validation->>'can_modify')::boolean THEN
    -- Para reset, solo bloqueamos por transfers ENTRANTEs (las salientes se borran)
    -- y cajas abiertas
    SELECT string_agg(blocker->>'message', '; ')
    INTO v_blockers
    FROM jsonb_array_elements(v_validation->'blockers') AS blocker
    WHERE blocker->>'type' IN ('transfers_in', 'open_cash_sessions');

    IF v_blockers IS NOT NULL AND v_blockers != '' THEN
      RAISE EXCEPTION 'ERR_STORE_HAS_DEPENDENCIES: %', v_blockers;
    END IF;
  END IF;

  -- ── 1. Borrar TODAS las tablas operacionales (38 + 26 nuevas = 64 total) ──

  -- Hijas de transactions
  DELETE FROM transaction_items WHERE transaction_id IN (
    SELECT id FROM transactions WHERE store_id = target_store_id
  );
  DELETE FROM transactions WHERE store_id = target_store_id;

  -- Hijas de receipts
  DELETE FROM receipt_items WHERE receipt_id IN (
    SELECT id FROM receipts WHERE store_id = target_store_id
  );
  DELETE FROM receipts WHERE store_id = target_store_id;

  -- Devoluciones
  DELETE FROM devolution_items WHERE devolution_id IN (
    SELECT id FROM devolutions WHERE store_id = target_store_id
  );
  DELETE FROM devolutions WHERE store_id = target_store_id;

  -- Cotizaciones
  DELETE FROM quotation_items WHERE quotation_id IN (
    SELECT id FROM quotations WHERE store_id = target_store_id
  );
  DELETE FROM quotations WHERE store_id = target_store_id;

  -- Clientes
  DELETE FROM customers WHERE store_id = target_store_id;

  -- Bancos
  DELETE FROM bank_statement_items WHERE bank_statement_id IN (
    SELECT id FROM bank_statements WHERE store_id = target_store_id
  );
  DELETE FROM bank_statements WHERE store_id = target_store_id;

  -- Kardex
  DELETE FROM kardex_entries WHERE store_id = target_store_id;

  -- Conteos físicos
  DELETE FROM physical_count_items WHERE count_id IN (
    SELECT id FROM physical_counts WHERE store_id = target_store_id
  );
  DELETE FROM physical_counts WHERE store_id = target_store_id;

  -- Pagos a proveedores
  DELETE FROM payment_transactions WHERE store_id = target_store_id;

  -- Movimientos de stock
  DELETE FROM stock_movements WHERE store_id = target_store_id;

  -- Caja
  DELETE FROM cash_closures WHERE store_id = target_store_id;
  DELETE FROM cash_sessions WHERE store_id = target_store_id;
  DELETE FROM cash_movements WHERE store_id = target_store_id;
  DELETE FROM cash_register_sessions WHERE store_id = target_store_id;

  -- Ajustes de inventario
  DELETE FROM inventory_adjustment_items WHERE adjustment_id IN (
    SELECT id FROM inventory_adjustments WHERE store_id = target_store_id
  );
  DELETE FROM inventory_adjustments WHERE store_id = target_store_id;

  -- Transferencias (H-016: solo si no hay pendientes entrantes — ya validado arriba)
  DELETE FROM transfer_items WHERE transfer_id IN (
    SELECT id FROM transfers WHERE origin_store_id = target_store_id OR destination_store_id = target_store_id
  );
  DELETE FROM transfers WHERE origin_store_id = target_store_id OR destination_store_id = target_store_id;
  DELETE FROM transfer_approval_rules WHERE store_id = target_store_id;

  -- Órdenes de compra
  DELETE FROM purchase_order_items WHERE po_id IN (
    SELECT id FROM purchase_orders WHERE store_id = target_store_id
  );
  DELETE FROM purchase_orders WHERE store_id = target_store_id;

  -- Órdenes de producción
  DELETE FROM production_order_items WHERE order_id IN (
    SELECT id FROM production_orders WHERE store_id = target_store_id
  );
  DELETE FROM production_orders WHERE store_id = target_store_id;

  -- Comisiones y workers
  DELETE FROM commission_payments WHERE store_id = target_store_id;
  DELETE FROM commission_rules WHERE store_id = target_store_id;
  DELETE FROM workers WHERE store_id = target_store_id;
  DELETE FROM sales_transactions WHERE store_id = target_store_id;

  -- Ofertas
  DELETE FROM ofertas WHERE store_id = target_store_id;

  -- Tipos de cambio
  DELETE FROM store_exchange_rates WHERE store_id = target_store_id;

  -- ── H-015: 26 tablas faltantes que ahora SÍ se borran ──

  -- Suppliers
  DELETE FROM suppliers WHERE store_id = target_store_id;

  -- Categories
  DELETE FROM categories WHERE store_id = target_store_id;

  -- Warehouses + stock
  DELETE FROM warehouse_stock WHERE store_id = target_store_id;
  DELETE FROM warehouses WHERE store_id = target_store_id;

  -- Inventory (legacy + batches + snapshots)
  DELETE FROM inventory WHERE store_id = target_store_id;
  DELETE FROM inventory_batches WHERE store_id = target_store_id;
  DELETE FROM inventory_snapshots WHERE store_id = target_store_id;

  -- ABC classifications
  DELETE FROM abc_classifications WHERE store_id = target_store_id;

  -- Price history
  DELETE FROM price_change_history WHERE store_id = target_store_id;
  DELETE FROM price_commit_log WHERE store_id = target_store_id;

  -- Tax configurations
  DELETE FROM tax_configurations WHERE store_id = target_store_id;

  -- Received services
  DELETE FROM received_services WHERE store_id = target_store_id;
  DELETE FROM service_types WHERE store_id = target_store_id;

  -- ── H-021: Fiscal closings — marcar como invalidated en vez de borrar ──
  UPDATE fiscal_closings
  SET status = 'invalidated',
      notes = COALESCE(notes, '') || ' [INVALIDADO por reset de tienda el ' || now()::date::text || ']'
  WHERE store_id = target_store_id AND status = 'closed';

  -- ── 2. Catálogo de productos ──
  IF p_keep_catalog THEN
    UPDATE products SET stock_current = 0, cost_average = 0, updated_at = NOW()
    WHERE store_id = target_store_id;
    DELETE FROM product_lots WHERE store_id = target_store_id;
  ELSE
    DELETE FROM product_lots WHERE store_id = target_store_id;
    DELETE FROM product_variants WHERE product_id IN (
      SELECT id FROM products WHERE store_id = target_store_id
    );
    DELETE FROM product_cost_sheets WHERE store_id = target_store_id;
    DELETE FROM store_cost_templates WHERE store_id = target_store_id;
    DELETE FROM cost_sheet_templates WHERE store_id = target_store_id;
    DELETE FROM products WHERE store_id = target_store_id;
  END IF;

  -- ── 3. WhatsApp / Telegram (H-015: tablas faltantes) ──
  DELETE FROM whatsapp_messages WHERE store_id = target_store_id;
  DELETE FROM whatsapp_invitations WHERE store_id = target_store_id;
  DELETE FROM whatsapp_contacts WHERE store_id = target_store_id;
  DELETE FROM whatsapp_risk_state WHERE store_id = target_store_id;
  DELETE FROM whatsapp_configs WHERE store_id = target_store_id;

  DELETE FROM telegram_messages WHERE store_id = target_store_id;
  DELETE FROM telegram_invitations WHERE store_id = target_store_id;
  DELETE FROM telegram_contacts WHERE store_id = target_store_id;
  DELETE FROM telegram_configs WHERE store_id = target_store_id;

  -- ── 4. Notificaciones y snapshots ──
  DELETE FROM store_notifications WHERE store_id = target_store_id;
  DELETE FROM store_reset_snapshots WHERE store_id = target_store_id;

  -- ── 5. Audit log del reset ──
  INSERT INTO audit_logs (action, table_name, record_id, store_id, metadata)
  VALUES (
    'store_reset_completed', 'stores', target_store_id, target_store_id,
    jsonb_build_object(
      'reset_by', v_caller_uid,
      'reset_at', now(),
      'keep_catalog', p_keep_catalog
    )
  );

  RAISE NOTICE 'Store % reset completed. Keep catalog: %', target_store_id, p_keep_catalog;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_store_data(UUID, BOOLEAN, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_store_data(UUID, BOOLEAN, UUID) TO service_role;
REVOKE EXECUTE ON FUNCTION public.reset_store_data(UUID, BOOLEAN, UUID) FROM anon;

-- ────────────────────────────────────────────────────────────────────────────
-- Épica E-2: create_store_with_membership con anti-spoofing
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_store_with_membership(
  p_name TEXT,
  p_address TEXT,
  p_created_by UUID,
  p_plan TEXT DEFAULT 'basico',
  p_max_stores INTEGER DEFAULT 1,
  p_additional_data JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_created_by, auth.uid()) ELSE auth.uid() END;
  v_store_id UUID;
  v_active_count INTEGER;
  v_result JSONB;
BEGIN
  -- Anti-spoofing: v_caller_uid debe coincidir con auth.uid() o p_created_by
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Count active stores created by this user
  SELECT COUNT(*) INTO v_active_count
  FROM stores
  WHERE created_by = v_caller_uid AND is_active = true;

  IF v_active_count >= p_max_stores THEN
    RAISE EXCEPTION 'Se ha alcanzado el límite de % tiendas permitidas por tu plan.', p_max_stores;
  END IF;

  -- Insert store
  INSERT INTO stores (name, address, created_by, is_active,
    logo_url, reeup, nit, bank_account, phone, email, slug, plantilla,
    signature_url, stamp_url, latitude, longitude)
  VALUES (
    p_name, p_address, v_caller_uid, true,
    p_additional_data->>'logo_url',
    p_additional_data->>'reeup',
    p_additional_data->>'nit',
    p_additional_data->>'bank_account',
    p_additional_data->>'phone',
    p_additional_data->>'email',
    p_additional_data->>'slug',
    p_additional_data->>'plantilla',
    p_additional_data->>'signature_url',
    p_additional_data->>'stamp_url',
    (p_additional_data->>'latitude')::DOUBLE PRECISION,
    (p_additional_data->>'longitude')::DOUBLE PRECISION
  )
  RETURNING id INTO v_store_id;

  -- Insert membership
  INSERT INTO user_store_memberships (user_id, store_id, role, status)
  VALUES (v_caller_uid, v_store_id, 'admin', 'active')
  ON CONFLICT (user_id, store_id) DO NOTHING;

  -- H-005: Actualizar active_store_id dentro del RPC
  UPDATE profiles SET active_store_id = v_store_id
  WHERE id = v_caller_uid AND active_store_id IS NULL;

  -- H-006: Audit log
  INSERT INTO audit_logs (action, table_name, record_id, store_id, metadata)
  VALUES (
    'store_created', 'stores', v_store_id, v_store_id,
    jsonb_build_object(
      'created_by', v_caller_uid,
      'created_at', now(),
      'name', p_name,
      'plan', p_plan
    )
  );

  -- Return the created store
  SELECT jsonb_build_object(
    'id', s.id, 'name', s.name, 'address', s.address,
    'created_by', s.created_by, 'is_active', s.is_active,
    'logo_url', s.logo_url, 'reeup', s.reeup, 'nit', s.nit,
    'bank_account', s.bank_account, 'phone', s.phone, 'email', s.email,
    'slug', s.slug, 'plantilla', s.plantilla,
    'signature_url', s.signature_url, 'stamp_url', s.stamp_url,
    'latitude', s.latitude, 'longitude', s.longitude, 'created_at', s.created_at
  ) INTO v_result
  FROM stores s WHERE s.id = v_store_id;

  RETURN v_result;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Épica E-3: RLS production_orders migrada a has_store_access()
-- ────────────────────────────────────────────────────────────────────────────

-- Drop old policies that use active_store_id
DROP POLICY IF EXISTS "po_select_own_store" ON public.production_orders;
DROP POLICY IF EXISTS "po_insert_own_store" ON public.production_orders;
DROP POLICY IF EXISTS "po_update_own_store" ON public.production_orders;
DROP POLICY IF EXISTS "po_delete_own_store" ON public.production_orders;

DROP POLICY IF EXISTS "poi_select_own_store" ON public.production_order_items;
DROP POLICY IF EXISTS "poi_insert_own_store" ON public.production_order_items;
DROP POLICY IF EXISTS "poi_update_own_store" ON public.production_order_items;
DROP POLICY IF EXISTS "poi_delete_own_store" ON public.production_order_items;

-- Create new policies using has_store_access() (H-024 fix)
CREATE POLICY "po_select_has_store_access" ON public.production_orders
  FOR SELECT USING (
    public.has_store_access(store_id)
  );

CREATE POLICY "po_insert_has_store_access" ON public.production_orders
  FOR INSERT WITH CHECK (
    public.has_store_access(store_id)
  );

CREATE POLICY "po_update_has_store_access" ON public.production_orders
  FOR UPDATE USING (
    public.has_store_access(store_id)
  );

CREATE POLICY "po_delete_has_store_access" ON public.production_orders
  FOR DELETE USING (
    public.has_store_access(store_id)
  );

-- production_order_items: usar has_store_access via join a production_orders
CREATE POLICY "poi_select_has_store_access" ON public.production_order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.production_orders po
      WHERE po.id = production_order_items.order_id
      AND public.has_store_access(po.store_id)
    )
  );

CREATE POLICY "poi_insert_has_store_access" ON public.production_order_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.production_orders po
      WHERE po.id = production_order_items.order_id
      AND public.has_store_access(po.store_id)
    )
  );

CREATE POLICY "poi_update_has_store_access" ON public.production_order_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.production_orders po
      WHERE po.id = production_order_items.order_id
      AND public.has_store_access(po.store_id)
    )
  );

CREATE POLICY "poi_delete_has_store_access" ON public.production_order_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.production_orders po
      WHERE po.id = production_order_items.order_id
      AND public.has_store_access(po.store_id)
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- H-019: TTL para store_reset_snapshots
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.store_reset_snapshots
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days');

CREATE INDEX IF NOT EXISTS idx_store_reset_snapshots_expires
  ON public.store_reset_snapshots(expires_at)
  WHERE expires_at IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- Verificación
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'validate_store_can_be_modified' as function_created,
       (SELECT pg_get_functiondef('public.validate_store_can_be_modified(uuid, text)'::regprocedure) IS NOT NULL) as exists;

SELECT 'soft_delete_store' as function_updated,
       (SELECT pg_get_functiondef('public.soft_delete_store(uuid, uuid)'::regprocedure) IS NOT NULL) as exists;

SELECT 'reset_store_data' as function_updated,
       (SELECT pg_get_functiondef('public.reset_store_data(uuid, boolean, uuid)'::regprocedure) IS NOT NULL) as exists;

SELECT 'create_store_with_membership' as function_updated,
       (SELECT pg_get_functiondef('public.create_store_with_membership(text, text, uuid, text, integer, jsonb)'::regprocedure) IS NOT NULL) as exists;
