-- R2 · GATE 2 — fixture candidates + actor qualification (READ ONLY)
SELECT jsonb_build_object(
  'captured_at', now(),
  'fixtures', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'product_id', p.id, 'sku', p.sku, 'name', p.name,
      'stock_current', p.stock_current, 'cost_average', p.cost_average, 'price', p.price,
      'is_service', p.is_service, 'has_movements', p.has_movements,
      'inv_qty', i.quantity, 'inv_version', i.version
    ) ORDER BY p.sku), '[]'::jsonb)
    FROM products p
    LEFT JOIN inventory i ON i.product_id = p.id AND i.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
    WHERE p.id IN (
      'e47421ea-f9aa-452b-b20b-4601ec12410f',
      '983e5726-a068-44b0-98b8-fef76ac481f1',
      '99885245-d370-46ea-99d9-176180574f77',
      'da1c4090-3e10-4120-a2bc-24da53cffe16',
      '5bf782be-70c8-4870-9514-46bc2ae9db69',
      '530e198c-0d42-4b36-852e-ba86f4431d94'
    )
  ),
  'actor', jsonb_build_object(
    'profile', (SELECT jsonb_build_object('id', pr.id, 'email', pr.email, 'role', pr.role) FROM profiles pr WHERE pr.id = '051c6157-600b-425e-b8c0-72388bacf541'),
    'memberships', (SELECT COALESCE(jsonb_agg(jsonb_build_object('store_id', m.store_id, 'role', m.role, 'status', m.status)), '[]'::jsonb) FROM user_store_memberships m WHERE m.user_id = '051c6157-600b-425e-b8c0-72388bacf541'),
    'has_store_access', (SELECT public.has_store_access_as('051c6157-600b-425e-b8c0-72388bacf541', 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')),
    'can_admin_reverse', (SELECT public.can_admin_reverse_transaction('051c6157-600b-425e-b8c0-72388bacf541', 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'))
  ),
  'store_sellers', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', pr.id, 'email', pr.email, 'role', pr.role)), '[]'::jsonb)
    FROM profiles pr WHERE pr.id IN (SELECT seller_id FROM transactions LIMIT 5) LIMIT 5
  ),
  'taxes_config', 'omitted-no-table'
) AS gate2;
