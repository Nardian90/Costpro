-- W9.5-B8 · GATE 9 — S11-retry: void de completed CON deducción previa, baseline limpio
-- Producto …005: inventory 10, stock_current 10 → venta -5 (5) → void +5 (esperado 10).
CREATE TEMP TABLE b8_log(probe text, outcome text, detail jsonb);
GRANT INSERT, SELECT ON b8_log TO authenticated;

INSERT INTO public.products (id, name, sku, store_id, stock_current, cost_average)
VALUES ('b8c00000-0000-4000-8000-000000000005', 'B8-PROD-CSTOCK2', 'B8-P5', 'b8a00000-0000-4000-8000-00000000a001', 10, 40);
INSERT INTO public.inventory (store_id, product_id, quantity)
VALUES ('b8a00000-0000-4000-8000-00000000a001', 'b8c00000-0000-4000-8000-000000000005', 10);

INSERT INTO public.transactions (id, store_id, seller_id, total_amount, status, payment_method, subtotal, discount_type, discount_value, tax_amount, sale_currency, sale_exchange_rate, cash_amount, created_at)
VALUES ('b8d00000-0000-4000-8000-00000000c00b','b8a00000-0000-4000-8000-00000000a001','b8b00000-0000-4000-8000-000000000008', 500, 'completed', 'cash', 500, 'fixed', 0, 0, 'CUP', 1, 500, now());
INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, cost_at_sale)
VALUES ('b8d00000-0000-4000-8000-00000000c00b','b8c00000-0000-4000-8000-000000000005', 5, 100, 40);
INSERT INTO public.payment_transactions (store_id, ref_type, ref_id, amount, currency, exchange_rate, payment_method, direction, payment_date, paid_by, transaction_id, idempotency_key)
VALUES ('b8a00000-0000-4000-8000-00000000a001','sale','b8d00000-0000-4000-8000-00000000c00b',500,'CUP',1,'cash','in',now(),'b8b00000-0000-4000-8000-000000000008','b8d00000-0000-4000-8000-00000000c00b','b8-pay-c00b');

-- Deducción de la venta (como haría create_sale_v2): -5 → inventory 5, stock_current 5
INSERT INTO public.stock_movements (store_id, product_id, created_by, quantity_change, movement_type, reference_id, reference_doc, unit_cost, notes)
VALUES ('b8a00000-0000-4000-8000-00000000a001','b8c00000-0000-4000-8000-000000000005','b8b00000-0000-4000-8000-000000000008', -5, 'sale', 'b8d00000-0000-4000-8000-00000000c00b', 'venta', 40, 'B8 S11-retry deduction');
UPDATE public.products SET stock_current = 5 WHERE id='b8c00000-0000-4000-8000-000000000005';

INSERT INTO b8_log VALUES('BASELINE_C2','STATE', (
  SELECT jsonb_build_object('stock_current', pr.stock_current, 'inventory', inv.quantity)
  FROM public.products pr JOIN public.inventory inv ON inv.product_id=pr.id AND inv.store_id='b8a00000-0000-4000-8000-00000000a001'
  WHERE pr.id='b8c00000-0000-4000-8000-000000000005'));

SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"b8b00000-0000-4000-8000-000000000008","role":"authenticated"}';
SET request.jwt.claim.sub = 'b8b00000-0000-4000-8000-000000000008';
DO $p$ DECLARE v jsonb; BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000c00b','b8-S11r-completed-stock', now(), NULL);
  INSERT INTO b8_log VALUES('S11r_void_completed_con_deduccion','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('S11r_void_completed_con_deduccion','DENIED', jsonb_build_object('err',SQLERRM,'code',SQLSTATE));
END $p$;
RESET ROLE;

INSERT INTO b8_log VALUES('POST_C2','STATE', (
  SELECT jsonb_build_object(
    'stock_current', pr.stock_current,
    'inventory', inv.quantity,
    'movements_sale', (SELECT count(*) FROM public.stock_movements m WHERE m.product_id='b8c00000-0000-4000-8000-000000000005' AND m.movement_type='sale'),
    'movements_sale_void', (SELECT count(*) FROM public.stock_movements m WHERE m.product_id='b8c00000-0000-4000-8000-000000000005' AND m.movement_type='sale_void'),
    'esperado', '10 / 10 (restauración exacta)')
  FROM public.products pr JOIN public.inventory inv ON inv.product_id=pr.id AND inv.store_id='b8a00000-0000-4000-8000-00000000a001'
  WHERE pr.id='b8c00000-0000-4000-8000-000000000005'));

SELECT coalesce(jsonb_agg(row_to_json(b8_log) ORDER BY probe), '[]'::jsonb) AS log FROM b8_log;
