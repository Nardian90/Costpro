-- DECLARED FINAL STATE (Git) de get_audit_logs
-- fuente: 20260227_fix_rpc_structures.sql stmt#3

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
        al.record_id::TEXT,
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
        (v_is_admin OR al.store_id IS NULL OR public.has_store_access(al.store_id))
        AND (p_store_id IS NULL OR al.store_id = p_store_id)
        AND (p_date_from IS NULL OR al.created_at >= p_date_from)
        AND (p_date_to IS NULL OR al.created_at <= p_date_to)
        AND (
            p_search_term IS NULL OR p_search_term = ''
            OR al.action ILIKE ('%' || p_search_term || '%')
            OR al.table_name ILIKE ('%' || p_search_term || '%')
            OR al.record_id::TEXT ILIKE ('%' || p_search_term || '%')
        )
    ORDER BY al.created_at DESC
    LIMIT p_limit;
END;
$$
