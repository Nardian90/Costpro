-- ============================================================================
-- Migration: 20260629000002_update_rpc_register_reception_with_currency.sql
-- Objetivo: Actualizar register_reception para aceptar moneda y tasa de cambio
-- ============================================================================

-- Drop y recrear la función con soporte de moneda/tasa por item
-- La firma cambia: ahora lee moneda_recepcion y tasa_cambio_recepcion de cada item
DROP FUNCTION IF EXISTS public.register_reception(uuid, text, timestamp with time zone, text, jsonb);

CREATE OR REPLACE FUNCTION public.register_reception(
  p_store_id uuid,
  p_supplier text,
  p_reception_date timestamptz DEFAULT now(),
  p_invoice_number text DEFAULT '',
  p_items jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_receipt_id UUID := gen_random_uuid();
  v_user_id UUID := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  v_total_cost NUMERIC := 0;
  v_item JSONB;
  v_product_id UUID;
  v_quantity NUMERIC;
  v_unit_cost NUMERIC;
  v_moneda TEXT;
  v_tasa NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_reception_date, NOW());
BEGIN
  -- Validación forward-only locking sobre p_reception_date
  PERFORM public.validate_operation_date(p_reception_date, p_store_id);

  -- Validar acceso a la tienda
  IF NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized store access';
  END IF;

  -- Insertar cabecera de recepción con la fecha efectiva
  INSERT INTO public.receipts (
    id, store_id, user_id, supplier, reception_date,
    reference_doc, total_cost, status, created_at, updated_at
  ) VALUES (
    v_receipt_id, p_store_id, v_user_id, p_supplier,
    v_effective_date, p_invoice_number, 0, 'active', v_effective_date, v_effective_date
  );

  -- Procesar cada item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC;
    v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0);
    -- FIX-COSTEO-DINAMICO: Leer moneda y tasa del item (default CUP/1.0)
    v_moneda := COALESCE(v_item->>'moneda_recepcion', 'CUP');
    v_tasa := COALESCE((v_item->>'tasa_cambio_recepcion')::NUMERIC, 1.0);

    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND store_id = p_store_id
    ) THEN
      RAISE NOTICE 'Producto % no encontrado o no pertenece a la tienda, saltando', v_product_id;
      CONTINUE;
    END IF;

    -- FIX-COSTEO-DINAMICO: Insertar con moneda y tasa de cambio
    INSERT INTO public.receipt_items (
      receipt_id, product_id, quantity, unit_cost,
      moneda_recepcion, tasa_cambio_recepcion,
      created_at, updated_at
    ) VALUES (
      v_receipt_id, v_product_id, v_quantity, v_unit_cost,
      v_moneda, v_tasa,
      v_effective_date, v_effective_date
    );

    PERFORM public.register_stock_movement(
      p_product_id := v_product_id,
      p_store_id := p_store_id,
      p_user_id := v_user_id,
      p_quantity := v_quantity,
      p_movement_type := 'purchase',
      p_reason := p_invoice_number || ' - ' || p_supplier,
      p_unit_cost := v_unit_cost,
      p_sale_id := v_receipt_id,
      p_operation_date := v_effective_date
    );

    v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
  END LOOP;

  UPDATE public.receipts SET total_cost = v_total_cost WHERE id = v_receipt_id;
  RETURN v_receipt_id;
END;
$function$;

COMMENT ON FUNCTION public.register_reception IS
  'Registra una recepción con items. Cada item puede tener moneda_recepcion y tasa_cambio_recepcion. Default: CUP/1.0.';
