-- ============================================================================
-- Migration: 20260807000002_v2_16_2_has_store_role_as.sql
-- Iteración 11.2 — Helper para validación de supervisor
-- ============================================================================
-- has_store_role_as(p_user_id, p_store_id, p_roles[]) — variante con user_id
-- explícito (similar a has_store_access_as). Necesario porque has_store_role
-- usa auth.uid() y el supervisor no es el caller del RPC.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.has_store_role_as;

CREATE OR REPLACE FUNCTION public.has_store_role_as(
  p_user_id uuid,
  p_store_id uuid,
  p_roles text[]
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
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
$function$;

REVOKE EXECUTE ON FUNCTION public.has_store_role_as FROM anon;
GRANT EXECUTE ON FUNCTION public.has_store_role_as TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_store_role_as TO service_role;

COMMENT ON FUNCTION public.has_store_role_as IS
  'Iteración 11.2: Check if a specific user has one of the specified roles in a store. Used for supervisor auth validation in create_sale_v2.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.has_store_role_as;
-- ============================================================================
