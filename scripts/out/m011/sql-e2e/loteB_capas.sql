-- LOTE-B · m011 · capas de compra de la recepción → uc 1
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('fin:RECEPCION:'||'0e11b000-0000-4000-8000-000000000001'));
CREATE TEMP TABLE m011b(paso text, payload jsonb);
DO $do$
DECLARE v_n int; v_t numeric; v_ok int;
BEGIN
  -- B-1 · freeze: 101 capas 1:1; Σ(qty×uc) prístino o ya-aplicado
  SELECT count(*)::int, coalesce(sum(quantity_change*unit_cost),0), count(*) FILTER (WHERE unit_cost<>1)::int
    INTO v_n, v_t, v_ok FROM public.stock_movements
   WHERE reference_id='0e11b000-0000-4000-8000-000000000001' AND movement_type='purchase';
  IF v_n<>5 THEN RAISE EXCEPTION 'ABORTO-B1a: capas=%', v_n; END IF;
  IF NOT (v_t=208509.00000000 OR v_t=27.0000) THEN RAISE EXCEPTION 'ABORTO-B1b: Σcapas=%', v_t; END IF;
  IF v_t=208509.00000000 AND v_ok<>3 THEN RAISE EXCEPTION 'ABORTO-B1c: capas por corregir=% (esperado 3)', v_ok; END IF;
  IF v_t=27.0000 AND v_ok<>0 THEN RAISE EXCEPTION 'ABORTO-B1d: estado ya-aplicado con capas sucias=%', v_ok; END IF;
END $do$;
-- S1 · ANTES + actualización
CREATE TEMP TABLE m011_capas AS
SELECT sm.id, sm.product_id, sm.quantity_change AS qty, sm.unit_cost AS uc_old
FROM public.stock_movements sm
WHERE sm.reference_id='0e11b000-0000-4000-8000-000000000001' AND sm.movement_type='purchase' AND sm.unit_cost<>1;
UPDATE public.stock_movements sm SET unit_cost=1
FROM m011_capas v WHERE sm.id=v.id;
DO $do$
DECLARE v_n int; v_t numeric; v_ok int;
BEGIN
  SELECT count(*)::int, coalesce(sum(quantity_change*unit_cost),0), count(*) FILTER (WHERE unit_cost<>1)::int
    INTO v_n, v_t, v_ok FROM public.stock_movements
   WHERE reference_id='0e11b000-0000-4000-8000-000000000001' AND movement_type='purchase';
  IF v_n<>5 OR v_t<>27.0000 OR v_ok<>0 THEN RAISE EXCEPTION 'B-6: post capas=% Σ=% sucias=%', v_n, v_t, v_ok; END IF;
  INSERT INTO m011b VALUES ('S1_post', jsonb_build_object('capas',5,'sucias',0,'valor_total',v_t));
  SELECT count(*) INTO v_n FROM m011_capas;
  INSERT INTO m011b VALUES ('S1_previas', to_jsonb(v_n));
END $do$;
-- S2 · auditoría por capa
INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
SELECT ('7ec9000c-0000-4000-8000-' || substr(md5('m011-capa-'||v.id),1,12))::uuid, now(), 'stock_movements', v.id, 'SYSTEM_RECT011_MOV_UC',
  jsonb_build_object('uc', v.uc_old, 'qty', v.qty), jsonb_build_object('uc', 1, 'qty', v.qty),
  '{"mision":"CP-FIN-RECEIPT-UNIT-COST-1-CUP-011","autorizacion":"propietario §1/§11 (regla 1,00 CUP/u)","metodo":"governed_admin_write (escape hatches M021/w62)"}'::jsonb, '9635e633-387f-411d-bc15-7d2b6179aae4', 'RECT011-E2E'
FROM m011_capas v ON CONFLICT (id) DO NOTHING;
SELECT paso, payload FROM m011b ORDER BY paso;
COMMIT;