-- ============================================================================
-- CASO A — RECEPCIÓN: WAC inicial y creación de inventario
-- Canónico (dueño §14-A + doc 61 E-R + D-01): WAC inicial = unit_cost_cup;
-- inventario creado (stock, movimiento 'purchase', receipt → active).
-- Ejecución: UNA transacción + ROLLBACK (cero residuo).
-- ============================================================================
\set ON_ERROR_STOP off
BEGIN;
\set ON_ERROR_ROLLBACK on
\i /home/z/my-project/scripts/af/af-common.sql

\echo '════ CASO A — RECEPCIÓN ════'
INSERT INTO public.products (id, name, sku, store_id, stock_current, cost_average, cost_price)
VALUES (:'PA'::uuid, 'AF Producto A', 'AF-A-001', :'S'::uuid, 0, 0, 0);

\echo '── STATE hash inicial (post-fixture, pre-acción) ──'
SELECT 'STATE|A|start|' || pg_temp.af_state_hash(:'PA'::uuid) AS state_hash;

\echo '── ACCIÓN: recepción canónica 10 @ 100 CUP (pending → confirm) ──'
SELECT pg_temp.af_reception(:'PA'::uuid, 10, 100, 'A-R1') AS receipt_id;

\echo '── EVIDENCIA: estado resultante ──'
SELECT 'EVID|A|product|stock_current=' || stock_current || '|cost_average=' || cost_average || '|cost_price=' || cost_price
FROM public.products WHERE id = :'PA'::uuid;
SELECT 'EVID|A|movement|' || movement_type || '|qty=' || quantity_change || '|unit_cost=' || unit_cost || '|balance=' || balance_after
FROM public.stock_movements WHERE product_id = :'PA'::uuid ORDER BY movement_date;
SELECT 'EVID|A|receipt_status=' || status || '|total_cost=' || coalesce(total_cost::text,'null')
FROM public.receipts WHERE store_id = :'S'::uuid;
SELECT 'EVID|A|kardex_entries=' || count(*) FROM public.kardex_entries WHERE product_id = :'PA'::uuid;

\echo '── ASSERTIONS (canon A) ──'
SELECT pg_temp.af_assert('A.1','WAC inicial = unit_cost (100)', 100,
  (SELECT cost_average FROM public.products WHERE id=:'PA'::uuid));
SELECT pg_temp.af_assert('A.2','Inventario creado: stock_current = 10', 10,
  (SELECT stock_current FROM public.products WHERE id=:'PA'::uuid));
SELECT pg_temp.af_assert_bool('A.3','Movimiento de inventario tipo purchase +10 @100',
  (SELECT EXISTS (SELECT 1 FROM public.stock_movements
    WHERE product_id=:'PA'::uuid AND movement_type='purchase'
      AND quantity_change=10 AND unit_cost=100)),
  true);
SELECT pg_temp.af_assert_bool('A.4','Receipt queda status=active con total_cost=1000',
  (SELECT EXISTS (SELECT 1 FROM public.receipts WHERE store_id=:'S'::uuid AND status='active' AND total_cost=1000)),
  true);
SELECT pg_temp.af_assert_bool('A.5','Kardex generada para el producto',
  (SELECT EXISTS (SELECT 1 FROM public.kardex_entries WHERE product_id=:'PA'::uuid)),
  true);

\echo '── STATE hash final (pre-rollback) ──'
SELECT 'STATE|A|end|' || pg_temp.af_state_hash(:'PA'::uuid) AS state_hash;

ROLLBACK;

\echo '── RESIDUO (post-rollback, debe ser cero) ──'
SELECT 'RESIDUE|A|products=' || cnt FROM (
  SELECT count(*) cnt FROM public.products WHERE id=:'PA'::uuid) x;
SELECT 'RESIDUE|A|stock_movements=' || cnt FROM (
  SELECT count(*) cnt FROM public.stock_movements WHERE product_id=:'PA'::uuid) x;
SELECT 'RESIDUE|A|receipts=' || cnt FROM (
  SELECT count(*) cnt FROM public.receipts WHERE store_id=:'S'::uuid) x;
\echo '════ FIN CASO A ════'
