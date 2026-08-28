-- ============================================================================
-- CASO D — VENTA + RECEPCIÓN: la venta no destruye WAC; algoritmo D-01 activo;
-- registrar diferencia entre WAC operativo y promedio histórico de adquisiciones.
-- Secuencia:
--   R1: 10 @ 100            → stock 10, WAC 100
--   Venta de 4 (costo 100)  → stock 6, WAC DEBE seguir 100
--   R2: 6 @ 200 (confirm)   → D-01 operativo: (6×100+6×200)/12 = 150
--                              histórico:  (10×100+6×200)/16 = 137.5  ← divergencia
--   R3 pendiente 1 @ 150 (solo INSERT receipt_items, sin confirmar)
--                           → trg_update_product_wac recalcula HISTÓRICO sobre
--                             recepciones activas → WAC operativo 150 se
--                             sobrescribe silenciosamente por 137.5 ?
-- ============================================================================
\set ON_ERROR_STOP off
BEGIN;
\set ON_ERROR_ROLLBACK on
\i /home/z/my-project/scripts/af/af-common.sql

\echo '════ CASO D — VENTA + RECEPCIÓN (D-01 vs histórico) ════'
INSERT INTO public.products (id, name, sku, store_id, stock_current, cost_average, cost_price)
VALUES (:'PD'::uuid, 'AF Producto D', 'AF-D-001', :'S'::uuid, 0, 0, 0);
SELECT pg_temp.af_reception(:'PD'::uuid, 10, 100, 'D-R1', '2026-08-28 10:00:00+00') AS receipt_1;

\echo '── STATE hash inicial (pre-acción: antes de la venta) ──'
SELECT 'STATE|D|start|' || pg_temp.af_state_hash(:'PD'::uuid) AS state_hash;

\echo '── ACCIÓN 1: venta de 4 @ 150 (costo cliente 100 = WAC real, para aislar dinámica WAC) ──'
SELECT public.create_sale_v2(
  p_store_id => :'S'::uuid, p_seller_id => :'U'::uuid,
  p_items => '[{"product_id":"33333333-3333-3333-3333-33333333a004","quantity":4,"price":150,"cost_at_sale":100}]'::jsonb,
  p_payment_method => 'cash', p_idempotency_key => 'AF-D-SALE-1',
  p_subtotal => 600, p_total_amount => 600, p_operation_date => '2026-08-28 10:05:00+00'
) AS sale_1;
SAVEPOINT sp_d1; ROLLBACK TO SAVEPOINT sp_d1;
SELECT stock_current AS d_stock_post_venta, cost_average AS d_wac_post_venta
FROM public.products WHERE id=:'PD'::uuid \gset
SELECT 'EVID|D|post_venta|stock=' || :'d_stock_post_venta' || '|wac=' || :'d_wac_post_venta';

\echo '── ACCIÓN 2: 2ª recepción 6 @ 200 (confirm D-01) ──'
SELECT pg_temp.af_reception(:'PD'::uuid, 6, 200, 'D-R2', '2026-08-28 10:10:00+00') AS receipt_2;
SELECT stock_current AS d_stock_post_r2, cost_average AS d_wac_post_r2
FROM public.products WHERE id=:'PD'::uuid \gset
SELECT 'EVID|D|post_r2|stock=' || :'d_stock_post_r2' || '|wac=' || :'d_wac_post_r2' || ' (D-01 esperado 150)';

\echo '── ACCIÓN 3: recepción 3 PENDIENTE 1 @ 150 (solo creación, dispara trigger sobre receipt_items) ──'
INSERT INTO public.receipts (id, store_id, user_id, status, reference_doc)
VALUES ('44444444-4444-4444-4444-44444444d003', :'S'::uuid, :'U'::uuid, 'pending', 'AF-D-R3');
INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost, tasa_cambio_recepcion)
VALUES ('44444444-4444-4444-4444-44444444d003', :'PD'::uuid, 1, 150, 1.0);
SELECT stock_current AS d_stock_post_r3, cost_average AS d_wac_post_r3
FROM public.products WHERE id=:'PD'::uuid \gset
SELECT 'EVID|D|post_r3_pendiente|stock=' || :'d_stock_post_r3' || '|wac=' || :'d_wac_post_r3' || ' (operativo 150; histórico 137.5)';

\echo '── Recalculo independiente de ambas fórmulas ──'
SELECT 'EVID|D|formulas|D01_operativo=(6×100+6×200)/12=' || round(1800.0/12,6) ||
       ' | historico=(10×100+6×200)/16=' || round(2200.0/16,6);

\echo '── ASSERTIONS (canon D) ──'
SELECT pg_temp.af_assert('D.1','Venta no destruye WAC (post-venta = 100)', 100, :'d_wac_post_venta'::numeric);
SELECT pg_temp.af_assert('D.2','WAC tras R2 = D-01 operativo (1800/12 = 150)', 150, :'d_wac_post_r2'::numeric);
SELECT pg_temp.af_assert('D.3','WAC tras R3-pendiente debe seguir 150 (canon D-01); histórico escribiría 137.5', 150, :'d_wac_post_r3'::numeric);
SELECT pg_temp.af_assert('D.4','Stock final = 6+6 = 12 (R3 no confirmada no suma stock)', 12, :'d_stock_post_r3'::numeric);

\echo '── DIVERGENCIA WAC operativo vs promedio histórico (registro §14-D) ──'
SELECT 'EVID|D|divergencia|operativo=150|historico=137.5|delta=' || round(150 - 2200.0/16, 6) ||
       '|sobrescrito=' || (CASE WHEN round(:'d_wac_post_r3'::numeric,6) <> 150.0 THEN 'SI (defecto)' ELSE 'NO' END);

\echo '── STATE hash final ──'
SELECT 'STATE|D|end|' || pg_temp.af_state_hash(:'PD'::uuid) AS state_hash;
ROLLBACK;

\echo '── RESIDUO ──'
SELECT 'RESIDUE|D|products='||cnt FROM (SELECT count(*) cnt FROM public.products WHERE id=:'PD'::uuid) x;
SELECT 'RESIDUE|D|transactions='||cnt FROM (SELECT count(*) cnt FROM public.transactions WHERE store_id=:'S'::uuid) x;
SELECT 'RESIDUE|D|receipts='||cnt FROM (SELECT count(*) cnt FROM public.receipts WHERE store_id=:'S'::uuid) x;
\echo '════ FIN CASO D ════'
