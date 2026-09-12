CREATE OR REPLACE FUNCTION public.receive_purchase(p_purchase_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  r record;
  v_store_id uuid;
BEGIN
  SELECT store_id INTO v_store_id FROM public.purchase_orders WHERE id = p_purchase_id;

  FOR r IN
    SELECT * FROM public.purchase_items WHERE purchase_order_id = p_purchase_id
  LOOP
    -- Actualizar inventario
    INSERT INTO public.inventory (store_id, product_id, quantity, updated_at)
    VALUES (v_store_id, r.product_id, r.quantity, timezone('utc', now()))
    ON CONFLICT (store_id, product_id)
    DO UPDATE SET quantity = public.inventory.quantity + r.quantity,
                  updated_at = timezone('utc', now());

    -- Movimiento de stock con costo
    INSERT INTO public.stock_movements (
      store_id,
      product_id,
      quantity_change,
      movement_type,
      reference_id,
      created_at
    ) VALUES (
      v_store_id,
      r.product_id,
      r.quantity,
      'purchase',
      p_purchase_id::text,
      timezone('utc', now())
    );
  END LOOP;

  -- Cambiar estado de orden
  UPDATE public.purchase_orders
  SET status = 'received', received_at = timezone('utc', now())
  WHERE id = p_purchase_id;
END;
$function$
