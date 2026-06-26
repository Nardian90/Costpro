-- ════════════════════════════════════════════════════════════════════
-- FIX P0: Versionar has_store_access() — función crítica que existía en BD
-- pero no estaba en migraciones. Sin esto, fresh deploy = sistema roto.
-- ════════════════════════════════════════════════════════════════════

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
$function$;

-- También versionar is_admin() si no está en migraciones
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
END;
$function$;

-- has_store_role(p_store_id, p_roles) — usada en RLS policies
CREATE OR REPLACE FUNCTION public.has_store_role(p_store_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid()
      AND m.store_id = p_store_id
      AND m.status = 'active'
      AND m.role::text = ANY(p_roles)
  );
END;
$function$;

COMMENT ON FUNCTION public.has_store_access(uuid) IS 'Verifica si el usuario actual tiene acceso a la tienda. Admin global = true. Otherwise chequea membership activa.';
COMMENT ON FUNCTION public.is_admin() IS 'Verifica si el usuario actual es admin global.';
COMMENT ON FUNCTION public.has_store_role(uuid, text[]) IS 'Verifica si el usuario tiene uno de los roles especificados en la tienda.';
