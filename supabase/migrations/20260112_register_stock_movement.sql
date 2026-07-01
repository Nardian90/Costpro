-- Migration: Crear RPC `register_stock_movement` (ejemplo)
-- Fecha: 2026-01-12

/*
  Esta función registra un movimiento de stock de forma atómica:
  - Inserta en `stock_movements`
  - Actualiza `inventory` (upsert) sumando quantity_change
  - Retorna metadata sobre la operación
  Revisa y ajusta tipos/nombres según tu esquema real antes de desplegar.
*/

BEGIN;

-- Crear la función si no existe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'register_stock_movement') THEN
    EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.register_stock_movement(
      p_store_id uuid,
      p_product_id uuid,
      p_variant_id uuid,
      p_quantity_change integer,
      p_movement_type text,
      p_reference_doc text,
      p_created_by uuid
    ) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $body$
    DECLARE
      v_inventory_id uuid;
      v_new_qty integer;
      v_res jsonb;
    BEGIN
      -- Insertar movimiento
      INSERT INTO public.stock_movements(
        store_id, product_id, variant_id, quantity_change, movement_type, reference_doc, movement_date, created_by, created_at
      ) VALUES (
        p_store_id, p_product_id, p_variant_id, p_quantity_change, p_movement_type::public.movement_type, p_reference_doc, now(), p_created_by, now()
      );

      -- Upsert inventario: si existe fila, sumar quantity_change; si no, crear nueva
      INSERT INTO public.inventory (id, store_id, product_id, quantity, updated_at)
      VALUES (gen_random_uuid(), p_store_id, p_product_id, GREATEST(p_quantity_change,0), now())
      ON CONFLICT (store_id, product_id) DO UPDATE
      SET quantity = public.inventory.quantity + EXCLUDED.quantity,
          updated_at = now();

      -- Obtener nuevo balance
      SELECT quantity INTO v_new_qty FROM public.inventory WHERE store_id = p_store_id AND product_id = p_product_id;

      v_res := jsonb_build_object('status','ok','new_quantity',v_new_qty);
      RETURN v_res;
    END;
    $body$;
    $fn$;
  END IF;
END$$;

COMMIT;
