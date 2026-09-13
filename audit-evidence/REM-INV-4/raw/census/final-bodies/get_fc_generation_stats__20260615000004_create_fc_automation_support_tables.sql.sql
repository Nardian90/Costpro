-- DECLARED FINAL STATE (Git) de get_fc_generation_stats
-- fuente: 20260615000004_create_fc_automation_support_tables.sql stmt#44

CREATE OR REPLACE FUNCTION public.get_fc_generation_stats(
  p_store_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT (public.is_global_admin() OR public.is_store_member(p_store_id)) THEN
    RAISE EXCEPTION 'Sin permisos para ver estadísticas de esta tienda';
  END IF;

  SELECT jsonb_build_object(
    'total_generations', COUNT(*),
    'successful', COUNT(*) FILTER (WHERE status = 'success'),
    'failed', COUNT(*) FILTER (WHERE status = 'failed'),
    'skipped', COUNT(*) FILTER (WHERE status = 'skipped'),
    'avg_generation_time_ms', ROUND(AVG(generation_time_ms)::numeric, 1),
    'by_trigger', jsonb_object_agg(
      triggered_by,
      COUNT(*) FILTER (WHERE triggered_by = fc_generation_log.triggered_by)
    )
  ) INTO v_result
  FROM fc_generation_log
  WHERE store_id = p_store_id
    AND created_at > now() - (p_days || ' days')::interval;

  RETURN v_result;
END;
$$
