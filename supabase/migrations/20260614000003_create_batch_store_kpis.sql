-- Drop existing function first to avoid parameter default conflicts
DROP FUNCTION IF EXISTS get_batch_store_daily_kpis(UUID[], DATE);

CREATE OR REPLACE FUNCTION get_batch_store_daily_kpis(
  p_store_ids UUID[],
  p_date DATE
)
RETURNS TABLE(
  store_id UUID,
  today_sales NUMERIC,
  today_transactions BIGINT,
  low_stock_count BIGINT,
  pending_transfers_out BIGINT,
  pending_receptions BIGINT,
  visible_products BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS store_id,
    COALESCE(SUM(tx.total_amount), 0) AS today_sales,
    COUNT(DISTINCT tx.id) AS today_transactions,
    COALESCE(SUM(CASE WHEN p.stock_current <= p.min_stock THEN 1 ELSE 0 END), 0) AS low_stock_count,
    COALESCE(
      (SELECT COUNT(*) FROM transfers WHERE origin_store_id = s.id AND status = 'PENDIENTE'),
      0
    ) AS pending_transfers_out,
    COALESCE(
      (SELECT COUNT(*) FROM receptions WHERE destination_store_id = s.id AND status = 'PENDIENTE'),
      0
    ) AS pending_receptions,
    COALESCE(
      (SELECT COUNT(*) FROM products WHERE store_id = s.id AND visible_en_tienda = true AND is_active = true),
      0
    ) AS visible_products
  FROM UNNEST(p_store_ids) AS s_id
  JOIN stores s ON s.id = s_id AND s.is_active = true
  LEFT JOIN transactions tx ON tx.store_id = s.id
    AND tx.created_at >= p_date
    AND tx.created_at < p_date + INTERVAL '1 day'
    AND tx.status = 'completed'
  LEFT JOIN products p ON p.store_id = s.id AND p.is_active = true
  GROUP BY s.id;
END;
$$;

COMMENT ON FUNCTION get_batch_store_daily_kpis IS 'Batch fetch KPIs for multiple stores in a single query. Replaces N+1 per-store queries.';

GRANT EXECUTE ON FUNCTION get_batch_store_daily_kpis TO authenticated, anon;
