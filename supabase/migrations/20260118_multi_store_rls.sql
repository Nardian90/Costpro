-- Phase 4: Security (RLS) and Helpers - CONSOLIDATED

-- 1. Consolidated role and store check functions
CREATE OR REPLACE FUNCTION public.current_user_store_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $$
BEGIN
    RETURN (SELECT active_store_id FROM public.profiles WHERE id = auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_store_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN public.current_user_store_id();
END;
$$;

CREATE OR REPLACE FUNCTION public.has_store_access(p_store_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN (
        public.is_admin()
        OR
        EXISTS (
            SELECT 1 FROM public.user_store_access
            WHERE user_id = auth.uid() AND store_id = p_store_id
        )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. Update has_role/has_any_role with compatibility
CREATE OR REPLACE FUNCTION public.has_role(required_role user_role)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $$
DECLARE
    v_actual_role user_role;
BEGIN
    SELECT role INTO v_actual_role FROM public.profiles WHERE id = auth.uid();

    -- Compatibility mapping
    IF v_actual_role = 'encargado' AND required_role = 'manager' THEN RETURN true; END IF;
    IF v_actual_role = 'usuario' AND (required_role = 'clerk' OR required_role = 'warehouse') THEN RETURN true; END IF;

    RETURN v_actual_role = required_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(required_roles user_role[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $$
DECLARE
    v_actual_role user_role;
    r user_role;
BEGIN
    SELECT role INTO v_actual_role FROM public.profiles WHERE id = auth.uid();

    FOREACH r IN ARRAY required_roles
    LOOP
        IF v_actual_role = r THEN RETURN true; END IF;
        IF v_actual_role = 'encargado' AND r = 'manager' THEN RETURN true; END IF;
        IF v_actual_role = 'usuario' AND (r = 'clerk' OR r = 'warehouse') THEN RETURN true; END IF;
    END LOOP;

    RETURN false;
END;
$$;

-- 3. RLS Policies
-- Stores
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view assigned stores" ON public.stores;
CREATE POLICY "Users can view assigned stores" ON public.stores
FOR SELECT TO authenticated
USING (public.has_store_access(id));

DROP POLICY IF EXISTS "Admins and Encargados can manage stores" ON public.stores;
CREATE POLICY "Admins and Encargados can manage stores" ON public.stores
FOR ALL TO authenticated
USING (
    public.is_admin()
    OR
    (public.has_role('encargado') AND created_by = auth.uid())
);

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are viewable by admins and owners" ON public.profiles;
CREATE POLICY "Profiles are viewable by admins and owners" ON public.profiles
FOR SELECT TO authenticated
USING (
    public.is_admin()
    OR id = auth.uid()
    OR created_by = auth.uid()
);

DROP POLICY IF EXISTS "Profiles are manageable by admins and creators" ON public.profiles;
CREATE POLICY "Profiles are manageable by admins and creators" ON public.profiles
FOR ALL TO authenticated
USING (
    public.is_admin()
    OR created_by = auth.uid()
);

-- User Store Access
ALTER TABLE public.user_store_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own store access" ON public.user_store_access;
CREATE POLICY "Users can view own store access" ON public.user_store_access
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = user_id AND created_by = auth.uid()));

DROP POLICY IF EXISTS "Admins and Encargados manage access" ON public.user_store_access;
CREATE POLICY "Admins and Encargados manage access" ON public.user_store_access
FOR ALL TO authenticated
USING (
    public.is_admin()
    OR (public.has_role('encargado') AND EXISTS (SELECT 1 FROM public.profiles WHERE id = user_id AND created_by = auth.uid()))
)
WITH CHECK (
    public.is_admin()
    OR (
        public.has_role('encargado')
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = user_id AND created_by = auth.uid())
        AND public.has_store_access(store_id)
    )
);
