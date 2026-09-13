-- DECLARED FINAL STATE (Git) de record_counted_quantity
-- fuente: 20260727000008_v2_12_12_fix_is_not_null_pattern.sql stmt#13

CREATE OR REPLACE FUNCTION public.record_counted_quantity(p_count_id uuid, p_product_id uuid, p_counted_quantity numeric, p_user_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store_id UUID;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT store_id INTO v_store_id FROM public.physical_counts WHERE id = p_count_id;
  IF v_store_id IS NULL THEN RAISE EXCEPTION 'ERR_COUNT_NOT_FOUND'; END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  UPDATE public.physical_count_items
    SET counted_quantity = p_counted_quantity,
        counted_at = NOW(),
        notes = COALESCE(p_notes, notes)
    WHERE count_id = p_count_id AND product_id = p_product_id;

  RETURN jsonb_build_object('status', 'success', 'count_id', p_count_id, 'product_id', p_product_id);
END;
$function$
