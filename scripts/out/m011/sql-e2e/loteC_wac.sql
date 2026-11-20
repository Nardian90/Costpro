-- LOTE-C · m011 · WAC recalculado (escape hatch w62 single-writer) + wac_change_log
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('fin:RECEPCION:'||'0e11b000-0000-4000-8000-000000000001'));
SET LOCAL app.wac_writer = 'fn_recalc_wac';
CREATE TEMP TABLE m011c(paso text, payload jsonb);
CREATE TEMP TABLE m011_wac AS
WITH datos(product_id, wac_new, stock_esp, wac_old_esp) AS (VALUES
  ('0e11c000-0000-4000-8000-000000000001'::uuid, 1.000000000000::numeric, 5.0000::numeric, 400::numeric),
  ('0e11c000-0000-4000-8000-000000000002'::uuid, 1.000000000000::numeric, 1.0000::numeric, 68000::numeric))
SELECT d.product_id, d.wac_new, d.stock_esp, d.wac_old_esp, p.cost_average AS wac_actual, p.stock_current
FROM datos d JOIN public.products p ON p.id=d.product_id;
DO $do$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM m011_wac;
  IF v_n<>2 THEN RAISE EXCEPTION 'ABORTO-C1: productos WAC=% (esperado 2)', v_n; END IF;
  IF EXISTS (SELECT 1 FROM m011_wac WHERE stock_current<>stock_esp) THEN
    RAISE EXCEPTION 'ABORTO-C2: stock congelado divergió (venta posterior) — regenerar análisis'; END IF;
  IF EXISTS (SELECT 1 FROM m011_wac WHERE wac_actual NOT IN (wac_old_esp, wac_new)) THEN
    RAISE EXCEPTION 'ABORTO-C3: WAC actual no es ni el congelado ni el objetivo — reanudación imposible'; END IF;
END $do$;
UPDATE public.products p SET cost_average=m.wac_new, updated_at=now()
FROM m011_wac m WHERE p.id=m.product_id AND p.cost_average<>m.wac_new;
DO $do$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM m011_wac m JOIN public.products p ON p.id=m.product_id WHERE p.cost_average=m.wac_new;
  IF v_n<>2 THEN RAISE EXCEPTION 'C-6: WAC conformes=% de 2', v_n; END IF;
  INSERT INTO m011c VALUES ('S1_post', jsonb_build_object('wac_conformes', v_n));
END $do$;
INSERT INTO public.wac_change_log (id, store_id, product_id, wac_before, wac_after, event, qty_in, uc_in, source_ref, created_at)
VALUES
  (('7ec9000c-0000-4000-8000-' || substr(md5('m011-wac-'||'0e11c000-0000-4000-8000-000000000001'),1,12))::uuid, '9635e633-387f-411d-bc15-7d2b6179aae4', '0e11c000-0000-4000-8000-000000000001'::uuid, 400::numeric, 1.000000000000::numeric, 'rectificacion', 5.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "TEST-FAC-011-VAL1CUP"}'::jsonb, now()),
  (('7ec9000c-0000-4000-8000-' || substr(md5('m011-wac-'||'0e11c000-0000-4000-8000-000000000002'),1,12))::uuid, '9635e633-387f-411d-bc15-7d2b6179aae4', '0e11c000-0000-4000-8000-000000000002'::uuid, 68000::numeric, 1.000000000000::numeric, 'rectificacion', 1.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "TEST-FAC-011-VAL1CUP"}'::jsonb, now())
ON CONFLICT (id) DO NOTHING;
DO $do$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.wac_change_log
   WHERE id::text LIKE '7ec9000c-0000-4000-8000-%' AND source_ref->>'mision' = 'CP-FIN-RECEIPT-UNIT-COST-1-CUP-011';
  IF v_n<>2 THEN RAISE EXCEPTION 'C-7: wac_change_log=% de 2', v_n; END IF;
  INSERT INTO m011c VALUES ('S2_wcl', to_jsonb(v_n));
END $do$;
-- auditoría por producto
INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
SELECT ('7ec9000c-0000-4000-8000-' || substr(md5('m011-wacaud-'||v.product_id),1,12))::uuid, now(), 'products', v.product_id, 'SYSTEM_RECT011_WAC',
  jsonb_build_object('wac', v.wac_actual, 'stock', v.stock_current),
  jsonb_build_object('wac', v.wac_new, 'stock', v.stock_current),
  '{"mision":"CP-FIN-RECEIPT-UNIT-COST-1-CUP-011","autorizacion":"propietario §1/§11 (regla 1,00 CUP/u)","metodo":"governed_admin_write (escape hatches M021/w62)"}'::jsonb, '9635e633-387f-411d-bc15-7d2b6179aae4', 'RECT011-E2E'
FROM m011_wac v ON CONFLICT (id) DO NOTHING;
SELECT paso, payload FROM m011c ORDER BY paso;
COMMIT;