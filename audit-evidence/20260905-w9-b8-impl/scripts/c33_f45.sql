INSERT INTO public.transactions (id, store_id, seller_id, total_amount, status, payment_method, subtotal, discount_type, discount_value, tax_amount, sale_currency, sale_exchange_rate, cash_amount, created_at)
SELECT tx, 'b8ca0000-0000-4000-8000-0000000000a1', seller, 200, 'completed','cash',200,'fixed',0,0,'CUP',1,200, now()
FROM (VALUES ('b8cd0000-0000-4000-8000-00000000f004'::uuid,'b8cb0000-0000-4000-8000-000000000004'::uuid),
             ('b8cd0000-0000-4000-8000-00000000f005'::uuid,'b8cb0000-0000-4000-8000-000000000004'::uuid)) AS v(tx, seller);
INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, cost_at_sale)
SELECT tx, 'b8cc0000-0000-4000-8000-000000000001', 2, 100, 40 FROM (VALUES ('b8cd0000-0000-4000-8000-00000000f004'::uuid),('b8cd0000-0000-4000-8000-00000000f005'::uuid)) AS v(tx);
INSERT INTO public.payment_transactions (store_id, ref_type, ref_id, amount, currency, exchange_rate, payment_method, direction, payment_date, paid_by, transaction_id, idempotency_key)
SELECT 'b8ca0000-0000-4000-8000-0000000000a1','sale',tx,200,'CUP',1,'cash','in',now(),'b8cb0000-0000-4000-8000-000000000004',tx,'b8c-pay-'||tx::text
FROM (VALUES ('b8cd0000-0000-4000-8000-00000000f004'::uuid),('b8cd0000-0000-4000-8000-00000000f005'::uuid)) AS v(tx);
SELECT count(*)::int AS created FROM public.transactions WHERE id::text ~ '(f00[45])$';
