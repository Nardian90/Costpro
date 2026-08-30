-- ============================================================================
-- w7d1-case-f6-nobypass.sql — FASE 6: PRUEBA DE NO-BYPASS (post-parche)
-- Rutas indirectas que podrían lograr mutación arbitraria de WAC sin
-- pasar por la política canónica. Todo en UNA TX con ROLLBACK final.
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.try_sql(p_role text, p_sql text)
RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE format('SET LOCAL role = %I', p_role);
  EXECUTE p_sql;
  EXECUTE 'RESET ROLE';
  RETURN 'EXECUTED';
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE'; RETURN 'DENIED(42501)';
WHEN OTHERS THEN
  EXECUTE 'RESET ROLE'; RETURN 'ERR:'||SQLSTATE||':'||left(SQLERRM,80);
END $f$;

BEGIN;
SELECT pg_temp.w62_product('d1b000000001','W7D1 NoBypass',10,100,1000,'22222222-2222-2222-2222-222222222222'::uuid) AS pidx \gset

-- ── a) anon → wrapper RPC create_sale_v2 (PUBLIC EXECUTE) ──
SELECT pg_temp.w62_assert_text('W7D1-B1','anon→create_sale_v2 (wrapper PUBLIC): identidad no verificada → bloqueado','ERR:P0001:ERR_UNAUTHORIZED',
  pg_temp.try_sql('anon', $q$SELECT public.create_sale_v2(
    p_store_id=>'22222222-2222-2222-2222-222222222222'::uuid,
    p_seller_id=>'11111111-1111-1111-1111-111111111111'::uuid,
    p_items=>'[{"product_id":"33333333-3333-3333-3333-d1b000000001","quantity":1,"price_at_sale":100}]'::jsonb,
    p_payment_method=>'cash', p_total_amount=>100, p_subtotal=>100)$q$));

-- ── b) anon → wrapper RPC create_devolution_v2 (PUBLIC EXECUTE, F-A) ──
SELECT pg_temp.w62_assert_text('W7D1-B2','anon→create_devolution_v2 (wrapper PUBLIC): ERR_UNAUTHORIZED (defensa interna)','ERR:P0001:ERR_UNAUTHORIZED',
  pg_temp.try_sql('anon', $q$SELECT public.create_devolution_v2(
    '22222222-2222-2222-2222-222222222222'::uuid, '{"items":[]}'::jsonb, 'cash',
    '11111111-1111-1111-1111-111111111111'::uuid, gen_random_uuid(), 'note', gen_random_uuid(), 'reason', ' pickup ', 'ref')$q$));

-- ── c) anon → reset_store_data (PUBLIC+anon, F-B) ──
SELECT pg_temp.w62_assert_text('W7D1-B3','anon→reset_store_data (2-arg, notación named): ERR_UNAUTHORIZED (has_management_access_as)','ERR:P0001:ERR_UNAUTHORIZED: Caller must be admin, manager or encargado of the store.',
  pg_temp.try_sql('anon', $q$SELECT public.reset_store_data(p_store_id=>'22222222-2222-2222-2222-222222222222'::uuid, p_keep_catalog=>true)$q$));

-- ── d) authenticated ADMIN (con claims) → reset_store_data: guard fail-closed ──
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT pg_temp.w62_evid('FASE6|d|authenticated-ADMIN→reset_store_data (esperado guard ERR_WAC_SINGLE_WRITER_VIOLATION): ' ||
  pg_temp.try_sql('authenticated', $q$SELECT public.reset_store_data(p_store_id=>'22222222-2222-2222-2222-222222222222'::uuid, p_keep_catalog=>true)$q$));

-- ── e) authenticated → w62_guard_wac_writer() invocación directa (trigger fn) ──
SELECT pg_temp.w62_evid('FASE6|e|authenticated→w62_guard_wac_writer() directa: ' ||
  pg_temp.try_sql('authenticated', $q$SELECT public.w62_guard_wac_writer()$q$));

-- ── f) barrido post-parche: escritores de cost_average ──
SELECT pg_temp.w62_evid('FASE6|f|escritores cost_average (prosrc) fuera de fn_recalc_wac: ' ||
  (SELECT coalesce(string_agg(DISTINCT p.proname,', '),'NINGUNO')
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prosrc ~ 'cost_average\s*=\s*'
     AND p.proname NOT IN ('fn_recalc_wac','reset_store_data')));

-- ── g) forja de token: funciones que fijan app.wac_writer ──
SELECT pg_temp.w62_evid('FASE6|g|funciones que fijan token app.wac_writer: ' ||
  (SELECT coalesce(string_agg(DISTINCT p.proname,', '),'NINGUNA')
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prosrc LIKE '%app.wac_writer%'));

-- ── h) dynamic SQL / restore machinery alcanzable por authenticated? ──
SELECT pg_temp.w62_assert_bool('W7D1-B4','restore_store_backup EXECUTE para authenticated=false (maquinaria require rol restaurador)',false,
  has_function_privilege('authenticated','public.restore_store_backup(uuid)','EXECUTE') OR
  has_function_privilege('authenticated','public.restore_store_backup(uuid,uuid)','EXECUTE') OR
  has_function_privilege('authenticated','public.restore_store_backup(uuid,uuid,boolean)','EXECUTE'));

-- ── i) estado final: WAC del producto untouched ──
SELECT pg_temp.w62_assert('W7D1-B5','tras TODOS los intentos: WAC permanece 100',100,(SELECT cost_average FROM public.products WHERE id=:'pidx'::uuid));
ROLLBACK;

SELECT pg_temp.w62_evid('FASE6|hygiene|productos de prueba restantes: ' ||
  (SELECT count(*) FROM public.products WHERE sku LIKE 'w7d1nb%') || ' (esperado 0)');
