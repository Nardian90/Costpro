-- =====================================================================
-- REM-R2-READ-EXEC — R2-B — MEDIUM: per-store reads (cross-store UUID probe eliminated)
--
-- Findings: audit-evidence/R2-SECDEF-READ-SURFACE/01_FINDINGS.md
-- Design:   audit-evidence/R2-SECDEF-READ-SURFACE/02_REMEDIATION-PREP.md
--           (FASE 3: Modelo A uniforme · FASE 7: guard spec · FASE 4: NULL -> 42501)
--
-- Each function is SECURITY DEFINER (RLS bypass) with EXECUTE granted to
-- authenticated and NO in-body authorization: any authenticated user could
-- pass an arbitrary store UUID (or NULL = ALL stores) and read cross-tenant
-- data. Guard = precedent 20260916000004 (get_batch_store_daily_kpis):
-- auth.role() <> 'service_role' -> NULL reject + public.has_store_access(p_store_id)
-- -> SQLSTATE 42501 ERR_UNAUTHORIZED_STORE. Bodies are byte-identical to
-- LIVE (frozen in 03_prep-live-capture.json) except the inserted guard.
-- No ACL, signature, owner, volatility or search_path changes. No GRANT/REVOKE.
-- Exception (documented): get_low_stock_count LANGUAGE sql -> plpgsql to host
-- the guard; its SELECT is preserved byte-identical inside RETURN (...).
-- =====================================================================

-- ---- get_store_analytics_advanced (get_store_analytics_advanced(uuid,date,date,integer)) · transform: plpgsql ----
CREATE OR REPLACE FUNCTION public.get_store_analytics_advanced(p_store_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- REM-R2-READ: authorization barrier (RLS is bypassed by SECURITY DEFINER).
  -- service_role keeps its trusted internal capability; human callers must
  -- hold active access (membership or global admin) on the requested store.
  -- NULL p_store_id is rejected: the legacy NULL=ALL-STORES path is not a
  -- legitimate capability (REM-R2-READ-PREP FASE 4, decision A).
  IF auth.role() <> 'service_role' THEN
    IF p_store_id IS NULL THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: NULL' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_store_access(p_store_id) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: %', p_store_id USING ERRCODE = '42501';
    END IF;
  END IF;
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
$function$;

-- ---- get_sales_since_last_closure (get_sales_since_last_closure(uuid)) · transform: plpgsql ----
CREATE OR REPLACE FUNCTION public.get_sales_since_last_closure(p_store_id uuid)
 RETURNS TABLE(total_sales numeric, total_cash numeric, total_transfer numeric, last_closure_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
                DECLARE
                    v_last_closure_at timestamptz;
                    BEGIN
                      -- REM-R2-READ: authorization barrier (RLS is bypassed by SECURITY DEFINER).
                      -- service_role keeps its trusted internal capability; human callers must
                      -- hold active access (membership or global admin) on the requested store.
                      -- NULL p_store_id is rejected: the legacy NULL=ALL-STORES path is not a
                      -- legitimate capability (REM-R2-READ-PREP FASE 4, decision A).
                      IF auth.role() <> 'service_role' THEN
                        IF p_store_id IS NULL THEN
                          RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: NULL' USING ERRCODE = '42501';
                        END IF;
                        IF NOT public.has_store_access(p_store_id) THEN
                          RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: %', p_store_id USING ERRCODE = '42501';
                        END IF;
                      END IF;
                        -- Find the last CLOSED closure for this store, using closed_at as the period marker
                            SELECT closed_at INTO v_last_closure_at
                                FROM public.cash_closures
                                    WHERE store_id = p_store_id AND status = 'cerrado'
                                        ORDER BY closed_at DESC
                                            LIMIT 1;

                                                -- Fallback: If no closed closure exists, default to the beginning of time (1970-01-01)
                                                    -- instead of date_trunc('day', now()), so that it reflects the full balance.
                                                        IF v_last_closure_at IS NULL THEN
                                                                v_last_closure_at := '1970-01-01 00:00:00+00'::timestamptz;
                                                                    END IF;

                                                                        RETURN QUERY
                                                                            SELECT
                                                                                    COALESCE(SUM(total_amount), 0)::numeric AS total_sales,
                                                                                            COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0)::numeric AS total_cash,
                                                                                                    COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN total_amount ELSE 0 END), 0)::numeric AS total_transfer,
                                                                                                            v_last_closure_at AS last_closure_at
                                                                                                                FROM public.transactions
                                                                                                                    WHERE store_id = p_store_id
                                                                                                                          AND status = 'completed'
                                                                                                                                AND created_at > v_last_closure_at;
                                                                                                                                END;
                                                                                                                                $function$;

-- ---- get_paginated_products (get_paginated_products(uuid,text,text,integer,integer)) · transform: plpgsql ----
CREATE OR REPLACE FUNCTION public.get_paginated_products(p_store_id uuid, p_search_term text DEFAULT ''::text, p_category text DEFAULT ''::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, description text, sku text, barcode text, barcode_type text, price numeric, precio_empresa numeric, cost_price numeric, image_url text, category text, unit_of_measure text, supplier text, created_at timestamp with time zone, updated_at timestamp with time zone, stock_current numeric, cost_average numeric, min_stock numeric, store_id uuid, is_active boolean, visible_en_tienda boolean, price_visible boolean, stock_visible boolean, on_promotion boolean, price_currency text, has_movements boolean, total bigint, is_complete boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_total bigint; v_is_complete boolean;
BEGIN
  -- REM-R2-READ: authorization barrier (RLS is bypassed by SECURITY DEFINER).
  -- service_role keeps its trusted internal capability; human callers must
  -- hold active access (membership or global admin) on the requested store.
  -- NULL p_store_id is rejected: the legacy NULL=ALL-STORES path is not a
  -- legitimate capability (REM-R2-READ-PREP FASE 4, decision A).
  IF auth.role() <> 'service_role' THEN
    IF p_store_id IS NULL THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: NULL' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_store_access(p_store_id) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: %', p_store_id USING ERRCODE = '42501';
    END IF;
  END IF;
  SELECT COUNT(*) INTO v_total FROM public.products p
  WHERE p.store_id = p_store_id AND p.is_active = true
  AND (COALESCE(p_search_term, '') = '' OR p.search_vector @@ plainto_tsquery('spanish', p_search_term) OR p.name ILIKE '%' || p_search_term || '%' OR p.sku ILIKE '%' || p_search_term || '%' OR COALESCE(p.barcode, '') ILIKE '%' || p_search_term || '%')
  AND (COALESCE(p_category, '') = '' OR p.category = p_category);

  v_is_complete := (p_limit + p_offset >= v_total);

  RETURN QUERY SELECT
    p.id::uuid, p.name::text, p.description::text, p.sku::text, p.barcode::text, p.barcode_type::text,
    p.price::numeric, p.precio_empresa::numeric, p.cost_price::numeric, p.image_url::text,
    p.category::text, p.unit_of_measure::text, p.supplier::text,
    p.created_at::timestamptz, p.updated_at::timestamptz,
    -- FIX: leer de inventory.quantity (fuente de verdad) en vez de p.stock_current (desincronizado)
    COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::numeric,
    p.cost_average::numeric, p.min_stock::numeric,
    p.store_id::uuid, p.is_active::boolean, p.visible_en_tienda::boolean,
    COALESCE(p.price_visible, true)::boolean, COALESCE(p.stock_visible, true)::boolean, COALESCE(p.on_promotion, false)::boolean, COALESCE(p.price_currency, 'CUP')::text,
    EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id)::boolean AS has_movements,
    v_total::bigint, v_is_complete::boolean
  FROM public.products p
  WHERE p.store_id = p_store_id AND p.is_active = true
  AND (COALESCE(p_search_term, '') = '' OR p.search_vector @@ plainto_tsquery('spanish', p_search_term) OR p.name ILIKE '%' || p_search_term || '%' OR p.sku ILIKE '%' || p_search_term || '%' OR COALESCE(p.barcode, '') ILIKE '%' || p_search_term || '%')
  AND (COALESCE(p_category, '') = '' OR p.category = p_category)
  ORDER BY p.name LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- ---- get_products_for_reception (get_products_for_reception(uuid,text,integer,integer)) · transform: plpgsql ----
CREATE OR REPLACE FUNCTION public.get_products_for_reception(p_store_id uuid, p_search_term text DEFAULT ''::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS TABLE(id uuid, name text, sku text, barcode text, cost_price numeric, price numeric, unit_of_measure text, stock_current numeric, min_stock numeric, is_active boolean, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_offset INT;
  v_search TEXT;
BEGIN
  -- REM-R2-READ: authorization barrier (RLS is bypassed by SECURITY DEFINER).
  -- service_role keeps its trusted internal capability; human callers must
  -- hold active access (membership or global admin) on the requested store.
  -- NULL p_store_id is rejected: the legacy NULL=ALL-STORES path is not a
  -- legitimate capability (REM-R2-READ-PREP FASE 4, decision A).
  IF auth.role() <> 'service_role' THEN
    IF p_store_id IS NULL THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: NULL' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_store_access(p_store_id) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: %', p_store_id USING ERRCODE = '42501';
    END IF;
  END IF;
  v_offset := (p_page - 1) * p_page_size;
  v_search := LOWER(TRIM(COALESCE(p_search_term, '')));

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.sku,
    p.barcode,
    p.cost_price,
    p.price,
    p.unit_of_measure,
    p.stock_current,
    p.min_stock,
    p.is_active,
    COUNT(*) OVER() AS total_count
  FROM products p
  WHERE p.store_id = p_store_id
    AND p.is_active = true
    AND (
      v_search = ''
      OR LOWER(p.name) LIKE '%' || v_search || '%'
      OR LOWER(COALESCE(p.sku, '')) LIKE '%' || v_search || '%'
      OR LOWER(COALESCE(p.barcode, '')) LIKE '%' || v_search || '%'
    )
  ORDER BY
    CASE WHEN v_search != '' AND LOWER(p.name) LIKE v_search || '%' THEN 0 ELSE 1 END,
    CASE WHEN v_search != '' AND LOWER(COALESCE(p.sku, '')) = v_search THEN 0 ELSE 1 END,
    p.name ASC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$function$;

-- ---- get_product_stock_ledger_paginated (get_product_stock_ledger_paginated(uuid,uuid,integer,integer)) · transform: plpgsql ----
CREATE OR REPLACE FUNCTION public.get_product_stock_ledger_paginated(p_product_id uuid, p_store_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(movement_id uuid, created_at timestamp with time zone, movement_type text, reference_id text, reference_doc text, quantity_change numeric, entry numeric, exit numeric, balance_after numeric, unit_cost numeric, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
                              BEGIN
                                -- REM-R2-READ: authorization barrier (RLS is bypassed by SECURITY DEFINER).
                                -- service_role keeps its trusted internal capability; human callers must
                                -- hold active access (membership or global admin) on the requested store.
                                -- NULL p_store_id is rejected: the legacy NULL=ALL-STORES path is not a
                                -- legitimate capability (REM-R2-READ-PREP FASE 4, decision A).
                                IF auth.role() <> 'service_role' THEN
                                  IF p_store_id IS NULL THEN
                                    RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: NULL' USING ERRCODE = '42501';
                                  END IF;
                                  IF NOT public.has_store_access(p_store_id) THEN
                                    RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: %', p_store_id USING ERRCODE = '42501';
                                  END IF;
                                END IF;
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
