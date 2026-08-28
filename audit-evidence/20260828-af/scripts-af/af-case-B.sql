-- ============================================================================
-- CASO B — SEGUNDA RECEPCIÓN: promedio ponderado según D-01
-- Identidad esperada (dueño §14-B, D-01 ratificado, A = WAC operativo):
--   WAC_new = (stock_prev × WAC_prev + qty × unit_cost) / (stock_prev + qty)
-- Setup: 10 @ 100 → confirm → 2ª recepción 5 @ 200.
-- Esperado: WAC = (10×100 + 5×200)/15 = 2000/15 ≈ 133.333333
-- ============================================================================
\set ON_ERROR_STOP off
BEGIN;
\set ON_ERROR_ROLLBACK on
\i /home/z/my-project/scripts/af/af-common.sql

\echo '════ CASO B — SEGUNDA RECEPCIÓN (D-01) ════'
INSERT INTO public.products (id, name, sku, store_id, stock_current, cost_average, cost_price)
VALUES (:'PB'::uuid, 'AF Producto B', 'AF-B-001', :'S'::uuid, 0, 0, 0);

\echo '── 1ª recepción 10 @ 100 ──'
SELECT pg_temp.af_reception(:'PB'::uuid, 10, 100, 'B-R1', '2026-08-28 10:00:00+00') AS receipt_1;
SELECT 'EVID|B|after_r1|stock=' || stock_current || '|wac=' || cost_average
FROM public.products WHERE id=:'PB'::uuid;

\echo '── STATE hash inicial (pre-acción del caso: 2ª recepción) ──'
SELECT 'STATE|B|start|' || pg_temp.af_state_hash(:'PB'::uuid) AS state_hash;

\echo '── ACCIÓN: 2ª recepción 5 @ 200 ──'
SELECT pg_temp.af_reception(:'PB'::uuid, 5, 200, 'B-R2', '2026-08-28 11:00:00+00') AS receipt_2;

\echo '── EVIDENCIA ──'
SELECT 'EVID|B|product|stock_current=' || stock_current || '|cost_average=' || cost_average
FROM public.products WHERE id=:'PB'::uuid;
SELECT 'EVID|B|movement|' || movement_type || '|qty=' || quantity_change || '|unit_cost=' || unit_cost
FROM public.stock_movements WHERE product_id=:'PB'::uuid ORDER BY movement_date;
\echo '── Recalculo canónico independiente de D-01 (identidad del dueño) ──'
SELECT 'EVID|B|D01_identity|(stock_prev×WAC_prev + qty×cost)/(stock_prev+qty) = ' ||
  round((10*100 + 5*200)::numeric / (10+5), 6) || ' | WAC_servidor = ' || round(cost_average, 6)
FROM public.products WHERE id=:'PB'::uuid;

\echo '── ASSERTIONS (canon B) ──'
SELECT pg_temp.af_assert('B.1','WAC = D-01 (2000/15 = 133.333333)', round(2000.0/15.0,6),
  round((SELECT cost_average FROM public.products WHERE id=:'PB'::uuid),6));
SELECT pg_temp.af_assert('B.2','Stock acumulado = 15', 15,
  (SELECT stock_current FROM public.products WHERE id=:'PB'::uuid));
SELECT pg_temp.af_assert_bool('B.3','2 movimientos purchase (+10@100, +5@200)',
  (SELECT (SELECT count(*) FROM public.stock_movements WHERE product_id=:'PB'::uuid AND movement_type='purchase') = 2
     AND (SELECT count(*) FROM public.stock_movements WHERE product_id=:'PB'::uuid AND movement_type='purchase' AND unit_cost=200) = 1),
  true);
SELECT pg_temp.af_assert_bool('B.4','Recepción B-R2 activa (pending→active)',
  (SELECT count(*) FROM public.receipts WHERE store_id=:'S'::uuid AND status='active' AND reference_doc='AF-B-R2') = 1,
  true);

\echo '── STATE hash final ──'
SELECT 'STATE|B|end|' || pg_temp.af_state_hash(:'PB'::uuid) AS state_hash;
ROLLBACK;

\echo '── RESIDUO ──'
SELECT 'RESIDUE|B|products='||cnt FROM (SELECT count(*) cnt FROM public.products WHERE id=:'PB'::uuid) x;
SELECT 'RESIDUE|B|movements='||cnt FROM (SELECT count(*) cnt FROM public.stock_movements WHERE product_id=:'PB'::uuid) x;
SELECT 'RESIDUE|B|receipts='||cnt FROM (SELECT count(*) cnt FROM public.receipts WHERE store_id=:'S'::uuid) x;
\echo '════ FIN CASO B ════'
