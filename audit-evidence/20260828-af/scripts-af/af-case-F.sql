-- ============================================================================
-- CASO F — DEVOLUCIÓN (8 verificaciones canónicas del dueño §14-F)
-- Setup: recepción 10 @ 100 → venta de 5 @ 200 (costo 100) → stock 5, WAC 100.
--  F1 reversión del COGS original      (return @ cost_at_sale=100)
--  F2 conservación de costo histórico  (WAC intacto)
--  F3 límite acumulado de devolución   (Σ devuelta ≤ vendida)
--  F4 comportamiento parcial           (devolver 2 de 5)
--  F5 contra-asiento financiero        (reembolso/cash reversal)
--  F6 idempotencia                     (misma clave → idempotente)
--  F7 concurrencia                     → af-case-F7-conc.sql (DB clon efímero)
--  F8 ausencia de sobre-devolución     (invariante stock ≤ recibido)
-- ============================================================================
\set ON_ERROR_STOP off
BEGIN;
\set ON_ERROR_ROLLBACK on
\i /home/z/my-project/scripts/af/af-common.sql

\echo '════ CASO F — DEVOLUCIÓN ════'
INSERT INTO public.products (id, name, sku, store_id, stock_current, cost_average, cost_price)
VALUES (:'PF'::uuid, 'AF Producto F', 'AF-F-001', :'S'::uuid, 0, 0, 0);
SELECT pg_temp.af_reception(:'PF'::uuid, 10, 100, 'F-R1', '2026-08-28 10:00:00+00') AS receipt_setup;

\echo '── Venta original: 5 @ 200 (costo servidor/cliente 100) ──'
SELECT public.create_sale_v2(
  p_store_id => :'S'::uuid, p_seller_id => :'U'::uuid,
  p_items => '[{"product_id":"33333333-3333-3333-3333-33333333a007","quantity":5,"price":200,"cost_at_sale":100}]'::jsonb,
  p_payment_method => 'cash', p_idempotency_key => 'AF-F-SALE-1',
  p_subtotal => 1000, p_total_amount => 1000, p_operation_date => '2026-08-28 10:05:00+00'
) AS venta_original;
SELECT COALESCE((SELECT id::text FROM public.transactions WHERE idempotency_key='AF-F-SALE-1' LIMIT 1),'00000000-0000-0000-0000-000000000000') AS f_tx1 \gset
SELECT 'EVID|F|venta|tx=' || :'f_tx1' || '|stock_post=' || (SELECT stock_current FROM public.products WHERE id=:'PF'::uuid);

\echo '── STATE hash inicial (pre-acciones de devolución) ──'
SELECT 'STATE|F|start|' || pg_temp.af_state_hash(:'PF'::uuid) AS state_hash;

\echo '── F1/F4: devolución PARCIAL 2 de 5 (referenciando venta original) ──'
SELECT public.create_devolution_v2(
  p_store_id => :'S'::uuid,
  p_items => '[{"product_id":"33333333-3333-3333-3333-33333333a007","quantity":2,"unit_price":200}]'::jsonb,
  p_reason => 'AF-F devolucion parcial', p_user_id => :'U'::uuid,
  p_original_transaction_id => :'f_tx1'::uuid, p_payment_method => 'cash',
  p_idempotency_key => 'AF-F-DEV-1'
) AS devolucion_1;
SELECT COALESCE(stock_current,-999) AS f_stock_dev1, COALESCE(cost_average,-999) AS f_wac_dev1 FROM public.products WHERE id=:'PF'::uuid \gset
SELECT 'EVID|F|dev1|stock=' || :'f_stock_dev1' || '|wac=' || :'f_wac_dev1';
SELECT 'EVID|F|kardex_return|qty=' || quantity_change || '|unit_cost=' || unit_cost ||
       '|costo_esperado_original=100'
FROM public.stock_movements WHERE product_id=:'PF'::uuid AND movement_type='return';

\echo '── F3/F8 ATAQUE sobre-devolución: devolver 4 más (acumulado 6 > vendida 5) ──'
SELECT public.create_devolution_v2(
  p_store_id => :'S'::uuid,
  p_items => '[{"product_id":"33333333-3333-3333-3333-33333333a007","quantity":4,"unit_price":200}]'::jsonb,
  p_reason => 'AF-F ataque sobre-devolucion', p_user_id => :'U'::uuid,
  p_original_transaction_id => :'f_tx1'::uuid, p_payment_method => 'cash',
  p_idempotency_key => 'AF-F-DEV-2'
) AS devolucion_ataque;
SELECT COALESCE(stock_current,-999) AS f_stock_dev2 FROM public.products WHERE id=:'PF'::uuid \gset
SELECT 'EVID|F|dev2_ataque|stock=' || :'f_stock_dev2' ||
       '|invariante_stock<=recibido(10)=' || (CASE WHEN :'f_stock_dev2'::numeric <= 10 THEN 'CUMPLE' ELSE 'VIOLADO' END);

\echo '── F6: reenvío con MISMA clave AF-F-DEV-2 (debe ser idempotente) ──'
SELECT public.create_devolution_v2(
  p_store_id => :'S'::uuid,
  p_items => '[{"product_id":"33333333-3333-3333-3333-33333333a007","quantity":4,"unit_price":200}]'::jsonb,
  p_reason => 'AF-F reenvio misma clave', p_user_id => :'U'::uuid,
  p_original_transaction_id => :'f_tx1'::uuid, p_payment_method => 'cash',
  p_idempotency_key => 'AF-F-DEV-2'
) AS devolucion_reenvio;

\echo '── F5: búsqueda de contra-asiento financiero (reembolso) ──'
SELECT 'EVID|F|contra_asiento|cash_movements_ref_devolucion=' ||
  (SELECT count(*) FROM public.cash_movements WHERE store_id=:'S'::uuid AND
     (reason ILIKE '%devol%'));
SELECT 'EVID|F|contra_asiento|refunds_registrados=' ||
  (SELECT count(*) FROM public.devolutions WHERE store_id=:'S'::uuid AND payment_method IS NOT NULL AND total_amount > 0) ||
  ' (existen devoluciones con monto; ¿existe asiento financiero inverso?)';

\echo '── EVIDENCIA agregada ──'
SELECT 'EVID|F|devolutions|n=' || count(*) || '|total=' || coalesce(sum(total_amount),0) ||
       '|nums=' || coalesce(string_agg(devolution_number, ','), '')
FROM public.devolutions WHERE store_id=:'S'::uuid;
SELECT 'EVID|F|product_final|stock=' || stock_current || '|wac=' || cost_average || ' (recibido total=10; vendido=5)'
FROM public.products WHERE id=:'PF'::uuid;

\echo '── ASSERTIONS (canon F) ──'
SELECT pg_temp.af_assert('F.1','Reversión COGS al costo original: return @ cost_at_sale=100', 100,
  COALESCE((SELECT unit_cost FROM public.stock_movements WHERE product_id=:'PF'::uuid AND movement_type='return'
   ORDER BY movement_date LIMIT 1), -999));
SELECT pg_temp.af_assert('F.2','Conservación costo histórico: WAC intacto (100)', 100, :'f_wac_dev1'::numeric);
SELECT pg_temp.af_assert_bool('F.3','Límite acumulado: sobre-devolución (6>5) RECHAZADA',
  false, (SELECT count(*) FROM public.devolutions WHERE store_id=:'S'::uuid) = 2);
SELECT pg_temp.af_assert_bool('F.4','Devolución parcial (2 de 5) procesada',
  (SELECT EXISTS (SELECT 1 FROM public.devolutions d JOIN public.devolution_items di ON di.devolution_id=d.id
    WHERE d.idempotency_key='AF-F-DEV-1' AND di.quantity=2)), true);
SELECT pg_temp.af_assert_bool('F.5','Contra-asiento financiero existe (reembolso/cash reversal)',
  (SELECT EXISTS (SELECT 1 FROM public.cash_movements WHERE store_id=:'S'::uuid AND reason ILIKE '%devol%')),
  true);
SELECT pg_temp.af_assert_bool('F.6','Idempotencia: clave AF-F-DEV-2 tiene UNA sola devolución',
  (SELECT count(*) FROM public.devolutions WHERE idempotency_key='AF-F-DEV-2') = 1, true);
SELECT pg_temp.af_assert_bool('F.8','Ausencia de sobre-devolución: stock final ≤ recibido (10)',
  :'f_stock_dev2'::numeric <= 10, true);

\echo '── STATE hash final ──'
SELECT 'STATE|F|end|' || pg_temp.af_state_hash(:'PF'::uuid) AS state_hash;
ROLLBACK;

\echo '── RESIDUO ──'
SELECT 'RESIDUE|F|products='||cnt FROM (SELECT count(*) cnt FROM public.products WHERE id=:'PF'::uuid) x;
SELECT 'RESIDUE|F|transactions='||cnt FROM (SELECT count(*) cnt FROM public.transactions WHERE store_id=:'S'::uuid) x;
SELECT 'RESIDUE|F|devolutions='||cnt FROM (SELECT count(*) cnt FROM public.devolutions WHERE store_id=:'S'::uuid) x;
SELECT 'RESIDUE|F|movements='||cnt FROM (SELECT count(*) cnt FROM public.stock_movements WHERE product_id=:'PF'::uuid) x;
\echo '════ FIN CASO F (F7 en clon: af-case-F7-conc.sql) ════'
