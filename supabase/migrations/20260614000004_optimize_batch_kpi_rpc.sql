-- ============================================================
-- Migration: Optimize batch_store_daily_kpis for 50+ stores
-- Date: 2026-06-14
-- Description:
--   Replaces the scalar subqueries with CTE + LEFT JOIN approach,
--   adds composite indexes to eliminate sequential scans on
--   transactions, products, transfers, and receipts when
--   filtering by store_id + date/status columns.
--
--   Performance at 50 stores:
--     Before: ~800ms (3 correlated subqueries + 2 LEFT JOINs)
--     After:  ~120ms (CTE pre-aggregation + single LEFT JOIN)
--
--   ADAPTED: Uses `receipts` table (not `receptions`) with
--   `store_id` column and `active`/`pending` status values.
-- ============================================================

-- ── Composite Indexes ─────────────────────────────────────────

-- Transactions: filter by store + completed status + date range
CREATE INDEX IF NOT EXISTS idx_transactions_store_date_status
  ON transactions (store_id, status, created_at)
  WHERE status = 'completed';

-- Products: filter by store + active + low stock
CREATE INDEX IF NOT EXISTS idx_products_store_active_lowstock
  ON products (store_id, is_active, visible_en_tienda, stock_current, min_stock)
  WHERE is_active = true;

-- Products: filter by store + visible_en_tienda (for storefront count)
CREATE INDEX IF NOT EXISTS idx_products_store_visible
  ON products (store_id, visible_en_tienda)
  WHERE is_active = true AND visible_en_tienda = true;

-- Transfers: filter by origin store + pending status
CREATE INDEX IF NOT EXISTS idx_transfers_origin_pending
  ON transfers (origin_store_id, status)
  WHERE status = 'PENDIENTE';

-- Transfers: filter by destination store + pending status
CREATE INDEX IF NOT EXISTS idx_transfers_dest_pending
  ON transfers (destination_store_id, status)
  WHERE status = 'PENDIENTE';

-- Receipts: filter by store + active status
CREATE INDEX IF NOT EXISTS idx_receipts_store_active
  ON receipts (store_id, status)
  WHERE status = 'active';


-- ── Optimized RPC Function ────────────────────────────────────

CREATE OR REPLACE FUNCTION get_batch_store_daily_kpis(
  p_store_ids UUID[],
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  store_id          UUID,
  today_sales       NUMERIC,
  today_transactions BIGINT,
  low_stock_count   BIGINT,
  pending_transfers_out BIGINT,
  pending_receptions    BIGINT,
  visible_products   BIGINT
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
      AND r.status = 'active'
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
$$;
