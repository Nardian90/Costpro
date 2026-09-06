-- GATE 10 · Payload del backup 08-02 vs estado actual (READ ONLY)
WITH pl AS (
  SELECT rs.backup_payload AS p
  FROM restore_sessions rs
  WHERE rs.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
  ORDER BY rs.initiated_at DESC LIMIT 1
)
SELECT jsonb_build_object(
  'meta', (SELECT p->'meta' FROM pl),
  'prod_rows', (SELECT jsonb_array_length(p->'tables'->'products') FROM pl),
  'prod_stock_gt0', (SELECT count(*) FROM jsonb_array_elements((SELECT p->'tables'->'products' FROM pl)) r WHERE (r->>'stock_current')::numeric > 0),
  'prod_stock_sum', (SELECT COALESCE(SUM((r->>'stock_current')::numeric),0) FROM jsonb_array_elements((SELECT p->'tables'->'products' FROM pl)) r),
  'inv_rows', (SELECT jsonb_array_length(p->'tables'->'inventory') FROM pl),
  'inv_qty_sum', (SELECT COALESCE(SUM((r->>'quantity')::numeric),0) FROM jsonb_array_elements((SELECT p->'tables'->'inventory' FROM pl)) r),
  'inv_qty_gt0', (SELECT count(*) FROM jsonb_array_elements((SELECT p->'tables'->'inventory' FROM pl)) r WHERE (r->>'quantity')::numeric > 0),
  'sm_rows', (SELECT jsonb_array_length(p->'tables'->'stock_movements') FROM pl),
  'sm_sum', (SELECT COALESCE(SUM((r->>'quantity_change')::numeric),0) FROM jsonb_array_elements((SELECT p->'tables'->'stock_movements' FROM pl)) r),
  'sm_by_type', (SELECT COALESCE(jsonb_agg(jsonb_build_object('type', q.t, 'n', q.n, 'sum', q.s) ORDER BY q.n DESC), '[]')
    FROM (SELECT r->>'movement_type' t, count(*) n, SUM((r->>'quantity_change')::numeric) s
          FROM jsonb_array_elements((SELECT p->'tables'->'stock_movements' FROM pl)) r GROUP BY 1) q),
  'tx_rows', (SELECT jsonb_array_length(p->'tables'->'transactions') FROM pl),
  'sm_date_range', (SELECT jsonb_build_object('min', MIN(r->>'movement_date'), 'max', MAX(r->>'movement_date'))
    FROM jsonb_array_elements((SELECT p->'tables'->'stock_movements' FROM pl)) r),
  'prod_created_range', (SELECT jsonb_build_object('min', MIN(r->>'created_at'), 'max', MAX(r->>'created_at'))
    FROM jsonb_array_elements((SELECT p->'tables'->'products' FROM pl)) r),
  'consistency_backup', (SELECT jsonb_build_object(
      'prod_equals_inv', (SELECT count(*) FROM jsonb_array_elements((SELECT p->'tables'->'products' FROM pl)) pr
        JOIN jsonb_array_elements((SELECT p->'tables'->'inventory' FROM pl)) ir
          ON ir->>'product_id' = pr->>'id'
        WHERE (pr->>'stock_current')::numeric = (ir->>'quantity')::numeric),
      'prod_without_inv', (SELECT count(*) FROM jsonb_array_elements((SELECT p->'tables'->'products' FROM pl)) pr
        WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements((SELECT p->'tables'->'inventory' FROM pl)) ir WHERE ir->>'product_id' = pr->>'id')),
      'inv_without_prod', (SELECT count(*) FROM jsonb_array_elements((SELECT p->'tables'->'inventory' FROM pl)) ir
        WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements((SELECT p->'tables'->'products' FROM pl)) pr WHERE pr->>'id' = ir->>'product_id')))),
  'per_product', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', left(pr->>'id', 8),
        'sku', pr->>'sku',
        'name', left(COALESCE(pr->>'name',''), 30),
        'b_stock', (pr->>'stock_current')::numeric,
        'b_inv', COALESCE(bi.qty, -1),
        'b_upd', left(COALESCE(pr->>'updated_at',''), 16),
        't_stock', tp.stock_current,
        'stock_frozen', (tp.stock_current = (pr->>'stock_current')::numeric),
        'stock_eq_binv', (tp.stock_current = COALESCE(bi.qty, -999999))
      ) ORDER BY (pr->>'stock_current')::numeric DESC), '[]')
    FROM jsonb_array_elements((SELECT p->'tables'->'products' FROM pl)) pr
    LEFT JOIN LATERAL (
      SELECT (ir->>'quantity')::numeric AS qty
      FROM jsonb_array_elements((SELECT p->'tables'->'inventory' FROM pl)) ir
      WHERE ir->>'product_id' = pr->>'id' LIMIT 1
    ) bi ON true
    JOIN products tp ON tp.id = (pr->>'id')::uuid
  ),
  'today_products_not_in_backup', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', left(tp.id::text,8), 'sku', tp.sku, 'name', left(tp.name,30),
      't_stock', tp.stock_current, 'created', left(tp.created_at::text,16))), '[]')
    FROM products tp
    WHERE tp.store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements((SELECT p->'tables'->'products' FROM pl)) pr WHERE pr->>'id' = tp.id::text))
) AS evidence;
