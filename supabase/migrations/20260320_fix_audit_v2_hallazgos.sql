-- Migration: Hardening Commercial Flows (Audit v2.0 Remediations)
-- Date: 2026-03-20
-- Author: Jules AI
-- Description: Fixes RBAC, Deadlocks, WAC Race Conditions, and Idempotency.

BEGIN;

-- ================================================================
-- 1. HARDENED WAC TRIGGER FUNCTION
-- ================================================================
CREATE OR REPLACE FUNCTION public.update_product_wac()
RETURNS TRIGGER AS $$
DECLARE
    v_current_stock NUMERIC;
    v_current_cost NUMERIC;
    v_new_stock NUMERIC;
    v_new_cost NUMERIC;
BEGIN
    -- CRITICAL: Lock the product row FOR UPDATE to prevent race conditions in WAC calculation
    SELECT stock_current, cost_price INTO v_current_stock, v_current_cost
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
    SET cost_price = v_new_cost,
        updated_at = NOW()
    WHERE id = NEW.product_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- 2. HARDENED CREATE_SALE (RBAC + DEADLOCK PREVENTION + IDEMPOTENCY)
-- ================================================================
CREATE OR REPLACE FUNCTION public.create_sale(
  p_store_id uuid,
  p_seller_id uuid,
  p_payment_method text,
  p_total_amount numeric,
  p_subtotal numeric,
  p_discount_type text,
  p_discount_value numeric,
  p_items jsonb,
  p_applied_taxes jsonb DEFAULT '[]'::jsonb,
  p_tax_amount numeric DEFAULT 0,
  p_transaction_id uuid DEFAULT NULL -- Idempotency Key
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_units_to_deduct integer;
  v_current_stock integer;
  v_product_name text;
BEGIN
  -- 🛡️ RBAC Enforcement
  IF NOT (public.is_admin() OR public.has_role('clerk')) THEN
    RAISE EXCEPTION 'Access Denied: Required role Clerk or Admin';
  END IF;

  -- 🛡️ Store Isolation
  IF NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'Access Denied to Store';
  END IF;

  -- 🛡️ Idempotency Check
  IF p_transaction_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.transactions WHERE id = p_transaction_id) THEN
      RETURN p_transaction_id; -- Already processed
    END IF;
    v_transaction_id := p_transaction_id;
  ELSE
    v_transaction_id := gen_random_uuid();
  END IF;

  -- 🔄 PHASE 1: PRE-VALIDATE & LOCK (Ordered to prevent deadlocks)
  -- 1a. Lock PRODUCTS first (Master)
  FOR v_product_id IN
    SELECT DISTINCT (elem->>'product_id')::uuid FROM jsonb_array_elements(p_items) as elem ORDER BY 1
  LOOP
    PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;
  END LOOP;

  -- 1b. Lock INVENTORY second
  FOR v_product_id, v_units_to_deduct IN
    WITH item_list AS (
      SELECT
        (elem->>'product_id')::uuid as prod_id,
        (elem->>'variant_id')::uuid as var_id,
        (elem->>'quantity')::numeric::integer as qty
      FROM jsonb_array_elements(p_items) as elem
    ),
    item_conversions AS (
      SELECT
        il.prod_id,
        il.qty * COALESCE(pv.conversion_factor, 1) as base_qty
      FROM item_list il
      LEFT JOIN public.product_variants pv ON pv.id = il.var_id
    )
    SELECT prod_id, SUM(base_qty)::integer
    FROM item_conversions
    GROUP BY prod_id
    ORDER BY prod_id
  LOOP
    SELECT quantity INTO v_current_stock FROM public.inventory
    WHERE store_id = p_store_id AND product_id = v_product_id FOR UPDATE;

    IF COALESCE(v_current_stock, 0) < v_units_to_deduct THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: % (Disponible: %, Requerido: %)',
        COALESCE(v_product_name, 'Producto desconocido'), COALESCE(v_current_stock, 0), v_units_to_deduct;
    END IF;
  END LOOP;

  -- 🔄 PHASE 2: PERSISTENCE
  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, subtotal, discount_type, discount_value,
    payment_method, status, tax_amount, applied_taxes
  ) VALUES (
    v_transaction_id, p_store_id, p_seller_id, p_total_amount, p_subtotal,
    p_discount_type::public.discount_type_enum, p_discount_value,
    p_payment_method::public.payment_method_enum, 'completed'::public.transaction_status,
    p_tax_amount, p_applied_taxes
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.transaction_items (
      transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale
    ) VALUES (
      v_transaction_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'variant_id')::uuid,
      (v_item->>'quantity')::numeric::integer,
      (v_item->>'price')::numeric,
      (v_item->>'cost')::numeric
    );

    PERFORM public.register_stock_movement(
      p_product_id := (v_item->>'product_id')::uuid,
      p_store_id := p_store_id,
      p_user_id := p_seller_id,
      p_quantity := -((v_item->>'quantity')::numeric::integer),
      p_movement_type := 'sale',
      p_reason := 'Venta #' || substring(v_transaction_id::text from 1 for 8),
      p_sale_id := v_transaction_id,
      p_unit_cost := COALESCE((v_item->>'cost')::numeric, 0),
      p_variant_id := (v_item->>'variant_id')::uuid
    );
  END LOOP;

  RETURN v_transaction_id;
END;
$$;

-- ================================================================
-- 3. HARDENED REGISTER_RECEPTION (RBAC + LOCKING + WAC INTEGRITY)
-- ================================================================
CREATE OR REPLACE FUNCTION public.register_reception(
    p_store_id UUID,
    p_supplier TEXT,
    p_reception_date DATE,
    p_invoice_number TEXT,
    p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reception_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity NUMERIC;
    v_unit_cost NUMERIC;
    v_total_cost NUMERIC := 0;
    v_user_id UUID;
BEGIN
    -- 🛡️ RBAC Enforcement
    IF NOT (public.is_admin() OR public.has_role('warehouse')) THEN
        RAISE EXCEPTION 'Access Denied: Required role Warehouse or Admin';
    END IF;

    v_user_id := auth.uid()::UUID;
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    -- 🛡️ Store Isolation
    IF NOT public.has_store_access(p_store_id) THEN
        RAISE EXCEPTION 'Invalid store_id for user';
    END IF;

    -- 🔄 PHASE 1: LOCK PRODUCTS (Ordered)
    FOR v_product_id IN
        SELECT DISTINCT (elem->>'product_id')::uuid FROM jsonb_array_elements(p_items) as elem ORDER BY 1
    LOOP
        PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;
    END LOOP;

    -- 🔄 PHASE 2: PERSISTENCE
    INSERT INTO public.receipts (
        user_id, total_cost, reference_doc, created_at, status, store_id, supplier, reception_date
    ) VALUES (
        v_user_id, 0, FORMAT('%s | %s', TRIM(p_supplier), TRIM(p_invoice_number)), now(), 'active', p_store_id, p_supplier, p_reception_date
    ) RETURNING id INTO v_reception_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::NUMERIC;
        v_unit_cost := (v_item->>'unit_cost')::NUMERIC;

        INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost, created_at)
        VALUES (v_reception_id, v_product_id, v_quantity, v_unit_cost, now());

        PERFORM public.register_stock_movement(
            p_store_id := p_store_id,
            p_product_id := v_product_id,
            p_variant_id := NULL,
            p_quantity := v_quantity::integer,
            p_movement_type := 'purchase',
            p_reason := 'Factura: ' || p_invoice_number,
            p_user_id := v_user_id,
            p_unit_cost := v_unit_cost,
            p_sale_id := v_reception_id -- Using reference_id logic
        );

        v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
    END LOOP;

    UPDATE public.receipts SET total_cost = v_total_cost WHERE id = v_reception_id;
    RETURN v_reception_id;
END;
$$;

-- ================================================================
-- 4. HARDENED PERFORM_INVENTORY_ADJUSTMENT (RBAC + LOCKING)
-- ================================================================
CREATE OR REPLACE FUNCTION public.perform_inventory_adjustment(
  p_product_id uuid,
  p_store_id uuid,
  p_user_id uuid,
  p_quantity_delta integer,
  p_unit_cost_adjustment numeric,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock_actual integer;
  v_costo_promedio_actual numeric;
  v_costo_total_actual numeric;
  v_nuevo_stock integer;
  v_nuevo_costo_total numeric;
  v_nuevo_costo_unitario numeric;
  v_costo_unitario_movimiento numeric;
BEGIN
  -- 🛡️ RBAC Enforcement
  IF NOT (public.is_admin() OR public.has_role('warehouse') OR public.has_role('manager')) THEN
    RAISE EXCEPTION 'Access Denied: Insufficient Permissions';
  END IF;

  -- 🛡️ Store Isolation
  IF NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'Access Denied to Store';
  END IF;

  -- 🔄 LOCKING
  -- Lock product first
  SELECT COALESCE(cost_average, cost_price, 0) INTO v_costo_promedio_actual
  FROM public.products WHERE id = p_product_id FOR UPDATE;

  -- Lock inventory second
  SELECT COALESCE(quantity, 0) INTO v_stock_actual
  FROM public.inventory WHERE store_id = p_store_id AND product_id = p_product_id FOR UPDATE;

  v_costo_total_actual := v_stock_actual * v_costo_promedio_actual;
  v_nuevo_stock := GREATEST(0, v_stock_actual + p_quantity_delta);

  IF p_quantity_delta < 0 THEN
    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);
    v_nuevo_costo_total := GREATEST(0, v_costo_total_actual - (ABS(p_quantity_delta) * v_costo_unitario_movimiento));
  ELSIF p_quantity_delta > 0 THEN
    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, 0);
    v_nuevo_costo_total := v_costo_total_actual + (p_quantity_delta * v_costo_unitario_movimiento);
  ELSE
    v_costo_unitario_movimiento := p_unit_cost_adjustment;
    v_nuevo_costo_total := v_stock_actual * v_costo_unitario_movimiento;
  END IF;

  IF v_nuevo_stock = 0 THEN v_nuevo_costo_total := 0; END IF;
  v_nuevo_costo_unitario := CASE WHEN v_nuevo_stock > 0 THEN v_nuevo_costo_total / v_nuevo_stock ELSE 0 END;

  PERFORM public.register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := p_user_id,
    p_quantity := p_quantity_delta,
    p_movement_type := 'adjustment',
    p_reason := p_reason,
    p_unit_cost := v_costo_unitario_movimiento
  );

  UPDATE public.products SET cost_average = v_nuevo_costo_unitario, updated_at = now() WHERE id = p_product_id;

  RETURN jsonb_build_object('status', 'ok', 'nuevo_stock', v_nuevo_stock, 'nuevo_costo_unitario', v_nuevo_costo_unitario);
END;
$$;

-- ================================================================
-- 5. HARDENED CONFIRM_TRANSFER (LOCKING + RBAC)
-- ================================================================
CREATE OR REPLACE FUNCTION public.confirm_transfer(p_transfer_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transfer RECORD;
    v_item RECORD;
    v_dest_product RECORD;
    v_stock_actual_dest INTEGER;
    v_costo_total_actual_dest NUMERIC;
    v_nuevo_stock_dest INTEGER;
    v_nuevo_costo_total_dest NUMERIC;
    v_nuevo_costo_unitario_dest NUMERIC;
BEGIN
    -- 🛡️ RBAC
    IF NOT (public.is_admin() OR public.has_role('warehouse') OR public.has_role('manager')) THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Permisos insuficientes');
    END IF;

    -- 🔄 LOCK TRANSFER
    SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'error', 'message', 'Transferencia no encontrada'); END IF;
    IF v_transfer.status != 'PENDIENTE' THEN RETURN jsonb_build_object('status', 'error', 'message', 'La transferencia ya ha sido procesada'); END IF;

    -- 🛡️ Store Access
    IF NOT (public.has_store_access(v_transfer.origin_store_id) AND public.has_store_access(v_transfer.destination_store_id)) THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Sin acceso a las tiendas involucradas');
    END IF;

    FOR v_item IN (SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id ORDER BY product_id) LOOP
        -- Lock Destination Product
        SELECT * INTO v_dest_product FROM public.products
        WHERE sku = (SELECT sku FROM public.products WHERE id = v_item.product_id)
        AND store_id = v_transfer.destination_store_id
        FOR UPDATE;

        IF v_dest_product.id IS NULL THEN RAISE EXCEPTION 'SKU % no existe en destino', (SELECT sku FROM public.products WHERE id = v_item.product_id); END IF;

        -- Lock Destination Inventory
        SELECT COALESCE(quantity, 0) INTO v_stock_actual_dest
        FROM public.inventory WHERE store_id = v_transfer.destination_store_id AND product_id = v_dest_product.id FOR UPDATE;

        -- WAC LOGIC
        v_costo_total_actual_dest := v_stock_actual_dest * COALESCE(v_dest_product.cost_average, v_dest_product.cost_price, 0);
        v_nuevo_stock_dest := v_stock_actual_dest + v_item.quantity;
        v_nuevo_costo_total_dest := v_costo_total_actual_dest + (v_item.quantity * v_item.unit_cost);
        v_nuevo_costo_unitario_dest := CASE WHEN v_nuevo_stock_dest > 0 THEN v_nuevo_costo_total_dest / v_nuevo_stock_dest ELSE 0 END;

        -- SALIDA Origen
        PERFORM public.register_stock_movement(
            p_product_id := v_item.product_id, p_store_id := v_transfer.origin_store_id, p_user_id := p_user_id,
            p_quantity := -v_item.quantity, p_movement_type := 'transfer_out', p_reason := 'Transferencia ' || v_transfer.id,
            p_unit_cost := v_item.unit_cost
        );

        -- ENTRADA Destino
        PERFORM public.register_stock_movement(
            p_product_id := v_dest_product.id, p_store_id := v_transfer.destination_store_id, p_user_id := p_user_id,
            p_quantity := v_item.quantity, p_movement_type := 'transfer_in', p_reason := 'Transferencia ' || v_transfer.id,
            p_unit_cost := v_item.unit_cost
        );

        UPDATE public.products SET cost_average = v_nuevo_costo_unitario_dest, updated_at = now() WHERE id = v_dest_product.id;
    END LOOP;

    UPDATE public.transfers SET status = 'COMPLETADA', completed_at = now() WHERE id = p_transfer_id;
    RETURN jsonb_build_object('status', 'ok', 'message', 'Transferencia confirmada');
END;
$$;

-- ================================================================
-- 6. AUDIT LOGS SECURITY
-- ================================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny direct writes to audit_logs" ON public.audit_logs;
CREATE POLICY "Deny direct writes to audit_logs" ON public.audit_logs
FOR INSERT WITH CHECK (false); -- Only system/RPCs can insert via SECURITY DEFINER if configured, or no one at all.

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_sale(uuid, uuid, text, numeric, numeric, text, numeric, jsonb, jsonb, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_reception(uuid, text, date, text, jsonb) TO authenticated;

COMMIT;
