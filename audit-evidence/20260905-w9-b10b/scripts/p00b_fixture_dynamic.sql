
-- ═══ B-10b fixture fase B: devoluciones canónicas (create_devolution_v2) ═══
-- claims service_role para que p_user_id sea honorado (canal API real)
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
CREATE TEMP TABLE b10b_ids(name text PRIMARY KEY, id uuid NOT NULL);
INSERT INTO b10b_ids VALUES ('D1', (public.create_devolution_v2(
  p_store_id => 'b10b0000-0000-4000-8000-00000000000a',
  p_items => '[{"product_id":"b10b0000-0000-4000-8000-0000000002a1","quantity":3,"unit_price":10}]'::jsonb,
  p_reason => 'b10b D1 happy', p_user_id => 'b10b0000-0000-4000-8000-0000000001a1',
  p_original_transaction_id => 'b10b0000-0000-4000-8000-0000000004c1')->>'devolution_id')::uuid);
INSERT INTO b10b_ids VALUES ('D2', (public.create_devolution_v2(
  p_store_id => 'b10b0000-0000-4000-8000-00000000000a',
  p_items => '[{"product_id":"b10b0000-0000-4000-8000-0000000002a2","quantity":2,"unit_price":10}]'::jsonb,
  p_reason => 'b10b D2 zero', p_user_id => 'b10b0000-0000-4000-8000-0000000001a1',
  p_original_transaction_id => 'b10b0000-0000-4000-8000-0000000004c2')->>'devolution_id')::uuid);
INSERT INTO b10b_ids VALUES ('D3', (public.create_devolution_v2(
  p_store_id => 'b10b0000-0000-4000-8000-00000000000a',
  p_items => '[{"product_id":"b10b0000-0000-4000-8000-0000000002a3","quantity":3,"unit_price":10}]'::jsonb,
  p_reason => 'b10b D3 drain', p_user_id => 'b10b0000-0000-4000-8000-0000000001a1',
  p_original_transaction_id => 'b10b0000-0000-4000-8000-0000000004c3')->>'devolution_id')::uuid);
INSERT INTO b10b_ids VALUES ('D6', (public.create_devolution_v2(
  p_store_id => 'b10b0000-0000-4000-8000-00000000000a',
  p_items => '[{"product_id":"b10b0000-0000-4000-8000-0000000002a5","quantity":1,"unit_price":10}]'::jsonb,
  p_reason => 'b10b D6 ga', p_user_id => 'b10b0000-0000-4000-8000-0000000001a1',
  p_original_transaction_id => 'b10b0000-0000-4000-8000-0000000004c4')->>'devolution_id')::uuid);
INSERT INTO b10b_ids VALUES ('D7', (public.create_devolution_v2(
  p_store_id => 'b10b0000-0000-4000-8000-00000000000a',
  p_items => '[{"product_id":"b10b0000-0000-4000-8000-0000000002a6","quantity":2,"unit_price":10}]'::jsonb,
  p_reason => 'b10b D7 concurrency', p_user_id => 'b10b0000-0000-4000-8000-0000000001a1',
  p_original_transaction_id => 'b10b0000-0000-4000-8000-0000000004c5')->>'devolution_id')::uuid);

-- Drenaje P3 (venta canónica: stock 7→0) para el caso stock insuficiente
DO $$ BEGIN
  PERFORM public.register_stock_movement(
    'b10b0000-0000-4000-8000-0000000002a3', 'b10b0000-0000-4000-8000-00000000000a', -7, 'sale', 'b10b drain P3', 'b10b0000-0000-4000-8000-0000000001a1',
    NULL, NULL, 0, 'b10b drain', NOW(), TRUE);
END $$;

SELECT jsonb_build_object(
  'ids', (SELECT jsonb_object_agg(name, id) FROM b10b_ids),
  'products', (SELECT jsonb_object_agg(id::text, jsonb_build_object('stock',stock_current,'wac',cost_average))
               FROM public.products WHERE id IN ('b10b0000-0000-4000-8000-0000000002a1','b10b0000-0000-4000-8000-0000000002a2','b10b0000-0000-4000-8000-0000000002a3','b10b0000-0000-4000-8000-0000000002a4','b10b0000-0000-4000-8000-0000000002a5','b10b0000-0000-4000-8000-0000000002a6')),
  'inventory', (SELECT jsonb_object_agg(product_id::text, quantity) FROM public.inventory
                WHERE product_id IN ('b10b0000-0000-4000-8000-0000000002a1','b10b0000-0000-4000-8000-0000000002a2','b10b0000-0000-4000-8000-0000000002a3','b10b0000-0000-4000-8000-0000000002a4','b10b0000-0000-4000-8000-0000000002a5','b10b0000-0000-4000-8000-0000000002a6')),
  'movs', (SELECT jsonb_object_agg(product_id::text, jsonb_build_object('n',n,'delta',d))
    FROM (SELECT product_id, count(*) n, SUM(quantity_change) d FROM public.stock_movements
          WHERE product_id IN ('b10b0000-0000-4000-8000-0000000002a1','b10b0000-0000-4000-8000-0000000002a2','b10b0000-0000-4000-8000-0000000002a3','b10b0000-0000-4000-8000-0000000002a4','b10b0000-0000-4000-8000-0000000002a5','b10b0000-0000-4000-8000-0000000002a6') GROUP BY product_id) x),
  'kardex', (SELECT jsonb_object_agg(product_id::text, n)
    FROM (SELECT product_id, count(*) n FROM public.kardex_entries
          WHERE product_id IN ('b10b0000-0000-4000-8000-0000000002a1','b10b0000-0000-4000-8000-0000000002a2','b10b0000-0000-4000-8000-0000000002a3','b10b0000-0000-4000-8000-0000000002a4','b10b0000-0000-4000-8000-0000000002a5','b10b0000-0000-4000-8000-0000000002a6') GROUP BY product_id) y)
) AS fixture_state;
