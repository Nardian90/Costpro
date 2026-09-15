-- =====================================================================
-- REM-INV-6R — store-access guard for get_batch_store_daily_kpis
--
-- Finding (audit-evidence/REM-INV-6R/11, staging attack A6):
--   get_batch_store_daily_kpis(uuid[], date) is SECURITY DEFINER (RLS bypass)
--   with EXECUTE granted to authenticated and NO in-body authorization: any
--   authenticated user could pass arbitrary store UUIDs and read cross-tenant
--   aggregate KPIs (sales totals, stock/transfer/receipt counts). Reproduced
--   dynamically on an ephemeral staging cluster (A6 returned 1 row for an
--   other-tenant store).
--
-- Remediation (§18 preference: reuse the canonical has_store_access helper):
--   per-store has_store_access(s) guard for non-service_role callers, exactly
--   like the V2.12.9 identity-binding pattern used by confirm/create_transfer
--   (CASE auth.role() = 'service_role' ... ELSE auth.uid() END).
--
-- Verified: legitimate caller (member of the requested stores) still passes;
-- cross-tenant request is rejected with SQLSTATE 42501. Read-only change:
-- adds no writes and does not alter returned columns.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_batch_store_daily_kpis(p_store_ids uuid[], p_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(store_id uuid, today_sales numeric, today_transactions bigint, low_stock_count bigint, pending_transfers_out bigint, pending_receptions bigint, visible_products bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s uuid;
BEGIN
  -- REM-INV-6R: authorization barrier (RLS is bypassed by SECURITY DEFINER).
  -- service_role keeps its trusted internal capability; human callers must
  -- hold active access (membership or global admin) on EVERY requested store.
  IF auth.role() <> 'service_role' THEN
    FOREACH s IN ARRAY p_store_ids LOOP
      IF NOT public.has_store_access(s) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: %', s USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END IF;

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
$function$;
