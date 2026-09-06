-- R1 · Universe revalidation + barriers (READ ONLY) — A1/A8/A9 + §5/§8 checks
SELECT jsonb_build_object(
  'captured_at', now(),
  'store_products', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'product_id', id, 'sku', sku, 'name', name,
      'stock_current', stock_current, 'cost_average', cost_average,
      'status', status, 'is_active', is_active, 'updated_at', updated_at
    ) ORDER BY id), '[]'::jsonb)
    FROM products WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
  ),
  'test_products', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', id, 'sku', sku, 'stock_current', stock_current) ORDER BY id), '[]'::jsonb)
    FROM products WHERE id IN (
      '5bf782be-70c8-4870-9514-46bc2ae9db69','530e198c-0d42-4b36-852e-ba86f4431d94',
      'aa5e148b-df42-4349-a131-867767352669','94e53fd4-75ae-4924-a1b1-1b3d13f90df8',
      '185f1c6f-e58a-4231-b39a-3a52f2c7ef22','7049d300-7e08-42f0-b081-d373a331d88c',
      '7dbff68e-3ad1-479b-b228-f81021699ed4','b7bd618c-38b4-475c-b775-dc81b233a825',
      'e9541bb4-97c2-4f1d-9cb2-836c38beefd7','8f4e2708-540c-477b-bef7-9aed96771a8f'
    )
  ),
  'test_inventory_rows', (SELECT count(*) FROM inventory WHERE product_id IN (
      '5bf782be-70c8-4870-9514-46bc2ae9db69','530e198c-0d42-4b36-852e-ba86f4431d94',
      'aa5e148b-df42-4349-a131-867767352669','94e53fd4-75ae-4924-a1b1-1b3d13f90df8',
      '185f1c6f-e58a-4231-b39a-3a52f2c7ef22','7049d300-7e08-42f0-b081-d373a331d88c',
      '7dbff68e-3ad1-479b-b228-f81021699ed4','b7bd618c-38b4-475c-b775-dc81b233a825',
      'e9541bb4-97c2-4f1d-9cb2-836c38beefd7','8f4e2708-540c-477b-bef7-9aed96771a8f')),
  'test_movement_rows', (SELECT count(*) FROM stock_movements WHERE product_id IN (
      '5bf782be-70c8-4870-9514-46bc2ae9db69','530e198c-0d42-4b36-852e-ba86f4431d94',
      'aa5e148b-df42-4349-a131-867767352669','94e53fd4-75ae-4924-a1b1-1b3d13f90df8',
      '185f1c6f-e58a-4231-b39a-3a52f2c7ef22','7049d300-7e08-42f0-b081-d373a331d88c',
      '7dbff68e-3ad1-479b-b228-f81021699ed4','b7bd618c-38b4-475c-b775-dc81b233a825',
      'e9541bb4-97c2-4f1d-9cb2-836c38beefd7','8f4e2708-540c-477b-bef7-9aed96771a8f')),
  'barrier_opening_movements', (SELECT count(*) FROM stock_movements WHERE reference_doc LIKE 'B10B-OBS2-RECON-OPENING:%'),
  'barrier_opening_rollback_movements', (SELECT count(*) FROM stock_movements WHERE reference_doc LIKE 'B10B-OBS2-RECON-ROLLBACK:%'),
  'barrier_audit_rows', (SELECT count(*) FROM audit_logs WHERE action = 'STOCK_RECONCILIATION_OPENING'),
  'actor_profile', (
    SELECT jsonb_build_object('id', id, 'email', email, 'role', role, 'is_active', is_active, 'tenant_id', tenant_id)
    FROM profiles WHERE id = '051c6157-600b-425e-b8c0-72388bacf541'
  )
) AS universe_revalidation;
