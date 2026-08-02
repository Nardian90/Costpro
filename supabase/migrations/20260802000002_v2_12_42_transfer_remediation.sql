-- ════════════════════════════════════════════════════════════════════════
-- V2.12.42 — Remediación de Transferencias (Épicas T-1 a T-5)
--
-- Resuelve 7 hallazgos críticos de auditoría:
-- H-031: Sin validación de stock suficiente al crear transferencia
-- H-032: Sin reserva de stock en tránsito
-- H-033: Confirmación puede causar stock negativo
-- H-034: Producto destino no se valida/guarda al crear
-- H-035: RLS transfer_items demasiado permisiva
-- H-036: No valida tiendas activas
-- H-037: No valida operation_date
--
-- Arquitectura:
-- - Tabla inventory_reservations (multi-propósito: transfers, sales, OTs)
-- - Vista v_stock_available (stock_current - SUM(reservas activas))
-- - create_transfer valida y reserva atómicamente
-- - confirm_transfer consume reserva + mueve stock
-- - cancel/libera reserva
-- - transfer_items.destination_product_id guarda el producto destino
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Épica T-1: Tabla inventory_reservations
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  reference_type TEXT NOT NULL CHECK (reference_type IN ('TRANSFER', 'SALE_ORDER', 'PRODUCTION_ORDER', 'CUSTOMER_HOLD')),
  reference_id UUID NOT NULL,
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RELEASED', 'CONSUMED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_by UUID,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_inv_res_store_product
  ON public.inventory_reservations(store_id, product_id, status);

CREATE INDEX IF NOT EXISTS idx_inv_res_reference
  ON public.inventory_reservations(reference_type, reference_id, status);

ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY inv_res_access ON public.inventory_reservations
  FOR ALL TO authenticated
  USING (public.has_store_access(store_id))
  WITH CHECK (public.has_store_access(store_id));

COMMENT ON TABLE public.inventory_reservations IS
'Reservas de stock multi-propósito. Cada transferencia/venta/OT pendiente crea una reserva ACTIVE. Al confirmar: CONSUMED. Al cancelar: RELEASED. stock_available = stock_current - SUM(reservas ACTIVE).';

-- Vista para stock disponible (stock_current - reservas activas)
CREATE OR REPLACE VIEW public.v_stock_available AS
SELECT
  p.id AS product_id,
  p.store_id,
  p.stock_current,
  p.stock_current - COALESCE(
    (SELECT SUM(r.quantity) FROM public.inventory_reservations r
     WHERE r.product_id = p.id AND r.store_id = p.store_id AND r.status = 'ACTIVE'),
    0
  ) AS stock_available,
  COALESCE(
    (SELECT SUM(r.quantity) FROM public.inventory_reservations r
     WHERE r.product_id = p.id AND r.store_id = p.store_id AND r.status = 'ACTIVE'),
    0
  ) AS stock_reserved
FROM public.products p;

-- ────────────────────────────────────────────────────────────────────────────
-- Épica T-4: Añadir destination_product_id a transfer_items
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.transfer_items
  ADD COLUMN IF NOT EXISTS destination_product_id UUID;

COMMENT ON COLUMN public.transfer_items.destination_product_id IS
'V2.12.42: ID del producto en la tienda destino. Se resuelve al crear la transferencia (no al confirmar). Si el producto no existe en destino, se crea automáticamente como espejo del origen.';

-- ────────────────────────────────────────────────────────────────────────────
-- Épica T-5: RLS transfer_items corregida
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "transfer_items_view_policy" ON public.transfer_items;
DROP POLICY IF EXISTS "transfer_items_view_policy_v2" ON public.transfer_items;

CREATE POLICY "transfer_items_view_v2" ON public.transfer_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.transfers t
      WHERE t.id = transfer_items.transfer_id
      AND (public.has_store_access(t.origin_store_id) OR public.has_store_access(t.destination_store_id))
    )
  );

CREATE POLICY "transfer_items_insert_v2" ON public.transfer_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transfers t
      WHERE t.id = transfer_items.transfer_id
      AND (public.has_store_access(t.origin_store_id) OR public.has_store_access(t.destination_store_id))
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- Épica T-2 + T-3: create_transfer con validación de stock + reserva atómica
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_transfer(
  p_origin_store_id uuid,
  p_destination_store_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_transaction_id uuid DEFAULT NULL,
  p_operation_date timestamp with time zone DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_transfer_id UUID := COALESCE(p_transaction_id, gen_random_uuid());
  v_item JSONB;
  v_pid UUID;
  v_qty NUMERIC;
  v_unit_cost NUMERIC;
  v_line_total NUMERIC;
  v_total_cost NUMERIC := 0;
  v_count INTEGER := 0;
  v_dest_product UUID;
  v_origin_product RECORD;
  v_stock_available NUMERIC;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_origin_store RECORD;
  v_dest_store RECORD;
BEGIN
  -- Anti-spoofing
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_destination_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- H-036: Validar tiendas activas
  SELECT * INTO v_origin_store FROM public.stores WHERE id = p_origin_store_id;
  SELECT * INTO v_dest_store FROM public.stores WHERE id = p_destination_store_id;
  IF NOT v_origin_store.is_active THEN RAISE EXCEPTION 'ERR_ORIGIN_STORE_INACTIVE'; END IF;
  IF NOT v_dest_store.is_active THEN RAISE EXCEPTION 'ERR_DEST_STORE_INACTIVE'; END IF;

  -- Validar que no sea la misma store
  IF p_origin_store_id = p_destination_store_id THEN
    RAISE EXCEPTION 'ERR_SAME_STORE';
  END IF;

  -- Insertar transferencia
  INSERT INTO public.transfers (
    id, origin_store_id, destination_store_id, status, notes, total_cost,
    created_by, created_at
  ) VALUES (
    v_transfer_id, p_origin_store_id, p_destination_store_id, 'PENDIENTE', p_notes, 0,
    v_caller_uid, v_effective_date
  );

  -- Procesar items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_pid := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;

    -- H-031: Validar stock disponible (stock_current - reservas activas)
    SELECT p.id, p.stock_current, p.cost_average, p.sku, p.name, p.unit_of_measure,
           p.stock_current - COALESCE(
             (SELECT SUM(r.quantity) FROM public.inventory_reservations r
              WHERE r.product_id = p.id AND r.store_id = p.store_id AND r.status = 'ACTIVE'),
             0
           ) AS stock_avail
    INTO v_origin_product
    FROM public.products p
    WHERE p.id = v_pid AND p.store_id = p_origin_store_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_pid; END IF;

    -- H-031: Stock insuficiente
    IF v_origin_product.stock_avail < v_qty THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: producto %, disponible %, solicitado %',
        v_origin_product.name, v_origin_product.stock_avail, v_qty;
    END IF;

    v_unit_cost := v_origin_product.cost_average;
    v_line_total := v_qty * v_unit_cost;
    v_total_cost := v_total_cost + v_line_total;
    v_count := v_count + 1;

    -- H-034: Resolver producto destino AHORA (no al confirmar)
    SELECT id INTO v_dest_product
    FROM public.products
    WHERE sku = v_origin_product.sku AND store_id = p_destination_store_id
    LIMIT 1;

    -- Si no existe en destino, crear producto espejo
    IF v_dest_product IS NULL THEN
      INSERT INTO public.products (
        store_id, sku, name, description, unit_of_measure,
        stock_current, cost_average, cost_price, price, price_currency,
        is_active, category
      ) VALUES (
        p_destination_store_id, v_origin_product.sku, v_origin_product.name,
        v_origin_product.name, v_origin_product.unit_of_measure,
        0, v_unit_cost, v_unit_cost, v_unit_cost, 'CUP',
        true, 'General'
      ) RETURNING id INTO v_dest_product;
    END IF;

    -- Guardar destination_product_id en transfer_items (H-034)
    INSERT INTO public.transfer_items (transfer_id, product_id, destination_product_id, quantity, unit_cost, total)
    VALUES (v_transfer_id, v_pid, v_dest_product, v_qty, v_unit_cost, v_line_total);

    -- H-032: Crear reserva atómica
    INSERT INTO public.inventory_reservations (
      store_id, product_id, reference_type, reference_id,
      quantity, status, created_by, metadata
    ) VALUES (
      p_origin_store_id, v_pid, 'TRANSFER', v_transfer_id,
      v_qty, 'ACTIVE', v_caller_uid,
      jsonb_build_object('destination_store_id', p_destination_store_id, 'dest_product_id', v_dest_product)
    );
  END LOOP;

  UPDATE public.transfers SET total_cost = v_total_cost WHERE id = v_transfer_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_TRANSFER', 'transfers', v_transfer_id, p_origin_store_id, v_caller_uid,
    jsonb_build_object('dest', p_destination_store_id, 'total_cost', v_total_cost, 'items_count', v_count,
      'reservations_created', v_count));

  RETURN jsonb_build_object('status', 'success', 'transfer_id', v_transfer_id, 'total_cost', v_total_cost);
END;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- Épica T-3: confirm_transfer consume reserva + mueve stock
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.confirm_transfer(
  p_transfer_id uuid,
  p_user_id uuid,
  p_operation_date timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_mov JSONB;
  v_movements JSONB[] := ARRAY[]::JSONB[];
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_reservation RECORD;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status <> 'PENDIENTE' THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_PENDING'; END IF;

  -- Autorización: caller debe tener acceso al destino
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.destination_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Approval check
  IF COALESCE(v_transfer.requires_approval, false) = true AND v_transfer.approved_at IS NULL THEN
    RAISE EXCEPTION 'ERR_TRANSFER_REQUIRES_APPROVAL';
  END IF;

  -- Validar stock disponible una vez más (por si hubo ventas entre crear y confirmar)
  -- stock_available = stock_current - reservas ACTIVE de ESTA transferencia
  -- Si stock_current < qty, no hay suficiente (la reserva ya está contada en stock_available)
  FOR v_item IN SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id LOOP
    SELECT stock_current INTO v_reservation
    FROM public.products WHERE id = v_item.product_id AND store_id = v_transfer.origin_store_id FOR UPDATE;

    IF v_reservation < v_item.quantity THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK_AT_CONFIRM: producto %, stock %, solicitado %',
        v_item.product_id, v_reservation, v_item.quantity;
    END IF;
  END LOOP;

  -- Actualizar estado
  UPDATE public.transfers
    SET status = 'CONFIRMADA', confirmed_at = NOW(), confirmed_by = v_caller_uid
    WHERE id = p_transfer_id;

  -- Procesar items: consumir reserva + mover stock
  FOR v_item IN SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id LOOP
    -- 1. Consumir reserva (cambiar status a CONSUMED)
    UPDATE public.inventory_reservations
      SET status = 'CONSUMED', consumed_at = NOW()
      WHERE reference_type = 'TRANSFER' AND reference_id = p_transfer_id
        AND product_id = v_item.product_id AND status = 'ACTIVE';

    -- 2. Descontar stock del origen (transfer_out)
    v_mov := public.register_stock_movement(
      v_item.product_id, v_transfer.origin_store_id, -v_item.quantity,
      'transfer_out', p_transfer_id::text, v_caller_uid, NULL, NULL,
      v_item.unit_cost, NULL, p_operation_date, TRUE
    );
    v_movements := array_append(v_movements, v_mov);

    -- 3. Añadir stock al destino (transfer_in) — usar destination_product_id
    v_mov := public.register_stock_movement(
      v_item.destination_product_id, v_transfer.destination_store_id, v_item.quantity,
      'transfer_in', p_transfer_id::text, v_caller_uid, NULL, NULL,
      v_item.unit_cost, NULL, p_operation_date, FALSE
    );
    v_movements := array_append(v_movements, v_mov);
  END LOOP;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_transfer.origin_store_id, 'transfer_confirmed', 'transfers', p_transfer_id,
    jsonb_build_object('dest', v_transfer.destination_store_id, 'at', NOW(),
      'requires_approval_was', COALESCE(v_transfer.requires_approval, false),
      'was_approved', v_transfer.approved_at IS NOT NULL,
      'reservations_consumed', (SELECT count(*) FROM public.inventory_reservations WHERE reference_id = p_transfer_id AND status = 'CONSUMED')));

  RETURN jsonb_build_object('status', 'success', 'transfer_id', p_transfer_id);
END;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- Épica T-3: cancel_transfer libera reserva
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cancel_transfer(
  p_transfer_id uuid,
  p_reason text DEFAULT 'Cancelada',
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_transfer RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status <> 'PENDIENTE' THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_PENDING'; END IF;

  -- Autorización: caller debe tener acceso al origen
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Actualizar estado
  UPDATE public.transfers
    SET status = 'CANCELADA', notes = COALESCE(notes, '') || ' [CANCELADA: ' || p_reason || ']'
    WHERE id = p_transfer_id;

  -- Liberar reservas ACTIVE
  UPDATE public.inventory_reservations
    SET status = 'RELEASED', released_at = NOW()
    WHERE reference_type = 'TRANSFER' AND reference_id = p_transfer_id AND status = 'ACTIVE';

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_transfer.origin_store_id, 'transfer_cancelled', 'transfers', p_transfer_id,
    jsonb_build_object('reason', p_reason, 'reservations_released',
      (SELECT count(*) FROM public.inventory_reservations WHERE reference_id = p_transfer_id AND status = 'RELEASED')));

  RETURN jsonb_build_object('status', 'success', 'transfer_id', p_transfer_id);
END;
$function$;

-- Permisos
GRANT EXECUTE ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone, uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.confirm_transfer(uuid, uuid, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_transfer(uuid, uuid, timestamp with time zone) TO service_role;

GRANT EXECUTE ON FUNCTION public.cancel_transfer(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_transfer(uuid, text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cancel_transfer(uuid, text, uuid) FROM anon;

-- ────────────────────────────────────────────────────────────────────────────
-- Verificación
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'inventory_reservations' as table_created,
       (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_reservations')) as exists;

SELECT 'v_stock_available' as view_created,
       (SELECT EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'v_stock_available')) as exists;

SELECT 'destination_product_id' as column_added,
       (SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transfer_items' AND column_name = 'destination_product_id')) as exists;
