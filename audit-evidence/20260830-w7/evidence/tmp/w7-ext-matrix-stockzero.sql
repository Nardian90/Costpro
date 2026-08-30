-- ============================================================================
-- w7-ext-matrix-stockzero.sql — W7 FASE 4 (matriz escritor único post-migración)
--                              + FASE 18 (STOCK=0: WAC retained vs reset)
-- Clon: w7_gate (paquetes 01..09 aplicados). Una TX por ruta (doctrina W62).
-- ============================================================================
-- ═══════════ FASE 4 — MATRIZ DE ESCRITOR ÚNICO (catálogos post-migración) ═══════════
SELECT 'EVID|F4|1|escritores cost_average post-migración: ' || coalesce(string_agg(DISTINCT w.fn, ' ; '), 'NINGUNO')
FROM (
  SELECT c.oid::regprocedure::text AS fn
  FROM pg_proc c
  WHERE c.pronamespace::regnamespace::text='public'
    AND c.prosrc ~ 'cost_average\s*=\s*'
) w;

SELECT 'EVID|F4|2|motor B update_product_wac existe: ' || count(*)::text
FROM pg_proc WHERE proname='update_product_wac' AND pronamespace::regnamespace::text='public';
SELECT 'EVID|F4|3|trigger motor B trg_update_product_wac existe: ' || count(*)::text
FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
WHERE p.proname='update_product_wac' AND NOT t.tgisinternal;
SELECT 'EVID|F4|4|guard trg_guard_wac_writer existe: ' || count(*)::text
FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
WHERE p.proname='w62_guard_wac_writer' AND NOT t.tgisinternal;
SELECT 'EVID|F4|5|funciones que fijan token app.wac_writer: ' ||
  coalesce(string_agg(oid::regprocedure::text, ' ; '), 'NINGUNA fuera de fn_recalc_wac')
FROM pg_proc
WHERE prosrc ~ 'app\.wac_writer' AND pronamespace::regnamespace::text='public'
  AND proname <> 'fn_recalc_wac' AND proname <> 'w62_guard_wac_writer';
SELECT 'EVID|F4|6|fn_recalc_wac SECURITY DEFINER + search_path fijado: ' ||
  bool_and(prosecdef AND proconfig IS NOT NULL)::text
FROM pg_proc WHERE proname='fn_recalc_wac' AND pronamespace::regnamespace::text='public';
SELECT 'EVID|F4|7|EXECUTE fn_recalc_wac → service_role only: ' ||
  (EXISTS(SELECT 1 FROM unnest(proacl) a WHERE a::text LIKE 'service_role%X/%')
   AND NOT EXISTS(SELECT 1 FROM unnest(proacl) a WHERE a::text ~ '^=X/')
   AND NOT EXISTS(SELECT 1 FROM unnest(proacl) a WHERE a::text LIKE 'anon%X/%')
   AND NOT EXISTS(SELECT 1 FROM unnest(proacl) a WHERE a::text LIKE 'authenticated%X/%'))::text
FROM pg_proc WHERE proname='fn_recalc_wac' AND pronamespace::regnamespace::text='public';

-- Ataque directo al escritor único (debe ser bloqueado por el guard)
BEGIN;
SET LOCAL request.jwt.claim.role = 'authenticated';
SAVEPOINT sp_f4a;
DO $$
BEGIN
  UPDATE public.products SET cost_average = 1 WHERE id='00000000-0000-0000-0000-000000000000'::uuid;
END $$;
ROLLBACK TO SAVEPOINT sp_f4a;
SELECT 'EVID|F4|8|UPDATE directo cost_average sin token → guard BLOQUEA (excepción ERR_WAC_SINGLE_WRITER_VIOLATION registrada arriba)';
ROLLBACK;

-- UPDATE con columna NO-WAC no debe ser bloqueado por el guard
BEGIN;
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT pg_temp.w62_product('f40010000001','F4 non-WAC col',1,50,80,'22222222-2222-2222-2222-222222222222'::uuid) AS p4 \gset
UPDATE public.products SET updated_at = now() WHERE id=:'p4'::uuid;
SELECT pg_temp.w62_assert_bool('F4-9','UPDATE de columna no-WAC NO bloqueado por guard (scope correcto)', true,
  (SELECT true));
ROLLBACK;

-- ═══════════ FASE 18 — STOCK = 0 (WAC retained vs reset) ═══════════
-- Escenario: stock>0 → salida total → stock=0 → nueva recepción
BEGIN;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT pg_temp.w62_evid('F18: stock 10@100 → venta total → stock=0 → recepción 5@200');
SELECT pg_temp.w62_product('f18010000001','F18 StockZero',10,100,200,'22222222-2222-2222-2222-222222222222'::uuid) AS p18 \gset

-- 18.1 venta TOTAL (10 uds, precio 200 → total 2000)
SELECT public.create_sale_v2(
  p_store_id=>'22222222-2222-2222-2222-222222222222'::uuid,
  p_seller_id=>'11111111-1111-1111-1111-111111111111'::uuid,
  p_items=>'[{"product_id":"33333333-3333-3333-3333-f18010000001","quantity":10,"price_at_sale":200}]'::jsonb,
  p_payment_method=>'cash', p_total_amount=>2000, p_subtotal=>2000,
  p_idempotency_key=>'F18-SALE-ALL') AS s18 \gset
SELECT pg_temp.w62_assert('F18-1','tras venta total: stock=0', 0,
  (SELECT stock_current FROM public.products WHERE id=:'p18'::uuid));
SELECT pg_temp.w62_assert('F18-2','tras venta total: WAC RETAINED (=100, NO reset, NO NULL)', 100,
  (SELECT cost_average FROM public.products WHERE id=:'p18'::uuid));
SELECT pg_temp.w62_assert('F18-3','COGS de la venta total = 10×WAC_prev = 1000', 1000,
  (SELECT ti.cost_at_sale*ti.quantity FROM public.transaction_items ti
    JOIN public.transactions t ON t.id=ti.transaction_id WHERE t.idempotency_key='F18-SALE-ALL'));
COMMIT;

-- 18.2 venta con stock 0 → rechazo (comportamiento definido, no accidental)
BEGIN;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claim.role = 'authenticated';
SAVEPOINT sp_sz2;
SELECT public.create_sale_v2(
  p_store_id=>'22222222-2222-2222-2222-222222222222'::uuid,
  p_seller_id=>'11111111-1111-1111-1111-111111111111'::uuid,
  p_items=>'[{"product_id":"33333333-3333-3333-3333-f18010000001","quantity":1,"price_at_sale":200}]'::jsonb,
  p_payment_method=>'cash', p_total_amount=>200, p_subtotal=>200,
  p_idempotency_key=>'F18-SALE-ZERO') AS s18b \gset
ROLLBACK TO SAVEPOINT sp_sz2;
SELECT pg_temp.w62_assert_bool('F18-4','venta con stock=0 → RECHAZADA (ERR_INSUFFICIENT_STOCK)', true,
  (SELECT NOT EXISTS (SELECT 1 FROM public.transactions WHERE idempotency_key='F18-SALE-ZERO')));
COMMIT;

-- 18.3 nueva recepción con S=0: WAC_new = uc_exacto (ca_prev retiene peso 0; sin contaminación)
BEGIN;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT pg_temp.w62_reception((SELECT id FROM public.products WHERE sku='W62-f18010000001')::uuid, 5, 200, 'F18-RECEPT');
SELECT pg_temp.w62_assert('F18-5','recepción sobre stock=0: WAC=200 EXACTO (blend S=0 ⇒ ca_prev peso 0)', 200,
  (SELECT round(cost_average,6) FROM public.products WHERE sku='W62-f18010000001'));
SELECT pg_temp.w62_assert('F18-6','stock tras recepción = 5', 5,
  (SELECT stock_current FROM public.products WHERE sku='W62-f18010000001'));
-- Demostración matemática: (S0×ca_prev + q×uc)/(S0+q) con S0=0 ⇒ = uc. Valor: 0×100 + 5×200 = 1000 = 5×200
SELECT pg_temp.w62_assert('F18-7','conservación frontera: valor post = uc×q = 1000 (0 valor creado/destruido)', 1000,
  (SELECT round(stock_current*cost_average,6) FROM public.products WHERE sku='W62-f18010000001'));
COMMIT;
\echo 'w7-ext-matrix-stockzero: FIN'
