-- REM-INV-4B — 02 VERBATIM LIVE definitions (pg_get_functiondef, captured PRE-fix)

-- ══════ LIVE pg_get_functiondef: current_user_store_ids ══════
CREATE OR REPLACE FUNCTION public.current_user_store_ids()
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result uuid[];
BEGIN
  IF public.is_admin() THEN
    SELECT array_agg(id) INTO v_result
    FROM public.stores
    WHERE tenant_id = public.current_user_tenant_id()
      AND is_active = true;
  ELSE
    SELECT array_agg(store_id) INTO v_result
    FROM public.user_store_memberships
    WHERE user_id = auth.uid()
      AND status = 'active';
  END IF;
  RETURN COALESCE(v_result, ARRAY[]::uuid[]);
END;
$function$


-- ══════ LIVE pg_get_functiondef: current_user_tenant_id ══════
CREATE OR REPLACE FUNCTION public.current_user_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$function$


-- ══════ LIVE pg_get_functiondef: get_transferable_stores ══════
CREATE OR REPLACE FUNCTION public.get_transferable_stores(p_user_id uuid, p_current_store_id uuid)
 RETURNS SETOF stores
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- 1. Obtener tenant_id de la tienda actual
  SELECT tenant_id INTO v_tenant_id
  FROM public.stores
  WHERE id = p_current_store_id AND is_active = true;

  -- 2. Devolver tiendas donde el caller tiene acceso (has_store_access_as)
  --    EXCLUYENDO la tienda actual
  --    Si tenant_id es NOT NULL, filtrar por mismo tenant.
  --    Si tenant_id es NULL (legacy), mostrar todas las que el caller tiene acceso.
  IF v_tenant_id IS NOT NULL THEN
    RETURN QUERY
    SELECT s.*
    FROM public.stores s
    WHERE s.tenant_id = v_tenant_id
      AND s.id != p_current_store_id
      AND s.is_active = true
      AND s.is_archived = false
      AND public.has_store_access_as(p_user_id, s.id)
    ORDER BY s.name;
  ELSE
    -- Legacy: tiendas sin tenant_id — usar solo has_store_access_as
    RETURN QUERY
    SELECT s.*
    FROM public.stores s
    WHERE s.id != p_current_store_id
      AND s.is_active = true
      AND s.is_archived = false
      AND public.has_store_access_as(p_user_id, s.id)
    ORDER BY s.name;
  END IF;
END;
$function$


-- ══════ LIVE pg_get_functiondef: has_store_access ══════
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


-- ══════ LIVE pg_get_functiondef: has_store_access_as ══════
CREATE OR REPLACE FUNCTION public.has_store_access_as(p_user_id uuid, p_store_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role TEXT;
BEGIN
    IF p_user_id IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;
    
    -- Check if admin
    SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
    IF v_role = 'admin' THEN RETURN true; END IF;
    
    -- Check membership
    RETURN EXISTS (
        SELECT 1 FROM public.user_store_memberships
        WHERE user_id = p_user_id AND store_id = p_store_id AND status = 'active'
    );
END;
$function$


-- ══════ LIVE pg_get_functiondef: has_store_role ══════
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
$function$


-- ══════ LIVE pg_get_functiondef: has_store_role ══════
CREATE OR REPLACE FUNCTION public.has_store_role(p_user_id uuid, p_store_id uuid, p_roles text[])
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN auth.role() = 'service_role' THEN
    EXISTS (
      SELECT 1 FROM public.user_store_memberships m
      WHERE m.user_id = p_user_id
        AND m.store_id = p_store_id
        AND m.status = 'active'
        AND m.role::text = ANY(p_roles)
    )
  ELSE
    EXISTS (
      SELECT 1 FROM public.user_store_memberships m
      WHERE m.user_id = auth.uid()
        AND m.store_id = p_store_id
        AND m.status = 'active'
        AND m.role::text = ANY(p_roles)
    )
  END
$function$


-- ══════ LIVE pg_get_functiondef: has_store_role_as ══════
CREATE OR REPLACE FUNCTION public.has_store_role_as(p_user_id uuid, p_store_id uuid, p_roles text[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_store_id IS NULL THEN
    RETURN false;
  END IF;

  -- Admin global bypasses
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role IN ('admin', 'superadmin')) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_store_memberships m
    WHERE m.user_id = p_user_id
      AND m.store_id = p_store_id
      AND m.status = 'active'
      AND m.role::text = ANY(p_roles)
  );
END;
$function$


-- ══════ LIVE pg_get_functiondef: is_global_admin ══════
CREATE OR REPLACE FUNCTION public.is_global_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$function$


