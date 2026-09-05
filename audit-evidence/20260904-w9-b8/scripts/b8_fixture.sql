-- W9.5-B8 · GATE 6 — Fixture sintético (autocommit; todo UUID sintético b8…)
-- Se elimina 100% en cleanup (b8_cleanup.sql). NO toca datos reales.
CREATE TEMP TABLE b8_fix_result(step text, detail jsonb);

-- Usuarios sintéticos (auth.users + profiles auto por trigger on_auth_user_created).
-- El trigger crea profiles con role=raw_user_meta_data->>'role'. Se BORRAN en cleanup.
INSERT INTO public.stores (id, name, slug) VALUES
  ('b8a00000-0000-4000-8000-00000000a001', 'B8-FIXTURE-STORE-A', 'b8-fixture-a'),
  ('b8a00000-0000-4000-8000-00000000b002', 'B8-FIXTURE-STORE-B', 'b8-fixture-b')
ON CONFLICT (id) DO NOTHING;
INSERT INTO b8_fix_result VALUES('stores', jsonb_build_object('n', 2));

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('b8b00000-0000-4000-8000-000000000001', 'b8-admin-fixture@example.invalid',    '{"role":"admin","full_name":"B8 admin"}'),
  ('b8b00000-0000-4000-8000-000000000002', 'b8-manager-fixture@example.invalid',  '{"role":"manager","full_name":"B8 manager"}'),
  ('b8b00000-0000-4000-8000-000000000003', 'b8-encargado-fixture@example.invalid','{"role":"encargado","full_name":"B8 encargado"}'),
  ('b8b00000-0000-4000-8000-000000000004', 'b8-clerk-fixture@example.invalid',    '{"role":"clerk","full_name":"B8 clerk"}'),
  ('b8b00000-0000-4000-8000-000000000005', 'b8-warehouse-fixture@example.invalid','{"role":"warehouse","full_name":"B8 warehouse"}'),
  ('b8b00000-0000-4000-8000-000000000006', 'b8-usuario-fixture@example.invalid',  '{"role":"usuario","full_name":"B8 usuario"}'),
  ('b8b00000-0000-4000-8000-000000000007', 'b8-costo-fixture@example.invalid',    '{"role":"costo","full_name":"B8 costo"}'),
  ('b8b00000-0000-4000-8000-000000000008', 'b8-sellerx-fixture@example.invalid',   '{"role":"encargado","full_name":"B8 sellerX"}'),
  ('b8b00000-0000-4000-8000-000000000009', 'b8-sellerb-fixture@example.invalid',   '{"role":"encargado","full_name":"B8 sellerB"}'),
  ('b8b00000-0000-4000-8000-00000000000a', 'b8-svc-fixture@example.invalid',       '{"role":"encargado","full_name":"B8 svc"}');

-- Ajustar perfiles auto-creados: tienda base + roles[] (el trigger ya seteó role)
UPDATE public.profiles p SET
  store_id  = v.store_id::uuid,
  roles     = v.roles_arr,
  is_active = true
FROM (VALUES
  ('b8b00000-0000-4000-8000-000000000001','b8a00000-0000-4000-8000-00000000a001',ARRAY['admin']::user_role[]),
  ('b8b00000-0000-4000-8000-000000000002','b8a00000-0000-4000-8000-00000000a001',ARRAY['manager']::user_role[]),
  ('b8b00000-0000-4000-8000-000000000003','b8a00000-0000-4000-8000-00000000a001',ARRAY['encargado']::user_role[]),
  ('b8b00000-0000-4000-8000-000000000004','b8a00000-0000-4000-8000-00000000a001',ARRAY['clerk']::user_role[]),
  ('b8b00000-0000-4000-8000-000000000005','b8a00000-0000-4000-8000-00000000a001',ARRAY['warehouse']::user_role[]),
  ('b8b00000-0000-4000-8000-000000000006','b8a00000-0000-4000-8000-00000000a001',ARRAY['usuario']::user_role[]),
  ('b8b00000-0000-4000-8000-000000000007','b8a00000-0000-4000-8000-00000000a001',ARRAY['costo']::user_role[]),
  ('b8b00000-0000-4000-8000-000000000008','b8a00000-0000-4000-8000-00000000a001',ARRAY['encargado']::user_role[]),
  ('b8b00000-0000-4000-8000-000000000009','b8a00000-0000-4000-8000-00000000b002',ARRAY['encargado']::user_role[]),
  ('b8b00000-0000-4000-8000-00000000000a','b8a00000-0000-4000-8000-00000000a001',ARRAY['encargado']::user_role[])
) AS v(id, store_id, roles_arr)
WHERE p.id = v.id::uuid;
INSERT INTO b8_fix_result VALUES('profiles', jsonb_build_object('n', (SELECT count(*) FROM profiles WHERE id::text LIKE 'b8b00000%')));

-- Membresías: los 7 roles + sellerX en A; sellerB en B. admin global SIN membership.
INSERT INTO public.user_store_memberships (user_id, store_id, role, status) VALUES
  ('b8b00000-0000-4000-8000-000000000002', 'b8a00000-0000-4000-8000-00000000a001', 'manager',   'active'),
  ('b8b00000-0000-4000-8000-000000000003', 'b8a00000-0000-4000-8000-00000000a001', 'encargado', 'active'),
  ('b8b00000-0000-4000-8000-000000000004', 'b8a00000-0000-4000-8000-00000000a001', 'clerk',     'active'),
  ('b8b00000-0000-4000-8000-000000000005', 'b8a00000-0000-4000-8000-00000000a001', 'warehouse', 'active'),
  ('b8b00000-0000-4000-8000-000000000006', 'b8a00000-0000-4000-8000-00000000a001', 'usuario',   'active'),
  ('b8b00000-0000-4000-8000-000000000007', 'b8a00000-0000-4000-8000-00000000a001', 'costo',     'active'),
  ('b8b00000-0000-4000-8000-000000000008', 'b8a00000-0000-4000-8000-00000000a001', 'encargado', 'active'),
  ('b8b00000-0000-4000-8000-000000000009', 'b8a00000-0000-4000-8000-00000000b002', 'encargado', 'active'),
  ('b8b00000-0000-4000-8000-00000000000a', 'b8a00000-0000-4000-8000-00000000a001', 'encargado', 'active');
INSERT INTO b8_fix_result VALUES('memberships', jsonb_build_object('n', 9));

-- Productos + inventario (stock base 10)
INSERT INTO public.products (id, name, sku, store_id, stock_current, cost_average) VALUES
  ('b8c00000-0000-4000-8000-000000000001', 'B8-PROD-A', 'B8-PA', 'b8a00000-0000-4000-8000-00000000a001', 10, 40),
  ('b8c00000-0000-4000-8000-000000000002', 'B8-PROD-B', 'B8-PB', 'b8a00000-0000-4000-8000-00000000b002', 10, 40),
  ('b8c00000-0000-4000-8000-000000000003', 'B8-PROD-PSTOCK', 'B8-P3', 'b8a00000-0000-4000-8000-00000000a001', 10, 40),
  ('b8c00000-0000-4000-8000-000000000004', 'B8-PROD-CSTOCK', 'B8-P4', 'b8a00000-0000-4000-8000-00000000a001', 5,  40);
INSERT INTO public.inventory (store_id, product_id, quantity) VALUES
  ('b8a00000-0000-4000-8000-00000000a001', 'b8c00000-0000-4000-8000-000000000001', 10),
  ('b8a00000-0000-4000-8000-00000000b002', 'b8c00000-0000-4000-8000-000000000002', 10),
  ('b8a00000-0000-4000-8000-00000000a001', 'b8c00000-0000-4000-8000-000000000003', 10),
  ('b8a00000-0000-4000-8000-00000000a001', 'b8c00000-0000-4000-8000-000000000004', 5);
INSERT INTO b8_fix_result VALUES('products+inventory', jsonb_build_object('n', 4));

-- Movimiento 'sale' previo para TX-C-STOCK (venta descontó 5) — refleja create_sale_v2
INSERT INTO public.stock_movements (store_id, product_id, created_by, quantity_change, movement_type, reference_id, reference_doc, unit_cost, notes)
VALUES ('b8a00000-0000-4000-8000-00000000a001', 'b8c00000-0000-4000-8000-000000000004',
        'b8b00000-0000-4000-8000-000000000008', -5, 'sale', 'b8d00000-0000-4000-8000-00000000c00a', 'venta', 40, 'B8 fixture: deduction simulada de venta completada');
UPDATE public.products SET stock_current = 5 WHERE id = 'b8c00000-0000-4000-8000-000000000004';

-- Helper: 26 transacciones (22 en A, 2 en B, 8 de batería B-9, 2 de stock)
CREATE TEMP TABLE b8_txs (
  tx uuid, store uuid, seller uuid, status text, qty numeric
);
INSERT INTO b8_txs VALUES
  -- P1: venta propia de cada rol (seller = el propio usuario del rol)
  ('b8d00000-0000-4000-8000-00000000a001','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000001','completed',2),
  ('b8d00000-0000-4000-8000-00000000a002','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000002','completed',2),
  ('b8d00000-0000-4000-8000-00000000a003','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000003','completed',2),
  ('b8d00000-0000-4000-8000-00000000a004','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000004','completed',2),
  ('b8d00000-0000-4000-8000-00000000a005','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000005','completed',2),
  ('b8d00000-0000-4000-8000-00000000a006','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000006','completed',2),
  ('b8d00000-0000-4000-8000-00000000a007','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000007','completed',2),
  -- P2: venta ajena misma tienda (seller = sellerX), una por rol
  ('b8d00000-0000-4000-8000-00000000b001','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000008','completed',2),
  ('b8d00000-0000-4000-8000-00000000b002','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000008','completed',2),
  ('b8d00000-0000-4000-8000-00000000b003','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000008','completed',2),
  ('b8d00000-0000-4000-8000-00000000b004','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000008','completed',2),
  ('b8d00000-0000-4000-8000-00000000b005','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000008','completed',2),
  ('b8d00000-0000-4000-8000-00000000b006','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000008','completed',2),
  ('b8d00000-0000-4000-8000-00000000b007','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000008','completed',2),
  -- P3 compartida: venta en tienda B (seller sellerB) — solo probes DENY de miembros de A
  ('b8d00000-0000-4000-8000-00000000b010','b8a00000-0000-4000-8000-00000000b002','b8b00000-0000-4000-8000-000000000009','completed',2),
  -- P5 admin global: una en A y una en B (dedicadas)
  ('b8d00000-0000-4000-8000-00000000b011','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000008','completed',2),
  ('b8d00000-0000-4000-8000-00000000b012','b8a00000-0000-4000-8000-00000000b002','b8b00000-0000-4000-8000-000000000009','completed',2),
  -- P4 forged identity (dedicada, seller sellerX)
  ('b8d00000-0000-4000-8000-00000000b013','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000008','completed',2),
  -- B-9: batería de estados
  ('b8d00000-0000-4000-8000-00000000c001','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000008','pending',2),
  ('b8d00000-0000-4000-8000-00000000c002','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000008','completed',2),
  ('b8d00000-0000-4000-8000-00000000c003','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000008','failed',2),
  ('b8d00000-0000-4000-8000-00000000c004','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000008','compensated',2),
  ('b8d00000-0000-4000-8000-00000000c005','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000008','cancelled',2),
  ('b8d00000-0000-4000-8000-00000000c006','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000008','refunded',2),
  ('b8d00000-0000-4000-8000-00000000c007','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000008','voided',2),
  ('b8d00000-0000-4000-8000-00000000c008','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000008','reversed',2),
  -- B-9: análisis de stock (pendiente SIN deducción / completada CON deducción)
  ('b8d00000-0000-4000-8000-00000000c009','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000008','pending',5),
  ('b8d00000-0000-4000-8000-00000000c00a','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000008','completed',5),
  -- HTTP mini-fixture (service_role / anon)
  ('b8d00000-0000-4000-8000-00000000d001','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-00000000000a','completed',2);

INSERT INTO public.transactions (id, store_id, seller_id, total_amount, status, payment_method, subtotal, discount_type, discount_value, tax_amount, sale_currency, sale_exchange_rate, cash_amount, created_at)
SELECT tx, store, seller, qty*100, status::transaction_status, 'cash', qty*100, 'fixed', 0, 0, 'CUP', 1, qty*100, now()
FROM b8_txs;
INSERT INTO b8_fix_result VALUES('transactions', jsonb_build_object('n', (SELECT count(*) FROM b8_txs)));

INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, cost_at_sale)
SELECT tx,
  CASE WHEN store='b8a00000-0000-4000-8000-00000000b002' THEN 'b8c00000-0000-4000-8000-000000000002'::uuid
       WHEN tx='b8d00000-0000-4000-8000-00000000c009' THEN 'b8c00000-0000-4000-8000-000000000003'::uuid
       WHEN tx='b8d00000-0000-4000-8000-00000000c00a' THEN 'b8c00000-0000-4000-8000-000000000004'::uuid
       ELSE 'b8c00000-0000-4000-8000-000000000001'::uuid END,
  qty, 100, 40
FROM b8_txs;
INSERT INTO b8_fix_result VALUES('items', jsonb_build_object('n', (SELECT count(*) FROM b8_txs)));

INSERT INTO public.payment_transactions (store_id, ref_type, ref_id, amount, currency, exchange_rate, payment_method, direction, payment_date, paid_by, transaction_id, idempotency_key)
SELECT store, 'sale', tx, qty*100, 'CUP', 1, 'cash', 'in', now(), seller, tx, 'b8-pay-' || tx::text
FROM b8_txs;
INSERT INTO b8_fix_result VALUES('payments', jsonb_build_object('n', (SELECT count(*) FROM b8_txs)));

SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) AS fixture FROM b8_fix_result t;
