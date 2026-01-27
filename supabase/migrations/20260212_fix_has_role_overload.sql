-- Migration: Fix has_role overload and ensure compatibility
-- Date: 2026-02-12

BEGIN;

-- 1. Create the 2-argument overload for has_role to support legacy or explicit calls
-- This handles calls like public.has_role(auth.uid(), 'admin') or public.has_role(user_id, 'manager')
CREATE OR REPLACE FUNCTION public.has_role(p_user_id UUID, p_required_role public.user_role)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $$
DECLARE
    v_actual_role public.user_role;
BEGIN
    SELECT role INTO v_actual_role FROM public.profiles WHERE id = p_user_id;

    IF v_actual_role IS NULL THEN
        RETURN false;
    END IF;

    -- Compatibility mapping (mirroring the 1-arg version)
    IF v_actual_role = 'encargado' AND p_required_role = 'manager' THEN RETURN true; END IF;
    IF v_actual_role = 'usuario' AND (p_required_role = 'clerk' OR p_required_role = 'warehouse') THEN RETURN true; END IF;

    RETURN v_actual_role = p_required_role;
END;
$$;

-- 2. Re-affirm the 1-argument version for consistency and to ensure it uses the overload logic if desired,
-- though keeping it as is for performance (avoiding extra function call if possible).
-- The 1-arg version already exists in 20260118_multi_store_rls.sql.

-- 3. Update any known problematic RLS policies to be more robust (optional but good practice)
-- If audit_logs or other tables were using the 2-arg version, they will now work.

COMMIT;
