-- ════════════════════════════════════════════════════════════════════════
-- V2.12.16 — Fix register_reception para service_role + has_store_access_as
--
-- Bug auto-infligido por V2.12.9: register_reception usaba has_store_access()
-- que requiere auth.uid() real. service_role (que no tiene auth.uid()) no
-- podía llamar la función, rompiendo scripts server-side automáticos.
--
-- Fix:
--   1. Añadir p_user_id parameter (default NULL) para compatibilidad con scripts.
--   2. Aplicar patrón anti-spoofing de V2.12.9: CASE auth.role() = 'service_role'
--   3. Cambiar has_store_access(p_store_id) → has_store_access_as(v_caller_uid, p_store_id)
--   4. Actualizar v_user_id para usar v_caller_uid (en vez de COALESCE(auth.uid(), 0-uuid))
--
-- Compatibilidad:
--   - Firmas anteriores: register_reception(p_store_id, p_supplier, p_reception_date, p_invoice_number, p_items)
--     siguen funcionando (p_user_id tiene default NULL)
--   - Nuevas llamadas pueden pasar p_user_id explicito (solo efectivo con service_role)
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- Necesario: DROP function antes de CREATE porque añadir un parámetro (aunque
-- tenga default) cambia la firma y PostgreSQL no lo permite con CREATE OR REPLACE.
-- Usamos CASCADE por si hay dependencias (triggers, views).
DROP FUNCTION IF EXISTS public.register_reception(uuid, text, timestamp with time zone, text, jsonb) CASCADE;

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
  -- V2.12.16: anti-spoofing. service_role puede pasar p_user_id explicito;
  -- authenticated siempre usa auth.uid() (ignora p_user_id).
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

  -- V2.12.16: usar has_store_access_as con v_caller_uid (no has_store_access)
  -- para permitir service_role con p_user_id. Anti-spoofing via auth.role() guard.
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

    PERFORM public.register_stock_movement(
      p_product_id := v_product_id,
      p_store_id := p_store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_units_to_add,
      p_movement_type := 'purchase',
      p_reference_doc := v_receipt_id::text,
      p_unit_cost := v_unit_cost_cup,
      p_reason := 'Recepción de mercancía',
      p_operation_date := v_effective_date,
      p_skip_access_check := TRUE
    );

    UPDATE public.products
      SET stock_current = stock_current + v_units_to_add,
          cost_average = CASE
            WHEN stock_current + v_units_to_add > 0 THEN
              ((stock_current * cost_average) + (v_units_to_add * v_unit_cost_cup)) / (stock_current + v_units_to_add)
            ELSE cost_average
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

-- GRANT explicito (defense-in-depth + V2.12.13)
REVOKE EXECUTE ON FUNCTION public.register_reception(uuid, text, timestamp with time zone, text, jsonb, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_reception(uuid, text, timestamp with time zone, text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_reception(uuid, text, timestamp with time zone, text, jsonb, uuid) TO service_role;

-- Mantener compatibilidad hacia atrás: como no podemos tener 2 firmas
-- (overloading con defaults causa error), usamos SOLO la firma 6-arg con
-- p_user_id DEFAULT NULL. Los callers existentes que usan 5 args siguen
-- funcionando porque p_user_id tiene default.
-- NO crear segundo overload (causa "cannot remove parameter defaults").

COMMENT ON FUNCTION public.register_reception(uuid, text, timestamp with time zone, text, jsonb, uuid) IS
'V2.12.16: anti-spoofing p_user_id (CASE auth.role() guard). service_role con p_user_id puede recibir; authenticated siempre usa auth.uid(). Compatibilidad: callers 5-arg siguen funcionando (p_user_id default NULL).';

NOTIFY pgrst, 'reload schema';

COMMIT;
