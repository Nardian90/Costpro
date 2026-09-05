-- W9.5-B8 MODELO C · p00 — Fixture sintético (autocommit; todo UUID b8ca/b8cb/b8cc/b8cd…)
-- Se elimina 100% en p07_cleanup.sql. NO toca datos reales.
-- Edades CONTROLADAS: fresh=now(), aged5m=now()-'5 min', aged2d=now()-'2 days'.
CREATE TEMP TABLE b8c_fix(step text, detail jsonb);

INSERT INTO public.stores (id, name, slug) VALUES
  ('b8ca0000-0000-4000-8000-0000000000a1', 'B8C-FIXTURE-STORE-A', 'b8c-fixture-a'),
  ('b8ca0000-0000-4000-8000-0000000000b2', 'B8C-FIXTURE-STORE-B', 'b8c-fixture-b')
ON CONFLICT (id) DO NOTHING;
INSERT INTO b8c_fix VALUES('stores', jsonb_build_object('n', 2));

-- Usuarios (auth.users + profiles auto por trigger; password para probes HTTP reales)
INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data) VALUES
  ('b8cb0000-0000-4000-8000-000000000001', 'b8c-admin@example.invalid',    extensions.crypt('B8c-Fixture-2026!', extensions.gen_salt('bf')), '{"role":"admin","full_name":"B8C admin"}'),
  ('b8cb0000-0000-4000-8000-000000000002', 'b8c-manager@example.invalid',  extensions.crypt('B8c-Fixture-2026!', extensions.gen_salt('bf')), '{"role":"manager","full_name":"B8C manager"}'),
  ('b8cb0000-0000-4000-8000-000000000003', 'b8c-encargado@example.invalid',extensions.crypt('B8c-Fixture-2026!', extensions.gen_salt('bf')), '{"role":"encargado","full_name":"B8C encargado"}'),
  ('b8cb0000-0000-4000-8000-000000000004', 'b8c-clerk@example.invalid',    extensions.crypt('B8c-Fixture-2026!', extensions.gen_salt('bf')), '{"role":"clerk","full_name":"B8C clerk"}'),
  ('b8cb0000-0000-4000-8000-000000000005', 'b8c-warehouse@example.invalid',extensions.crypt('B8c-Fixture-2026!', extensions.gen_salt('bf')), '{"role":"warehouse","full_name":"B8C warehouse"}'),
  ('b8cb0000-0000-4000-8000-000000000006', 'b8c-usuario@example.invalid',  extensions.crypt('B8c-Fixture-2026!', extensions.gen_salt('bf')), '{"role":"usuario","full_name":"B8C usuario"}'),
  ('b8cb0000-0000-4000-8000-000000000007', 'b8c-costo@example.invalid',    extensions.crypt('B8c-Fixture-2026!', extensions.gen_salt('bf')), '{"role":"costo","full_name":"B8C costo"}'),
  ('b8cb0000-0000-4000-8000-000000000008', 'b8c-adminmem@example.invalid', extensions.crypt('B8c-Fixture-2026!', extensions.gen_salt('bf')), '{"role":"admin","full_name":"B8C adminMem"}'),
  ('b8cb0000-0000-4000-8000-000000000009', 'b8c-sellerx@example.invalid',  extensions.crypt('B8c-Fixture-2026!', extensions.gen_salt('bf')), '{"role":"encargado","full_name":"B8C sellerX"}'),
  ('b8cb0000-0000-4000-8000-00000000000a', 'b8c-clerkb@example.invalid',   extensions.crypt('B8c-Fixture-2026!', extensions.gen_salt('bf')), '{"role":"clerk","full_name":"B8C clerkB"}');

-- adminMem: rol GLOBAL no-admin con membership-role admin (admin de TIENDA, no transversal)
UPDATE public.profiles p SET store_id = v.sid::uuid, roles = v.arr, is_active = true
FROM (VALUES
  ('b8cb0000-0000-4000-8000-000000000001','b8ca0000-0000-4000-8000-0000000000a1',ARRAY['admin']::user_role[]),
  ('b8cb0000-0000-4000-8000-000000000002','b8ca0000-0000-4000-8000-0000000000a1',ARRAY['manager']::user_role[]),
  ('b8cb0000-0000-4000-8000-000000000003','b8ca0000-0000-4000-8000-0000000000a1',ARRAY['encargado']::user_role[]),
  ('b8cb0000-0000-4000-8000-000000000004','b8ca0000-0000-4000-8000-0000000000a1',ARRAY['clerk']::user_role[]),
  ('b8cb0000-0000-4000-8000-000000000005','b8ca0000-0000-4000-8000-0000000000a1',ARRAY['warehouse']::user_role[]),
  ('b8cb0000-0000-4000-8000-000000000006','b8ca0000-0000-4000-8000-0000000000a1',ARRAY['usuario']::user_role[]),
  ('b8cb0000-0000-4000-8000-000000000007','b8ca0000-0000-4000-8000-0000000000a1',ARRAY['costo']::user_role[]),
  ('b8cb0000-0000-4000-8000-000000000008','b8ca0000-0000-4000-8000-0000000000a1',ARRAY['usuario']::user_role[]),
  ('b8cb0000-0000-4000-8000-000000000009','b8ca0000-0000-4000-8000-0000000000a1',ARRAY['encargado']::user_role[]),
  ('b8cb0000-0000-4000-8000-00000000000a','b8ca0000-0000-4000-8000-0000000000b2',ARRAY['clerk']::user_role[])
) AS v(id, sid, arr) WHERE p.id = v.id::uuid;
INSERT INTO b8c_fix VALUES('profiles', jsonb_build_object('n', (SELECT count(*) FROM public.profiles WHERE id::text LIKE 'b8cb0000%')));

-- Membresías (adminGlobal uid…001 SIN membership — transversal por rol global)
INSERT INTO public.user_store_memberships (user_id, store_id, role, status) VALUES
  ('b8cb0000-0000-4000-8000-000000000002', 'b8ca0000-0000-4000-8000-0000000000a1', 'manager',   'active'),
  ('b8cb0000-0000-4000-8000-000000000003', 'b8ca0000-0000-4000-8000-0000000000a1', 'encargado', 'active'),
  ('b8cb0000-0000-4000-8000-000000000004', 'b8ca0000-0000-4000-8000-0000000000a1', 'clerk',     'active'),
  ('b8cb0000-0000-4000-8000-000000000005', 'b8ca0000-0000-4000-8000-0000000000a1', 'warehouse', 'active'),
  ('b8cb0000-0000-4000-8000-000000000006', 'b8ca0000-0000-4000-8000-0000000000a1', 'usuario',   'active'),
  ('b8cb0000-0000-4000-8000-000000000007', 'b8ca0000-0000-4000-8000-0000000000a1', 'costo',     'active'),
  ('b8cb0000-0000-4000-8000-000000000008', 'b8ca0000-0000-4000-8000-0000000000a1', 'admin',     'active'),
  ('b8cb0000-0000-4000-8000-000000000009', 'b8ca0000-0000-4000-8000-0000000000a1', 'encargado', 'active'),
  ('b8cb0000-0000-4000-8000-00000000000a', 'b8ca0000-0000-4000-8000-0000000000b2', 'clerk',     'active');
INSERT INTO b8c_fix VALUES('memberships', jsonb_build_object('n', 9));

-- Productos + inventario
INSERT INTO public.products (id, name, sku, store_id, stock_current, cost_average) VALUES
  ('b8cc0000-0000-4000-8000-000000000001', 'B8C-PROD-A',  'B8C-PA', 'b8ca0000-0000-4000-8000-0000000000a1', 10, 40),
  ('b8cc0000-0000-4000-8000-000000000002', 'B8C-PROD-B',  'B8C-PB', 'b8ca0000-0000-4000-8000-0000000000b2', 10, 40),
  ('b8cc0000-0000-4000-8000-000000000003', 'B8C-PROD-E1', 'B8C-P3', 'b8ca0000-0000-4000-8000-0000000000a1', 5,  40),
  ('b8cc0000-0000-4000-8000-000000000004', 'B8C-PROD-E2', 'B8C-P4', 'b8ca0000-0000-4000-8000-0000000000a1', 7,  40);
INSERT INTO public.inventory (store_id, product_id, quantity) VALUES
  ('b8ca0000-0000-4000-8000-0000000000a1', 'b8cc0000-0000-4000-8000-000000000001', 10),
  ('b8ca0000-0000-4000-8000-0000000000b2', 'b8cc0000-0000-4000-8000-000000000002', 10),
  ('b8ca0000-0000-4000-8000-0000000000a1', 'b8cc0000-0000-4000-8000-000000000003', 5),
  ('b8ca0000-0000-4000-8000-0000000000a1', 'b8cc0000-0000-4000-8000-000000000004', 7);
INSERT INTO b8c_fix VALUES('products+inventory', jsonb_build_object('n', 4));

-- Transacciones (37) con edades controladas
CREATE TEMP TABLE b8c_txs(tx uuid, store uuid, seller uuid, status text, qty numeric, age text);
INSERT INTO b8c_txs VALUES
  -- ventas propias fresh (una por actor)
  ('b8cd0000-0000-4000-8000-00000000a001','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000001','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000a002','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000002','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000a003','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000003','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000a004','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000004','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000a005','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000005','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000a006','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000006','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000a007','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000007','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000a008','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000008','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000a009','b8ca0000-0000-4000-8000-0000000000b2','b8cb0000-0000-4000-8000-00000000000a','completed',2,'fresh'),
  -- propia AGED (5 min) del clerk → ventana expirada
  ('b8cd0000-0000-4000-8000-00000000b001','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000004','completed',2,'aged5m'),
  -- ajenas fresh (seller=sellerX) — cada probe V2 usa una dedicada
  ('b8cd0000-0000-4000-8000-00000000b002','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000b003','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000b004','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000b005','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000b006','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000b007','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000b008','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000b009','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000b00a','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009','completed',2,'fresh'),
  -- cross-store (tienda B, seller clerkB) para denies de miembros de A
  ('b8cd0000-0000-4000-8000-00000000c001','b8ca0000-0000-4000-8000-0000000000b2','b8cb0000-0000-4000-8000-00000000000a','completed',2,'fresh'),
  -- ajena AGED 2 días (sellerX) → V2 sin ventana
  ('b8cd0000-0000-4000-8000-00000000c002','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009','completed',2,'aged2d'),
  -- batería de estados (seller=sellerX)
  ('b8cd0000-0000-4000-8000-00000000d001','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009','pending',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000d002','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009','failed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000d003','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009','compensated',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000d004','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009','cancelled',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000d005','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009','refunded',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000d006','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009','voided',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000d007','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009','reversed',2,'fresh'),
  -- integridad financiera (dedicadas, consistentes con movement previo)
  ('b8cd0000-0000-4000-8000-00000000e001','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009','completed',5,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000e002','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000004','completed',3,'fresh'),
  -- concurrencia (dedicadas)
  ('b8cd0000-0000-4000-8000-00000000f001','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000004','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000f002','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000004','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000f003','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009','completed',2,'fresh'),
  -- identidad forjada / service (dedicadas)
  ('b8cd0000-0000-4000-8000-00000000b011','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000005','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000b012','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000004','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000b013','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000004','completed',2,'fresh'),
  ('b8cd0000-0000-4000-8000-00000000b014','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009','completed',2,'fresh');

INSERT INTO public.transactions (id, store_id, seller_id, total_amount, status, payment_method, subtotal, discount_type, discount_value, tax_amount, sale_currency, sale_exchange_rate, cash_amount, created_at)
SELECT tx, store, seller, qty*100, status::transaction_status, 'cash', qty*100, 'fixed', 0, 0, 'CUP', 1, qty*100,
       CASE age WHEN 'fresh' THEN now() WHEN 'aged5m' THEN now() - interval '5 minutes' WHEN 'aged2d' THEN now() - interval '2 days' END
FROM b8c_txs;
INSERT INTO b8c_fix VALUES('transactions', jsonb_build_object('n', (SELECT count(*) FROM b8c_txs)));

INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, cost_at_sale)
SELECT tx,
  CASE WHEN store='b8ca0000-0000-4000-8000-0000000000b2' THEN 'b8cc0000-0000-4000-8000-000000000002'::uuid
       WHEN tx='b8cd0000-0000-4000-8000-00000000e001' THEN 'b8cc0000-0000-4000-8000-000000000003'::uuid
       WHEN tx='b8cd0000-0000-4000-8000-00000000e002' THEN 'b8cc0000-0000-4000-8000-000000000004'::uuid
       ELSE 'b8cc0000-0000-4000-8000-000000000001'::uuid END,
  qty, 100, 40
FROM b8c_txs;
INSERT INTO b8c_fix VALUES('items', jsonb_build_object('n', (SELECT count(*) FROM b8c_txs)));

INSERT INTO public.payment_transactions (store_id, ref_type, ref_id, amount, currency, exchange_rate, payment_method, direction, payment_date, paid_by, transaction_id, idempotency_key)
SELECT store, 'sale', tx, qty*100, 'CUP', 1, 'cash', 'in', now(), seller, tx, 'b8c-pay-' || tx::text
FROM b8c_txs;
INSERT INTO b8c_fix VALUES('payments', jsonb_build_object('n', (SELECT count(*) FROM b8c_txs)));

-- Movimientos 'sale' previos SOLO para e001/e002 (consistencia financiera exacta)
INSERT INTO public.stock_movements (store_id, product_id, created_by, quantity_change, movement_type, reference_id, reference_doc, unit_cost, notes) VALUES
  ('b8ca0000-0000-4000-8000-0000000000a1','b8cc0000-0000-4000-8000-000000000003','b8cb0000-0000-4000-8000-000000000009',-5,'sale','b8cd0000-0000-4000-8000-00000000e001','venta',40,'b8cd0000-0000-4000-8000-00000000e001'),
  ('b8ca0000-0000-4000-8000-0000000000a1','b8cc0000-0000-4000-8000-000000000004','b8cb0000-0000-4000-8000-000000000004',-3,'sale','b8cd0000-0000-4000-8000-00000000e002','venta',40,'b8cd0000-0000-4000-8000-00000000e002');
INSERT INTO b8c_fix VALUES('prior-sale-movements', jsonb_build_object('n', 2));

SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) AS fixture FROM b8c_fix t;
