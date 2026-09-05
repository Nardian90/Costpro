-- Fixture extra: txs con seller = admin REAL (uid de admin@costpro.com)
CREATE TEMP TABLE b8c_fix2(step text, detail jsonb);
DO $$
DECLARE v_admin uuid;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE email='admin@costpro.com' LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'admin profile no encontrado'; END IF;
  INSERT INTO b8c_fix2 VALUES('admin_uid', to_jsonb(v_admin::text));
  -- b015: venta propia del admin (fresh) → H4 (void propio SUCCESS)
  INSERT INTO public.transactions (id, store_id, seller_id, total_amount, status, payment_method, subtotal, discount_type, discount_value, tax_amount, sale_currency, sale_exchange_rate, cash_amount, created_at)
  VALUES ('b8cd0000-0000-4000-8000-00000000b015','b8ca0000-0000-4000-8000-0000000000a1', v_admin, 200, 'completed', 'cash', 200, 'fixed', 0, 0, 'CUP', 1, 200, now());
  INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, cost_at_sale)
  VALUES ('b8cd0000-0000-4000-8000-00000000b015','b8cc0000-0000-4000-8000-000000000001', 2, 100, 40);
  INSERT INTO public.payment_transactions (store_id, ref_type, ref_id, amount, currency, exchange_rate, payment_method, direction, payment_date, paid_by, transaction_id, idempotency_key)
  VALUES ('b8ca0000-0000-4000-8000-0000000000a1','sale','b8cd0000-0000-4000-8000-00000000b015',200,'CUP',1,'cash','in',now(),v_admin,'b8cd0000-0000-4000-8000-00000000b015','b8c-pay-b015');
  -- b016: venta de sellerX (para H6 API admin SUCCESS)
  INSERT INTO public.transactions (id, store_id, seller_id, total_amount, status, payment_method, subtotal, discount_type, discount_value, tax_amount, sale_currency, sale_exchange_rate, cash_amount, created_at)
  VALUES ('b8cd0000-0000-4000-8000-00000000b016','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009', 200, 'completed', 'cash', 200, 'fixed', 0, 0, 'CUP', 1, 200, now());
  INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, cost_at_sale)
  VALUES ('b8cd0000-0000-4000-8000-00000000b016','b8cc0000-0000-4000-8000-000000000001', 2, 100, 40);
  INSERT INTO public.payment_transactions (store_id, ref_type, ref_id, amount, currency, exchange_rate, payment_method, direction, payment_date, paid_by, transaction_id, idempotency_key)
  VALUES ('b8ca0000-0000-4000-8000-0000000000a1','sale','b8cd0000-0000-4000-8000-00000000b016',200,'CUP',1,'cash','in',now(),'b8cb0000-0000-4000-8000-000000000009','b8cd0000-0000-4000-8000-00000000b016','b8c-pay-b016');
  -- b017: venta de sellerX (para H7 forged p_user_id → SUCCESS con atribución admin)
  INSERT INTO public.transactions (id, store_id, seller_id, total_amount, status, payment_method, subtotal, discount_type, discount_value, tax_amount, sale_currency, sale_exchange_rate, cash_amount, created_at)
  VALUES ('b8cd0000-0000-4000-8000-00000000b017','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009', 200, 'completed', 'cash', 200, 'fixed', 0, 0, 'CUP', 1, 200, now());
  INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, cost_at_sale)
  VALUES ('b8cd0000-0000-4000-8000-00000000b017','b8cc0000-0000-4000-8000-000000000001', 2, 100, 40);
  INSERT INTO public.payment_transactions (store_id, ref_type, ref_id, amount, currency, exchange_rate, payment_method, direction, payment_date, paid_by, transaction_id, idempotency_key)
  VALUES ('b8ca0000-0000-4000-8000-0000000000a1','sale','b8cd0000-0000-4000-8000-00000000b017',200,'CUP',1,'cash','in',now(),'b8cb0000-0000-4000-8000-000000000009','b8cd0000-0000-4000-8000-00000000b017','b8c-pay-b017');
END $$;
SELECT coalesce(jsonb_agg(row_to_json(t)),'[]'::jsonb) AS fixture2 FROM b8c_fix2 t;
