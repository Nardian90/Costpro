-- Rendimiento: 20k ventas + 60k líneas + pagos; medir latencia del RPC.
\set ON_ERROR_STOP on
\timing on

-- Generar datos masivos (una sola INSERT..SELECT desde generate_series)
BEGIN;
CREATE TEMP TABLE seed_sales AS
SELECT ('f0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid AS id,
       CASE WHEN g % 2 = 0 THEN '11111111-1111-1111-1111-111111111111'::uuid
            ELSE '22222222-2222-2222-2222-222222222222'::uuid END AS store_id,
       CASE WHEN g % 3 = 0 THEN 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
            WHEN g % 3 = 1 THEN 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
            ELSE 'aaaaaaaa-0000-0000-0000-000000000003'::uuid END AS seller_id,
       100 + (g % 900) AS total_amount,
       'completed'::transaction_status AS status,
       'cash'::payment_method_enum AS payment_method,
       (100 + (g % 900)) AS subtotal,
       0 AS discount_value,
       0 AS tax_amount,
       'CUP'::text AS sale_currency,
       ('2026-11-01 08:00-05'::timestamptz + ((g % 480) * interval '12 minutes')) AS completed_at
  FROM generate_series(1, 20000) g;

INSERT INTO transactions (id, store_id, seller_id, total_amount, status, payment_method, subtotal, discount_value, tax_amount, sale_currency, sale_exchange_rate, completed_at, created_at)
SELECT id, store_id, seller_id, total_amount, status, payment_method, subtotal, discount_value, tax_amount, sale_currency, 1, completed_at, completed_at FROM seed_sales;

INSERT INTO transaction_items (transaction_id, product_id, quantity, price_at_sale, price_at_sale_cup, item_discount_value)
SELECT s.id,
       CASE WHEN s.id::text LIKE '%0' THEN 'bbbbbbbb-0000-0000-0000-000000000001'::uuid
            WHEN s.id::text LIKE '%2' THEN 'bbbbbbbb-0000-0000-0000-000000000002'::uuid
            ELSE 'bbbbbbbb-0000-0000-0000-000000000003'::uuid END,
       1 + (extract(epoch from s.completed_at)::int % 3),
       100, 100, 0
  FROM seed_sales s;

INSERT INTO payment_transactions (id, store_id, ref_type, ref_id, transaction_id, amount, payment_method, currency, exchange_rate, direction, payment_date)
SELECT extensions.gen_random_uuid(),
       ss.store_id, 'sale', ss.id, ss.id, ss.total_amount, 'cash', 'CUP', 1, 'in', ss.completed_at
  FROM seed_sales ss, generate_series(1,1) g;
COMMIT;

ANALYZE transactions; ANALYZE transaction_items; ANALYZE payment_transactions;

-- Consulta del dashboard (30 días, ámbito completo del admin)
BEGIN;
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT 'RPC 20k ventas → ops=' || (res->'kpi'->>'ops') || ' net=' || (res->'kpi'->>'net_cup')
  FROM public.get_sales_dashboard_analytics(NULL,
    '2026-10-10 00:00-05'::timestamptz, '2026-11-08 23:59-05'::timestamptz,
    '2026-09-10 00:00-05'::timestamptz, '2026-10-09 23:59-05'::timestamptz) res;
ROLLBACK;
