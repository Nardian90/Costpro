CREATE OR REPLACE FUNCTION public.has_store_access_as(p_user_id uuid, p_store_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF p_user_id IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;

    -- [HSAA-20261027] Nivel administrativo de plataforma (admin|superadmin)
    -- delegado al check central is_admin_check(p_user_id) — la misma fuente
    -- confiable de is_admin()/RLS. Antes: v_role = 'admin' estricto, que
    -- rechazaba falsamente al superadmin (sin membresías por diseño).
    IF public.is_admin_check(p_user_id) THEN RETURN true; END IF;

    -- Check membership (usuarios operativos — semántica sin cambios)
    RETURN EXISTS (
        SELECT 1 FROM public.user_store_memberships
        WHERE user_id = p_user_id AND store_id = p_store_id AND status = 'active'
    );
END;
$function$;
