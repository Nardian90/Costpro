-- ============================================================================
-- w7-ext-fase19.sql — W7 FASE 19: INV-15 VALUE CONSERVATION FORMAL
-- Ventana (store, producto): V_ledger = V0 + Σ in×uc − Σ out×uc(=WAC_prev) ± reversión
-- Dos bases: LEDGER (movimientos) vs WAC (stock×cost_average). Varianza A1
-- (basis mismatch de devoluciones a cost_at_sale ≠ WAC vigente) se MATERIALIZA.
-- Clon: w7_gate.
-- ============================================================================
BEGIN;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT pg_temp.w62_evid('F19: ciclo completo 10@100 → +5@200 → venta3 → +5@300 → devolución1');

-- P19: semilla 10@100 (apertura implícita V0=1000)
SELECT pg_temp.w62_product('f19010000001','F19 Conservation',10,100,300,'22222222-2222-2222-2222-222222222222'::uuid) AS p19 \gset
SELECT 'EVID|F19|apertura: stock=10, WAC=100, V0=1000';

-- 19.1 recepción +5@200 → WAC=(10·100+5·200)/15=133.3333
SELECT pg_temp.w62_reception('33333333-3333-3333-3333-f19010000001'::uuid, 5, 200, 'F19-R1');
SELECT pg_temp.w62_assert('F19-1','WAC tras +5@200 = 133.333333', 133.333333,
  (SELECT round(cost_average,6) FROM public.products WHERE id='33333333-3333-3333-3333-f19010000001'::uuid));
COMMIT;

-- 19.2 venta de 3 → COGS=3×133.3333=400; WAC invariante
BEGIN;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT public.create_sale_v2(
  p_store_id=>'22222222-2222-2222-2222-222222222222'::uuid,
  p_seller_id=>'11111111-1111-1111-1111-111111111111'::uuid,
  p_items=>'[{"product_id":"33333333-3333-3333-3333-f19010000001","quantity":3,"price_at_sale":400}]'::jsonb,
  p_payment_method=>'cash', p_total_amount=>1200, p_subtotal=>1200,
  p_idempotency_key=>'F19-SALE1') AS s19 \gset
SELECT pg_temp.w62_assert('F19-2','COGS venta = 3×133.3333 = 400 (WAC_prev vigente)', 400,
  (SELECT round(ti.cost_at_sale*ti.quantity,6) FROM public.transaction_items ti
    JOIN public.transactions t ON t.id=ti.transaction_id WHERE t.idempotency_key='F19-SALE1'));
SELECT pg_temp.w62_assert('F19-3','WAC invariante tras venta (133.333333)', 133.333333,
  (SELECT round(cost_average,6) FROM public.products WHERE id='33333333-3333-3333-3333-f19010000001'::uuid));
COMMIT;

-- 19.3 recepción +5@300 → WAC=(12·133.3333+5·300)/17=(1600+1500)/17=182.352941
BEGIN;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT pg_temp.w62_reception('33333333-3333-3333-3333-f19010000001'::uuid, 5, 300, 'F19-R2');
SELECT pg_temp.w62_assert('F19-4','WAC tras +5@300 = 182.352941 (blend exacto)', 182.352941,
  (SELECT round(cost_average,6) FROM public.products WHERE id='33333333-3333-3333-3333-f19010000001'::uuid));
COMMIT;

-- 19.4 devolución de 1 ud de F19-SALE1 (cash) → retorno a cost_at_sale=133.3333; WAC NO re-blendeado
BEGIN;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT public.create_devolution_v2(
  p_store_id=>'22222222-2222-2222-2222-222222222222'::uuid,
  p_items=>'[{"product_id":"33333333-3333-3333-3333-f19010000001","quantity":1,"unit_price":400}]'::jsonb,
  p_reason=>'F19 reversión', p_user_id=>'11111111-1111-1111-1111-111111111111'::uuid,
  p_original_transaction_id=>(SELECT id FROM public.transactions WHERE idempotency_key='F19-SALE1'),
  p_payment_method=>'cash', p_idempotency_key=>'F19-DEV1') AS dev19 \gset
SELECT pg_temp.w62_assert('F19-5','COGS_revertido = COGS_original (uc del movement return = 133.333333)', 133.333333,
  (SELECT round(unit_cost,6) FROM public.stock_movements
    WHERE movement_type='return' AND product_id='33333333-3333-3333-3333-f19010000001'::uuid LIMIT 1));

-- ═════ CIERRE DE VENTANA: conservation formal ═════
-- Base LEDGER: V0 + Σin×uc − Σout×uc + reversión
--   = 1000 + (5·200 + 5·300) − (3·133.333333) + (1·133.333333) = 3233.333333
WITH agg AS (
  SELECT
    COALESCE(SUM(CASE WHEN quantity_change>0 THEN quantity_change*unit_cost ELSE 0 END),0) AS v_in,
    COALESCE(SUM(CASE WHEN quantity_change<0 THEN -quantity_change*unit_cost ELSE 0 END),0) AS v_out
  FROM public.stock_movements
  WHERE product_id='33333333-3333-3333-3333-f19010000001'::uuid
    AND store_id='22222222-2222-2222-2222-222222222222'::uuid
)
SELECT pg_temp.w62_assert('F19-6','LEDGER: V0 1000 + in 2500 − out 400 = 3100 + reversión 133.333333 = 3233.333333',
  3233.333333,
  (SELECT round(1000 + v_in - v_out, 6) FROM agg));

-- Base WAC: stock_final × WAC_final = 18 × 182.352941 = 3282.352941
SELECT pg_temp.w62_assert('F19-7','WAC basis: stock 18 × WAC 182.352941 = 3282.352941', 3282.352941,
  (SELECT round(stock_current*cost_average,6) FROM public.products WHERE id='33333333-3333-3333-3333-f19010000001'::uuid));

-- ═════ VARIANZA A1 MATERIALIZADA (basis mismatch) ═════
-- A1 = 1 × (WAC_vigente 182.352941 − cost_at_sale 133.333333) = 49.019608
SELECT pg_temp.w62_assert('F19-8','A1 basis mismatch MATERIALIZADA = 1×(182.352941−133.333333) = 49.019608', 49.019608,
  (SELECT round(
    (SELECT stock_current*cost_average FROM public.products WHERE id='33333333-3333-3333-3333-f19010000001'::uuid)
  - (SELECT 1000 + COALESCE(SUM(CASE WHEN quantity_change>0 THEN quantity_change*unit_cost ELSE 0 END),0)
       - COALESCE(SUM(CASE WHEN quantity_change<0 THEN -quantity_change*unit_cost ELSE 0 END),0)
     FROM public.stock_movements WHERE product_id='33333333-3333-3333-3333-f19010000001'::uuid)
  , 6)));

-- Trazabilidad: la varianza es RECONSTRUIBLE desde stock_movements (uc) × transaction_items (cost_at_sale)
SELECT pg_temp.w62_assert_bool('F19-9','A1 trazable: existe movement return con uc ≠ WAC vigente (línea de auditoría)', true,
  (SELECT EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.movement_type='return' AND sm.product_id='33333333-3333-3333-3333-f19010000001'::uuid
      AND round(sm.unit_cost,6) <> (SELECT round(cost_average,6) FROM public.products WHERE id=sm.product_id))));

-- ═════ Σ COGS == Σ movimientos de venta ═════
SELECT pg_temp.w62_assert('F19-10','Σ transaction_items.COGS = Σ stock_movements(sale).unit_cost×|qty| (exacto)', 0,
  (SELECT round(
    (SELECT COALESCE(SUM(ti.cost_at_sale*ti.quantity),0) FROM public.transaction_items ti
      JOIN public.transactions t ON t.id=ti.transaction_id
      WHERE ti.product_id='33333333-3333-3333-3333-f19010000001'::uuid)
  - (SELECT COALESCE(SUM(-quantity_change*unit_cost),0) FROM public.stock_movements
      WHERE product_id='33333333-3333-3333-3333-f19010000001'::uuid AND movement_type='sale')
  , 6)));
COMMIT;
\echo 'w7-ext-fase19: FIN'
