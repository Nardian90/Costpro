SELECT jsonb_build_object(
  'mismatched', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'sku', p.sku, 'stock', p.stock_current, 'inv', i.quantity) ORDER BY p.sku), '[]'::jsonb)
    FROM products p
    LEFT JOIN inventory i ON i.product_id = p.id AND i.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
    WHERE p.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND COALESCE(i.quantity, 0) <> COALESCE(p.stock_current, 0)
  )
) AS m;
