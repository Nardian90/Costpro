CREATE OR REPLACE FUNCTION public.can_manage_store_as(p_user_id uuid, p_store_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;
  -- Nivel administrativo de plataforma (admin|superadmin) delegado al check
  -- central is_admin_check — la misma fuente confiable de is_admin()/RLS
  -- (20261027120000 has_store_access_as_superadmin_policy).
  IF public.is_admin_check(p_user_id) THEN RETURN true; END IF;
  -- Membresía operativa de GESTIÓN en la tienda específica (canManageStore):
  -- clerk/warehouse/usuario/costo NO gestionan.
  RETURN EXISTS (
    SELECT 1 FROM public.user_store_memberships m
    WHERE m.user_id = p_user_id
      AND m.store_id = p_store_id
      AND m.status = 'active'
      AND m.role IN ('admin', 'manager', 'encargado')
  );
END;
$function$;
