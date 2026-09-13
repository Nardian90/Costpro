-- DECLARED FINAL STATE (Git) de detect_orphan_users
-- fuente: 20260805000014_v2_14_14_detect_reconcile_orphans.sql stmt#1

CREATE OR REPLACE FUNCTION public.detect_orphan_users()
RETURNS TABLE(
  auth_user_id uuid,
  email text,
  detected_at timestamptz,
  log_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_orphan RECORD;
BEGIN
  -- Solo admin puede ejecutar
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins can detect orphan users.';
  END IF;

  -- Registrar nuevos huérfanos (idempotente por UNIQUE auth_user_id)
  FOR v_orphan IN
    SELECT au.id, au.email
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE p.id IS NULL
  LOOP
    INSERT INTO public.orphaned_users_log (auth_user_id, email)
    VALUES (v_orphan.id, v_orphan.email)
    ON CONFLICT (auth_user_id) DO NOTHING;
  END LOOP;

  -- Retornar huérfanos actuales con status del log
  RETURN QUERY
    SELECT
      o.auth_user_id,
      o.email,
      o.detected_at,
      o.status
    FROM public.orphaned_users_log o
    WHERE o.status IN ('pending', 'pending_deletion')
    ORDER BY o.detected_at DESC;
END;
$function$
