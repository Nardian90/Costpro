CREATE OR REPLACE FUNCTION public.get_product_stock_ledger_paginated(
  p_product_id uuid,
  p_store_id uuid DEFAULT NULL::uuid,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS TABLE(
  movement_id uuid,
  created_at timestamp with time zone,
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
AS $function$
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
      SUM(m.quantity_change) OVER (ORDER BY m.created_at ASC, m.id ASC) as balance,
      COUNT(*) OVER() as total_count
    FROM public.stock_movements m
    WHERE m.product_id = p_product_id
      AND (p_store_id IS NULL OR m.store_id = p_store_id)
  )
  SELECT
    m.movement_id,
    m.created_at,
    m.type,
    m.reference_id,
    m.q_change,
    m.q_entry,
    m.q_exit,
    m.balance,
    m.total_count
  FROM movements m
  ORDER BY m.created_at DESC
  LIMIT p_page_size
  OFFSET (p_page - 1) * p_page_size;
END;
$function$;
