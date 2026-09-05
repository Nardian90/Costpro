-- W9.5-B8 · GATE 1c — funciones de creación de ventas + columnas necesarias para fixture
SELECT jsonb_build_object(
  'a_sale_creator_fns', (
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND (p.proname ILIKE '%create_sale%' OR p.proname ILIKE '%checkout%' OR p.proname ILIKE '%register_sale%')
      ORDER BY p.proname
    ) t
  ),
  'b_required_cols', (
    SELECT jsonb_object_agg(tbl, cols) FROM (
      SELECT c.relname AS tbl,
             jsonb_agg(jsonb_build_object('col', a.attname, 'type', format_type(a.atttypid,a.atttypmod),
                       'notnull', a.attnotnull, 'def', pg_get_expr(ad.adbin, ad.adrelid))) AS cols
      FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      LEFT JOIN pg_attrdef ad ON ad.adrelid=c.oid AND ad.adnum=a.attnum
      WHERE n.nspname='public' AND c.relname IN ('stores','products','transaction_items','payment_transactions','inventory','stock_movements','audit_logs','auth_users_shadow')
      GROUP BY c.relname
    ) x
  ),
  'c_auth_users_required', (
    SELECT jsonb_agg(jsonb_build_object('col', a.attname, 'notnull', a.attnotnull, 'def', pg_get_expr(ad.adbin, ad.adrelid)))
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef ad ON ad.adrelid=c.oid AND ad.adnum=a.attnum
    WHERE n.nspname='auth' AND c.relname='users'
  ),
  'd_store_min_shape', (
    SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT id, name, slug FROM stores LIMIT 2
    ) t
  ),
  'e_a_sample_tx_shape', (
    SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT id, store_id, seller_id, status, total_amount, payment_method, cancelled_at, created_at
      FROM transactions ORDER BY created_at DESC LIMIT 1
    ) t
  ),
  'f_sample_tx_items', (
    SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT ti.* FROM transaction_items ti
      JOIN transactions tx ON tx.id = ti.transaction_id
      ORDER BY tx.created_at DESC LIMIT 2
    ) t
  ),
  'g_sample_payment', (
    SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT pt.* FROM payment_transactions pt
      JOIN transactions tx ON tx.id = pt.transaction_id
      ORDER BY tx.created_at DESC LIMIT 1
    ) t
  ),
  'h_sample_product', (
    SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT id, name, store_id, cost_average, stock_current FROM products LIMIT 1
    ) t
  ),
  'i_sample_membership', (
    SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT * FROM user_store_memberships WHERE status='active' LIMIT 1
    ) t
  )
) AS gate1c;
