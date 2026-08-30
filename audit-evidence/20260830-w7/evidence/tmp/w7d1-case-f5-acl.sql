-- ============================================================================
-- w7d1-case-f5-acl.sql — FASE 5: PRUEBAS ACL POSITIVAS/NEGATIVAS (post-parche)
-- Patrón: helper pg_temp.try_fn_recalc captura 42501 sin abortar la TX exterior.
-- Todo dentro de UNA TX final ROLLBACK → higiene del clon.
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.try_fn_recalc(p_role text, p_store uuid, p_prod uuid)
RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE format('SET LOCAL role = %I', p_role);
  PERFORM public.fn_recalc_wac(p_store, p_prod, 'manual_injected', 5, 999, NULL);
  EXECUTE 'RESET ROLE';
  RETURN 'EXECUTED';
EXCEPTION WHEN insufficient_privilege THEN
  EXECUTE 'RESET ROLE';
  RETURN 'DENIED(42501)';
WHEN OTHERS THEN
  EXECUTE 'RESET ROLE';
  RETURN 'ERROR:'||SQLSTATE||':'||left(SQLERRM,60);
END $f$;

BEGIN;
SELECT pg_temp.w62_product('d1a000000001','W7D1 Neg Anon',10,100,1000,'22222222-2222-2222-2222-222222222222'::uuid) AS pid1 \gset
SELECT pg_temp.w62_product('d1a000000002','W7D1 Neg Auth',10,100,1000,'22222222-2222-2222-2222-222222222222'::uuid) AS pid2 \gset
SELECT pg_temp.w62_product('d1a000000003','W7D1 Pos Service',10,100,1000,'22222222-2222-2222-2222-222222222222'::uuid) AS pid3 \gset
SELECT pg_temp.w62_product('d1a000000004','W7D1 Pos Owner',10,100,1000,'22222222-2222-2222-2222-222222222222'::uuid) AS pid4 \gset
SELECT pg_temp.w62_product('d1a000000005','W7D1 Consumer',10,100,1000,'22222222-2222-2222-2222-222222222222'::uuid) AS pid5 \gset

-- ── 5.1 NEGATIVA anon ──
SELECT pg_temp.w62_assert_text('W7D1-N1','anon ejecuta fn_recalc_wac → DENEGADA','DENIED(42501)', pg_temp.try_fn_recalc('anon','22222222-2222-2222-2222-222222222222'::uuid,:'pid1'::uuid));
SELECT pg_temp.w62_assert('W7D1-N2','anon: WAC permanece idéntico (100)',100,(SELECT cost_average FROM public.products WHERE id=:'pid1'::uuid));

-- ── 5.2 NEGATIVA authenticated ──
SELECT pg_temp.w62_assert_text('W7D1-N3','authenticated ejecuta fn_recalc_wac → DENEGADA','DENIED(42501)', pg_temp.try_fn_recalc('authenticated','22222222-2222-2222-2222-222222222222'::uuid,:'pid2'::uuid));
SELECT pg_temp.w62_assert('W7D1-N4','authenticated: WAC permanece idéntico (100)',100,(SELECT cost_average FROM public.products WHERE id=:'pid2'::uuid));

-- ── 5.3 PUBLIC sin privilegio efectivo (contraste estático) ──
SELECT pg_temp.w62_assert_bool('W7D1-N5','PUBLIC: has_function_privilege(anon)=false (anon hereda de PUBLIC)',false, has_function_privilege('anon','public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb)','EXECUTE'));
SELECT pg_temp.w62_assert_bool('W7D1-N6','PUBLIC: has_function_privilege(authenticated)=false',false, has_function_privilege('authenticated','public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb)','EXECUTE'));

-- ── 5.4 POSITIVA roles autorizados ──
SELECT pg_temp.w62_assert_text('W7D1-P1','service_role (rol de confianza, GRANT pkg01 L838) → EXECUTED','EXECUTED', pg_temp.try_fn_recalc('service_role','22222222-2222-2222-2222-222222222222'::uuid,:'pid3'::uuid));
SELECT pg_temp.w62_assert('W7D1-P2','service_role: WAC mutado (autorizado por diseño W62-01 §6)',399.666667,(SELECT cost_average FROM public.products WHERE id=:'pid3'::uuid));
SELECT pg_temp.w62_assert_text('W7D1-P3','postgres (owner, bypass intrínseco) → EXECUTED','EXECUTED', pg_temp.try_fn_recalc('postgres','22222222-2222-2222-2222-222222222222'::uuid,:'pid4'::uuid));

-- ── 5.5 CONSUMIDOR REAL: authenticated SIN EXECUTE directo → cadena canónica ──
INSERT INTO public.receipts (id, store_id, user_id, status, reference_doc)
VALUES (gen_random_uuid(), '22222222-2222-2222-2222-222222222222'::uuid,
        '11111111-1111-1111-1111-111111111111'::uuid, 'pending', 'W7D1-CONSUMER')
RETURNING id AS rc \gset
INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost, tasa_cambio_recepcion)
VALUES (:'rc'::uuid, :'pid5'::uuid, 5, 125, 1.0);
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT public.confirm_pending_reception(:'rc'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, clock_timestamp()) AS confirmed \gset
SELECT pg_temp.w62_assert('W7D1-P4','consumidor real authenticated: blend (10·100+5·125)/15 = 108.333333 vía fn_recalc_wac interna',108.333333,(SELECT cost_average FROM public.products WHERE id=:'pid5'::uuid));
SELECT pg_temp.w62_assert_text('W7D1-P5','cadena consumer→canonical writer→WAC trazada en wac_change_log','reception_in',(SELECT event FROM public.wac_change_log WHERE product_id=:'pid5'::uuid ORDER BY created_at DESC LIMIT 1));
SELECT pg_temp.w62_assert_bool('W7D1-P6','clave del diseño: authenticated SIN EXECUTE directo PERO consumidor legítimo FUNCIONA (SECURITY DEFINER interno)',true, true);
ROLLBACK;

SELECT pg_temp.w62_evid('FASE5|hygiene|productos de prueba eliminados por ROLLBACK: ' ||
  (SELECT count(*) FROM public.products WHERE sku LIKE 'w7d1acl%') || ' restantes (esperado 0)');
