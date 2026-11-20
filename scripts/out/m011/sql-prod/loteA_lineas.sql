-- LOTE-A · m011 · líneas → 1,00 CUP y cabecera → 5861.5000
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('fin:RECEIPCION:'||'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'));
SET LOCAL app.allow_receipt_item_edit = 'on';
CREATE TEMP TABLE m011a(paso text, payload jsonb);
DO $do$
DECLARE
  v_n int; v_s numeric; v_t numeric; v_ok int; v_rc record; v_camb int; v_hab boolean;
BEGIN
  -- A-1 · freeze de alcance (101 líneas, Σqty, Σvalor; estados prístino o ya-aplicado)
  SELECT count(*)::int, coalesce(sum(quantity),0), coalesce(sum(unit_cost*tasa_cambio_recepcion*quantity),0),
         count(*) FILTER (WHERE unit_cost=1 AND moneda_recepcion='CUP' AND tasa_cambio_recepcion=1)::int
    INTO v_n, v_s, v_t, v_ok FROM public.receipt_items WHERE receipt_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
  IF v_n<>101 OR v_s<>5861.5000 THEN RAISE EXCEPTION 'ABORTO-A1a: líneas=% Σqty=%', v_n, v_s; END IF;
  IF NOT ((v_t=40739585.000000000 AND v_ok=23) OR (v_t=5861.5000 AND v_ok=101)) THEN
    RAISE EXCEPTION 'ABORTO-A1b: estado no reconocido Σvalor=% ya_ok=%', v_t, v_ok; END IF;
  SELECT total_cost, payment_status, coalesce(paid_amount,0) AS paid_amount, status INTO v_rc FROM public.receipts WHERE id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
  IF NOT FOUND THEN RAISE EXCEPTION 'ABORTO-A1c: recepción inexistente'; END IF;
  IF v_rc.payment_status<>'unpaid' OR v_rc.paid_amount>0 OR v_rc.status IN ('voided','reversed') THEN
    RAISE EXCEPTION 'ABORTO-A1d: deuda/estado cambió: %', to_jsonb(v_rc); END IF;
  v_hab := (v_t=5861.5000 AND v_ok=101 AND v_rc.total_cost=5861.5000);
  IF NOT (v_rc.total_cost=40739585.000000000 OR v_rc.total_cost=5861.5000) THEN
    RAISE EXCEPTION 'ABORTO-A1e: total_cost=%', v_rc.total_cost; END IF;
  IF v_hab AND v_t<>5861.5000 THEN RAISE EXCEPTION 'ABORTO-A1f: inconsistencia cabecera/líneas'; END IF;
END $do$;

-- S1 · captura de ANTES + actualización de las líneas no conformes a 1 CUP
CREATE TEMP TABLE m011_lineas AS
SELECT ri.id, ri.product_id, ri.quantity AS qty, ri.unit_cost AS uc_old,
       ri.moneda_recepcion AS mon_old, ri.tasa_cambio_recepcion AS tasa_old
FROM public.receipt_items ri
WHERE ri.receipt_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
  AND (ri.unit_cost<>1 OR ri.moneda_recepcion<>'CUP' OR ri.tasa_cambio_recepcion<>1);
DO $do$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM m011_lineas;
  INSERT INTO m011a VALUES ('S1_previas', to_jsonb(v_n));
  IF v_n<>78 AND v_n<>0 THEN RAISE EXCEPTION 'A-5: S1 filas % no esperadas (0 o 78)', v_n; END IF;
  IF v_n=78 AND (SELECT coalesce(sum(unit_cost*tasa_cambio_recepcion*quantity),0) FROM public.receipt_items WHERE receipt_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63')<>40739585.000000000 THEN
    RAISE EXCEPTION 'A-5: S1 con estado no prístino'; END IF;
END $do$;
UPDATE public.receipt_items ri
SET unit_cost=1, moneda_recepcion='CUP', tasa_cambio_recepcion=1, updated_at=now()
FROM m011_lineas v WHERE ri.id=v.id;
DO $do$
DECLARE v_n int; v_t numeric; v_ok int;
BEGIN
  SELECT count(*)::int, coalesce(sum(unit_cost*tasa_cambio_recepcion*quantity),0),
         count(*) FILTER (WHERE unit_cost=1 AND moneda_recepcion='CUP' AND tasa_cambio_recepcion=1)::int
    INTO v_n, v_t, v_ok FROM public.receipt_items WHERE receipt_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
  IF v_n<>101 OR v_t<>5861.5000 OR v_ok<>101 THEN RAISE EXCEPTION 'A-6: post-S1 líneas=% Σvalor=% ok=%', v_n, v_t, v_ok; END IF;
  INSERT INTO m011a VALUES ('S1_post', jsonb_build_object('lineas',101,'ya_ok',101,'subtotal_total',v_t));
END $do$;

-- S2 · cabecera → total de líneas
DO $do$
DECLARE v_rc record;
BEGIN
  SELECT total_cost INTO v_rc FROM public.receipts WHERE id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
  IF v_rc.total_cost<>5861.5000 THEN
    UPDATE public.receipts SET total_cost=5861.5000, updated_at=now() WHERE id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63' AND total_cost<>5861.5000;
  END IF;
END $do$;
DO $do$
DECLARE v_t numeric;
BEGIN
  SELECT total_cost INTO v_t FROM public.receipts WHERE id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
  IF v_t<>5861.5000 THEN RAISE EXCEPTION 'A-6: S2 total_cost=%', v_t; END IF;
  INSERT INTO m011a VALUES ('S2_post', jsonb_build_object('total_cost', v_t));
END $do$;

-- S3 · auditoría por línea (ids deterministas; idempotente)
INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
SELECT ('7ec9000b-0000-4000-8000-' || substr(md5('m011-line-'||v.id),1,12))::uuid, now(), 'receipt_items', v.id, 'SYSTEM_RECT011_VALUATION',
  jsonb_build_object('uc', v.uc_old, 'moneda', v.mon_old, 'tasa', v.tasa_old, 'qty', v.qty),
  jsonb_build_object('uc', 1, 'moneda', 'CUP', 'tasa', 1, 'qty', v.qty, 'subtotal', v.qty),
  '{"mision":"CP-FIN-RECEIPT-UNIT-COST-1-CUP-011","autorizacion":"propietario §1/§11 (regla 1,00 CUP/u)","metodo":"governed_admin_write (escape hatches M021/w62)"}'::jsonb, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', 'RECT011-PROD'
FROM m011_lineas v ON CONFLICT (id) DO NOTHING;
-- S4 · auditoría de cabecera
INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
VALUES ('7ec9000b-0000-4000-8000-e11300000001', now(), 'receipts', 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63', 'SYSTEM_RECT011_TOTAL',
  jsonb_build_object('total_cost', 40739585.000000000), jsonb_build_object('total_cost', 5861.5000),
  '{"mision":"CP-FIN-RECEIPT-UNIT-COST-1-CUP-011","autorizacion":"propietario §1/§11 (regla 1,00 CUP/u)","metodo":"governed_admin_write (escape hatches M021/w62)"}'::jsonb, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', 'RECT011-PROD')
ON CONFLICT (id) DO NOTHING;
SELECT paso, payload FROM m011a ORDER BY paso;
COMMIT;