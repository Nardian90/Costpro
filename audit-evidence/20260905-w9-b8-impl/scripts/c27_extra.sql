INSERT INTO public.transactions (id, store_id, seller_id, total_amount, status, payment_method, subtotal, discount_type, discount_value, tax_amount, sale_currency, sale_exchange_rate, cash_amount, created_at) VALUES
  ('b8cd0000-0000-4000-8000-00000000b018','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009',200,'completed','cash',200,'fixed',0,0,'CUP',1,200, now()),
  ('b8cd0000-0000-4000-8000-00000000b019','b8ca0000-0000-4000-8000-0000000000a1','b8cb0000-0000-4000-8000-000000000009',200,'completed','cash',200,'fixed',0,0,'CUP',1,200, now()),
  ('b8cd0000-0000-4000-8000-00000000b020','b8ca0000-0000-4000-8000-0000000000b2','b8cb0000-0000-4000-8000-00000000000a',200,'completed','cash',200,'fixed',0,0,'CUP',1,200, now());
INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, cost_at_sale) VALUES
  ('b8cd0000-0000-4000-8000-00000000b018','b8cc0000-0000-4000-8000-000000000001',2,100,40),
  ('b8cd0000-0000-4000-8000-00000000b019','b8cc0000-0000-4000-8000-000000000001',2,100,40),
  ('b8cd0000-0000-4000-8000-00000000b020','b8cc0000-0000-4000-8000-000000000002',2,100,40);
INSERT INTO public.payment_transactions (store_id, ref_type, ref_id, amount, currency, exchange_rate, payment_method, direction, payment_date, paid_by, transaction_id, idempotency_key)
SELECT store,'sale',tx,200,'CUP',1,'cash','in',now(),seller,tx,'b8c-pay-'||tx::text FROM public.transactions WHERE id::text ~ '(b018|b019|b020)$';
SELECT count(*)::int AS created FROM public.transactions WHERE id::text ~ '(b018|b019|b020)$';
