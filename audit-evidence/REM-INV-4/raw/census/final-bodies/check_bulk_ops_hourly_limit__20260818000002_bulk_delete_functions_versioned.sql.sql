-- DECLARED FINAL STATE (Git) de check_bulk_ops_hourly_limit
-- fuente: 20260818000002_bulk_delete_functions_versioned.sql stmt#3

CREATE OR REPLACE FUNCTION public.check_bulk_ops_hourly_limit(p_user_id uuid, p_plan text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
BEGIN
  v_limit := CASE p_plan
    WHEN 'free' THEN 1
    WHEN 'pro' THEN 20
    WHEN 'enterprise' THEN 999999
    ELSE 1
  END;

  SELECT COUNT(*) INTO v_used
  FROM public.bulk_ops_log
  WHERE user_id = p_user_id
    AND initiated_at > NOW() - INTERVAL '1 hour';

  RETURN jsonb_build_object(
    'allowed', v_used < v_limit,
    'used', v_used,
    'limit', v_limit,
    'remaining', GREATEST(0, v_limit - v_used)
  );
END;
$function$


 
REVOKE EXECUTE ON FUNCTION public.check_bulk_ops_hourly_limit FROM PUBLIC, anon, authenticated
