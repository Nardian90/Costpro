-- Migration: Hardened Stock Management v3 (Final)
-- Date: 2026-03-04
-- Author: Jules
-- Description: Comprehensive fix for negative stock, variant support, and function alignment.

BEGIN;

-- 1. CLEANUP: Drop all possible versions of create_sale and register_stock_movement
DO $$
BEGIN
    -- Drop create_sale variations
    DROP FUNCTION IF EXISTS public.create_sale(uuid, uuid, text, numeric, numeric, text, numeric, jsonb);
    DROP FUNCTION IF EXISTS public.create_sale(uuid, uuid, text, numeric, numeric, text, numeric, jsonb, jsonb, numeric);

    -- Drop register_stock_movement variations
    DROP FUNCTION IF EXISTS public.register_stock_movement(uuid, uuid, uuid, integer, text, text, uuid, integer, text);
    DROP FUNCTION IF EXISTS public.register_stock_movement(uuid, uuid, uuid, integer, text, text, uuid, integer);
    DROP FUNCTION IF EXISTS public.register_stock_movement(uuid, uuid, uuid, integer, text, text, uuid);
    DROP FUNCTION IF EXISTS public.register_stock_movement(uuid, uuid, uuid, integer, public.movement_type, text, text, uuid, integer);
    DROP FUNCTION IF EXISTS public.register_stock_movement(uuid, uuid, uuid, integer, public.movement_type, text, text, uuid);
    DROP FUNCTION IF EXISTS public.register_stock_movement(uuid, uuid, uuid, integer, text, text, uuid, integer, text, text);
    DROP FUNCTION IF EXISTS public.register_stock_movement(uuid, uuid, uuid, uuid, integer, text, text, uuid, integer, text);
    DROP FUNCTION IF EXISTS public.register_stock_movement(uuid, uuid, uuid, integer, text, text, uuid, numeric, text, uuid);
END $$;

-- 2. ENFORCE INVENTORY UNIQUENESS
-- Ensure there is a unique constraint on (store_id, product_id) for ON CONFLICT to work
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'inventory_store_product_unique'
    ) THEN
        ALTER TABLE public.inventory ADD CONSTRAINT inventory_store_product_unique UNIQUE (store_id, product_id);
    END IF;
END $$;

-- 3. ENHANCED REGISTER_STOCK_MOVEMENT
CREATE OR REPLACE FUNCTION public.register_stock_movement(
  p_product_id uuid,
  p_store_id uuid,
  p_user_id uuid,
  p_quantity integer,
  p_movement_type text,
  p_reason text,
  p_sale_id uuid DEFAULT NULL,
  p_unit_cost numeric DEFAULT 0,
  p_notes text DEFAULT NULL,
  p_variant_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_qty integer;
  v_new_version integer;
BEGIN
  IF p_quantity = 0 THEN RETURN jsonb_build_object('status', 'skipped', 'message', 'Zero quantity'); END IF;

  INSERT INTO public.stock_movements (
    product_id, store_id, created_by, variant_id, quantity_change,
    movement_type, reference_id, reference_doc, unit_cost, notes, movement_date, created_at
  ) VALUES (
    p_product_id, p_store_id, p_user_id, p_variant_id, p_quantity,
    LOWER(p_movement_type)::public.movement_type, p_sale_id::text, p_reason,
    COALESCE(p_unit_cost, 0), p_notes, now(), now()
  );

  SELECT quantity, version INTO v_new_qty, v_new_version
  FROM public.inventory
  WHERE store_id = p_store_id AND product_id = p_product_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'new_quantity', COALESCE(v_new_qty, 0),
    'new_version', COALESCE(v_new_version, 0)
  );
END;
$$;

-- 4. HARDENED TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.fn_sync_inventory_on_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_new_qty integer;
BEGIN
    -- Final Safety: Never allow an INSERT with negative quantity
    -- If it doesn't exist, initial quantity must be at least what we are adding.
    -- If we are subtracting and it doesn't exist, it's an error.

    IF NEW.quantity_change < 0 AND NOT EXISTS (
        SELECT 1 FROM public.inventory WHERE store_id = NEW.store_id AND product_id = NEW.product_id
    ) THEN
        RAISE EXCEPTION 'ERR_NEGATIVE_STOCK_INITIAL: No se puede iniciar inventario con valores negativos para el producto %', NEW.product_id;
    END IF;

    INSERT INTO public.inventory (store_id, product_id, quantity, version, updated_at)
    VALUES (NEW.store_id, NEW.product_id, NEW.quantity_change, 1, now())
    ON CONFLICT (store_id, product_id)
    DO UPDATE SET
        quantity = public.inventory.quantity + EXCLUDED.quantity,
        version = public.inventory.version + 1,
        updated_at = now()
    RETURNING quantity INTO v_new_qty;

    NEW.balance_after := v_new_qty;
    RETURN NEW;
END;
$function$;

-- 5. HARDENED CREATE_SALE
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
  v_units_to_deduct integer;
  v_conversion_factor integer;
  v_current_stock integer;
  v_product_name text;
  v_product_id uuid;
  v_variant_id uuid;
BEGIN
  -- Security
  IF NOT (public.is_admin() OR public.has_store_access(p_store_id)) THEN
    RAISE EXCEPTION 'Access Denied to Store';
  END IF;

  -- 1. PRE-VALIDATE STOCK
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_units_to_deduct := (v_item->>'quantity')::integer;

    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_variant_id;
      v_units_to_deduct := v_units_to_deduct * COALESCE(v_conversion_factor, 1);
    END IF;

    SELECT quantity INTO v_current_stock FROM public.inventory WHERE store_id = p_store_id AND product_id = v_product_id;

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
    v_units_to_deduct := (v_item->>'quantity')::integer;

    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_variant_id;
      v_units_to_deduct := v_units_to_deduct * COALESCE(v_conversion_factor, 1);
    END IF;

    INSERT INTO public.transaction_items (
      transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale
    ) VALUES (
      v_transaction_id, v_product_id, v_variant_id,
      (v_item->>'quantity')::integer, (v_item->>'price')::numeric, (v_item->>'cost')::numeric
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

-- 6. GRANT PERMISSIONS (CRITICAL)
GRANT EXECUTE ON FUNCTION public.create_sale(uuid, uuid, text, numeric, numeric, text, numeric, jsonb, jsonb, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_stock_movement(uuid, uuid, uuid, integer, text, text, uuid, numeric, text, uuid) TO authenticated;

COMMIT;
