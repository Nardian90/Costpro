-- Migration: Comprehensive Audit Logging Expansion
-- Date: 2026-02-15
-- Author: Jules

BEGIN;

-- 1. Enhance Profile Audit (Profiles)
CREATE OR REPLACE FUNCTION public.audit_profile_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Log creation
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
        VALUES (
            auth.uid(),
            'CREATE_USER',
            'profiles',
            NEW.id,
            jsonb_build_object('full_name', NEW.full_name, 'role', NEW.role, 'email', NEW.email),
            NULL
        );
    -- Log deletion
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, store_id)
        VALUES (
            auth.uid(),
            'DELETE_USER',
            'profiles',
            OLD.id,
            jsonb_build_object('full_name', OLD.full_name, 'role', OLD.role),
            NULL
        );
    -- Log updates
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Log active store change
        IF (OLD.active_store_id IS DISTINCT FROM NEW.active_store_id) THEN
            INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
            VALUES (
                auth.uid(),
                'CHANGE_ACTIVE_STORE',
                'profiles',
                NEW.id,
                jsonb_build_object('active_store_id', OLD.active_store_id),
                jsonb_build_object('active_store_id', NEW.active_store_id),
                NEW.active_store_id
            );
        END IF;

        -- Log role change
        IF (OLD.role IS DISTINCT FROM NEW.role) THEN
            INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
            VALUES (
                auth.uid(),
                'CHANGE_ROLE',
                'profiles',
                NEW.id,
                jsonb_build_object('role', OLD.role),
                jsonb_build_object('role', NEW.role),
                NEW.active_store_id
            );
        END IF;

        -- Log name change
        IF (OLD.full_name IS DISTINCT FROM NEW.full_name) THEN
            INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
            VALUES (
                auth.uid(),
                'UPDATE_USER_NAME',
                'profiles',
                NEW.id,
                jsonb_build_object('full_name', OLD.full_name),
                jsonb_build_object('full_name', NEW.full_name),
                NEW.active_store_id
            );
        END IF;
    END IF;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

-- Re-attach trigger if not already there (it should be, but let's be safe)
DROP TRIGGER IF EXISTS trigger_audit_profile_changes ON public.profiles;
CREATE TRIGGER trigger_audit_profile_changes
AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_profile_changes();


-- 2. Audit for Products
CREATE OR REPLACE FUNCTION public.audit_product_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
        VALUES (
            auth.uid(),
            'CREATE_PRODUCT',
            'products',
            NEW.id,
            jsonb_build_object('name', NEW.name, 'sku', NEW.sku, 'price', NEW.price, 'cost_price', NEW.cost_price),
            NEW.store_id
        );
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Log Price Change
        IF (OLD.price IS DISTINCT FROM NEW.price OR OLD.cost_price IS DISTINCT FROM NEW.cost_price) THEN
            INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
            VALUES (
                auth.uid(),
                'UPDATE_PRICES',
                'products',
                NEW.id,
                jsonb_build_object('price', OLD.price, 'cost_price', OLD.cost_price, 'name', OLD.name),
                jsonb_build_object('price', NEW.price, 'cost_price', NEW.cost_price, 'name', NEW.name),
                NEW.store_id
            );
        END IF;

        -- Log other important changes (name, sku) if not already logged by price change
        IF (OLD.name IS DISTINCT FROM NEW.name OR OLD.sku IS DISTINCT FROM NEW.sku) THEN
             IF (OLD.price IS NOT DISTINCT FROM NEW.price AND OLD.cost_price IS NOT DISTINCT FROM NEW.cost_price) THEN
                INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
                VALUES (
                    auth.uid(),
                    'UPDATE_PRODUCT',
                    'products',
                    NEW.id,
                    jsonb_build_object('name', OLD.name, 'sku', OLD.sku),
                    jsonb_build_object('name', NEW.name, 'sku', NEW.sku),
                    NEW.store_id
                );
             END IF;
        END IF;
    END IF;
    -- Note: managed_delete_product already handles DELETE audit.
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_audit_product_changes ON public.products;
CREATE TRIGGER trigger_audit_product_changes
AFTER INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.audit_product_changes();


-- 3. Audit for Stores
CREATE OR REPLACE FUNCTION public.audit_store_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
        VALUES (
            auth.uid(),
            'UPDATE_STORE_CONFIG',
            'stores',
            NEW.id,
            jsonb_build_object('name', OLD.name, 'address', OLD.address, 'settings', OLD.settings),
            jsonb_build_object('name', NEW.name, 'address', NEW.address, 'settings', NEW.settings),
            NEW.id
        );
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_audit_store_changes ON public.stores;
CREATE TRIGGER trigger_audit_store_changes
AFTER UPDATE ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.audit_store_changes();


-- 4. Update RPCs for explicit auditing

-- 4.1 create_sale audit
CREATE OR REPLACE FUNCTION public.create_sale(
  p_store_id uuid,
  p_seller_id uuid,
  p_payment_method text,
  p_total_amount numeric,
  p_subtotal numeric,
  p_discount_type text,
  p_discount_value numeric,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction_id uuid;
  v_item jsonb;
  v_items_count int;
BEGIN
  -- Validate store access
  IF NOT (public.is_admin() OR public.has_store_access(p_store_id)) THEN
    RAISE EXCEPTION 'Access Denied to Store';
  END IF;

  v_items_count := jsonb_array_length(p_items);

  -- 1. Create Transaction
  INSERT INTO public.transactions (
    store_id,
    seller_id,
    total_amount,
    subtotal,
    discount_type,
    discount_value,
    payment_method,
    status
  )
  VALUES (
    p_store_id,
    p_seller_id,
    p_total_amount,
    p_subtotal,
    p_discount_type::public.discount_type_enum,
    p_discount_value,
    p_payment_method::public.payment_method_enum,
    'completed'::public.transaction_status
  )
  RETURNING id INTO v_transaction_id;

  -- 2. Create Transaction Items and Update Stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.transaction_items (
      transaction_id,
      product_id,
      variant_id,
      quantity,
      price_at_sale,
      cost_at_sale
    )
    VALUES (
      v_transaction_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'variant_id')::uuid,
      (v_item->>'quantity')::integer,
      (v_item->>'price')::numeric,
      (v_item->>'cost')::numeric
    );

    -- Register stock movement
    PERFORM public.register_stock_movement(
      p_product_id := (v_item->>'product_id')::uuid,
      p_store_id := p_store_id,
      p_user_id := p_seller_id,
      p_quantity := -((v_item->>'quantity')::integer),
      p_movement_type := 'sale',
      p_reason := 'POS Checkout #' || substring(v_transaction_id::text from 1 for 8),
      p_sale_id := v_transaction_id,
      p_unit_cost := COALESCE((v_item->>'cost')::integer, 0)
    );
  END LOOP;

  -- 3. AUDIT LOG for Sale
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (
    p_seller_id,
    'CREATE_SALE',
    'transactions',
    v_transaction_id,
    jsonb_build_object(
        'total_amount', p_total_amount,
        'items_count', v_items_count,
        'payment_method', p_payment_method
    ),
    p_store_id
  );

  RETURN v_transaction_id;
END;
$$;


-- 4.2 perform_inventory_adjustment audit
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
  v_product_name text;
BEGIN
  -- 1. Get current values
  SELECT name INTO v_product_name FROM public.products WHERE id = p_product_id;

  SELECT COALESCE(quantity, 0) INTO v_stock_actual
  FROM public.inventory
  WHERE store_id = p_store_id AND product_id = p_product_id;

  SELECT COALESCE(cost_average, cost_price, 0) INTO v_costo_promedio_actual
  FROM public.products
  WHERE id = p_product_id;

  v_costo_total_actual := v_stock_actual * v_costo_promedio_actual;

  -- 2. Calculate New Values
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

  IF v_nuevo_stock > 0 THEN
    v_nuevo_costo_unitario := v_nuevo_costo_total / v_nuevo_stock;
  ELSE
    v_nuevo_costo_unitario := 0;
  END IF;

  -- 3. Register Stock Movement
  PERFORM public.register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := p_user_id,
    p_quantity := p_quantity_delta,
    p_movement_type := 'adjustment',
    p_reason := p_reason,
    p_sale_id := NULL,
    p_unit_cost := v_costo_unitario_movimiento,
    p_notes := 'Ajuste manual: ' || p_reason
  );

  -- 4. Update Product Catalog
  UPDATE public.products
  SET cost_average = v_nuevo_costo_unitario,
      updated_at = now()
  WHERE id = p_product_id;

  -- 5. AUDIT LOG
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
  VALUES (
    p_user_id,
    'MANUAL_STOCK_ADJUSTMENT',
    'inventory',
    p_product_id,
    jsonb_build_object('quantity', v_stock_actual, 'cost', v_costo_promedio_actual, 'product_name', v_product_name),
    jsonb_build_object('quantity', v_nuevo_stock, 'cost', v_nuevo_costo_unitario, 'delta', p_quantity_delta, 'reason', p_reason),
    p_store_id
  );

  RETURN jsonb_build_object(
    'status', 'ok',
    'nuevo_stock', v_nuevo_stock,
    'nuevo_costo_total', v_nuevo_costo_total,
    'nuevo_costo_unitario', v_nuevo_costo_unitario,
    'movimiento_registrado', true
  );
END;
$$;


-- 4.3 Transfer lifecycle audit
CREATE OR REPLACE FUNCTION public.create_transfer(
    p_origin_store_id UUID,
    p_destination_store_id UUID,
    p_items JSONB,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transfer_id UUID;
    v_item RECORD;
    v_items_count int;
BEGIN
    v_items_count := jsonb_array_length(p_items);

    -- 1. Insertar cabecera
    INSERT INTO public.transfers (origin_store_id, destination_store_id, created_by, notes)
    VALUES (p_origin_store_id, p_destination_store_id, auth.uid(), p_notes)
    RETURNING id INTO v_transfer_id;

    -- 2. Insertar items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INTEGER, unit_cost NUMERIC)
    LOOP
        INSERT INTO public.transfer_items (transfer_id, product_id, quantity, unit_cost)
        VALUES (v_transfer_id, v_item.product_id, v_item.quantity, v_item.unit_cost);
    END LOOP;

    -- 3. AUDIT LOG
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
    VALUES (
        auth.uid(),
        'CREATE_TRANSFER',
        'transfers',
        v_transfer_id,
        jsonb_build_object(
            'origin_store_id', p_origin_store_id,
            'destination_store_id', p_destination_store_id,
            'items_count', v_items_count
        ),
        p_origin_store_id
    );

    RETURN v_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_transfer(p_transfer_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transfer RECORD;
    v_item RECORD;
    v_dest_product RECORD;
    v_res_out JSONB;
    v_res_in JSONB;
    v_stock_actual_dest INTEGER;
    v_costo_promedio_actual_dest NUMERIC;
    v_costo_total_actual_dest NUMERIC;
    v_nuevo_stock_dest INTEGER;
    v_nuevo_costo_total_dest NUMERIC;
    v_nuevo_costo_unitario_dest NUMERIC;
BEGIN
    -- 1. Obtener transferencia con bloqueo
    SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Transferencia no encontrada');
    END IF;

    -- 2. Validar que la transferencia esté PENDIENTE
    IF v_transfer.status != 'PENDIENTE' THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'La transferencia ya ha sido procesada');
    END IF;

    -- 3. Procesar cada item
    FOR v_item IN (SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id) LOOP
        -- SALIDA del origen
        v_res_out := public.register_stock_movement(
            p_product_id := v_item.product_id,
            p_store_id := v_transfer.origin_store_id,
            p_user_id := p_user_id,
            p_quantity := -v_item.quantity,
            p_movement_type := 'transfer_out',
            p_reason := 'Transferencia ' || substring(v_transfer.id::text from 1 for 8) || ' a tienda destino',
            p_sale_id := NULL,
            p_unit_cost := v_item.unit_cost,
            p_notes := 'Transferencia confirmada'
        );

        IF (v_res_out->>'status') = 'error' THEN
            RAISE EXCEPTION '%', (v_res_out->>'message');
        END IF;

        -- ENTRADA al destino
        SELECT * INTO v_dest_product FROM public.products
        WHERE sku = (SELECT sku FROM public.products WHERE id = v_item.product_id)
        AND store_id = v_transfer.destination_store_id;

        IF v_dest_product.id IS NULL THEN
            RAISE EXCEPTION 'El producto con SKU % no existe en el almacén destino',
                (SELECT sku FROM public.products WHERE id = v_item.product_id);
        END IF;

        -- WAC LOGIC para el destino
        SELECT COALESCE(quantity, 0) INTO v_stock_actual_dest
        FROM public.inventory
        WHERE store_id = v_transfer.destination_store_id AND product_id = v_dest_product.id;

        v_costo_promedio_actual_dest := COALESCE(v_dest_product.cost_average, v_dest_product.cost_price, 0);
        v_costo_total_actual_dest := v_stock_actual_dest * v_costo_promedio_actual_dest;

        v_nuevo_stock_dest := v_stock_actual_dest + v_item.quantity;
        v_nuevo_costo_total_dest := v_costo_total_actual_dest + (v_item.quantity * v_item.unit_cost);

        IF v_nuevo_stock_dest > 0 THEN
            v_nuevo_costo_unitario_dest := v_nuevo_costo_total_dest / v_nuevo_stock_dest;
        ELSE
            v_nuevo_costo_unitario_dest := 0;
        END IF;

        -- Registrar ENTRADA
        v_res_in := public.register_stock_movement(
            p_product_id := v_dest_product.id,
            p_store_id := v_transfer.destination_store_id,
            p_user_id := p_user_id,
            p_quantity := v_item.quantity,
            p_movement_type := 'transfer_in',
            p_reason := 'Transferencia ' || substring(v_transfer.id::text from 1 for 8) || ' desde tienda origen',
            p_sale_id := NULL,
            p_unit_cost := v_item.unit_cost,
            p_notes := 'Transferencia confirmada'
        );

        IF (v_res_in->>'status') = 'error' THEN
            RAISE EXCEPTION '%', (v_res_in->>'message');
        END IF;

        -- Actualizar Costo Promedio
        UPDATE public.products
        SET cost_average = v_nuevo_costo_unitario_dest,
            updated_at = now()
        WHERE id = v_dest_product.id;

    END LOOP;

    -- 4. Actualizar estado de la transferencia
    UPDATE public.transfers
    SET status = 'CONFIRMADA', updated_at = now()
    WHERE id = p_transfer_id;

    -- 5. AUDIT LOG
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
    VALUES (
        p_user_id,
        'CONFIRM_TRANSFER',
        'transfers',
        p_transfer_id,
        jsonb_build_object(
            'origin_store_id', v_transfer.origin_store_id,
            'destination_store_id', v_transfer.destination_store_id,
            'status', 'CONFIRMADA'
        ),
        v_transfer.destination_store_id
    );

    RETURN jsonb_build_object('status', 'success', 'message', 'Transferencia confirmada y stock actualizado correctamente');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

COMMIT;
