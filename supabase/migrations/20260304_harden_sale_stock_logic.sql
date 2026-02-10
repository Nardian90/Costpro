-- Migration: Harden Sale Stock Logic and Restore Variant Support (v2)
-- Date: 2026-03-04
-- Author: Jules
-- Description: Adds stock pre-checks to create_sale, handles variant conversion factors,
-- restores variant_id recording in stock movements, and fixes unit_cost precision.
-- This version corrects the function signature to match the frontend parameters.

BEGIN;

-- 1. Drop existing register_stock_movement functions to avoid overloads
DROP FUNCTION IF EXISTS public.register_stock_movement(uuid, uuid, uuid, integer, text, text, uuid, integer, text);
DROP FUNCTION IF EXISTS public.register_stock_movement(uuid, uuid, uuid, integer, text, text, uuid, integer);
DROP FUNCTION IF EXISTS public.register_stock_movement(uuid, uuid, uuid, integer, text, text, uuid);
DROP FUNCTION IF EXISTS public.register_stock_movement(uuid, uuid, uuid, integer, public.movement_type, text, text, uuid, integer);
DROP FUNCTION IF EXISTS public.register_stock_movement(uuid, uuid, uuid, integer, public.movement_type, text, text, uuid);
DROP FUNCTION IF EXISTS public.register_stock_movement(uuid, uuid, uuid, integer, text, text, uuid, integer, text, text);
DROP FUNCTION IF EXISTS public.register_stock_movement(uuid, uuid, uuid, integer, text, text, uuid, integer, text);

-- 2. Create the Enhanced register_stock_movement (10 parameters)
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
    variant_id,
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
    p_variant_id,
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

-- 3. Update the trigger function for inventory sync to be safer
CREATE OR REPLACE FUNCTION public.fn_sync_inventory_on_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_new_qty integer;
BEGIN
    -- Upsert inventory
    INSERT INTO public.inventory (store_id, product_id, quantity, version, updated_at)
    VALUES (NEW.store_id, NEW.product_id, NEW.quantity_change, 1, now())
    ON CONFLICT (store_id, product_id)
    DO UPDATE SET
        quantity = public.inventory.quantity + EXCLUDED.quantity,
        version = public.inventory.version + 1,
        updated_at = now()
    RETURNING quantity INTO v_new_qty;

    -- Update balance_after in stock_movements row being inserted
    NEW.balance_after := v_new_qty;

    RETURN NEW;
END;
$function$;

-- 4. Re-align create_sale with full signature (10 parameters)
-- Drop the 8-parameter version I might have created previously
DROP FUNCTION IF EXISTS public.create_sale(uuid, uuid, text, numeric, numeric, text, numeric, jsonb);

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
  -- Validate store access
  IF NOT (public.is_admin() OR public.has_store_access(p_store_id)) THEN
    RAISE EXCEPTION 'Access Denied to Store';
  END IF;

  -- 1. Pre-validation of Stock
  -- Note: This loop performs simple per-item validation.
  -- Cumulative check across multiple line items of the same product is handled by DB constraints
  -- but we provide a friendly error here for the most common cases.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_variant_id := (v_item->>'variant_id')::uuid;

    -- Calculate units to deduct using conversion factor if variant exists
    v_units_to_deduct := (v_item->>'quantity')::integer;

    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
      FROM public.product_variants
      WHERE id = v_variant_id;

      v_units_to_deduct := v_units_to_deduct * COALESCE(v_conversion_factor, 1);
    END IF;

    -- Check available stock in inventory for this store
    SELECT quantity INTO v_current_stock
    FROM public.inventory
    WHERE store_id = p_store_id AND product_id = v_product_id;

    IF COALESCE(v_current_stock, 0) < v_units_to_deduct THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: El producto % no tiene suficiente stock (% disponible, % requerido)',
        v_product_name, COALESCE(v_current_stock, 0), v_units_to_deduct;
    END IF;
  END LOOP;

  -- 2. Create Transaction
  INSERT INTO public.transactions (
    store_id,
    seller_id,
    total_amount,
    subtotal,
    discount_type,
    discount_value,
    payment_method,
    status,
    tax_amount,
    applied_taxes
  )
  VALUES (
    p_store_id,
    p_seller_id,
    p_total_amount,
    p_subtotal,
    p_discount_type::public.discount_type_enum,
    p_discount_value,
    p_payment_method::public.payment_method_enum,
    'completed'::public.transaction_status,
    p_tax_amount,
    p_applied_taxes
  )
  RETURNING id INTO v_transaction_id;

  -- 3. Create Transaction Items and Register Stock Movements
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_variant_id := (v_item->>'variant_id')::uuid;

    -- Recalculate units to deduct for registration
    v_units_to_deduct := (v_item->>'quantity')::integer;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
      FROM public.product_variants
      WHERE id = v_variant_id;
      v_units_to_deduct := v_units_to_deduct * COALESCE(v_conversion_factor, 1);
    END IF;

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
      v_product_id,
      v_variant_id,
      (v_item->>'quantity')::integer,
      (v_item->>'price')::numeric,
      (v_item->>'cost')::numeric
    );

    -- Register stock movement via the enhanced canonical function
    PERFORM public.register_stock_movement(
      p_product_id := v_product_id,
      p_store_id := p_store_id,
      p_user_id := p_seller_id,
      p_quantity := -v_units_to_deduct,
      p_movement_type := 'sale',
      p_reason := 'POS Checkout #' || substring(v_transaction_id::text from 1 for 8),
      p_sale_id := v_transaction_id,
      p_unit_cost := COALESCE((v_item->>'cost')::numeric, 0),
      p_variant_id := v_variant_id
    );
  END LOOP;

  RETURN v_transaction_id;
END;
$$;

-- 5. Re-align other callers

-- 5.1 register_reception
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
AS $$
DECLARE
    v_reception_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_unit_cost NUMERIC;
    v_total_cost NUMERIC := 0;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid()::UUID;
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    -- Create receipt record
    INSERT INTO public.receipts (
        user_id, total_cost, reference_doc, created_at, status, store_id, supplier, reception_date
    ) VALUES (
        v_user_id, 0, FORMAT('%s | %s', TRIM(p_supplier), TRIM(p_invoice_number)), now(), 'active', p_store_id, p_supplier, p_reception_date
    )
    RETURNING id INTO v_reception_id;

    -- Process items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_unit_cost := (v_item->>'unit_cost')::NUMERIC;

        INSERT INTO public.receipt_items (
            receipt_id, product_id, quantity, unit_cost, created_at
        ) VALUES (
            v_reception_id, v_product_id, v_quantity, v_unit_cost, now()
        );

        PERFORM public.register_stock_movement(
            p_product_id := v_product_id,
            p_store_id := p_store_id,
            p_user_id := v_user_id,
            p_quantity := v_quantity,
            p_movement_type := 'purchase',
            p_reason := 'Factura: ' || p_invoice_number,
            p_sale_id := NULL,
            p_unit_cost := v_unit_cost
        );

        v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
    END LOOP;

    UPDATE public.receipts SET total_cost = v_total_cost WHERE id = v_reception_id;
    RETURN v_reception_id;
END;
$$;

-- 5.2 process_stock_adjustment
CREATE OR REPLACE FUNCTION public.process_stock_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta integer, p_reason text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_current_stock integer;
BEGIN
    SELECT COALESCE(quantity, 0) INTO v_current_stock
    FROM public.inventory
    WHERE store_id = p_store_id AND product_id = p_product_id;

    IF (v_current_stock + p_quantity_delta) < 0 THEN
        RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: Adjustment would result in negative stock';
    END IF;

    PERFORM public.register_stock_movement(
        p_product_id := p_product_id,
        p_store_id := p_store_id,
        p_user_id := p_user_id,
        p_quantity := p_quantity_delta,
        p_movement_type := 'adjustment',
        p_reason := p_reason,
        p_unit_cost := 0
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Stock adjusted successfully',
        'new_quantity', (v_current_stock + p_quantity_delta)
    );
END;
$$;

COMMIT;
