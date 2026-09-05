INSERT INTO public.transactions (id, store_id, seller_id, total_amount, status, payment_method, subtotal, discount_type, discount_value, tax_amount, sale_currency, sale_exchange_rate, cash_amount, created_at)
VALUES ('b8cd0000-0000-4000-8000-00000000b027','b8ca0000-0000-4000-8000-0000000000a1','051c6157-600b-425e-b8c0-72388bacf541',200,'completed','cash',200,'fixed',0,0,'CUP',1,200, now());
INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, cost_at_sale)
VALUES ('b8cd0000-0000-4000-8000-00000000b027','b8cc0000-0000-4000-8000-000000000001',2,100,40);
INSERT INTO public.payment_transactions (store_id, ref_type, ref_id, amount, currency, exchange_rate, payment_method, direction, payment_date, paid_by, transaction_id, idempotency_key)
VALUES ('b8ca0000-0000-4000-8000-0000000000a1','sale','b8cd0000-0000-4000-8000-00000000b027',200,'CUP',1,'cash','in',now(),'051c6157-600b-425e-b8c0-72388bacf541','b8cd0000-0000-4000-8000-00000000b027','b8c-pay-b027');
SELECT count(*)::int AS ok FROM public.transactions WHERE id='b8cd0000-0000-4000-8000-00000000b027';
