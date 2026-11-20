-- LOTE-D · m011 · asiento de ajuste RECT-011 (idempotente, ids deterministas)
-- Combinación única: (AJUSTE_INVENTARIO, FVC, reconocimiento) — libres (RECT-1/RECT-2 ocupan las demás)
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('fin:RECEPCION:'||'0e11b000-0000-4000-8000-000000000001'));
CREATE TEMP TABLE m011d(paso text, payload jsonb);
DO $do$
DECLARE
  v_n int; v_t numeric; v_ok int; v_h numeric; v_cxp numeric; v_e int;
BEGIN
  -- D-1 · prerrequisitos: lotes A y B aplicados íntegros
  SELECT count(*)::int, coalesce(sum(unit_cost*tasa_cambio_recepcion*quantity),0),
         count(*) FILTER (WHERE unit_cost=1 AND moneda_recepcion='CUP' AND tasa_cambio_recepcion=1)::int
    INTO v_n, v_t, v_ok FROM public.receipt_items WHERE receipt_id='0e11b000-0000-4000-8000-000000000001';
  IF v_n<>5 OR v_t<>27.0000 OR v_ok<>5 THEN RAISE EXCEPTION 'ABORTO-D1a: líneas no conformes (%/%/%)', v_n, v_t, v_ok; END IF;
  SELECT count(*)::int INTO v_n FROM public.stock_movements WHERE reference_id='0e11b000-0000-4000-8000-000000000001' AND movement_type='purchase' AND unit_cost<>1;
  IF v_n<>0 THEN RAISE EXCEPTION 'ABORTO-D1b: capas no conformes=%', v_n; END IF;
  SELECT total_cost INTO v_h FROM public.receipts WHERE id='0e11b000-0000-4000-8000-000000000001';
  IF v_h<>27.0000 THEN RAISE EXCEPTION 'ABORTO-D1c: total_cost=%', v_h; END IF;
  -- D-2 · CXP neta del documento: prístina post-A/B o ya con RECT-011
  SELECT coalesce(sum(CASE WHEN fm.sense='credito' THEN fm.amount ELSE -fm.amount END),0) INTO v_cxp
    FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
   WHERE fe.document_id='0e11b000-0000-4000-8000-000000000001' AND fm.category_code='PAS_CXP_PROV';
  IF NOT (v_cxp=208509.00 OR v_cxp=27.0000) THEN RAISE EXCEPTION 'ABORTO-D2: CXP neta=%', v_cxp; END IF;
  SELECT count(*) INTO v_e FROM public.fin_entries WHERE id='7ec9000c-0000-4000-8000-d11300000001';
  IF v_e>1 THEN RAISE EXCEPTION 'ABORTO-D3: entrada duplicada %', v_e; END IF;
  INSERT INTO m011d VALUES ('preflight', jsonb_build_object('cxp_neta', v_cxp, 'entry_existe', v_e));
END $do$;
INSERT INTO public.fin_entries (id, store_id, document_type, document_id, document_number, event,
  reversal_of, economic_date, posted_at, status, description, movements_snapshot)
VALUES ('7ec9000c-0000-4000-8000-d11300000001','9635e633-387f-411d-bc15-7d2b6179aae4','AJUSTE_INVENTARIO','0e11b000-0000-4000-8000-000000000001','TEST-FAC-011-VAL1CUP','reconocimiento',
  '7113f450-7326-4407-b1dc-0dd31c3dcda1','2026-07-01',now(),'posted',
  'Rectificación CP-FIN-RECEIPT-UNIT-COST-1-CUP-011: valoración de las 101 líneas a 1,00 CUP/u (regla del propietario). DR PAS_CXP_PROV 208482.00000000 / CR ACT_INVENTARIO+GAS_COSTO_VENTAS+GAS_VALES+GAS_PERDIDA_INV',
  '[{"traza": {"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "regla": "rect011-cxp-d"}, "amount": "208482.00000000", "sentido": "debito", "currency": "CUP", "categoria": "PAS_CXP_PROV"}, {"traza": {"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "regla": "rect011-inv-c"}, "amount": "69994.00", "sentido": "credito", "currency": "CUP", "categoria": "ACT_INVENTARIO"}, {"traza": {"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "regla": "rect011-cogs-c"}, "amount": "137690.00", "sentido": "credito", "currency": "CUP", "categoria": "GAS_COSTO_VENTAS"}, {"traza": {"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "regla": "rect011-vales-c"}, "amount": "399.00", "sentido": "credito", "currency": "CUP", "categoria": "GAS_VALES"}, {"traza": {"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "regla": "rect011-perd-c"}, "amount": "399.00", "sentido": "credito", "currency": "CUP", "categoria": "GAS_PERDIDA_INV"}]'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.fin_movements (id, entry_id, store_id, category_code, sense, amount, currency,
  exchange_rate, economic_date, description, traza)
VALUES
  ('7ec9000c-0000-4000-8000-f11300000001','7ec9000c-0000-4000-8000-d11300000001','9635e633-387f-411d-bc15-7d2b6179aae4','PAS_CXP_PROV','debito',208482.00000000,'CUP',1,'2026-07-01',
   'RECT-011 TEST-FAC-011-VAL1CUP: reducción de la obligación a valor 1 CUP/u (101 líneas)','{"mision":"CP-FIN-RECEIPT-UNIT-COST-1-CUP-011","regla":"rect011-cxp-d"}'::jsonb),
  ('7ec9000c-0000-4000-8000-f11300000002','7ec9000c-0000-4000-8000-d11300000001','9635e633-387f-411d-bc15-7d2b6179aae4','ACT_INVENTARIO','credito',69994.00,'CUP',1,'2026-07-01',
   'RECT-011 TEST-FAC-011-VAL1CUP: desvalorización de existencias aún en capa FVC','{"mision":"CP-FIN-RECEIPT-UNIT-COST-1-CUP-011","regla":"rect011-inv-c"}'::jsonb),
  ('7ec9000c-0000-4000-8000-f11300000003','7ec9000c-0000-4000-8000-d11300000001','9635e633-387f-411d-bc15-7d2b6179aae4','GAS_COSTO_VENTAS','credito',137690.00,'CUP',1,'2026-07-01',
   'RECT-011 TEST-FAC-011-VAL1CUP: corrección de COGS por unidades vendidas de la capa FVC','{"mision":"CP-FIN-RECEIPT-UNIT-COST-1-CUP-011","regla":"rect011-cogs-c"}'::jsonb),
  ('7ec9000c-0000-4000-8000-f11300000004','7ec9000c-0000-4000-8000-d11300000001','9635e633-387f-411d-bc15-7d2b6179aae4','GAS_VALES','credito',399.00,'CUP',1,'2026-07-01',
   'RECT-011 TEST-FAC-011-VAL1CUP: corrección por unidades retiradas con vales de la capa FVC','{"mision":"CP-FIN-RECEIPT-UNIT-COST-1-CUP-011","regla":"rect011-vales-c"}'::jsonb),
  ('7ec9000c-0000-4000-8000-f11300000005','7ec9000c-0000-4000-8000-d11300000001','9635e633-387f-411d-bc15-7d2b6179aae4','GAS_PERDIDA_INV','credito',399.00,'CUP',1,'2026-07-01',
   'RECT-011 TEST-FAC-011-VAL1CUP: corrección por pérdidas/ajustes de la capa FVC','{"mision":"CP-FIN-RECEIPT-UNIT-COST-1-CUP-011","regla":"rect011-perd-c"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
DO $do$
DECLARE v_d numeric; v_cxp numeric; v_n int;
BEGIN
  SELECT sum(CASE WHEN sense='debito' THEN amount ELSE -amount END) INTO v_d
    FROM public.fin_movements WHERE entry_id='7ec9000c-0000-4000-8000-d11300000001';
  IF v_d IS NULL OR v_d<>0 THEN RAISE EXCEPTION 'D-6: D=C=% — ROLLBACK', v_d; END IF;
  SELECT coalesce(sum(CASE WHEN fm.sense='credito' THEN fm.amount ELSE -fm.amount END),0) INTO v_cxp
    FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
   WHERE fe.document_id='0e11b000-0000-4000-8000-000000000001' AND fm.category_code='PAS_CXP_PROV';
  IF v_cxp<>27.0000 THEN RAISE EXCEPTION 'D-7: CXP neta post=% (esperado 27.0000)', v_cxp; END IF;
  SELECT count(*) INTO v_n FROM public.fin_movements WHERE entry_id='7ec9000c-0000-4000-8000-d11300000001';
  INSERT INTO m011d VALUES ('post', jsonb_build_object('balance', v_d, 'cxp_neta', v_cxp, 'movimientos', v_n));
END $do$;
INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
VALUES ('7ec9000c-0000-4000-8000-e11300000002', now(), 'fin_entries', '7ec9000c-0000-4000-8000-d11300000001', 'SYSTEM_RECT011_ENTRY',
  jsonb_build_object('cxp_neta_antes', 208509.00, 'total_lineas_antes', 208509.00000000),
  jsonb_build_object('asiento','RECT-011','reversal_of','7113f450-7326-4407-b1dc-0dd31c3dcda1',
    'debito', jsonb_build_object('PAS_CXP_PROV', 208482.00000000),
    'credito', jsonb_build_object('ACT_INVENTARIO', 69994.00, 'GAS_COSTO_VENTAS', 137690.00, 'GAS_VALES', 399.00, 'GAS_PERDIDA_INV', 399.00)),
  '{"mision":"CP-FIN-RECEIPT-UNIT-COST-1-CUP-011","autorizacion":"propietario §1/§11 (regla 1,00 CUP/u)","metodo":"governed_admin_write (escape hatches M021/w62)"}'::jsonb, '9635e633-387f-411d-bc15-7d2b6179aae4', 'RECT011-E2E')
ON CONFLICT (id) DO NOTHING;
SELECT paso, payload FROM m011d ORDER BY paso;
COMMIT;