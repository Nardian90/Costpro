-- ============================================================================
-- COSTPRO-SALES-DASHBOARD-001: RPC agregado de analytics de ventas
-- ============================================================================
-- Dashboard de Ventas (Historial de Ventas → tab «Dashboard»).
--
-- DISEÑO (docs/sales-dashboard/KPI_DEFINITIONS.md):
--   · UNA sola llamada devuelve TODOS los agregados del período y del
--     período anterior equivalente (cero N+1, cero descarga de documentos).
--   · Montos de DOCUMENTO en CUP (invariante de create_sale_v2:
--     total = subtotal − descuento + impuestos; subtotal/discuento siempre CUP).
--   · Cobros reales por moneda desde payment_transactions (fuente autoritativa,
--     una fila por componente: cash/transfer CUP, zelle USD/EUR/MLC).
--   · Devoluciones (NC) agrupadas por SU moneda (total_amount en currency).
--   · Vendedor = transactions.seller_id (quien generó la operación).
--   · p_status cambia la POBLACIÓN base (default 'completed' = válidas).
--   · Clasificación temporal en America/Havana (timezone operativo del negocio,
--     constante en el sistema: 20260810000070_pr4_4e).
--
-- SEGURIDAD (patrón get_transactions / gate CI sql-security-gate):
--   · STABLE + SECURITY DEFINER — imprescindible para nombres de vendedores
--     (profiles RLS los oculta a roles no administrativos). Read-only.
--   · auth.uid() obligatorio (Check 1) + guard por tienda:
--     p_store_id → has_store_access(p_store_id);
--     NULL → solo tiendas de current_user_store_ids() (superadmin → todas,
--     admin → tenant, resto → membresías activas).
--   · GRANT EXECUTE solo a authenticated y service_role (nunca PUBLIC/anon).
--
-- NO modifica funciones monetarias ni tablas: solo lectura.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_sales_dashboard_analytics(
  p_store_id uuid,
  p_date_from timestamptz,
  p_date_to timestamptz,
  p_prev_from timestamptz,
  p_prev_to timestamptz,
  p_seller_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_limit_products integer DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_store_ids uuid[];
  v_from timestamptz := p_date_from;
  v_to timestamptz := p_date_to;
  v_prev_from timestamptz := p_prev_from;
  v_prev_to timestamptz := p_prev_to;
  v_result jsonb;
  v_limit_products integer := GREATEST(3, LEAST(COALESCE(p_limit_products, 8), 20));
BEGIN
  -- ── Guards (gate CI Check 1: auth.uid; aislamiento por tienda) ──────────
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_PERMISSION_DENIED: sesión requerida' USING ERRCODE = '42501';
  END IF;

  IF p_store_id IS NOT NULL THEN
    IF NOT public.has_store_access(p_store_id) THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: sin acceso a la tienda %', p_store_id USING ERRCODE = '42501';
    END IF;
    v_store_ids := ARRAY[p_store_id];
  ELSE
    -- Sin tienda concreta: SOLO las tiendas del usuario (jamás se mezclan
    -- tiendas sin permiso — superadmin ve todas, admin su tenant, resto
    -- sus membresías activas).
    SELECT COALESCE(array_agg(s), '{}') INTO v_store_ids
      FROM public.current_user_store_ids() AS s;
    IF array_length(v_store_ids, 1) IS NULL THEN
      v_store_ids := '{}';
    END IF;
  END IF;

  IF v_from IS NULL OR v_to IS NULL OR v_to < v_from THEN
    RAISE EXCEPTION 'ERR_INVALID_PERIOD: p_date_from/p_date_to inválidos';
  END IF;

  WITH

  -- ── Ventas válidas del período (ventana actual) ─────────────────────────
  sales AS (
    SELECT t.id, t.store_id, t.seller_id, t.subtotal, t.discount_value,
           t.tax_amount, t.total_amount, t.payment_method, t.completed_at,
           t.payment_incidents, t.created_at
      FROM public.transactions t
     WHERE t.status::text = COALESCE(NULLIF(p_status, ''), 'completed')
       AND t.completed_at >= v_from AND t.completed_at <= v_to
       AND t.store_id = ANY(v_store_ids)
       AND (p_seller_id IS NULL OR t.seller_id = p_seller_id)
       AND (p_status IS NULL OR p_status = '' OR t.status::text = p_status)
       AND (p_payment_method IS NULL OR p_payment_method = ''
            OR t.payment_method::text = p_payment_method)
  ),

  -- ── Serie temporal: buckets completos (generate_series) en Havana ───────
  -- Granularidad: hora (≤3d), día (≤62d), semana (≤180d), mes (resto).
  gran AS (
    SELECT CASE
      WHEN (v_to - v_from) <= interval '3 days' THEN 'hour'
      WHEN (v_to - v_from) <= interval '62 days' THEN 'day'
      WHEN (v_to - v_from) <= interval '180 days' THEN 'week'
      ELSE 'month'
    END AS unit
  ),
  buckets AS (
    SELECT gs AS bucket_start
      FROM gran, generate_series(
        date_trunc((SELECT unit FROM gran), v_from AT TIME ZONE 'America/Havana') AT TIME ZONE 'America/Havana',
        v_to,
        CASE (SELECT unit FROM gran)
          WHEN 'hour' THEN interval '1 hour'
          WHEN 'day' THEN interval '1 day'
          WHEN 'week' THEN interval '1 week'
          ELSE interval '1 month'
        END
      ) AS gs
  ),
  sales_bucketed AS (
    SELECT b.bucket_start,
           COUNT(s.id) AS ops,
           COALESCE(SUM(s.subtotal), 0) AS gross,
           COALESCE(SUM(s.total_amount), 0) AS net,
           COALESCE(SUM(s.discount_value), 0) AS discounts
      FROM buckets b
      LEFT JOIN sales s
        ON date_trunc((SELECT unit FROM gran), s.completed_at AT TIME ZONE 'America/Havana')
           AT TIME ZONE 'America/Havana' = b.bucket_start
     GROUP BY b.bucket_start
  ),

  -- ── Devoluciones del período (documento NC; en SU moneda) ──────────────
  devos AS (
    SELECT d.id, d.store_id, d.original_transaction_id, d.total_amount,
           d.currency, d.processed_by, d.created_at, d.status
      FROM public.devolutions d
     WHERE d.status = 'completed'
       AND d.created_at >= v_from AND d.created_at <= v_to
       AND d.store_id = ANY(v_store_ids)
  ),

  -- ── Unidades: líneas de ventas válidas / líneas de devolución ───────────
  item_units AS (
    SELECT ti.product_id, SUM(ti.quantity) AS units
      FROM public.transaction_items ti
      JOIN sales s ON s.id = ti.transaction_id
     GROUP BY ti.product_id
  ),
  devo_units AS (
    SELECT di.product_id, SUM(di.quantity) AS units
      FROM public.devolution_items di
      JOIN devos d ON d.id = di.devolution_id
     GROUP BY di.product_id
  ),

  -- ── Cobros reales (fuente autoritativa, por moneda) ─────────────────────
  payments AS (
    SELECT pt.payment_method, pt.currency, pt.amount, pt.amount_cup,
           pt.transaction_id, s.seller_id, s.payment_method AS sale_method
      FROM public.payment_transactions pt
      JOIN sales s ON s.id = pt.transaction_id
     WHERE pt.ref_type = 'sale' AND pt.direction = 'in'
  ),

  -- ── Ventas válidas del período ANTERIOR equivalente (mismos filtros) ────
  sales_prev AS (
    SELECT t.id, t.subtotal, t.discount_value, t.total_amount, t.seller_id,
           t.payment_method
      FROM public.transactions t
     WHERE t.status::text = COALESCE(NULLIF(p_status, ''), 'completed')
       AND t.completed_at >= v_prev_from AND t.completed_at <= v_prev_to
       AND t.store_id = ANY(v_store_ids)
       AND (p_seller_id IS NULL OR t.seller_id = p_seller_id)
       AND (p_status IS NULL OR p_status = '' OR t.status::text = p_status)
       AND (p_payment_method IS NULL OR p_payment_method = ''
            OR t.payment_method::text = p_payment_method)
  ),
  devos_prev AS (
    SELECT d.id, d.total_amount, d.currency
      FROM public.devolutions d
     WHERE d.status = 'completed'
       AND d.created_at >= v_prev_from AND d.created_at <= v_prev_to
       AND d.store_id = ANY(v_store_ids)
  ),
  payments_prev AS (
    SELECT pt.payment_method, pt.currency, pt.amount
      FROM public.payment_transactions pt
      JOIN sales_prev sp ON sp.id = pt.transaction_id
     WHERE pt.ref_type = 'sale' AND pt.direction = 'in'
  ),

  -- ── Totales del período actual ──────────────────────────────────────────
  totals AS (
    SELECT
      COUNT(s.id) AS ops,
      COALESCE(SUM(s.subtotal), 0) AS gross,
      COALESCE(SUM(s.discount_value), 0) AS discounts,
      COALESCE(SUM(s.tax_amount), 0) AS taxes,
      COALESCE(SUM(s.total_amount), 0) AS net
    FROM sales s
  ),
  devo_totals AS (
    SELECT
      COALESCE(SUM(total_amount) FILTER (WHERE currency = 'CUP'), 0) AS cup,
      COALESCE(SUM(total_amount) FILTER (WHERE currency = 'USD'), 0) AS usd
    FROM devos
  ),
  pay_totals AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE currency = 'USD' AND payment_method = 'zelle'), 0) AS usd,
      COALESCE(SUM(amount_cup), 0) AS cup_equiv,
      COUNT(*) AS rows
    FROM payments
  ),

  -- ── Totales del período anterior ────────────────────────────────────────
  totals_prev AS (
    SELECT COUNT(sp.id) AS ops,
           COALESCE(SUM(sp.subtotal), 0) AS gross,
           COALESCE(SUM(sp.discount_value), 0) AS discounts,
           COALESCE(SUM(sp.total_amount), 0) AS net
    FROM sales_prev sp
  ),
  devo_totals_prev AS (
    SELECT COALESCE(SUM(total_amount) FILTER (WHERE currency = 'CUP'), 0) AS cup,
           COALESCE(SUM(total_amount) FILTER (WHERE currency = 'USD'), 0) AS usd
    FROM devos_prev
  ),
  pay_totals_prev AS (
    SELECT COALESCE(SUM(amount) FILTER (WHERE currency = 'USD' AND payment_method = 'zelle'), 0) AS usd
    FROM payments_prev
  ),

  -- ── Rendimiento por vendedor (ventas + devoluciones por venta original) ─
  seller_rows AS (
    SELECT
      s.seller_id,
      p.full_name AS seller_name,
      COUNT(*) AS ops,
      COALESCE(SUM(s.subtotal), 0) AS gross,
      COALESCE(SUM(s.discount_value), 0) AS discounts,
      COALESCE(SUM(s.total_amount), 0) AS net
    FROM sales s
    LEFT JOIN public.profiles p ON p.id = s.seller_id
    GROUP BY s.seller_id, p.full_name
  ),
  seller_devo AS (
    SELECT t.seller_id, COALESCE(SUM(d.total_amount), 0) AS devolutions_cup
      FROM devos d
      JOIN public.transactions t ON t.id = d.original_transaction_id
     WHERE d.currency = 'CUP'
     GROUP BY t.seller_id
  ),
  sellers AS (
    -- Participación sobre las ventas NETAS del ámbito filtrado (total
    -- comparable): neto del vendedor tras sus devoluciones ÷ neto total.
    SELECT sr.*, COALESCE(sd.devolutions_cup, 0) AS devolutions_cup,
           CASE WHEN (SELECT net FROM totals) > 0
                THEN ROUND(100.0 * (sr.net - COALESCE(sd.devolutions_cup, 0))
                           / (SELECT net FROM totals), 2)
                ELSE 0 END AS participation_pct
      FROM seller_rows sr
      LEFT JOIN seller_devo sd ON sd.seller_id = sr.seller_id
  ),

  -- ── Productos: neto por producto (CUP contable, neto de descuento línea) ─
  product_net AS (
    SELECT ti.product_id,
           pr.name AS product_name,
           pr.sku,
           SUM(ti.quantity) AS units,
           SUM(GREATEST(ti.quantity * ti.price_at_sale_cup - COALESCE(ti.item_discount_value, 0), 0)) AS net_cup
      FROM public.transaction_items ti
      JOIN sales s ON s.id = ti.transaction_id
      LEFT JOIN public.products pr ON pr.id = ti.product_id
     GROUP BY ti.product_id, pr.name, pr.sku
  ),
  product_units AS (
    SELECT COALESCE(u.product_id, du.product_id) AS product_id,
           COALESCE(u.units, 0) AS sold_units,
           COALESCE(du.units, 0) AS returned_units
      FROM item_units u
      FULL OUTER JOIN devo_units du ON du.product_id = u.product_id
  ),
  products_agg AS (
    SELECT COALESCE(pn.product_id, pu.product_id) AS product_id,
           COALESCE(pn.product_name, pr2.name) AS product_name,
           COALESCE(pn.sku, pr2.sku) AS sku,
           COALESCE(pu.sold_units, 0) AS units_sold,
           COALESCE(pu.returned_units, 0) AS units_returned,
           COALESCE(pn.net_cup, 0) AS net_cup
      FROM product_net pn
      FULL OUTER JOIN product_units pu ON pu.product_id = pn.product_id
      LEFT JOIN public.products pr2 ON pr2.id = COALESCE(pn.product_id, pu.product_id)
  ),
  total_product_net AS (
    SELECT COALESCE(SUM(net_cup), 0) AS total FROM products_agg WHERE net_cup > 0
  ),
  top_products AS (
    SELECT pa.product_id, pa.product_name, pa.sku, pa.units_sold,
           pa.units_returned, pa.net_cup,
           CASE WHEN (SELECT total FROM total_product_net) > 0
                THEN ROUND(100.0 * pa.net_cup / (SELECT total FROM total_product_net), 2)
                ELSE 0 END AS participation_pct
      FROM products_agg pa
     ORDER BY pa.net_cup DESC, pa.units_sold DESC
     LIMIT v_limit_products
  ),
  top_units AS (
    SELECT product_id, product_name, sku, units_sold, units_returned, net_cup
      FROM products_agg
     ORDER BY units_sold DESC, net_cup DESC
     LIMIT v_limit_products
  ),
  -- Menor movimiento: catálogo activo del ámbito SIN actividad (0 unidades)
  -- o por debajo del percentil 25 de unidades vendidas del período.
  active_catalog AS (
    SELECT pr.id, pr.name, pr.sku
      FROM public.products pr
     WHERE pr.is_active = true
       AND pr.status = 'ACTIVE'
       AND pr.store_id = ANY(v_store_ids)
       AND pr.is_service = false
  ),
  sold_stats AS (
    SELECT COALESCE(percentile_cont(0.25) WITHIN GROUP (ORDER BY units_sold), 0) AS p25
      FROM products_agg WHERE units_sold > 0
  ),
  low_movement AS (
    SELECT ac.id AS product_id, ac.name AS product_name, ac.sku,
           COALESCE(pu.sold_units, 0) AS units_sold
      FROM active_catalog ac
      LEFT JOIN product_units pu ON pu.product_id = ac.id
     WHERE COALESCE(pu.sold_units, 0) = 0
        OR COALESCE(pu.sold_units, 0) <= (SELECT p25 FROM sold_stats)
     ORDER BY COALESCE(pu.sold_units, 0) ASC, ac.name ASC
     LIMIT v_limit_products
  ),

  -- ── Métodos de pago: facturado (documento) vs cobrado (payment_transactions)
  method_doc AS (
    SELECT s.payment_method::text AS method,
           COUNT(*) AS ops,
           COALESCE(SUM(s.total_amount), 0) AS amount_cup
      FROM sales s
     GROUP BY s.payment_method
  ),
  method_pay AS (
    SELECT pt.payment_method AS method,
           pt.currency,
           COUNT(DISTINCT pt.transaction_id) AS ops,
           COALESCE(SUM(pt.amount), 0) AS amount
      FROM payments pt
     GROUP BY pt.payment_method, pt.currency
  ),

  -- ── Horario: día de semana × hora (America/Havana) ──────────────────────
  heatmap AS (
    SELECT EXTRACT(ISODOW FROM s.completed_at AT TIME ZONE 'America/Havana')::int AS dow,
           EXTRACT(HOUR FROM s.completed_at AT TIME ZONE 'America/Havana')::int AS hour,
           COUNT(*) AS ops,
           COALESCE(SUM(s.total_amount), 0) AS net
      FROM sales s
     GROUP BY 1, 2
  ),

  -- ── Alertas ──────────────────────────────────────────────────────────────
  doc_status_counts AS (
    SELECT t.status::text AS status, COUNT(*) AS ops,
           COALESCE(SUM(t.total_amount), 0) AS amount
      FROM public.transactions t
     WHERE t.completed_at >= v_from AND t.completed_at <= v_to
       AND t.store_id = ANY(v_store_ids)
       AND t.status IN ('voided', 'reversed', 'pending', 'failed', 'cancelled', 'compensated', 'refunded')
     GROUP BY t.status
  ),
  incident_sales AS (
    SELECT COUNT(*) AS ops
      FROM sales s
     WHERE s.payment_incidents IS NOT NULL
       AND s.payment_incidents::text NOT IN ('null', '[]', '{}', '')
  ),
  sync_log_alerts AS (
    SELECT sl.status AS status, COUNT(*) AS ops
      FROM public.sync_log sl
     WHERE sl.created_at >= v_from AND sl.created_at <= v_to
       AND sl.entity = 'sale'
       AND sl.status IN ('error', 'conflict')
       AND sl.store_id = ANY(v_store_ids)
     GROUP BY sl.status
  ),
  -- Conciliación: ventas válidas sin pagos registrados o con diferencia > 0.05
  unreconciled AS (
    SELECT COUNT(*) AS ops,
           COALESCE(SUM(s.total_amount - COALESCE(pt.sum_cup, 0)), 0) AS diff
      FROM sales s
      LEFT JOIN (
        SELECT transaction_id, SUM(amount_cup) AS sum_cup
          FROM public.payment_transactions
         WHERE ref_type = 'sale' AND direction = 'in'
         GROUP BY transaction_id
      ) pt ON pt.transaction_id = s.id
     WHERE COALESCE(pt.sum_cup, 0) = 0
        OR ABS(s.total_amount - COALESCE(pt.sum_cup, 0)) > 0.05
  )

  SELECT jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to,
      'granularity', (SELECT unit FROM gran),
      'prev_from', v_prev_from, 'prev_to', v_prev_to),
    'kpi', jsonb_build_object(
      'ops', (SELECT ops FROM totals),
      'gross_cup', (SELECT ROUND(gross, 2) FROM totals),
      'discounts_cup', (SELECT ROUND(discounts, 2) FROM totals),
      'taxes_cup', (SELECT ROUND(taxes, 2) FROM totals),
      'net_cup', (SELECT ROUND(net, 2) FROM totals),
      'devolutions_cup', (SELECT ROUND(cup, 2) FROM devo_totals),
      'devolutions_usd', (SELECT ROUND(usd, 2) FROM devo_totals),
      'collected_usd', (SELECT ROUND(usd, 2) FROM pay_totals),
      'collected_cup_equiv', (SELECT ROUND(cup_equiv, 2) FROM pay_totals),
      'avg_ticket_cup', (SELECT CASE WHEN ops > 0 THEN ROUND(net / ops, 2) ELSE 0 END FROM totals),
      'units_sold', (SELECT COALESCE(SUM(units), 0) FROM item_units),
      'units_returned', (SELECT COALESCE(SUM(units), 0) FROM devo_units),
      'prev', jsonb_build_object(
        'ops', (SELECT ops FROM totals_prev),
        'gross_cup', (SELECT ROUND(gross, 2) FROM totals_prev),
        'discounts_cup', (SELECT ROUND(discounts, 2) FROM totals_prev),
        'net_cup', (SELECT ROUND(net, 2) FROM totals_prev),
        'devolutions_cup', (SELECT ROUND(cup, 2) FROM devo_totals_prev),
        'devolutions_usd', (SELECT ROUND(usd, 2) FROM devo_totals_prev),
        'collected_usd', (SELECT ROUND(usd, 2) FROM pay_totals_prev),
        'avg_ticket_cup', (SELECT CASE WHEN ops > 0 THEN ROUND(net / ops, 2) ELSE 0 END FROM totals_prev)
      )
    ),
    'series', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'bucket', to_char(bucket_start AT TIME ZONE 'America/Havana', 'YYYY-MM-DD HH24:MI'),
        'ops', ops, 'gross_cup', ROUND(gross, 2), 'net_cup', ROUND(net, 2),
        'discounts_cup', ROUND(discounts, 2)
      ) ORDER BY bucket_start), '[]'::jsonb)
      FROM sales_bucketed
    ),
    'sellers', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'seller_id', seller_id, 'name', COALESCE(seller_name, 'Usuario'),
        'ops', ops, 'gross_cup', ROUND(gross, 2), 'discounts_cup', ROUND(discounts, 2),
        'devolutions_cup', ROUND(devolutions_cup, 2),
        'net_cup', ROUND(net, 2),
        'avg_ticket_cup', CASE WHEN ops > 0 THEN ROUND(net / ops, 2) ELSE 0 END,
        'participation_pct', participation_pct
      ) ORDER BY net DESC), '[]'::jsonb)
      FROM sellers
    ),
    'products', jsonb_build_object(
      'top_net', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY rn), '[]'::jsonb) FROM (
        SELECT ROW_NUMBER() OVER (ORDER BY net_cup DESC) AS rn, 'net' AS kind,
               product_id, product_name AS name, sku, units_sold, units_returned,
               ROUND(net_cup, 2) AS net_cup, participation_pct FROM top_products) x),
      'top_units', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY rn), '[]'::jsonb) FROM (
        SELECT ROW_NUMBER() OVER (ORDER BY units_sold DESC) AS rn, 'units' AS kind,
               product_id, product_name AS name, sku, units_sold, units_returned,
               ROUND(net_cup, 2) AS net_cup FROM top_units) x),
      'low_movement', (SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb) FROM (
        SELECT product_id, product_name AS name, sku, units_sold FROM low_movement) x),
      'total_net_cup', (SELECT ROUND(total, 2) FROM total_product_net)
    ),
    'payment_methods', jsonb_build_object(
      'by_document', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'method', method, 'ops', ops, 'amount_cup', ROUND(amount_cup, 2)
        ) ORDER BY amount_cup DESC), '[]'::jsonb) FROM method_doc),
      'by_collection', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'method', method, 'currency', currency, 'ops', ops,
          'amount', ROUND(amount, 2)
        ) ORDER BY amount DESC), '[]'::jsonb) FROM method_pay)
    ),
    'heatmap', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'dow', dow, 'hour', hour, 'ops', ops, 'net_cup', ROUND(net, 2)
      )), '[]'::jsonb) FROM heatmap
    ),
    'alerts', jsonb_build_object(
      'doc_status', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'status', status, 'ops', ops, 'amount_cup', ROUND(amount, 2)
      )), '[]'::jsonb) FROM doc_status_counts),
      'devolutions_count', (SELECT COUNT(*) FROM devos),
      'devolutions_cup', (SELECT ROUND(cup, 2) FROM devo_totals),
      'devolutions_usd', (SELECT ROUND(usd, 2) FROM devo_totals),
      'incident_sales', (SELECT ops FROM incident_sales),
      'sync_log', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'status', status, 'ops', ops)), '[]'::jsonb) FROM sync_log_alerts),
      'unreconciled_ops', (SELECT ops FROM unreconciled),
      'unreconciled_diff_cup', (SELECT ROUND(diff, 2) FROM unreconciled)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_sales_dashboard_analytics(uuid, timestamptz, timestamptz, timestamptz, timestamptz, uuid, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_dashboard_analytics(uuid, timestamptz, timestamptz, timestamptz, timestamptz, uuid, text, text, integer) TO authenticated, service_role;

-- Consulta de detalle por producto (drill-down): ventas válidas del período
-- que contienen el producto. Solo lectura, mismos guards.
CREATE OR REPLACE FUNCTION public.get_sales_dashboard_product_detail(
  p_store_id uuid,
  p_date_from timestamptz,
  p_date_to timestamptz,
  p_product_id uuid
)
RETURNS TABLE(
  transaction_id uuid,
  completed_at timestamptz,
  seller_name text,
  total_amount numeric,
  quantity numeric,
  line_net_cup numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Guard de sesión (mismo patrón que get_sales_dashboard_analytics;
  -- exigido además por el gate CI secdef_no_auth)
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_PERMISSION_DENIED: sesión requerida' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT ti.transaction_id,
         t.completed_at,
         COALESCE(p.full_name, 'Usuario') AS seller_name,
         t.total_amount,
         ti.quantity,
         GREATEST(ti.quantity * ti.price_at_sale_cup - COALESCE(ti.item_discount_value, 0), 0) AS line_net_cup
    FROM public.transaction_items ti
    JOIN public.transactions t ON t.id = ti.transaction_id
    LEFT JOIN public.profiles p ON p.id = t.seller_id
   WHERE ti.product_id = p_product_id
     AND t.status = 'completed'
     AND t.completed_at >= p_date_from AND t.completed_at <= p_date_to
     AND (p_store_id IS NULL AND public.has_store_access(t.store_id)
          OR p_store_id IS NOT NULL AND t.store_id = p_store_id AND public.has_store_access(p_store_id))
   ORDER BY t.completed_at DESC
   LIMIT 200;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_sales_dashboard_product_detail(uuid, timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_dashboard_product_detail(uuid, timestamptz, timestamptz, uuid) TO authenticated, service_role;
