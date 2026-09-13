-- DECLARED FINAL STATE (Git) de get_product_stock_ledger_paginated
-- fuente: 20260227_fix_rpc_structures.sql stmt#2

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
$function$
