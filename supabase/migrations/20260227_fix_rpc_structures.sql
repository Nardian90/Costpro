-- Migration: Fix RPC Result Structures for Audit and Kardex
-- Date: 2026-02-27
-- Description: Ensures explicit casting in SELECT statements to match RETURNS TABLE definitions exactly.

BEGIN;

-- 1. Fix get_audit_logs
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
        al.id::uuid,
        al.created_at::timestamptz,
        al.user_id::uuid,
        al.action::text,
        al.table_name::text,
        al.record_id::text,
        al.old_data::jsonb,
        al.new_data::jsonb,
        al.metadata::jsonb,
        al.store_id::uuid,
        s.name::text as store_name,
        (
            SELECT jsonb_build_object(
                'full_name', p.full_name,
                'role', p.role
            )
            FROM public.profiles p
            WHERE p.id = al.user_id
            LIMIT 1
        )::jsonb as profile
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

-- 2. Fix get_product_stock_ledger_paginated
CREATE OR REPLACE FUNCTION public.get_product_stock_ledger_paginated(
  p_product_id uuid,
  p_store_id uuid DEFAULT NULL::uuid,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS TABLE(
  movement_id uuid,
  created_at timestamptz,
  movement_type text,
  reference_id text,
  quantity_change numeric,
  entry numeric,
  exit numeric,
  running_balance numeric,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH movements AS (
    SELECT
      m.id as movement_id,
      m.created_at,
      m.movement_type::TEXT as type,
      COALESCE(m.reference_id::TEXT, 'S/Ref') as reference_id,
      m.quantity_change::NUMERIC as q_change,
      CASE WHEN m.quantity_change > 0 THEN m.quantity_change::NUMERIC ELSE 0 END as q_entry,
      CASE WHEN m.quantity_change < 0 THEN ABS(m.quantity_change)::NUMERIC ELSE 0 END as q_exit,
      SUM(m.quantity_change::NUMERIC) OVER (ORDER BY m.created_at ASC, m.id ASC) as balance,
      COUNT(*) OVER()::BIGINT as total_count
    FROM public.stock_movements m
    WHERE m.product_id = p_product_id
      AND (p_store_id IS NULL OR m.store_id = p_store_id)
  )
  SELECT
    m.movement_id::uuid,
    m.created_at::timestamptz,
    m.type::text,
    m.reference_id::text,
    m.q_change::numeric,
    m.q_entry::numeric,
    m.q_exit::numeric,
    m.balance::numeric,
    m.total_count::bigint
  FROM movements m
  ORDER BY m.created_at DESC
  LIMIT p_page_size
  OFFSET (p_page - 1) * p_page_size;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_audit_logs TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_stock_ledger_paginated TO authenticated;

COMMIT;
