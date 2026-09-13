-- DECLARED FINAL STATE (Git) de has_store_access
-- fuente: 20260627000001_versionar_has_store_access.sql stmt#0

CREATE OR REPLACE FUNCTION public.has_store_access(p_store_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR p_store_id IS NULL THEN
    RETURN false;
  END IF;

  -- Admin global tiene acceso a todo
  IF public.is_admin() THEN
    RETURN true;
  END IF;

  -- Verificar membership activa en la tienda
  RETURN EXISTS (
    SELECT 1
    FROM public.user_store_memberships m
    JOIN public.stores s
      ON s.id = m.store_id
    JOIN public.profiles p
      ON p.id = m.user_id
    WHERE m.user_id = v_user_id
      AND m.store_id = p_store_id
      AND m.status::text = 'active'
      AND (
        p.tenant_id IS NULL
        OR s.tenant_id IS NULL
        OR p.tenant_id = s.tenant_id
      )
  );
END;
$function$
