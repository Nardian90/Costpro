-- Migration: Fix RPC structures for Kardex and Audit reports
-- Date: 2026-02-27
-- Description: Unifies parameter names to p_limit/p_offset and implements explicit casting to prevent schema cache errors.
-- Also aligns Kardex RPC with the columns expected by the frontend.

BEGIN;

-- 1. Fix get_product_stock_ledger_paginated
-- Drop the old version if it exists with different parameters
DROP FUNCTION IF EXISTS public.get_product_stock_ledger_paginated(uuid, uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.get_product_stock_ledger_paginated(
  p_product_id uuid,
  p_store_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  movement_id uuid,
  created_at timestamp with time zone,
  movement_type text,
  reference_id text,
  reference_doc text,
  quantity_change numeric,
  entry numeric,
  exit numeric,
  balance_after numeric,
  unit_cost numeric,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  WITH movements AS (
    SELECT
      m.id as movement_id,
      m.created_at,
      m.movement_type::TEXT as type,
      COALESCE(m.reference_id::TEXT, 'S/Ref') as ref_id,
      COALESCE(m.reference_doc::TEXT, 'S/Doc') as ref_doc,
      m.quantity_change::NUMERIC as q_change,
      CASE WHEN m.quantity_change > 0 THEN m.quantity_change::NUMERIC ELSE 0 END as q_entry,
      CASE WHEN m.quantity_change < 0 THEN ABS(m.quantity_change)::NUMERIC ELSE 0 END as q_exit,
      -- Use the calculated balance to ensure accuracy, but call it balance_after for UI compatibility
      SUM(m.quantity_change) OVER (ORDER BY m.created_at ASC, m.id ASC)::NUMERIC as balance,
      m.unit_cost::NUMERIC as u_cost,
      COUNT(*) OVER() as total_records
    FROM public.stock_movements m
    WHERE m.product_id = p_product_id
      AND (p_store_id IS NULL OR m.store_id = p_store_id)
  )
  SELECT
    m.movement_id,
    m.created_at,
    m.type,
    m.ref_id,
    m.ref_doc,
    m.q_change,
    m.q_entry,
    m.q_exit,
    m.balance,
    m.u_cost,
    m.total_records
  FROM movements m
  ORDER BY m.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- 2. Fix get_audit_logs to ensure record_id is TEXT and p_limit is handled correctly
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
$$;

COMMIT;
