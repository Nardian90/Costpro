-- Migration: Crear RPC `register_reception` (ejemplo completo)
-- Fecha: 2026-01-12

/*
  Propósito:
  - Registrar una recepción (receipt + receipt_items)
  - Insertar movimientos de stock por cada item
  - Actualizar inventario de forma atómica
  - Retornar resumen de la operación

  Revisa nombres/columnas y tipos según tu esquema real antes de desplegar.
*/

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'register_reception') THEN
    EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.register_reception(
      p_store_id uuid,
      p_supplier text,
      p_reception_date date,
      p_invoice_number text,
      p_items jsonb,
      p_user_id uuid
    ) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $body$
    DECLARE
      v_receipt_id uuid;
      v_item jsonb;
      v_product_id uuid;
      v_qty integer;
      v_unit_cost numeric;
      v_new_qty integer;
      v_mov jsonb;
      v_res jsonb := jsonb_build_object('status','ok','items',jsonb_build_array());
    BEGIN
      -- Crear receipt
      v_receipt_id := gen_random_uuid();
      INSERT INTO public.receipts(id, created_at, user_id, status, total_cost, reference_doc, notes)
      VALUES (v_receipt_id, now(), p_user_id, 'active', 0, p_invoice_number, p_supplier);

      -- Iterar items: p_items expected as JSON array of objects {product_id, quantity, unit_cost}
      FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
      LOOP
        v_product_id := (v_item->>'product_id')::uuid;
        v_qty := (v_item->>'quantity')::int;
        v_unit_cost := (v_item->>'unit_cost')::numeric;

        -- Insert receipt item
        INSERT INTO public.receipt_items(id, receipt_id, product_id, quantity, unit_cost, created_at)
        VALUES (gen_random_uuid(), v_receipt_id, v_product_id, v_qty, v_unit_cost, now());

        -- Insert movimiento de stock
        INSERT INTO public.stock_movements(id, store_id, product_id, variant_id, quantity_change, movement_type, reference_id, reference_doc, movement_date, created_by, created_at)
        VALUES (gen_random_uuid(), p_store_id, v_product_id, NULL, v_qty, 'purchase'::public.movement_type, v_receipt_id::text, p_invoice_number, now(), p_user_id, now());

        -- Upsert inventory
        INSERT INTO public.inventory (id, store_id, product_id, quantity, updated_at)
        VALUES (gen_random_uuid(), p_store_id, v_product_id, v_qty, now())
        ON CONFLICT (store_id, product_id) DO UPDATE
        SET quantity = public.inventory.quantity + EXCLUDED.quantity,
            updated_at = now();

        -- Obtener nuevo balance
        SELECT quantity INTO v_new_qty FROM public.inventory WHERE store_id = p_store_id AND product_id = v_product_id;

        -- Añadir info al resultado
        v_mov := jsonb_build_object('product_id', v_product_id, 'quantity_added', v_qty, 'new_quantity', v_new_qty);
        v_res := jsonb_set(v_res, '{items}', (v_res->'items') || jsonb_build_array(v_mov));
      END LOOP;

      -- Actualizar total_cost en receipt (opcional)
      UPDATE public.receipts SET total_cost = (
        SELECT COALESCE(SUM(quantity * unit_cost),0) FROM public.receipt_items WHERE receipt_id = v_receipt_id
      ) WHERE id = v_receipt_id;

      v_res := jsonb_set(v_res, '{receipt_id}', to_jsonb(v_receipt_id));
      RETURN v_res;
    END;
    $body$;
    $fn$;
  END IF;
END$$;

COMMIT;
