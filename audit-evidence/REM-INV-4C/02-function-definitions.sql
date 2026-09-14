REM-INV-4C — 02 LIVE function definitions (pg_get_functiondef, verbatim, PRE-remediation)

-- ================= current_user_tenant_id() =================
CREATE OR REPLACE FUNCTION public.current_user_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$function$


-- ================= has_store_role(uuid,text[]) =================
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


-- ================= has_store_role(uuid,uuid,text[]) =================
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


-- ================= has_store_role_as(uuid,uuid,text[]) =================
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


-- ================= SUPPORT current_user_store_ids() =================
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


-- ================= SUPPORT has_store_access(uuid) =================
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


-- ================= SUPPORT is_admin_with_access(uuid) =================
CREATE OR REPLACE FUNCTION public.is_admin_with_access(p_store_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean;
  v_user_tenant uuid;
  v_store_tenant uuid;
BEGIN
  v_is_admin := public.is_admin();
  IF NOT v_is_admin THEN
    RETURN public.has_store_access(p_store_id);
  END IF;
  v_user_tenant := public.current_user_tenant_id();
  SELECT tenant_id INTO v_store_tenant FROM public.stores WHERE id = p_store_id;
  RETURN v_store_tenant IS NULL OR v_store_tenant = v_user_tenant;
END;
$function$


-- ================= SUPPORT is_admin() =================
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
$function$


-- ================= SUPPORT is_global_admin() =================
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


-- ================= SUPPORT is_managed_user(uuid) =================
CREATE OR REPLACE FUNCTION public.is_managed_user(p_target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_store_memberships usm_target
    WHERE usm_target.user_id = p_target_user_id
      AND EXISTS (
        SELECT 1 FROM public.user_store_memberships usm_me
        WHERE usm_me.user_id = auth.uid()
          AND usm_me.store_id = usm_target.store_id
          AND usm_me.role IN ('encargado', 'manager')
          AND usm_me.status = 'active'
      )
  );
END;
$function$


-- ================= SUPPORT is_store_member(uuid) =================
CREATE OR REPLACE FUNCTION public.is_store_member(p_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_store_memberships
    WHERE store_id = p_store_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$function$


-- ================= SUPPORT is_tenant_member(uuid) =================
CREATE OR REPLACE FUNCTION public.is_tenant_member(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_tenant_id IS NOT NULL
   AND p_tenant_id = public.current_user_tenant_id();
$function$

