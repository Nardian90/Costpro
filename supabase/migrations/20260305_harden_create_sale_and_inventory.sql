-- Migration: Hardened Stock Validation and Concurrency v2
-- Date: 2026-03-05
-- Author: Eli
-- Description: Final hardening of inventory logic to prevent negative stock and handle concurrency.

BEGIN;

-- 1. HARDENED TRIGGER FUNCTION
-- This version avoids the check_violation error by explicitly checking for existence
-- and separating the logic, ensuring custom error messages are always used.
CREATE OR REPLACE FUNCTION public.fn_sync_inventory_on_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_new_qty integer;
    v_exists boolean;
BEGIN
    -- Check if record exists
    SELECT EXISTS (
        SELECT 1 FROM public.inventory
        WHERE store_id = NEW.store_id AND product_id = NEW.product_id
    ) INTO v_exists;

    IF NOT v_exists THEN
        -- If it doesn't exist and we are subtracting, it's an error
        IF NEW.quantity_change < 0 THEN
            RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: No hay registro de inventario para el producto %', NEW.product_id;
        END IF;

        INSERT INTO public.inventory (store_id, product_id, quantity, version, updated_at)
        VALUES (NEW.store_id, NEW.product_id, NEW.quantity_change, 1, now())
        RETURNING quantity INTO v_new_qty;
    ELSE
        -- If it exists, update it. This handles the negative change safely.
        UPDATE public.inventory
        SET quantity = public.inventory.quantity + NEW.quantity_change,
            version = public.inventory.version + 1,
            updated_at = now()
        WHERE store_id = NEW.store_id AND product_id = NEW.product_id
        RETURNING quantity INTO v_new_qty;

        -- Final check after update
        IF v_new_qty < 0 THEN
            RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: El stock no puede ser negativo para el producto % (Resultado: %)', NEW.product_id, v_new_qty;
        END IF;
    END IF;

    NEW.balance_after := v_new_qty;
    RETURN NEW;
END;
$function$;

-- 2. HARDENED CREATE_SALE RPC
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
  p_tax_amount numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_quantity_requested integer;
  v_units_to_deduct integer;
  v_current_stock integer;
  v_product_name text;
  v_conversion_factor integer;
BEGIN
  -- Security
  IF NOT (public.is_admin() OR public.has_store_access(p_store_id)) THEN
    RAISE EXCEPTION 'Access Denied to Store';
  END IF;

  -- 1. PRE-VALIDATE STOCK WITH AGGREGATION AND LOCKING
  -- We aggregate all required units per product first and LOCK the rows.
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
    ORDER BY prod_id -- Deadlock prevention
  LOOP
    -- Lock row for update
    SELECT quantity INTO v_current_stock
    FROM public.inventory
    WHERE store_id = p_store_id AND product_id = v_product_id
    FOR UPDATE;

    IF COALESCE(v_current_stock, 0) < v_units_to_deduct THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: % (Disponible: %, Requerido: %)',
        COALESCE(v_product_name, 'Producto desconocido'), COALESCE(v_current_stock, 0), v_units_to_deduct;
    END IF;
  END LOOP;

  -- 2. CREATE TRANSACTION
  INSERT INTO public.transactions (
    store_id, seller_id, total_amount, subtotal, discount_type, discount_value,
    payment_method, status, tax_amount, applied_taxes
  ) VALUES (
    p_store_id, p_seller_id, p_total_amount, p_subtotal,
    p_discount_type::public.discount_type_enum, p_discount_value,
    p_payment_method::public.payment_method_enum, 'completed'::public.transaction_status,
    p_tax_amount, p_applied_taxes
  ) RETURNING id INTO v_transaction_id;

  -- 3. PROCESS ITEMS
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity_requested := (v_item->>'quantity')::numeric::integer;

    v_units_to_deduct := v_quantity_requested;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_variant_id;
      v_units_to_deduct := v_quantity_requested * COALESCE(v_conversion_factor, 1);
    END IF;

    INSERT INTO public.transaction_items (
      transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale
    ) VALUES (
      v_transaction_id, v_product_id, v_variant_id,
      v_quantity_requested, (v_item->>'price')::numeric, (v_item->>'cost')::numeric
    );

    PERFORM public.register_stock_movement(
      p_product_id := v_product_id,
      p_store_id := p_store_id,
      p_user_id := p_seller_id,
      p_quantity := -v_units_to_deduct,
      p_movement_type := 'sale',
      p_reason := 'Venta #' || substring(v_transaction_id::text from 1 for 8),
      p_sale_id := v_transaction_id,
      p_unit_cost := COALESCE((v_item->>'cost')::numeric, 0),
      p_variant_id := v_variant_id
    );
  END LOOP;

  RETURN v_transaction_id;
END;
$$;

COMMIT;
