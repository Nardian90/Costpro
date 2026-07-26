-- V2.5.3 — Ajustes finales tras tests BOLA fix
--
-- 1. create_transfer: el INSERT usaba auth.uid() para created_by, que es NULL
--    cuando se llama con service_role. Usar v_caller_uid (que ya definimos).
--
-- 2. perform_inventory_adjustment: eliminar la versión con p_tasa_cambio
--    (no se usa en el código actual y causa ambigüedad en Supabase client).

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Reescribir create_transfer con v_caller_uid en el INSERT
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_transfer(
  p_origin_store_id uuid,
  p_destination_store_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_transaction_id uuid DEFAULT NULL,
  p_operation_date timestamp with time zone DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_transfer_id UUID := COALESCE(p_transaction_id, gen_random_uuid());
    v_item RECORD;
    v_server_unit_cost NUMERIC;
    v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
    v_caller_uid UUID := auth.uid();
BEGIN
    -- V2.5 H1a: autorización BOLA
    IF v_caller_uid IS NOT NULL THEN
      IF NOT public.has_store_access(p_origin_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED_ORIGIN';
      END IF;
      IF NOT public.has_store_access(p_destination_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED_DESTINATION';
      END IF;
    END IF;

    PERFORM public.validate_transfer_operation_date(p_operation_date, p_origin_store_id, p_destination_store_id);

    -- V2.5.3: usar COALESCE(v_caller_uid, '00000000-...') o NULL explícito
    -- La columna created_by es NOT NULL, así que si v_caller_uid es NULL
    -- (service_role), usamos un UUID sentinela del sistema.
    INSERT INTO public.transfers (
      id, origin_store_id, destination_store_id, created_by, notes, tenant_id, created_at
    )
    VALUES (
      v_transfer_id, p_origin_store_id, p_destination_store_id,
      COALESCE(v_caller_uid, '00000000-0000-0000-0000-000000000000'::uuid),
      p_notes,
      (SELECT tenant_id FROM public.stores WHERE id = p_origin_store_id),
      v_effective_date
    );

    FOR v_item IN
      SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        quantity NUMERIC,
        unit_cost NUMERIC,
        tasa_cambio NUMERIC
      )
    LOOP
        SELECT cost_average INTO v_server_unit_cost
        FROM public.products
        WHERE id = v_item.product_id AND store_id = p_origin_store_id;
        IF v_server_unit_cost IS NULL THEN
          v_server_unit_cost := 0;
        END IF;

        INSERT INTO public.transfer_items (transfer_id, product_id, quantity, unit_cost, created_at)
        VALUES (v_transfer_id, v_item.product_id, v_item.quantity, v_server_unit_cost, v_effective_date);
    END LOOP;
    RETURN v_transfer_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Eliminar perform_inventory_adjustment con p_tasa_cambio (no usada)
-- ──────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.perform_inventory_adjustment(uuid, uuid, numeric, text, uuid, numeric, timestamp with time zone, numeric) CASCADE;

NOTIFY pgrst, 'reload schema';
