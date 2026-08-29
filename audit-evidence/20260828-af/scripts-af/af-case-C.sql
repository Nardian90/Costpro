-- ============================================================================
-- CASO C — VENTA: cost_at_sale lo determina el SERVIDOR
-- Canónico (dueño §14-C): el cliente NO puede imponer 0, 7777 u otro costo.
-- Setup: recepción 10 @ 100 → WAC 100, stock 10.
-- Ataque 1: venta de 3 con cost_at_sale=7777 impuesto por el cliente.
-- Ataque 2: venta de 2 SIN claves de costo (el servidor debe usar WAC, no 0).
-- ============================================================================
\set ON_ERROR_STOP off
BEGIN;
\set ON_ERROR_ROLLBACK on
\i /home/z/my-project/scripts/af/af-common.sql

\echo '════ CASO C — VENTA (costo server-side) ════'
INSERT INTO public.products (id, name, sku, store_id, stock_current, cost_average, cost_price)
VALUES (:'PC'::uuid, 'AF Producto C', 'AF-C-001', :'S'::uuid, 0, 0, 0);
SELECT pg_temp.af_reception(:'PC'::uuid, 10, 100, 'C-R1') AS receipt_setup;

\echo '── STATE hash inicial ──'
SELECT 'STATE|C|start|' || pg_temp.af_state_hash(:'PC'::uuid) AS state_hash;

\echo '── ATAQUE 1: cliente impone cost_at_sale=7777 (venta de 3 @ 150, total server-validado 450) ──'
SELECT public.create_sale_v2(
  p_store_id => :'S'::uuid, p_seller_id => :'U'::uuid,
  p_items => '[{"product_id":"33333333-3333-3333-3333-33333333a003","quantity":3,"price":150,"cost_at_sale":7777}]'::jsonb,
  p_payment_method => 'cash', p_idempotency_key => 'AF-C-SALE-1',
  p_subtotal => 450, p_total_amount => 450, p_operation_date => '2026-08-28 10:05:00+00'
) AS sale_1;

\echo '── ATAQUE 2: venta SIN claves de costo (2 @ 150, total 300) ──'
SELECT public.create_sale_v2(
  p_store_id => :'S'::uuid, p_seller_id => :'U'::uuid,
  p_items => '[{"product_id":"33333333-3333-3333-3333-33333333a003","quantity":2,"price":150}]'::jsonb,
  p_payment_method => 'cash', p_idempotency_key => 'AF-C-SALE-2',
  p_subtotal => 300, p_total_amount => 300, p_operation_date => '2026-08-28 10:06:00+00'
) AS sale_2;

\echo '── EVIDENCIA ──'
SELECT 'EVID|C|tx|idem=' || idempotency_key || '|total=' || total_amount || '|status=' || status
FROM public.transactions WHERE store_id=:'S'::uuid ORDER BY created_at;
SELECT 'EVID|C|item|idem=' || t.idempotency_key || '|qty=' || ti.quantity || '|cost_at_sale=' || ti.cost_at_sale
FROM public.transaction_items ti JOIN public.transactions t ON t.id=ti.transaction_id
WHERE t.store_id=:'S'::uuid ORDER BY t.created_at;
SELECT 'EVID|C|movement|' || movement_type || '|qty=' || quantity_change || '|unit_cost_registrado=' || unit_cost
FROM public.stock_movements WHERE product_id=:'PC'::uuid ORDER BY movement_date;
SELECT 'EVID|C|product|stock=' || stock_current || '|wac=' || cost_average
FROM public.products WHERE id=:'PC'::uuid;

\echo '── ASSERTIONS (canon C: el servidor impone WAC=100) ──'
SELECT pg_temp.af_assert('C.1','Ataque 7777 ignorado: cost_at_sale venta 1 = 100 (WAC servidor)', 100,
  COALESCE((SELECT ti.cost_at_sale FROM public.transaction_items ti
    JOIN public.transactions t ON t.id=ti.transaction_id
    WHERE t.idempotency_key='AF-C-SALE-1' LIMIT 1), -999));
SELECT pg_temp.af_assert('C.2','Sin costo del cliente: cost_at_sale venta 2 = 100 (no 0)', 100,
  COALESCE((SELECT ti.cost_at_sale FROM public.transaction_items ti
    JOIN public.transactions t ON t.id=ti.transaction_id
    WHERE t.idempotency_key='AF-C-SALE-2' LIMIT 1), -999));
SELECT pg_temp.af_assert('C.3','Kardex venta 1 al costo servidor (unit_cost=100)', 100,
  COALESCE((SELECT unit_cost FROM public.stock_movements
    WHERE product_id=:'PC'::uuid AND movement_type='sale' ORDER BY movement_date LIMIT 1), -999));
SELECT pg_temp.af_assert_bool('C.4','WAC no alterado por ventas (=100)',
  (SELECT round(cost_average,6)=100 FROM public.products WHERE id=:'PC'::uuid), true);
SELECT pg_temp.af_assert('C.5','Stock tras ventas (3+2) = 5', 5,
  (SELECT stock_current FROM public.products WHERE id=:'PC'::uuid));

\echo '── STATE hash final ──'
SELECT 'STATE|C|end|' || pg_temp.af_state_hash(:'PC'::uuid) AS state_hash;
ROLLBACK;

\echo '── RESIDUO ──'
SELECT 'RESIDUE|C|products='||cnt FROM (SELECT count(*) cnt FROM public.products WHERE id=:'PC'::uuid) x;
SELECT 'RESIDUE|C|transactions='||cnt FROM (SELECT count(*) cnt FROM public.transactions WHERE store_id=:'S'::uuid) x;
SELECT 'RESIDUE|C|movements='||cnt FROM (SELECT count(*) cnt FROM public.stock_movements WHERE product_id=:'PC'::uuid) x;
\echo '════ FIN CASO C ════'
