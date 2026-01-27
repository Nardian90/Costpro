-- Migration: Alignment Fix for Production (CostPro)
-- Date: 2026-02-01
-- Description: Ensures missing columns in profiles and audit_logs exist and fixes get_audit_logs RPC.

BEGIN;

-- 1. Align Profiles table
-- Adding missing columns that frontend expects
ALTER TABLE IF EXISTS public.profiles
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS roles public.user_role[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS active_store_id UUID REFERENCES public.stores(id);

-- 2. Align Audit Logs table
-- Ensure store_id exists for store isolation
ALTER TABLE IF EXISTS public.audit_logs
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id);

-- 3. Add Indices for Performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_store_id ON public.audit_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- 4. Correct get_audit_logs RPC
-- Handles NULLs, provides deterministic results, and validates permissions.
CREATE OR REPLACE FUNCTION public.get_audit_logs(
    p_store_id uuid DEFAULT NULL,
    p_search_term text DEFAULT NULL,
    p_date_from timestamp DEFAULT NULL,
    p_date_to timestamp DEFAULT NULL,
    p_limit integer DEFAULT 1000
)
RETURNS TABLE (
    id uuid,
    created_at timestamptz,
    user_id uuid,
    action text,
    table_name text,
    record_id text,
    old_data jsonb,
    new_data jsonb,
    metadata jsonb,
    store_id uuid,
    store_name text,
    profile jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_is_admin boolean;
BEGIN
    v_user_id := auth.uid();
    v_is_admin := public.is_admin();

    -- Defensive: if p_limit is null, use default
    IF p_limit IS NULL THEN
        p_limit := 1000;
    END IF;

    RETURN QUERY
    SELECT
        al.id,
        al.created_at,
        al.user_id,
        al.action,
        al.table_name,
        al.record_id,
        al.old_data,
        al.new_data,
        al.metadata,
        al.store_id,
        s.name as store_name,
        (
            SELECT jsonb_build_object(
                'full_name', p.full_name,
                'role', p.role
            )
            FROM public.profiles p
            WHERE p.id = al.user_id
        ) as profile
    FROM public.audit_logs al
    LEFT JOIN public.stores s ON al.store_id = s.id
    WHERE
        -- Permission check: Admins see everything, others see only their accessible stores or logs without store_id
        (v_is_admin OR al.store_id IS NULL OR public.has_store_access(al.store_id))
        AND (p_store_id IS NULL OR al.store_id = p_store_id)
        AND (p_date_from IS NULL OR al.created_at >= p_date_from)
        AND (p_date_to IS NULL OR al.created_at <= p_date_to)
        AND (
            p_search_term IS NULL OR p_search_term = ''
            OR al.action ILIKE ('%' || p_search_term || '%')
            OR al.table_name ILIKE ('%' || p_search_term || '%')
            OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = al.user_id
                AND p.full_name ILIKE ('%' || p_search_term || '%')
            )
        )
    ORDER BY al.created_at DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_audit_logs TO authenticated;

COMMIT;
