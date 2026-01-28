-- Migration: Update register_stock_movement to support numeric unit cost and align callers
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
  p_unit_cost numeric DEFAULT 0,
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

  -- Insert movement
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

  -- Retrieve updated values from inventory
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

-- 3. Update create_sale to use numeric unit cost
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
  IF NOT (public.is_admin() OR public.has_store_access(p_store_id)) THEN
    RAISE EXCEPTION 'Access Denied to Store';
  END IF;

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

    PERFORM public.register_stock_movement(
      p_product_id := (v_item->>'product_id')::uuid,
      p_store_id := p_store_id,
      p_user_id := p_seller_id,
      p_quantity := -((v_item->>'quantity')::integer),
      p_movement_type := 'sale',
      p_reason := 'POS Checkout #' || substring(v_transaction_id::text from 1 for 8),
      p_sale_id := v_transaction_id,
      p_unit_cost := COALESCE((v_item->>'cost')::numeric, 0)
    );
  END LOOP;

  RETURN v_transaction_id;
END;
$$;

-- 4. Update register_reception to use numeric unit cost
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

    INSERT INTO public.receipts (
        user_id,
        total_cost,
        reference_doc,
        created_at,
        status,
        store_id,
        supplier,
        reception_date
    ) VALUES (
        v_user_id,
        0,
        FORMAT('%s | %s', TRIM(p_supplier), TRIM(p_invoice_number)),
        now(),
        'active',
        p_store_id,
        p_supplier,
        p_reception_date
    )
    RETURNING id INTO v_reception_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_unit_cost := (v_item->>'unit_cost')::NUMERIC;

        INSERT INTO public.receipt_items (
            receipt_id,
            product_id,
            quantity,
            unit_cost,
            created_at
        ) VALUES (
            v_reception_id,
            v_product_id,
            v_quantity,
            v_unit_cost,
            now()
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

-- 5. Update process_inventory_adjustment to use numeric unit cost
CREATE OR REPLACE FUNCTION public.process_inventory_adjustment(
  p_store_id uuid,
  p_cashier_id uuid,
  p_items public.adjustment_item[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_adjustment_id uuid;
  v_sale_id uuid;
  v_item public.adjustment_item;
  v_decomp_item public.variant_decomposition;
  v_difference integer;
  v_total_sale_amount numeric := 0;
  v_variant_price numeric;
  v_cost_at_sale numeric;
BEGIN
  INSERT INTO public.inventory_adjustments (store_id, created_by, status, reason)
  VALUES (p_store_id, p_cashier_id, 'PROCESSING', 'STOCKTAKE_SHRINKAGE')
  RETURNING id INTO v_adjustment_id;

  INSERT INTO public.sales (cashier_id, payment_method, total_amount, status)
  VALUES (p_cashier_id, 'other', 0, 'completed')
  RETURNING id INTO v_sale_id;

  FOREACH v_item IN ARRAY p_items
  LOOP
    v_difference := v_item.counted_quantity - v_item.expected_quantity;

    INSERT INTO public.inventory_adjustment_items (adjustment_id, product_id, expected_quantity, counted_quantity)
    VALUES (v_adjustment_id, v_item.product_id, v_item.expected_quantity, v_item.counted_quantity);

    IF v_difference < 0 THEN
      IF v_item.decomposition IS NOT NULL THEN
        FOREACH v_decomp_item IN ARRAY v_item.decomposition
        LOOP
          SELECT price, (SELECT cost_price FROM public.products WHERE id = v_item.product_id)
          INTO v_variant_price, v_cost_at_sale
          FROM public.product_variants WHERE id = v_decomp_item.variant_id;

          INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price_sold, cost_at_sale)
          VALUES (v_sale_id, v_item.product_id, v_decomp_item.quantity, v_variant_price, v_cost_at_sale);

          v_total_sale_amount := v_total_sale_amount + (v_decomp_item.quantity * v_variant_price);

          PERFORM public.register_stock_movement(
            p_product_id := v_item.product_id,
            p_store_id := p_store_id,
            p_user_id := p_cashier_id,
            p_quantity := -v_decomp_item.quantity,
            p_movement_type := 'sale',
            p_reason := 'adj:' || v_adjustment_id::text,
            p_sale_id := v_sale_id,
            p_unit_cost := COALESCE(v_cost_at_sale, 0)
          );
        END LOOP;
      END IF;
    ELSIF v_difference > 0 THEN
      PERFORM public.register_stock_movement(
        p_product_id := v_item.product_id,
        p_store_id := p_store_id,
        p_user_id := p_cashier_id,
        p_quantity := v_difference,
        p_movement_type := 'adjustment',
        p_reason := 'adj:' || v_adjustment_id::text,
        p_sale_id := NULL,
        p_unit_cost := 0
      );
    END IF;
  END LOOP;

  UPDATE public.sales
  SET total_amount = v_total_sale_amount
  WHERE id = v_sale_id;

  UPDATE public.inventory_adjustments
  SET status = 'COMPLETED'
  WHERE id = v_adjustment_id;

  RETURN v_sale_id;
END;
$$;

COMMIT;
