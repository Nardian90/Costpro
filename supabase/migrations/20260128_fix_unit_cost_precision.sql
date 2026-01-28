-- Migration: Update register_stock_movement to support numeric unit cost
-- Author: Jules
-- Date: 2026-01-28

BEGIN;

-- 1. Drop the function with the old signature
DROP FUNCTION IF EXISTS public.register_stock_movement(uuid, uuid, uuid, integer, text, text, uuid, integer, text);

-- 2. Create the function with numeric unit cost
CREATE OR REPLACE FUNCTION public.register_stock_movement(
  p_product_id uuid,
  p_store_id uuid,
  p_user_id uuid,
  p_quantity integer,
  p_movement_type text,
  p_reason text,
  p_sale_id uuid DEFAULT NULL,
  p_unit_cost numeric DEFAULT 0, -- Changed from integer to numeric
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_qty integer;
  v_new_version integer;
BEGIN
  -- Validations
  IF p_quantity = 0 THEN
    RAISE EXCEPTION 'Quantity cannot be zero';
  END IF;

  -- Insert movement. Note: trigger tr_sync_inventory_after_movement
  -- will handle the atomic update of the inventory table.
  INSERT INTO public.stock_movements (
    product_id,
    store_id,
    created_by,
    quantity_change,
    movement_type,
    reference_id,
    reference_doc,
    unit_cost,
    notes,
    movement_date,
    created_at
  ) VALUES (
    p_product_id,
    p_store_id,
    p_user_id,
    p_quantity,
    LOWER(p_movement_type)::public.movement_type,
    p_sale_id::text,
    p_reason,
    COALESCE(p_unit_cost, 0),
    p_notes,
    now(),
    now()
  );

  -- Retrieve updated values from inventory (updated by trigger)
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

-- Align other functions that use register_stock_movement and might be casting to integer
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
BEGIN
  -- Validate store access
  IF NOT (public.is_admin() OR public.has_store_access(p_store_id)) THEN
    RAISE EXCEPTION 'Access Denied to Store';
  END IF;

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

    -- Register stock movement via the canonical function
    PERFORM public.register_stock_movement(
      p_product_id := (v_item->>'product_id')::uuid,
      p_store_id := p_store_id,
      p_user_id := p_seller_id,
      p_quantity := -((v_item->>'quantity')::integer),
      p_movement_type := 'sale',
      p_reason := 'POS Checkout #' || substring(v_transaction_id::text from 1 for 8),
      p_sale_id := v_transaction_id,
      p_unit_cost := COALESCE((v_item->>'cost')::numeric, 0) -- Changed cast to numeric
    );
  END LOOP;

  RETURN v_transaction_id;
END;
$$;

COMMIT;
