-- w7-ext-acl-public.sql — W7: verificación de grants PUBLIC por defecto en funciones NUEVAS W6.2
-- y demostración de explotabilidad del escritor WAC como authenticated (LAB ONLY)
\pset pager off
\o /home/z/my-project/w7-readiness/tmp/W7-f12-public-grants.txt

-- ═══ 1. ACL efectiva de todas las funciones creadas/redefinidas por los paquetes ═══
SELECT 'EVID|PUB|' || oid::regprocedure::text || ' :: ' ||
  coalesce(array_to_string(proacl,' , '),'NULL')
FROM pg_proc
WHERE pronamespace::regnamespace::text='public'
  AND proname IN ('fn_recalc_wac','w62_guard_wac_writer','w62_df04_classify',
    'withdraw_production_item_v3','create_devolution_v2','create_sale_v2',
    'confirm_pending_reception','create_vale_salida','receive_production_output',
    'close_production_order_v2','confirm_transfer','reverse_transfer')
ORDER BY 1;

-- ═══ 2. Privilegio efectivo por rol (la prueba que importa, no el texto del grant) ═══
SELECT 'EVID|PRIV|' || f.fn || ' :: anon=' || has_function_privilege('anon', f.sig, 'EXECUTE')::text
  || ' authenticated=' || has_function_privilege('authenticated', f.sig, 'EXECUTE')::text
FROM (VALUES
  ('fn_recalc_wac','fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb)'),
  ('withdraw_production_item_v3','withdraw_production_item_v3(uuid,numeric,uuid,uuid,text,uuid,text)'),
  ('create_devolution_v2','create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text)'),
  ('w62_df04_classify','w62_df04_classify(timestamp with time zone,numeric,numeric,boolean)')
) AS f(fn,sig);

\o
-- ═══ 3. EXPLOTACIÓN REAL: authenticated invoca fn_recalc_wac directamente con uc arbitrario ═══
BEGIN;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT pg_temp.w62_product('f12010000001','F12 public-target',10,100,150,'22222222-2222-2222-2222-222222222222'::uuid) AS pt \gset
SELECT 'EVID|EXPLOIT|WAC antes: ' || cost_average::text FROM public.products WHERE id=:'pt'::uuid;
-- llamada directa con parámetros arbitrarios (NO hay recepción real):
SELECT public.fn_recalc_wac('22222222-2222-2222-2222-222222222222'::uuid, :'pt'::uuid,
  'manual_injected', 5, 999, '{"attack":"direct_rpc_authenticated"}'::jsonb) AS wac_result \gset
SELECT 'EVID|EXPLOIT|WAC después de llamada authenticated directa (esperado legítimo=100; si ≠100 ⇒ mutación arbitraria): ' || cost_average::text
FROM public.products WHERE id=:'pt'::uuid;
SELECT 'EVID|EXPLOIT|wac_change_log registró el evento: ' || count(*)::text
FROM public.wac_change_log WHERE product_id=:'pt'::uuid AND event='manual_injected';
ROLLBACK;
\echo 'w7-ext-acl-public: FIN'
