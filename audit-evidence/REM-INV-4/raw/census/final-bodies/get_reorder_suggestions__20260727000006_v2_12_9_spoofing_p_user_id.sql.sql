-- DECLARED FINAL STATE (Git) de get_reorder_suggestions
-- fuente: 20260727000006_v2_12_9_spoofing_p_user_id.sql stmt#17

CREATE OR REPLACE FUNCTION public.get_reorder_suggestions(p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF NOT public.has_store_access_as(v_uid, p_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'product_id', p.id, 'product_name', p.name, 'sku', p.sku,
      'current_stock', p.stock_current,
      'suggested_quantity', CASE
        WHEN abc.classification = 'A' THEN GREATEST(50, 100 - p.stock_current)
        WHEN abc.classification = 'B' THEN GREATEST(20, 50 - p.stock_current)
        ELSE GREATEST(10, 20 - p.stock_current)
      END,
      'abc_class', COALESCE(abc.classification, 'C'),
      'priority', CASE
        WHEN COALESCE(abc.classification, 'C') = 'A' AND p.stock_current <= 5 THEN 'critical'
        WHEN COALESCE(abc.classification, 'C') = 'A' THEN 'high'
        WHEN COALESCE(abc.classification, 'C') = 'B' AND p.stock_current <= 0 THEN 'high'
        WHEN p.stock_current <= 0 THEN 'medium'
        ELSE 'low'
      END
    )), '[]'::jsonb)
    FROM public.products p
    LEFT JOIN LATERAL (
      SELECT classification FROM public.abc_classifications
      WHERE store_id = p.store_id AND product_id = p.id
        AND period_year = EXTRACT(YEAR FROM now())::int
        AND period_month = EXTRACT(MONTH FROM now())::int
      LIMIT 1
    ) abc ON true
    WHERE p.store_id = p_store_id AND p.is_active = true
      AND p.stock_current <= CASE
        WHEN abc.classification = 'A' THEN 10
        WHEN abc.classification = 'B' THEN 5
        ELSE 0
      END
  );
END;
$function$
