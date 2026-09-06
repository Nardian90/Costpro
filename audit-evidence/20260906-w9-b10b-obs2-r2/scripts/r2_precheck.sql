SELECT jsonb_build_object(
  'actor_active', (SELECT p.is_active FROM profiles p WHERE p.id = '051c6157-600b-425e-b8c0-72388bacf541'),
  'store_row', (SELECT jsonb_build_object('id', s.id, 'name', s.name) FROM stores s WHERE s.id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
  'payment_enum', (SELECT coalesce(jsonb_agg(e.enumlabel ORDER BY e.enumsortorder), '[]'::jsonb) FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname='payment_method_enum'),
  'current_user_probe', (SELECT current_user)
) AS pre;
