-- V2.10.3 — FIX: create_transfer valida que productos existan en store origen
--
-- BUG ENCONTRADO EN PRUEBAS LIVE:
-- Si el cliente envía un product_id que no existe en el store de origen,
-- el INSERT de transfer_items falla con FK violation → 500 genérico.
-- Esto da mala UX al usuario.
--
-- FIX: validar productos antes de insertar. Si alguno no existe, devolver
-- error 400-friendly con el product_id problemático.

CREATE OR REPLACE FUNCTION public.create_transfer(
  p_origin_store_id uuid,
  p_destination_store_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_transaction_id uuid DEFAULT NULL,
  p_operation_date timestamp with time zone DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
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
    v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
    v_product_exists BOOLEAN;
BEGIN
    -- V2.5 H1a: autorización BOLA
    IF v_caller_uid IS NOT NULL THEN
      IF NOT public.has_store_access_as(v_caller_uid, p_origin_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED_ORIGIN';
      END IF;
      IF NOT public.has_store_access_as(v_caller_uid, p_destination_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED_DESTINATION';
      END IF;
    END IF;

    PERFORM public.validate_transfer_operation_date(p_operation_date, p_origin_store_id, p_destination_store_id);

    -- V2.10.3: validar que TODOS los productos existan en el store de origen
    FOR v_item IN
      SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        quantity NUMERIC,
        unit_cost NUMERIC,
        tasa_cambio NUMERIC
      )
    LOOP
        SELECT EXISTS(
          SELECT 1 FROM public.products WHERE id = v_item.product_id AND store_id = p_origin_store_id
        ) INTO v_product_exists;
        IF NOT v_product_exists THEN
          RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: producto % no existe en store origen', v_item.product_id;
        END IF;
    END LOOP;

    INSERT INTO public.transfers (
      id, origin_store_id, destination_store_id, created_by, notes, tenant_id, created_at,
      requires_approval
    )
    VALUES (
      v_transfer_id, p_origin_store_id, p_destination_store_id,
      v_caller_uid,
      p_notes,
      (SELECT tenant_id FROM public.stores WHERE id = p_origin_store_id),
      v_effective_date,
      public.transfer_requires_approval(p_origin_store_id, p_destination_store_id, p_items)
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

GRANT EXECUTE ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
