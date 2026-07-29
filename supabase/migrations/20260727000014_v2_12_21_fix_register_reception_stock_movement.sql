-- ════════════════════════════════════════════════════════════════════════
-- V2.12.21 — Fix register_reception: p_reference_doc → p_notes (signature mismatch)
--
-- Bug: register_reception llama register_stock_movement con el parámetro
-- nombrado `p_reference_doc` que NO existe en la firma actual de
-- register_stock_movement. La firma correcta tiene `p_notes` (parámetro #10)
-- y `p_sale_id` (parámetro #8, UUID — no text).
--
-- Firma actual de register_stock_movement:
--   (p_product_id uuid, p_store_id uuid, p_quantity numeric, p_movement_type text,
--    p_reason text, p_user_id uuid, p_variant_id uuid, p_sale_id uuid,
--    p_unit_cost numeric, p_notes text, p_operation_date timestamptz,
--    p_skip_access_check boolean)
--
-- Error al llamar register_reception:
--   42883: function public.register_stock_movement(p_product_id := uuid, ...)
--   No function matches the given name and argument types.
--
-- Fix: cambiar `p_reference_doc := v_receipt_id::text` → `p_notes := v_receipt_id::text`
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.register_reception(
  p_store_id uuid,
  p_supplier text,
  p_reception_date timestamp with time zone DEFAULT now(),
  p_invoice_number text DEFAULT ''::text,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_receipt_id UUID := gen_random_uuid();
  v_caller_uid UUID := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_user_id UUID := COALESCE(v_caller_uid, '00000000-0000-0000-0000-000000000000'::uuid);
  v_total_cost NUMERIC := 0;
  v_item JSONB;
  v_product_id UUID;
  v_quantity NUMERIC;
  v_unit_cost NUMERIC;
  v_moneda TEXT;
  v_tasa NUMERIC;
  v_unit_cost_cup NUMERIC;
  v_variant_id UUID;
  v_conversion_factor integer := 1;
  v_units_to_add integer;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_reception_date, NOW());
BEGIN
  PERFORM public.validate_operation_date(p_reception_date, p_store_id);

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized store access';
  END IF;

  INSERT INTO public.receipts (
    id, store_id, user_id, supplier, reception_date,
    reference_doc, total_cost, status, created_at, updated_at
  ) VALUES (
    v_receipt_id, p_store_id, v_user_id, p_supplier,
    v_effective_date, p_invoice_number, 0, 'active', v_effective_date, v_effective_date
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC;
    v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0);
    v_moneda := COALESCE(v_item->>'moneda_recepcion', 'CUP');
    v_tasa := COALESCE((v_item->>'tasa_cambio_recepcion')::NUMERIC, 1.0);

    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_conversion_factor := 1;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;

    v_units_to_add := v_quantity * v_conversion_factor;
    v_unit_cost_cup := v_unit_cost * v_tasa;

    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND store_id = p_store_id
    ) THEN
      RAISE NOTICE 'Producto % no encontrado o no pertenece a la tienda, saltando', v_product_id;
      CONTINUE;
    END IF;

    INSERT INTO public.receipt_items (
      receipt_id, product_id, variant_id, quantity, unit_cost,
      moneda_recepcion, tasa_cambio_recepcion,
      created_at, updated_at
    ) VALUES (
      v_receipt_id, v_product_id, v_variant_id, v_quantity, v_unit_cost,
      v_moneda, v_tasa,
      v_effective_date, v_effective_date
    );

    -- V2.12.21 FIX: p_reference_doc no existe en register_stock_movement.
    -- La firma correcta usa p_notes (text, #10) y p_sale_id (uuid, #8).
    -- Pasamos el receipt_id como p_notes (referencia del documento).
    PERFORM public.register_stock_movement(
      p_product_id := v_product_id,
      p_store_id := p_store_id,
      p_quantity := v_units_to_add,
      p_movement_type := 'purchase',
      p_reason := 'Recepción de mercancía',
      p_user_id := v_caller_uid,
      p_variant_id := NULL,
      p_sale_id := NULL,
      p_unit_cost := v_unit_cost_cup,
      p_notes := v_receipt_id::text,
      p_operation_date := v_effective_date,
      p_skip_access_check := TRUE
    );

    -- register_stock_movement ya actualiza inventory.quantity + products.stock_current
    -- via triggers internos, pero también actualizamos cost_average aquí.
    UPDATE public.products
      SET cost_average = CASE
            WHEN stock_current > 0 THEN
              ((stock_current * cost_average) + (v_units_to_add * v_unit_cost_cup)) / (stock_current)
            ELSE v_unit_cost_cup
          END,
          updated_at = NOW()
      WHERE id = v_product_id;

    v_total_cost := v_total_cost + (v_unit_cost_cup * v_quantity);
  END LOOP;

  UPDATE public.receipts SET total_cost = v_total_cost WHERE id = v_receipt_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REGISTER_RECEPTION', 'receipts', v_receipt_id, p_store_id, v_caller_uid,
    jsonb_build_object('supplier', p_supplier, 'total_cost', v_total_cost, 'items_count', jsonb_array_length(p_items)));

  RETURN v_receipt_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.register_reception(uuid, text, timestamp with time zone, text, jsonb, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_reception(uuid, text, timestamp with time zone, text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_reception(uuid, text, timestamp with time zone, text, jsonb, uuid) TO service_role;

COMMENT ON FUNCTION public.register_reception(uuid, text, timestamp with time zone, text, jsonb, uuid) IS
'V2.12.21: fix p_reference_doc → p_notes en llamada a register_stock_movement. V2.12.16: anti-spoofing. V2.12.9: anti-spoofing guard.';

NOTIFY pgrst, 'reload schema';

COMMIT;
