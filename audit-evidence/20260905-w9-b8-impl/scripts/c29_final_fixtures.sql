INSERT INTO public.transactions (id, store_id, seller_id, total_amount, status, payment_method, subtotal, discount_type, discount_value, tax_amount, sale_currency, sale_exchange_rate, cash_amount, created_at)
SELECT tx, store_id, seller_id, 200, 'completed','cash',200,'fixed',0,0,'CUP',1,200, now()
FROM (VALUES
  ('b8cd0000-0000-4000-8000-00000000b022'::uuid,'b8ca0000-0000-4000-8000-0000000000a1'::uuid,'b8cb0000-0000-4000-8000-000000000004'::uuid),
  ('b8cd0000-0000-4000-8000-00000000b023'::uuid,'b8ca0000-0000-4000-8000-0000000000a1'::uuid,'051c6157-600b-425e-b8c0-72388bacf541'::uuid),
  ('b8cd0000-0000-4000-8000-00000000b024'::uuid,'b8ca0000-0000-4000-8000-0000000000a1'::uuid,'b8cb0000-0000-4000-8000-000000000009'::uuid),
  ('b8cd0000-0000-4000-8000-00000000b025'::uuid,'b8ca0000-0000-4000-8000-0000000000a1'::uuid,'b8cb0000-0000-4000-8000-000000000009'::uuid),
  ('b8cd0000-0000-4000-8000-00000000b026'::uuid,'b8ca0000-0000-4000-8000-0000000000b2'::uuid,'b8cb0000-0000-4000-8000-00000000000a'::uuid)
) AS v(tx, store_id, seller_id);
INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, cost_at_sale)
SELECT tx, CASE WHEN store_id='b8ca0000-0000-4000-8000-0000000000b2' THEN 'b8cc0000-0000-4000-8000-000000000002'::uuid ELSE 'b8cc0000-0000-4000-8000-000000000001'::uuid END, 2, 100, 40
FROM (VALUES ('b8cd0000-0000-4000-8000-00000000b022'::uuid,'b8ca0000-0000-4000-8000-0000000000a1'::uuid),
             ('b8cd0000-0000-4000-8000-00000000b023'::uuid,'b8ca0000-0000-4000-8000-0000000000a1'::uuid),
             ('b8cd0000-0000-4000-8000-00000000b024'::uuid,'b8ca0000-0000-4000-8000-0000000000a1'::uuid),
             ('b8cd0000-0000-4000-8000-00000000b025'::uuid,'b8ca0000-0000-4000-8000-0000000000a1'::uuid),
             ('b8cd0000-0000-4000-8000-00000000b026'::uuid,'b8ca0000-0000-4000-8000-0000000000b2'::uuid)) AS v(tx, store_id);
INSERT INTO public.payment_transactions (store_id, ref_type, ref_id, amount, currency, exchange_rate, payment_method, direction, payment_date, paid_by, transaction_id, idempotency_key)
SELECT t.store_id,'sale',t.id,200,'CUP',1,'cash','in',now(),t.seller_id,t.id,'b8c-pay-'||t.id::text
FROM public.transactions t WHERE t.id::text ~ '(b02[2-6])$';
SELECT count(*)::int AS created FROM public.transactions WHERE id::text ~ '(b02[2-6])$';
