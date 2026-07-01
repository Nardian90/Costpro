-- Migration: Fix inventory immutability and synchronize stock movement logic
-- Date: 2026-01-15

BEGIN;

-- 1. Redefine the trigger function for stock movements to handle inventory updates properly
CREATE OR REPLACE FUNCTION public.fn_sync_inventory_on_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_new_qty integer;
BEGIN
    -- Upsert: Inserta el registro de inventario si no existe para ese producto/tienda
    -- Si ya existe, suma el cambio (positivo o negativo) e incrementa la versión
    INSERT INTO public.inventory (store_id, product_id, quantity, version, updated_at)
    VALUES (NEW.store_id, NEW.product_id, NEW.quantity_change, 1, now())
    ON CONFLICT (store_id, product_id)
    DO UPDATE SET
        quantity = public.inventory.quantity + EXCLUDED.quantity,
        version = public.inventory.version + 1,
        updated_at = now()
    RETURNING quantity INTO v_new_qty;

    -- Update balance_after in stock_movements
    NEW.balance_after := v_new_qty;

    RETURN NEW;
END;
$function$;

-- 2. Update register_stock_movement to NOT update inventory directly
CREATE OR REPLACE FUNCTION public.register_stock_movement(
  p_store_id uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_quantity_change integer,
  p_movement_type text,
  p_reference_doc text,
  p_created_by uuid,
  p_inventory_version integer DEFAULT NULL,
  p_reference_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $body$
DECLARE
  v_new_qty integer;
  v_new_version integer;
  v_res jsonb;
BEGIN
  -- Optimistic locking check
  IF p_inventory_version IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.inventory
      WHERE store_id = p_store_id
        AND product_id = p_product_id
        AND version = p_inventory_version
    ) THEN
      RAISE EXCEPTION 'Concurrency error: Inventory version mismatch';
    END IF;
  END IF;

  -- Insert movement. This will fire tr_sync_inventory_after_movement
  -- which in turn updates the inventory table.
  INSERT INTO public.stock_movements(
    store_id, product_id, variant_id, quantity_change, movement_type, reference_id, reference_doc, movement_date, created_by, created_at
  ) VALUES (
    p_store_id, p_product_id, p_variant_id, p_quantity_change, p_movement_type::public.movement_type, p_reference_id, p_reference_doc, now(), p_created_by, now()
  );

  -- Retrieve the updated quantity and version from inventory
  -- These were updated by the trigger during the INSERT above
  SELECT quantity, version INTO v_new_qty, v_new_version
  FROM public.inventory
  WHERE store_id = p_store_id AND product_id = p_product_id;

  v_res := jsonb_build_object('status', 'ok', 'new_quantity', v_new_qty, 'new_version', v_new_version);
  RETURN v_res;
END;
$body$;

-- 3. Update create_sale to use the updated register_stock_movement
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
      p_store_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'variant_id')::uuid,
      -((v_item->>'quantity')::integer),
      'sale',
      'Venta #' || substring(v_transaction_id::text from 1 for 8),
      p_seller_id,
      NULL, -- p_inventory_version
      v_transaction_id::text -- p_reference_id
    );
  END LOOP;

  RETURN v_transaction_id;
END;
$$;

-- 4. Update register_reception to be compliant
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

    -- Process items
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

        -- Use register_stock_movement
        PERFORM public.register_stock_movement(
            p_store_id,
            v_product_id,
            NULL,
            v_quantity,
            'purchase',
            'Factura: ' || p_invoice_number,
            v_user_id,
            NULL,
            v_reception_id::TEXT
        );

        v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
    END LOOP;

    UPDATE public.receipts SET total_cost = v_total_cost WHERE id = v_reception_id;

    RETURN v_reception_id;
END;
$$;

-- 5. Update cancel_reception to be compliant
CREATE OR REPLACE FUNCTION public.cancel_reception(
    p_reception_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_store_id UUID;
    v_user_id UUID;
    v_item RECORD;
BEGIN
    v_user_id := auth.uid()::UUID;
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    -- Get store_id from receipt
    SELECT store_id INTO v_store_id FROM public.receipts WHERE id = p_reception_id;
    IF v_store_id IS NULL THEN RAISE EXCEPTION 'Reception not found'; END IF;

    -- Register movements to revert stock
    FOR v_item IN SELECT product_id, quantity FROM public.receipt_items WHERE receipt_id = p_reception_id
    LOOP
        PERFORM public.register_stock_movement(
            v_store_id,
            v_item.product_id,
            NULL,
            -v_item.quantity,
            'adjustment',
            'Cancelación de recepción: ' || p_reception_id::TEXT,
            v_user_id,
            NULL,
            p_reception_id::TEXT
        );
    END LOOP;

    -- Mark as voided
    UPDATE public.receipts SET status = 'voided', updated_at = now() WHERE id = p_reception_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Update deduct_stock
CREATE OR REPLACE FUNCTION public.deduct_stock(p_store_id uuid, p_product_id uuid, p_quantity integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  PERFORM public.register_stock_movement(
    p_store_id,
    p_product_id,
    NULL,
    -p_quantity,
    'adjustment',
    'Direct deduction via deduct_stock',
    auth.uid()
  );
END;
$function$;

-- 7. Ensure trigger is BEFORE INSERT
DROP TRIGGER IF EXISTS tr_sync_inventory_after_movement ON public.stock_movements;
CREATE TRIGGER tr_sync_inventory_after_movement
BEFORE INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION fn_sync_inventory_on_movement();

COMMIT;
