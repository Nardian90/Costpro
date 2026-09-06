-- R2 · GATE 3 — PRE-operational fixture snapshot (READ ONLY)
SELECT jsonb_build_object(
  'captured_at', now(),
  'fixtures', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'product_id', p.id, 'sku', p.sku, 'name', p.name,
      'stock_current', p.stock_current, 'cost_average', p.cost_average, 'price', p.price,
      'is_service', p.is_service, 'has_movements', p.has_movements, 'updated_at', p.updated_at,
      'inv', (SELECT jsonb_build_object('quantity', i.quantity, 'version', i.version, 'updated_at', i.updated_at) FROM inventory i WHERE i.product_id = p.id AND i.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'movements', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', m.id, 'qty', m.quantity_change, 'type', m.movement_type, 'ref_doc', m.reference_doc, 'ref_id', m.reference_id, 'unit_cost', m.unit_cost, 'balance_after', m.balance_after, 'created_at', m.created_at, 'created_by', m.created_by) ORDER BY m.created_at, m.id), '[]'::jsonb) FROM stock_movements m WHERE m.product_id = p.id AND m.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'kardex', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', k.id, 'type', k.movement_type, 'qty', k.quantity, 'unit_cost', k.unit_cost, 'total_value', k.total_value, 'bal_qty', k.balance_quantity, 'bal_value', k.balance_total_value, 'ref_desc', k.reference_description, 'created_at', k.created_at) ORDER BY k.created_at, k.id), '[]'::jsonb) FROM kardex_entries k WHERE k.product_id = p.id AND k.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'business_events', (SELECT count(*) FROM business_events b WHERE b.entity_id = p.id AND b.payload->>'store_id' = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')
    ) ORDER BY p.sku), '[]'::jsonb)
    FROM products p
    WHERE p.id IN (
      'e47421ea-f9aa-452b-b20b-4601ec12410f',
      '983e5726-a068-44b0-98b8-fef76ac481f1',
      '99885245-d370-46ea-99d9-176180574f77',
      'da1c4090-3e10-4120-a2bc-24da53cffe16'
    )
  ),
  'test_products', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'product_id', p.id, 'sku', p.sku, 'stock_current', p.stock_current,
      'in_batch', EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.product_id = p.id AND sm.reference_doc LIKE 'B10B-OBS2-RECON-OPENING:%'),
      'movement_rows', (SELECT count(*) FROM stock_movements sm WHERE sm.product_id = p.id),
      'inventory_rows', (SELECT count(*) FROM inventory i WHERE i.product_id = p.id)
    ) ORDER BY p.sku), '[]'::jsonb)
    FROM products p WHERE p.id IN (
      '5bf782be-70c8-4870-9514-46bc2ae9db69','530e198c-0d42-4b36-852e-ba86f4431d94',
      'aa5e148b-df42-4349-a131-867767352669','94e53fd4-75ae-4924-a1b1-1b3d13f90df8',
      '185f1c6f-e58a-4231-b39a-3a52f2c7ef22','7049d300-7e08-42f0-b081-d373a331d88c',
      '7dbff68e-3ad1-479b-b228-f81021699ed4','b7bd618c-38b4-475c-b775-dc81b233a825',
      'e9541bb4-97c2-4f1d-9cb2-836c38beefd7','8f4e2708-540c-477b-bef7-9aed96771a8f')
  ),
  'store_state', jsonb_build_object(
    'transactions_store', (SELECT count(*) FROM transactions WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'payments_store_tx', (SELECT count(*) FROM payment_transactions pt JOIN transactions t ON t.id = pt.transaction_id WHERE t.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'audit_store', (SELECT count(*) FROM audit_logs WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'movements_store', (SELECT count(*) FROM stock_movements WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'kardex_store', (SELECT count(*) FROM kardex_entries WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'be_store', (SELECT count(*) FROM business_events WHERE payload->>'store_id' = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
    'wac_log_store', (SELECT count(*) FROM wac_change_log WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')
  ),
  'initial_movement_fingerprints', (
    SELECT COALESCE(jsonb_object_agg(m.product_id, md5(concat(m.id::text, m.quantity_change::text, m.unit_cost::text, m.reference_doc, m.reference_id, m.created_at::text, m.created_by::text, m.movement_type::text))), '{}'::jsonb)
    FROM stock_movements m WHERE m.reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'
  )
) AS pre_op;
