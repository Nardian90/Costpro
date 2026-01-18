-- Migration: Update process_inventory_adjustment function for full sales logic
-- Date: 2024-08-01

BEGIN;

-- Drop the old function and type to recreate them
DROP FUNCTION IF EXISTS public.process_inventory_adjustment(uuid, uuid, public.adjustment_item[]);
DROP TYPE IF EXISTS public.adjustment_item;
DROP TYPE IF EXISTS public.variant_decomposition;

-- Create a new type for the variant decomposition
CREATE TYPE public.variant_decomposition AS (
  variant_id uuid,
  quantity integer
);

-- Recreate the adjustment_item type to include the decomposition
CREATE TYPE public.adjustment_item AS (
  product_id uuid,
  expected_quantity integer,
  counted_quantity integer,
  decomposition public.variant_decomposition[]
);

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
  -- 1. Create a new inventory adjustment record
  INSERT INTO public.inventory_adjustments (store_id, created_by, status, reason)
  VALUES (p_store_id, p_cashier_id, 'PROCESSING', 'STOCKTAKE_SHRINKAGE')
  RETURNING id INTO v_adjustment_id;

  -- 2. Create a single sale record for all shortages
  INSERT INTO public.sales (cashier_id, payment_method, total_amount, status)
  VALUES (p_cashier_id, 'other', 0, 'completed') -- Initial total is 0
  RETURNING id INTO v_sale_id;

  -- 3. Loop through each item provided
  FOREACH v_item IN ARRAY p_items
  LOOP
    v_difference := v_item.counted_quantity - v_item.expected_quantity;

    INSERT INTO public.inventory_adjustment_items (adjustment_id, product_id, expected_quantity, counted_quantity)
    VALUES (v_adjustment_id, v_item.product_id, v_item.expected_quantity, v_item.counted_quantity);

    IF v_difference < 0 THEN
      -- Shortage: Process the decomposition and create sale_items
      IF v_item.decomposition IS NOT NULL THEN
        FOREACH v_decomp_item IN ARRAY v_item.decomposition
        LOOP
          -- Get variant price and product cost
          SELECT price, (SELECT cost_price FROM public.products WHERE id = v_item.product_id)
          INTO v_variant_price, v_cost_at_sale
          FROM public.product_variants WHERE id = v_decomp_item.variant_id;

          -- Insert sale item
          INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price_sold, cost_at_sale)
          VALUES (v_sale_id, v_item.product_id, v_decomp_item.quantity, v_variant_price, v_cost_at_sale);

          -- Update total sale amount
          v_total_sale_amount := v_total_sale_amount + (v_decomp_item.quantity * v_variant_price);

          -- Register stock movement
          PERFORM public.register_stock_movement(
            p_store_id,
            v_item.product_id,
            v_decomp_item.variant_id,
            -v_decomp_item.quantity, -- Negative quantity for sale
            'SALE',
            'adj:' || v_adjustment_id::text,
            p_cashier_id,
            NULL
          );
        END LOOP;
      END IF;
    ELSIF v_difference > 0 THEN
      -- Surplus: Register a positive stock movement
      PERFORM public.register_stock_movement(
        p_store_id,
        v_item.product_id,
        NULL, -- No specific variant for surplus
        v_difference,
        'ADJUSTMENT_SURPLUS',
        'adj:' || v_adjustment_id::text,
        p_cashier_id,
        NULL
      );

      -- Log audit event for surplus
      INSERT INTO public.audit_logs (user_id, table_name, record_id, action, metadata)
      VALUES (
        p_cashier_id,
        'inventory_adjustments',
        v_adjustment_id,
        'SURPLUS',
        jsonb_build_object(
          'product_id', v_item.product_id,
          'quantity', v_difference
        )
      );
    END IF;
  END LOOP;

  -- 4. Update the total amount on the sale record
  UPDATE public.sales
  SET total_amount = v_total_sale_amount
  WHERE id = v_sale_id;

  -- 5. Mark the adjustment as completed
  UPDATE public.inventory_adjustments
  SET status = 'COMPLETED'
  WHERE id = v_adjustment_id;

  RETURN v_sale_id;
END;
$$;

-- Grant execution rights to the authenticated role
GRANT EXECUTE ON FUNCTION public.process_inventory_adjustment(uuid, uuid, public.adjustment_item[]) TO authenticated;

COMMIT;
