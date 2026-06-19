CREATE OR REPLACE FUNCTION public.get_batch_store_daily_kpis(p_store_ids uuid[], p_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(store_id uuid, today_sales numeric, today_transactions bigint, low_stock_count bigint, pending_transfers_out bigint, pending_receptions bigint, visible_products bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH
  -- Pre-aggregate today's sales per store (single scan with index)
  sales AS (
    SELECT
      tx.store_id,
      COALESCE(SUM(tx.total_amount), 0) AS total_sales,
      COUNT(DISTINCT tx.id)              AS tx_count
    FROM transactions tx
    WHERE tx.store_id = ANY(p_store_ids)
      AND tx.status = 'completed'
      AND tx.created_at >= p_date
      AND tx.created_at <  p_date + INTERVAL '1 day'
    GROUP BY tx.store_id
  ),

  -- Pre-aggregate low-stock product counts per store (single scan with index)
  low_stock AS (
    SELECT
      p.store_id,
      COUNT(*) AS low_count
    FROM products p
    WHERE p.store_id = ANY(p_store_ids)
      AND p.is_active = true
      AND p.stock_current <= p.min_stock
    GROUP BY p.store_id
  ),

  -- Count pending outgoing transfers per store (single scan with index)
  transfers_out AS (
    SELECT
      t.origin_store_id AS store_id,
      COUNT(*)           AS pending_count
    FROM transfers t
    WHERE t.origin_store_id = ANY(p_store_ids)
      AND t.status = 'PENDIENTE'
    GROUP BY t.origin_store_id
  ),

  -- Count active receipts (pending receptions) per store
  receipts_pending AS (
    SELECT
      r.store_id,
      COUNT(*) AS pending_count
    FROM receipts r
    WHERE r.store_id = ANY(p_store_ids)
      AND r.status = 'pending'
    GROUP BY r.store_id
  ),

  -- Count visible storefront products per store (single scan with index)
  visible AS (
    SELECT
      p.store_id,
      COUNT(*) AS visible_count
    FROM products p
    WHERE p.store_id = ANY(p_store_ids)
      AND p.is_active = true
      AND p.visible_en_tienda = true
    GROUP BY p.store_id
  )

  -- Final join: UNNEST input + LEFT JOIN each CTE (no correlated subqueries)
  SELECT
    s_id                                      AS store_id,
    COALESCE(sales.total_sales, 0)            AS today_sales,
    COALESCE(sales.tx_count, 0)               AS today_transactions,
    COALESCE(low_stock.low_count, 0)          AS low_stock_count,
    COALESCE(transfers_out.pending_count, 0)  AS pending_transfers_out,
    COALESCE(receipts_pending.pending_count, 0) AS pending_receptions,
    COALESCE(visible.visible_count, 0)        AS visible_products
  FROM UNNEST(p_store_ids) AS s_id
  LEFT JOIN sales             ON sales.store_id             = s_id
  LEFT JOIN low_stock         ON low_stock.store_id         = s_id
  LEFT JOIN transfers_out     ON transfers_out.store_id     = s_id
  LEFT JOIN receipts_pending  ON receipts_pending.store_id  = s_id
  LEFT JOIN visible           ON visible.store_id           = s_id;
END;
$function$
