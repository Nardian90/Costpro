-- ============================================================================
-- Extensión de Política de Secuencia Global a todos los RPCs de documentos
-- ----------------------------------------------------------------------------
-- Modifica: register_stock_movement, create_transfer, confirm_transfer,
-- confirm_pending_reception, process_inventory_adjustment,
-- process_stock_adjustment, register_reception, create_sale (update).
--
-- Principio: p_operation_date se añade como ÚLTIMO parámetro con DEFAULT NULL.
-- Si es NULL → usa NOW() (comportamiento legacy, 100% retrocompatible).
-- Si viene → valida contra MAX global (forward-only locking) y la usa en todos
-- los INSERTs/UPDATEs relevantes, incluyendo stock movements.
-- ============================================================================

-- ============================================================
-- 1. register_stock_movement: añadir p_operation_date
-- ============================================================
-- Es llamado por create_sale, create_transfer, confirm_transfer, etc.
-- Si p_operation_date viene, la usa para movement_date y created_at.
-- Si no, usa now() (comportamiento actual).

DROP FUNCTION IF EXISTS public.register_stock_movement(
  UUID, UUID, NUMERIC, TEXT, TEXT, UUID, UUID, UUID, NUMERIC, TEXT
);

CREATE OR REPLACE FUNCTION public.register_stock_movement(
  p_product_id UUID,
  p_store_id UUID,
  p_quantity NUMERIC,
  p_movement_type TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_variant_id UUID DEFAULT NULL,
  p_sale_id UUID DEFAULT NULL,
  p_unit_cost NUMERIC DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  -- NUEVO: fecha de operación efectiva (para forward-only locking)
  p_operation_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_new_qty NUMERIC;
  v_new_version BIGINT;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
  -- 1) Validar acceso a la tienda
  IF NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized store access';
  END IF;

  -- 2) Si cantidad es cero, no hacer nada
  IF p_quantity = 0 THEN
    RETURN jsonb_build_object('status', 'skipped');
  END IF;

  -- 3) Insertar movimiento en bitácora con la fecha efectiva
  INSERT INTO public.stock_movements (
    product_id, store_id, created_by, variant_id, quantity_change,
    movement_type, reference_id, reference_doc, unit_cost, notes, movement_date, created_at
  ) VALUES (
    p_product_id, p_store_id, p_user_id, p_variant_id, p_quantity,
    LOWER(p_movement_type)::public.movement_type, p_sale_id::text, p_reason,
    COALESCE(p_unit_cost, 0), p_notes, v_effective_date, v_effective_date
  )
  RETURNING balance_after INTO v_new_qty;

  -- 4) Obtener la versión actual del inventario
  SELECT version INTO v_new_version FROM public.inventory
  WHERE product_id = p_product_id AND store_id = p_store_id;

  -- 5) Actualizar caché denormalizado en products.stock_current
  UPDATE public.products
  SET stock_current = v_new_qty, updated_at = v_effective_date
  WHERE id = p_product_id AND store_id = p_store_id;

  -- 6) Recalcular costo promedio si viene unit_cost > 0 (recepciones)
  IF COALESCE(p_unit_cost, 0) > 0 AND p_quantity > 0 THEN
    UPDATE public.products
    SET cost_average = (
      SELECT
        CASE
          WHEN SUM(sm.quantity_change) = 0 THEN 0
          ELSE ROUND(SUM(sm.unit_cost * sm.quantity_change) / SUM(sm.quantity_change), 4)
        END
      FROM public.stock_movements sm
      WHERE sm.product_id = p_product_id
        AND sm.store_id = p_store_id
        AND sm.quantity_change > 0
    ),
    updated_at = v_effective_date
    WHERE id = p_product_id AND store_id = p_store_id;
  END IF;

  -- 7) Registrar evento de negocio
  INSERT INTO public.business_events (event_type, entity_id, payload, created_at)
  VALUES (
    'stock_movement',
    p_product_id,
    jsonb_build_object(
      'store_id', p_store_id,
      'quantity_change', p_quantity,
      'movement_type', LOWER(p_movement_type),
      'new_quantity', v_new_qty,
      'version', v_new_version,
      'reason', COALESCE(p_reason, ''),
      'user_id', COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ),
    v_effective_date
  );

  -- 8) Retornar resultado
  RETURN jsonb_build_object(
    'status', 'ok',
    'new_quantity', v_new_qty,
    'new_version', v_new_version
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.register_stock_movement(
  UUID, UUID, NUMERIC, TEXT, TEXT, UUID, UUID, UUID, NUMERIC, TEXT, TIMESTAMP WITH TIME ZONE
) TO authenticated;

-- ============================================================
-- 2. create_transfer: añadir p_operation_date + validación
-- ============================================================

DROP FUNCTION IF EXISTS public.create_transfer(UUID, UUID, JSONB, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.create_transfer(
  p_origin_store_id UUID,
  p_destination_store_id UUID,
  p_items JSONB,
  p_notes TEXT DEFAULT NULL,
  p_transaction_id UUID DEFAULT NULL,
  -- NUEVO: fecha de operación (forward-only locking)
  p_operation_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_transfer_id UUID := COALESCE(p_transaction_id, gen_random_uuid());
    v_item RECORD;
    v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
    -- Validación forward-only locking
    PERFORM public.validate_operation_date(p_operation_date);

    INSERT INTO public.transfers (
      id, origin_store_id, destination_store_id, created_by, notes, tenant_id, created_at
    )
    VALUES (
      v_transfer_id, p_origin_store_id, p_destination_store_id, auth.uid(), p_notes,
      (SELECT tenant_id FROM public.stores WHERE id = p_origin_store_id),
      v_effective_date
    );

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity NUMERIC, unit_cost NUMERIC) LOOP
        INSERT INTO public.transfer_items (transfer_id, product_id, quantity, unit_cost, created_at)
        VALUES (v_transfer_id, v_item.product_id, v_item.quantity, v_item.unit_cost, v_effective_date);
    END LOOP;
    RETURN v_transfer_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_transfer(UUID, UUID, JSONB, TEXT, UUID, TIMESTAMP WITH TIME ZONE) TO authenticated;

-- ============================================================
-- 3. confirm_transfer: añadir p_operation_date + validación
-- ============================================================

DROP FUNCTION IF EXISTS public.confirm_transfer(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION public.confirm_transfer(
  p_transfer_id UUID,
  p_user_id UUID,
  p_transaction_id UUID DEFAULT NULL,
  -- NUEVO: fecha de operación (forward-only locking)
  p_operation_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_transfer RECORD;
    v_item RECORD;
    v_dest_product RECORD;
    v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
    -- Validación forward-only locking
    PERFORM public.validate_operation_date(p_operation_date);

    SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
    FOR v_item IN (SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id) LOOP
        SELECT * INTO v_dest_product FROM public.products
        WHERE sku = (SELECT sku FROM public.products WHERE id = v_item.product_id)
          AND store_id = v_transfer.destination_store_id FOR UPDATE;

        PERFORM public.register_stock_movement(
          p_product_id := v_item.product_id,
          p_store_id := v_transfer.origin_store_id,
          p_user_id := p_user_id,
          p_quantity := -v_item.quantity,
          p_movement_type := 'transfer_out',
          p_operation_date := v_effective_date
        );
        PERFORM public.register_stock_movement(
          p_product_id := v_dest_product.id,
          p_store_id := v_transfer.destination_store_id,
          p_user_id := p_user_id,
          p_quantity := v_item.quantity,
          p_movement_type := 'transfer_in',
          p_operation_date := v_effective_date
        );
    END LOOP;
    UPDATE public.transfers SET status = 'CONFIRMADA', updated_at = v_effective_date
    WHERE id = p_transfer_id;
    RETURN jsonb_build_object('status', 'ok');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.confirm_transfer(UUID, UUID, UUID, TIMESTAMP WITH TIME ZONE) TO authenticated;

-- ============================================================
-- 4. confirm_pending_reception: añadir p_operation_date + validación
-- ============================================================

DROP FUNCTION IF EXISTS public.confirm_pending_reception(UUID, UUID);

CREATE OR REPLACE FUNCTION public.confirm_pending_reception(
  p_receipt_id UUID,
  p_user_id UUID,
  -- NUEVO: fecha de operación (forward-only locking)
  p_operation_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_store_id UUID;
  v_item RECORD;
  v_current_stock NUMERIC;
  v_current_avg NUMERIC;
  v_new_stock NUMERIC;
  v_new_avg NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
  -- Validación forward-only locking
  PERFORM public.validate_operation_date(p_operation_date);

  SELECT store_id INTO v_store_id FROM receipts
  WHERE id = p_receipt_id AND status = 'pending' FOR UPDATE;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Recepcion no encontrada o no esta pendiente';
  END IF;

  FOR v_item IN SELECT product_id, quantity, unit_cost FROM receipt_items WHERE receipt_id = p_receipt_id LOOP
    SELECT stock_current, cost_average INTO v_current_stock, v_current_avg
    FROM products WHERE id = v_item.product_id FOR UPDATE;
    v_new_stock := COALESCE(v_current_stock, 0) + v_item.quantity;
    v_new_avg := CASE WHEN v_new_stock > 0
      THEN (COALESCE(v_current_stock,0)*COALESCE(v_current_avg,0) + v_item.quantity*v_item.unit_cost) / v_new_stock
      ELSE v_item.unit_cost END;
    UPDATE products SET stock_current = v_new_stock, cost_average = v_new_avg, updated_at = v_effective_date
    WHERE id = v_item.product_id;
    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
    VALUES (v_item.product_id, v_store_id, 'purchase'::movement_type, v_item.quantity, v_item.unit_cost, 'Confirmacion recepcion', v_effective_date, p_user_id, v_effective_date);
  END LOOP;

  UPDATE receipts SET status = 'active', updated_at = v_effective_date
  WHERE id = p_receipt_id AND status = 'pending';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.confirm_pending_reception(UUID, UUID, TIMESTAMP WITH TIME ZONE) TO authenticated;

-- ============================================================
-- 5. process_inventory_adjustment: añadir p_operation_date + validación
-- ============================================================

DROP FUNCTION IF EXISTS public.process_inventory_adjustment(UUID, UUID, public.adjustment_item[]);

CREATE OR REPLACE FUNCTION public.process_inventory_adjustment(
  p_store_id UUID,
  p_cashier_id UUID,
  p_items public.adjustment_item[],
  -- NUEVO: fecha de operación (forward-only locking)
  p_operation_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_adjustment_id UUID;
  v_item public.adjustment_item;
  v_difference NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
  -- Validación forward-only locking
  PERFORM public.validate_operation_date(p_operation_date);

  INSERT INTO public.inventory_adjustments (store_id, created_by, status, created_at)
  VALUES (p_store_id, p_cashier_id, 'PROCESSING', v_effective_date)
  RETURNING id INTO v_adjustment_id;

  FOREACH v_item IN ARRAY p_items
  LOOP
    v_difference := v_item.counted_quantity - v_item.expected_quantity;
    INSERT INTO public.inventory_adjustment_items (adjustment_id, product_id, expected_quantity, counted_quantity, created_at)
    VALUES (v_adjustment_id, v_item.product_id, v_item.expected_quantity, v_item.counted_quantity, v_effective_date);

    PERFORM public.register_stock_movement(
        p_product_id := v_item.product_id,
        p_store_id := p_store_id,
        p_user_id := p_cashier_id,
        p_quantity := v_difference,
        p_movement_type := 'adjustment',
        p_operation_date := v_effective_date
    );
  END LOOP;

  UPDATE public.inventory_adjustments SET status = 'COMPLETED', updated_at = v_effective_date
  WHERE id = v_adjustment_id;
  RETURN v_adjustment_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.process_inventory_adjustment(UUID, UUID, public.adjustment_item[], TIMESTAMP WITH TIME ZONE) TO authenticated;

-- ============================================================
-- 6. process_stock_adjustment: añadir p_operation_date + validación
-- ============================================================

DROP FUNCTION IF EXISTS public.process_stock_adjustment(UUID, UUID, NUMERIC, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.process_stock_adjustment(
  p_store_id UUID,
  p_product_id UUID,
  p_quantity_delta NUMERIC,
  p_reason TEXT,
  p_user_id UUID,
  -- NUEVO: fecha de operación (forward-only locking)
  p_operation_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
    -- Validación forward-only locking
    PERFORM public.validate_operation_date(p_operation_date);

    PERFORM public.register_stock_movement(
      p_product_id := p_product_id,
      p_store_id := p_store_id,
      p_user_id := p_user_id,
      p_quantity := p_quantity_delta,
      p_movement_type := 'adjustment',
      p_reason := p_reason,
      p_operation_date := v_effective_date
    );
    RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.process_stock_adjustment(UUID, UUID, NUMERIC, TEXT, UUID, TIMESTAMP WITH TIME ZONE) TO authenticated;

-- ============================================================
-- 7. register_reception: validar p_reception_date (ya existe)
-- ============================================================
-- register_reception ya acepta p_reception_date. Solo añadimos validación.

DROP FUNCTION IF EXISTS public.register_reception(
  UUID, TEXT, TIMESTAMP WITH TIME ZONE, TEXT, JSONB
);

CREATE OR REPLACE FUNCTION public.register_reception(
  p_store_id UUID,
  p_supplier TEXT,
  p_reception_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  p_invoice_number TEXT DEFAULT '',
  p_items JSONB DEFAULT '[]'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_receipt_id UUID := gen_random_uuid();
  v_user_id UUID := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  v_total_cost NUMERIC := 0;
  v_item JSONB;
  v_product_id UUID;
  v_quantity NUMERIC;
  v_unit_cost NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_reception_date, NOW());
BEGIN
  -- Validación forward-only locking sobre p_reception_date
  PERFORM public.validate_operation_date(p_reception_date);

  -- Validar acceso a la tienda
  IF NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized store access';
  END IF;

  -- Insertar cabecera de recepción con la fecha efectiva
  INSERT INTO public.receipts (
    id, store_id, user_id, supplier, reception_date,
    reference_doc, total_cost, status, created_at, updated_at
  ) VALUES (
    v_receipt_id, p_store_id, v_user_id, p_supplier,
    v_effective_date, p_invoice_number, 0, 'active', v_effective_date, v_effective_date
  );

  -- Procesar cada item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC;
    v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0);

    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND store_id = p_store_id
    ) THEN
      RAISE NOTICE 'Producto % no encontrado o no pertenece a la tienda, saltando', v_product_id;
      CONTINUE;
    END IF;

    INSERT INTO public.receipt_items (
      receipt_id, product_id, quantity, unit_cost, created_at, updated_at
    ) VALUES (
      v_receipt_id, v_product_id, v_quantity, v_unit_cost, v_effective_date, v_effective_date
    );

    PERFORM public.register_stock_movement(
      p_product_id := v_product_id,
      p_store_id := p_store_id,
      p_user_id := v_user_id,
      p_quantity := v_quantity,
      p_movement_type := 'purchase',
      p_reason := p_invoice_number || ' - ' || p_supplier,
      p_unit_cost := v_unit_cost,
      p_sale_id := v_receipt_id,
      p_operation_date := v_effective_date
    );

    v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
  END LOOP;

  UPDATE public.receipts SET total_cost = v_total_cost WHERE id = v_receipt_id;
  RETURN v_receipt_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.register_reception(UUID, TEXT, TIMESTAMP WITH TIME ZONE, TEXT, JSONB) TO authenticated;

-- ============================================================
-- 8. create_sale: actualizar para pasar p_operation_date a register_stock_movement
-- ============================================================
-- El RPC ya acepta p_operation_date (de la migración anterior).
-- Esta actualización asegura que register_stock_movement reciba la fecha.

DROP FUNCTION IF EXISTS public.create_sale(
  UUID, UUID, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, TEXT, NUMERIC, JSONB, UUID, TIMESTAMP WITH TIME ZONE
);

CREATE OR REPLACE FUNCTION public.create_sale(
  p_store_id UUID,
  p_seller_id UUID,
  p_total_amount NUMERIC,
  p_items JSONB,
  p_subtotal NUMERIC DEFAULT 0,
  p_discount_type TEXT DEFAULT 'fixed',
  p_discount_value NUMERIC DEFAULT 0,
  p_payment_method TEXT DEFAULT 'cash',
  p_tax_amount NUMERIC DEFAULT 0,
  p_applied_taxes JSONB DEFAULT '[]'::JSONB,
  p_transaction_id UUID DEFAULT NULL,
  p_operation_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transaction_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_units_to_deduct NUMERIC;
  v_current_stock NUMERIC;
  v_tenant_id UUID;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
  -- 0) Validación de política forward-only
  PERFORM public.validate_operation_date(p_operation_date);

  -- 1) Internal security check
  IF NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized store access';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.stores WHERE id = p_store_id;
  v_transaction_id := COALESCE(p_transaction_id, gen_random_uuid());

  -- 2) Insert transaction header con la fecha efectiva
  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, subtotal, tenant_id, status,
    payment_method, discount_type, discount_value, tax_amount, applied_taxes,
    created_at
  )
  VALUES (
    v_transaction_id, p_store_id, p_seller_id, p_total_amount, p_subtotal, v_tenant_id,
    'completed'::transaction_status,
    p_payment_method::payment_method_enum,
    p_discount_type::discount_type_enum,
    p_discount_value, p_tax_amount, p_applied_taxes,
    v_effective_date
  );

  -- 3) Process items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_units_to_deduct := (v_item->>'quantity')::NUMERIC;

    PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

    SELECT quantity INTO v_current_stock FROM public.inventory
      WHERE store_id = p_store_id AND product_id = v_product_id FOR UPDATE;

    IF COALESCE(v_current_stock, 0) < v_units_to_deduct THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: Producto % tiene % unidades, se requieren %', v_product_id, COALESCE(v_current_stock, 0), v_units_to_deduct;
    END IF;

    -- Insert item con fecha efectiva
    INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, cost_at_sale, created_at)
    VALUES (v_transaction_id, v_product_id, v_units_to_deduct, (v_item->>'price')::NUMERIC, (v_item->>'cost')::NUMERIC, v_effective_date);

    -- Register movement con la fecha efectiva
    PERFORM public.register_stock_movement(
      p_product_id := v_product_id, p_store_id := p_store_id, p_user_id := p_seller_id,
      p_quantity := -v_units_to_deduct, p_movement_type := 'sale',
      p_sale_id := v_transaction_id, p_unit_cost := COALESCE((v_item->>'cost')::NUMERIC, 0),
      p_operation_date := v_effective_date
    );
  END LOOP;

  RETURN v_transaction_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_sale(
  UUID, UUID, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, TEXT, NUMERIC, JSONB, UUID, TIMESTAMP WITH TIME ZONE
) TO authenticated;

-- ============================================================
-- 9. Verificación: mostrar todas las funciones modificadas
-- ============================================================

SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_sale', 'create_transfer', 'confirm_transfer',
    'confirm_pending_reception', 'process_inventory_adjustment',
    'process_stock_adjustment', 'register_reception', 'register_stock_movement'
  )
ORDER BY p.proname;
