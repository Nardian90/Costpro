-- ============================================================================
-- Store Analytics Advanced RPC
-- ----------------------------------------------------------------------------
-- Crea un RPC unificado `get_store_analytics_advanced` que retorna datos
-- agregados para alimentar el Dashboard 10/10.
--
-- Modo de uso:
--   SELECT * FROM get_store_analytics_advanced(
--     p_store_id := 'uuid',
--     p_start_date := '2026-06-01',  -- opcional, default = hoy - 30 días
--     p_end_date := '2026-06-20',     -- opcional, default = ahora
--     p_days := 30                    -- legacy, solo se usa si start_date es NULL
--   );
-- ============================================================================

-- Limpia definición previa (idempotente)
DROP FUNCTION IF EXISTS public.get_store_analytics_advanced(p_store_id UUID, p_days INT);
DROP FUNCTION IF EXISTS public.get_store_analytics_advanced(p_store_id UUID, p_start_date DATE, p_end_date DATE, p_days INT);

CREATE OR REPLACE FUNCTION public.get_store_analytics_advanced(
  p_store_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Resolución de fechas:
  -- - Si p_start_date y p_end_date están dados → usar ese rango
  -- - Sino → usar p_days hacia atrás desde hoy
  v_end_date DATE := COALESCE(p_end_date, CURRENT_DATE);
  v_start_date DATE := COALESCE(p_start_date, v_end_date - (p_days || ' days')::INTERVAL);
  v_start_ts TIMESTAMPTZ := v_start_date::timestamp AT TIME ZONE 'UTC';
  v_end_ts TIMESTAMPTZ := (v_end_date + INTERVAL '1 day')::timestamp AT TIME ZONE 'UTC';
  v_today_start TIMESTAMPTZ := date_trunc('day', NOW());
  v_actual_days INT := GREATEST(1, v_end_date - v_start_date + 1);
  v_kpis JSONB;
  v_sales_series JSONB;
  v_top_products_revenue JSONB;
  v_top_products_quantity JSONB;
  v_payment_distribution JSONB;
  v_weekday_distribution JSONB;
  v_hour_distribution JSONB;
  v_low_stock JSONB;
  v_slow_movers JSONB;
  v_overstock JSONB;
  v_category_margins JSONB;
  v_product_velocity JSONB;
BEGIN
  -- ============================================================
  -- 1. KPIs principales (período + comparativa hoy)
  -- ============================================================
  -- ⚠️ BUG FIX: NO usar LEFT JOIN transaction_items aquí.
  -- El LEFT JOIN duplica cada transacción por cada item, haciendo que
  -- SUM(t.total_amount) cuente N veces la misma transacción.
  -- Solución: calcular ventas en una subquery sin JOIN, y costo/qty en otra.
  SELECT jsonb_build_object(
    'period_sales', COALESCE(sales_data.total_sales, 0),
    'period_cost', COALESCE(items_data.total_cost, 0),
    'period_transactions', COALESCE(sales_data.tx_count, 0),
    'period_items_sold', COALESCE(items_data.items_sold, 0),
    'today_sales', COALESCE(sales_data.today_sales, 0),
    'today_transactions', COALESCE(sales_data.today_tx_count, 0),
    'avg_ticket', CASE WHEN COALESCE(sales_data.tx_count, 0) > 0
                       THEN COALESCE(sales_data.total_sales, 0) / sales_data.tx_count
                       ELSE 0 END,
    'avg_items_per_sale', CASE WHEN COALESCE(sales_data.tx_count, 0) > 0
                                THEN COALESCE(items_data.items_sold, 0)::FLOAT / sales_data.tx_count
                                ELSE 0 END
  )
  INTO v_kpis
  FROM (
    -- Subquery 1: métricas a nivel transacción (sin JOIN, sin duplicación)
    SELECT
      SUM(t.total_amount) AS total_sales,
      COUNT(*) AS tx_count,
      SUM(CASE WHEN t.created_at >= v_today_start THEN t.total_amount ELSE 0 END) AS today_sales,
      SUM(CASE WHEN t.created_at >= v_today_start THEN 1 ELSE 0 END) AS today_tx_count
    FROM transactions t
    WHERE t.store_id = p_store_id
      AND t.status = 'completed'
      AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
  ) AS sales_data
  CROSS JOIN (
    -- Subquery 2: métricas a nivel item (sumando solo items de transacciones completadas)
    SELECT
      COALESCE(SUM(ti.cost_at_sale * ti.quantity), 0) AS total_cost,
      COALESCE(SUM(ti.quantity), 0) AS items_sold
    FROM transaction_items ti
    INNER JOIN transactions t ON t.id = ti.transaction_id
    WHERE t.store_id = p_store_id
      AND t.status = 'completed'
      AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
  ) AS items_data;

  -- ============================================================
  -- 2. Serie temporal de ventas por día
  -- ============================================================
  -- BUG FIX: misma duplicación que KPIs. Usar subqueries separadas.
  SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY day_date), '[]'::jsonb)
  INTO v_sales_series
  FROM (
    SELECT
      d::date AS day_date,
      d::text AS date,
      COALESCE(sales_by_day.sales, 0) AS sales,
      COALESCE(sales_by_day.transactions, 0) AS transactions,
      COALESCE(items_by_day.items_sold, 0) AS items_sold
    FROM generate_series(
      date_trunc('day', v_start_date),
      date_trunc('day', NOW()),
      '1 day'
    ) AS d
    LEFT JOIN (
      SELECT
        date_trunc('day', t.created_at) AS day,
        SUM(t.total_amount) AS sales,
        COUNT(*) AS transactions
      FROM transactions t
      WHERE t.store_id = p_store_id
        AND t.status = 'completed'
        AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
      GROUP BY date_trunc('day', t.created_at)
    ) AS sales_by_day ON sales_by_day.day = d
    LEFT JOIN (
      SELECT
        date_trunc('day', t.created_at) AS day,
        SUM(ti.quantity) AS items_sold
      FROM transaction_items ti
      INNER JOIN transactions t ON t.id = ti.transaction_id
      WHERE t.store_id = p_store_id
        AND t.status = 'completed'
        AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
      GROUP BY date_trunc('day', t.created_at)
    ) AS items_by_day ON items_by_day.day = d
    ORDER BY d
  ) AS d;

  -- ============================================================
  -- 3. Top productos por ingreso (top 10)
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(q)), '[]'::jsonb)
  INTO v_top_products_revenue
  FROM (
    SELECT
      ti.product_id,
      p.name,
      p.sku,
      p.category,
      COALESCE(SUM(ti.price_at_sale * ti.quantity), 0) AS revenue,
      COALESCE(SUM(ti.quantity), 0) AS quantity,
      COALESCE(SUM(ti.cost_at_sale * ti.quantity), 0) AS cost,
      CASE WHEN SUM(ti.price_at_sale * ti.quantity) > 0
           THEN ROUND(
             ((SUM(ti.price_at_sale * ti.quantity) - SUM(ti.cost_at_sale * ti.quantity))
             / SUM(ti.price_at_sale * ti.quantity) * 100)::numeric, 2
           )
           ELSE 0 END AS margin_pct
    FROM transaction_items ti
    INNER JOIN transactions t ON t.id = ti.transaction_id
    INNER JOIN products p ON p.id = ti.product_id
    WHERE t.store_id = p_store_id
      AND t.status = 'completed'
      AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
    GROUP BY ti.product_id, p.name, p.sku, p.category
    ORDER BY revenue DESC
    LIMIT 10
  ) AS q;

  -- ============================================================
  -- 4. Top productos por cantidad (top 10)
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(q)), '[]'::jsonb)
  INTO v_top_products_quantity
  FROM (
    SELECT
      ti.product_id,
      p.name,
      p.sku,
      COALESCE(SUM(ti.quantity), 0) AS quantity,
      COALESCE(SUM(ti.price_at_sale * ti.quantity), 0) AS revenue
    FROM transaction_items ti
    INNER JOIN transactions t ON t.id = ti.transaction_id
    INNER JOIN products p ON p.id = ti.product_id
    WHERE t.store_id = p_store_id
      AND t.status = 'completed'
      AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
    GROUP BY ti.product_id, p.name, p.sku
    ORDER BY quantity DESC
    LIMIT 10
  ) AS q;

  -- ============================================================
  -- 5. Distribución de métodos de pago
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(q)), '[]'::jsonb)
  INTO v_payment_distribution
  FROM (
    SELECT
      -- Cast a TEXT para evitar issues con el enum payment_method_enum
      -- que no acepta 'unknown' como valor. Frontend mapeará 'other' → 'Otro'.
      CASE WHEN t.payment_method IS NULL THEN 'other'
           ELSE t.payment_method::TEXT END AS method,
      COUNT(*) AS count,
      COALESCE(SUM(t.total_amount), 0) AS total,
      CASE WHEN SUM(SUM(t.total_amount)) OVER () > 0
           THEN ROUND((SUM(t.total_amount) / SUM(SUM(t.total_amount)) OVER () * 100)::numeric, 2)
           ELSE 0 END AS pct
    FROM transactions t
    WHERE t.store_id = p_store_id
      AND t.status = 'completed'
      AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
    GROUP BY t.payment_method
    ORDER BY total DESC
  ) AS q;

  -- ============================================================
  -- 6. Distribución por día de semana (0=Domingo, 6=Sábado)
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(q) ORDER BY weekday), '[]'::jsonb)
  INTO v_weekday_distribution
  FROM (
    SELECT
      EXTRACT(DOW FROM t.created_at)::INT AS weekday,
      TRIM(TO_CHAR(t.created_at, 'Day')) AS weekday_name,
      COALESCE(SUM(t.total_amount), 0) AS sales,
      COUNT(*) AS transactions
    FROM transactions t
    WHERE t.store_id = p_store_id
      AND t.status = 'completed'
      AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
    GROUP BY EXTRACT(DOW FROM t.created_at), TRIM(TO_CHAR(t.created_at, 'Day'))
  ) AS q;

  -- ============================================================
  -- 7. Distribución por hora del día (0-23)
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(q) ORDER BY hour), '[]'::jsonb)
  INTO v_hour_distribution
  FROM (
    SELECT
      EXTRACT(HOUR FROM t.created_at)::INT AS hour,
      COALESCE(SUM(t.total_amount), 0) AS sales,
      COUNT(*) AS transactions
    FROM transactions t
    WHERE t.store_id = p_store_id
      AND t.status = 'completed'
      AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
    GROUP BY EXTRACT(HOUR FROM t.created_at)
  ) AS q;

  -- ============================================================
  -- 8. Productos con stock bajo (<= min_stock)
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(q) ORDER BY deficit DESC), '[]'::jsonb)
  INTO v_low_stock
  FROM (
    SELECT
      p.id AS product_id,
      p.name,
      p.sku,
      p.stock_current,
      p.min_stock,
      GREATEST(0, COALESCE(p.min_stock, 0) - COALESCE(p.stock_current, 0)) AS deficit
    FROM products p
    WHERE p.store_id = p_store_id
      AND p.is_active = true
      AND COALESCE(p.stock_current, 0) <= COALESCE(p.min_stock, 0)
      AND COALESCE(p.min_stock, 0) > 0
  ) AS q;

  -- ============================================================
  -- 9. Productos con movimiento lento (sin ventas en 30 días)
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(q) ORDER BY days_without_sales DESC), '[]'::jsonb)
  INTO v_slow_movers
  FROM (
    SELECT
      p.id AS product_id,
      p.name,
      p.sku,
      p.stock_current,
      EXTRACT(DAY FROM NOW() - COALESCE(last_sale.last_sale_date, p.created_at))::INT AS days_without_sales,
      last_sale.last_sale_date
    FROM products p
    LEFT JOIN (
      SELECT ti.product_id, MAX(t.created_at) AS last_sale_date
      FROM transaction_items ti
      INNER JOIN transactions t ON t.id = ti.transaction_id
      WHERE t.store_id = p_store_id AND t.status = 'completed'
      GROUP BY ti.product_id
    ) last_sale ON last_sale.product_id = p.id
    WHERE p.store_id = p_store_id
      AND p.is_active = true
      AND COALESCE(p.stock_current, 0) > 0
      AND (last_sale.last_sale_date IS NULL
           OR last_sale.last_sale_date < NOW() - INTERVAL '30 days')
    ORDER BY days_without_sales DESC
    LIMIT 20
  ) AS q;

  -- ============================================================
  -- 10. Productos con exceso de inventario (rotación < 1 mes)
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(q) ORDER BY days_of_stock DESC NULLS LAST), '[]'::jsonb)
  INTO v_overstock
  FROM (
    SELECT
      p.id AS product_id,
      p.name,
      p.sku,
      p.stock_current,
      COALESCE(sales_stats.avg_daily, 0) AS avg_daily_sales,
      CASE WHEN COALESCE(sales_stats.avg_daily, 0) > 0
           THEN ROUND((COALESCE(p.stock_current, 0) / sales_stats.avg_daily)::numeric, 1)
           ELSE NULL END AS days_of_stock,
      COALESCE(p.stock_current, 0) * COALESCE(p.cost_price, 0) AS overstock_value
    FROM products p
    LEFT JOIN (
      SELECT ti.product_id,
             SUM(ti.quantity)::FLOAT / GREATEST(p_days, 1) AS avg_daily
      FROM transaction_items ti
      INNER JOIN transactions t ON t.id = ti.transaction_id
      WHERE t.store_id = p_store_id
        AND t.status = 'completed'
        AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
      GROUP BY ti.product_id
    ) sales_stats ON sales_stats.product_id = p.id
    WHERE p.store_id = p_store_id
      AND p.is_active = true
      AND COALESCE(p.stock_current, 0) > 0
      AND (sales_stats.avg_daily IS NULL
           OR COALESCE(p.stock_current, 0) / NULLIF(sales_stats.avg_daily, 0) > 45)
    ORDER BY days_of_stock DESC NULLS LAST
    LIMIT 15
  ) AS q;

  -- ============================================================
  -- 11. Márgenes por categoría
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(q) ORDER BY revenue DESC), '[]'::jsonb)
  INTO v_category_margins
  FROM (
    SELECT
      COALESCE(p.category, 'Sin categoría') AS category,
      COALESCE(SUM(ti.price_at_sale * ti.quantity), 0) AS revenue,
      COALESCE(SUM(ti.cost_at_sale * ti.quantity), 0) AS cost,
      COALESCE(SUM(ti.price_at_sale * ti.quantity), 0) - COALESCE(SUM(ti.cost_at_sale * ti.quantity), 0) AS margin,
      CASE WHEN SUM(ti.price_at_sale * ti.quantity) > 0
           THEN ROUND(
             ((SUM(ti.price_at_sale * ti.quantity) - SUM(ti.cost_at_sale * ti.quantity))
             / SUM(ti.price_at_sale * ti.quantity) * 100)::numeric, 2
           )
           ELSE 0 END AS margin_pct,
      COALESCE(SUM(ti.quantity), 0) AS items_sold
    FROM transaction_items ti
    INNER JOIN transactions t ON t.id = ti.transaction_id
    INNER JOIN products p ON p.id = ti.product_id
    WHERE t.store_id = p_store_id
      AND t.status = 'completed'
      AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
    GROUP BY p.category
  ) AS q;

  -- ============================================================
  -- 12. Respuesta final
  -- ============================================================
  RETURN jsonb_build_object(
    'period_days', v_actual_days,
    'start_date', v_start_date::text,
    'end_date', v_end_date::text,
    'kpis', v_kpis,
    'sales_series', v_sales_series,
    'top_products_revenue', v_top_products_revenue,
    'top_products_quantity', v_top_products_quantity,
    'payment_distribution', v_payment_distribution,
    'weekday_distribution', v_weekday_distribution,
    'hour_distribution', v_hour_distribution,
    'low_stock', v_low_stock,
    'slow_movers', v_slow_movers,
    'overstock', v_overstock,
    'category_margins', v_category_margins
  );
END;
$$;

-- Permisos: cualquier usuario autenticado puede ejecutar el RPC
GRANT EXECUTE ON FUNCTION public.get_store_analytics_advanced(UUID, DATE, DATE, INT) TO authenticated;

-- Comentario de documentación
COMMENT ON FUNCTION public.get_store_analytics_advanced(UUID, DATE, DATE, INT) IS
'Dashboard 10/10: retorna JSONB con KPIs, series temporales, top productos, distribución de pagos, márgenes por categoría, alertas de stock y rotación. p_start_date/p_end_date controlan el rango (default = últimos p_days días desde hoy).';
