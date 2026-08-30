-- ============================================================================
-- w7-ext-f11-f13.sql — W7 FASE 11 (overloads post-migración) + FASE 13 (compat clientes)
-- Clon: w7_gate
-- ============================================================================
\pset pager off
\o /home/z/my-project/w7-readiness/tmp/W7-f11-overloads.txt
-- ═══ FASE 11: inventario pg_proc post-migración ═══
SELECT 'EVID|F11|' || proname || ' → ' || count(*) || ' firma(s): ' ||
  coalesce(string_agg(oid::regprocedure::text, ' ## '), 'NINGUNA (nombre eliminado)')
FROM pg_proc
WHERE pronamespace::regnamespace::text='public'
  AND proname IN ('withdraw_production_item','withdraw_production_item_deprecated_6arg',
    'withdraw_production_item_deprecated_9arg','withdraw_production_item_v3',
    'receive_production_output','receive_production_output_deprecated_4arg',
    'create_vale_salida','create_devolution','create_devolution_v2','close_production_order_v2')
GROUP BY proname ORDER BY proname;

-- EXECUTE por rol sobre las firmas vivivas (superficie PostgREST post-migración)
SELECT 'EVID|F11-ACL|' || f.fn || ' :: anon=' || has_function_privilege('anon', f.sig, 'EXECUTE')::text
  || ' authed=' || has_function_privilege('authenticated', f.sig, 'EXECUTE')::text
  || ' service=' || has_function_privilege('service_role', f.sig, 'EXECUTE')::text
FROM (VALUES
  ('withdraw_production_item_v3','withdraw_production_item_v3(uuid,numeric,uuid,uuid,text,uuid,text)'),
  ('receive_production_output 6-arg','receive_production_output(uuid,uuid,numeric,uuid,uuid,text)'),
  ('close_production_order_v2','close_production_order_v2(uuid,uuid,uuid,numeric,text,text,numeric,uuid,numeric,uuid,text)'),
  ('create_vale_salida 5-arg','create_vale_salida(uuid,jsonb,uuid,text,text)'),
  ('create_vale_salida 6-arg','create_vale_salida(uuid,jsonb,uuid,text,text,uuid)')
) AS f(fn,sig);
\o

-- ═══ FASE 13: sondas de compatibilidad ═══

-- 13.1 CLIENT_OLD llama withdraw 6-arg (ruta app actual L26) → expect 42883
\set ON_ERROR_STOP off
SELECT pg_temp.w62_product('f13010000001','F13 old client',10,50,100,'22222222-2222-2222-2222-222222222222'::uuid) AS p13 \gset
\set probeWithdraw 'SELECT public.withdraw_production_item('''', 1, 1, NULL, NULL, NULL);'
SELECT 'EVID|F13|withdraw 6-arg resolución: ' || coalesce((SELECT to_regprocedure('withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text)')::text), 'NO EXISTE (42883 para clientes legacy)');
SELECT 'EVID|F13|receive 4-arg resolución: ' || coalesce((SELECT to_regprocedure('receive_production_output(uuid,uuid,numeric,uuid)')::text), 'NO EXISTE (42883 para clientes legacy)');

-- 13.2 vale_salida: llamada con SOLO los 5 params comunes (named) → ¿42725 is not unique?
SAVEPOINT sp_vale5;
SELECT public.create_vale_salida(
  p_store_id=>'22222222-2222-2222-2222-222222222222'::uuid,
  p_items=>'[]'::jsonb, p_production_order_id=>NULL::uuid,
  p_notes=>'probe-5arg', p_idempotency_key=>NULL::text);
ROLLBACK TO SAVEPOINT sp_vale5;
SELECT 'EVID|F13|vale_salida 5-named-params: ver error arriba (42725 = ambigüedad residual conocida)';

-- 13.3 CLIENT_OLD create_sale_v2 con cost_at_sale=7777 → COMPATIBLE-BUT-DEPRECATED (costo ignorado)
BEGIN;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claim.role = 'authenticated';
SAVEPOINT sp_old_sale;
SELECT public.create_sale_v2(
  p_store_id=>'22222222-2222-2222-2222-222222222222'::uuid,
  p_seller_id=>'11111111-1111-1111-1111-111111111111'::uuid,
  p_items=>'[{"product_id":"'||:'p13'||'","quantity":2,"price_at_sale":100,"cost_at_sale":7777,"cost":7777}]'::jsonb,
  p_payment_method=>'cash', p_total_amount=>200, p_subtotal=>200,
  p_idempotency_key=>'F13-OLD-SALE') AS olds \gset
SELECT pg_temp.w62_assert('F13-1','CLIENT_OLD: venta aceptada; COGS ignoró 7777 → 50 (WAC server)', 50,
  (SELECT round(cost_at_sale,6) FROM public.transaction_items ti
    JOIN public.transactions t ON t.id=ti.transaction_id WHERE t.idempotency_key='F13-OLD-SALE'));
COMMIT;

-- 13.4 CLIENT_OLD create_devolution v1 (ruta devolutions L73 con USE_V2_REVERSE=false) → 42501
BEGIN;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claim.role = 'authenticated';
SAVEPOINT sp_old_dev;
SELECT public.create_devolution(
  p_store_id=>'22222222-2222-2222-2222-222222222222'::uuid,
  p_items=>'[]'::jsonb, p_reason=>'probe v1',
  p_user_id=>'11111111-1111-1111-1111-111111111111'::uuid);
ROLLBACK TO SAVEPOINT sp_old_dev;
SELECT 'EVID|F13|create_devolution v1 como authenticated: ver error arriba (42501 = v1 bloqueada, BREAKING controlado)';
COMMIT;

-- 13.5 CLIENT_NEW: close_v2 con key → idempotente (re-emite mismo resultado)
BEGIN;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT pg_temp.w62_evid('F13: close sin key (CLIENT_OLD) y con key (CLIENT_NEW) — ver df08-after 10 asserts');
ROLLBACK;

-- 13.6 anon sobre create_devolution_v2 (PUBLIC residual F-A): alcanza el check de auth interna
BEGIN;
SET LOCAL request.jwt.claim.role = 'anon';
SAVEPOINT sp_anon_dev;
SELECT public.create_devolution_v2(
  p_store_id=>'22222222-2222-2222-2222-222222222222'::uuid,
  p_items=>'[]'::jsonb, p_reason=>'anon probe',
  p_original_transaction_id=>NULL::uuid, p_payment_method=>'cash');
ROLLBACK TO SAVEPOINT sp_anon_dev;
SELECT 'EVID|F13|create_devolution_v2 como anon: ver error arriba (ERR_UNAUTHORIZED/ERR_DEVOLUTION_NO_ORIGINAL = superficie expuesta, defensa interna activa)';
COMMIT;
\echo 'w7-ext-f11-f13: FIN'
