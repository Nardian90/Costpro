-- LOTE-C · m011 · WAC recalculado (escape hatch w62 single-writer) + wac_change_log
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('fin:RECEPCION:'||'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'));
SET LOCAL app.wac_writer = 'fn_recalc_wac';
CREATE TEMP TABLE m011c(paso text, payload jsonb);
CREATE TEMP TABLE m011_wac AS
WITH datos(product_id, wac_new, stock_esp, wac_old_esp) AS (VALUES
  ('1498f8ec-aa50-49a0-bf89-4e7eb7e29b1c'::uuid, 1.000000000000::numeric, 1.0000::numeric, 4000.0::numeric),
  ('372180f6-9837-44b6-a939-91dc67e21d7a'::uuid, 1.000000000000::numeric, 6.0000::numeric, 500.0::numeric),
  ('c0ca7553-28e4-4391-9c9e-770d63642948'::uuid, 1.000000000000::numeric, 12.0000::numeric, 200.0::numeric),
  ('ce3f2c20-7aaf-4eb6-b6af-38834fb37fc2'::uuid, 1.000000000000::numeric, 15.0000::numeric, 200.0::numeric),
  ('cb969aba-5b05-4198-9fd6-5857abff2ac8'::uuid, 1.000000000000::numeric, 1.0000::numeric, 2000.0::numeric),
  ('ff5145c8-d43c-4104-82c3-81dacef80e78'::uuid, 1.000000000000::numeric, 2.0000::numeric, 1800.0::numeric),
  ('f3d0f5a3-7e9d-46c9-91c1-a166129cb187'::uuid, 1.000000000000::numeric, 7.0000::numeric, 5000.0::numeric),
  ('7a6af746-d8ca-4325-b0eb-ed4cb574f5ad'::uuid, 1.000000000000::numeric, 119.0000::numeric, 200.0000000000000000::numeric),
  ('8859ef67-f829-4543-8bf8-6bb7e970e92d'::uuid, 1.000000000000::numeric, 111.0000::numeric, 4.1441441441441441441441171::numeric),
  ('6862a061-50d0-4c8d-96d4-7b6d6ed082cd'::uuid, -1.000000000000::numeric, 25.0000::numeric, 0.96000000000000000000::numeric),
  ('6cda2af1-6e24-4bfc-a2f8-bcd52797e841'::uuid, 1.000000000000::numeric, 5.0000::numeric, 2800.0000000000000000::numeric),
  ('fcadebcd-1f99-4736-973d-cea194902399'::uuid, -665.857142857143::numeric, 3.0000::numeric, 0.14285714285714285714::numeric),
  ('963cd5c6-f496-471f-bf4b-6db083c8929f'::uuid, 1.000000000000::numeric, 1.0000::numeric, 40000.0::numeric),
  ('8769cde9-6135-4011-a56c-86a96e02bf7b'::uuid, 1.000000000000::numeric, 10.0000::numeric, 250::numeric),
  ('a764a5b5-e680-49ee-9fcf-88721e0e243e'::uuid, 1.000000000000::numeric, 3.0000::numeric, 250.0::numeric),
  ('7d50c274-922e-4674-bdff-a452884bf03e'::uuid, 1.000000000000::numeric, 22.0000::numeric, 2500.0000000000000000::numeric),
  ('6fb35013-d343-4f2f-8f24-00ff79869cf2'::uuid, 1.000000000000::numeric, 4.0000::numeric, 250.0000000000000000::numeric),
  ('d0cab976-b1cc-42a9-a177-97aa48a393a5'::uuid, 1.000000000000::numeric, 22.0000::numeric, 600.0000000000000000::numeric),
  ('2b2e648d-feea-4a1b-a3c6-f614ae320ab8'::uuid, 1.000000000000::numeric, 2.0000::numeric, 250.0000000000000000::numeric),
  ('9f279860-e020-4749-a40c-fee16beb35df'::uuid, 1.000000000000::numeric, 3.0000::numeric, 1500.0::numeric),
  ('8b05170d-4b3d-4cc4-937e-b4d7daa2a6fd'::uuid, -122398.000000000000::numeric, 2.0000::numeric, 1::numeric),
  ('ac865b9c-53a2-4048-91e6-40a362adb913'::uuid, 1.000000000000::numeric, 30.0000::numeric, 6500.0::numeric),
  ('1b0d19fd-e0fe-4ac1-972c-3a1361d61263'::uuid, -78176.248120300752::numeric, 3.0000::numeric, 0.751879699248120300752::numeric),
  ('ea9f3d5e-2d7e-4ae9-adf4-d8469ae24cb3'::uuid, 1.000000000000::numeric, 2.0000::numeric, 17000.000000000000::numeric),
  ('680c132e-b328-4390-926e-18b1368f6444'::uuid, -2175998.000000000000::numeric, 1.0000::numeric, 1::numeric))
SELECT d.product_id, d.wac_new, d.stock_esp, d.wac_old_esp, p.cost_average AS wac_actual, p.stock_current
FROM datos d JOIN public.products p ON p.id=d.product_id;
DO $do$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM m011_wac;
  IF v_n<>25 THEN RAISE EXCEPTION 'ABORTO-C1: productos WAC=% (esperado 25)', v_n; END IF;
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
  IF v_n<>25 THEN RAISE EXCEPTION 'C-6: WAC conformes=% de 25', v_n; END IF;
  INSERT INTO m011c VALUES ('S1_post', jsonb_build_object('wac_conformes', v_n));
END $do$;
INSERT INTO public.wac_change_log (id, store_id, product_id, wac_before, wac_after, event, qty_in, uc_in, source_ref, created_at)
VALUES
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'1498f8ec-aa50-49a0-bf89-4e7eb7e29b1c'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', '1498f8ec-aa50-49a0-bf89-4e7eb7e29b1c'::uuid, 4000.0::numeric, 1.000000000000::numeric, 'rectificacion', 1.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'372180f6-9837-44b6-a939-91dc67e21d7a'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', '372180f6-9837-44b6-a939-91dc67e21d7a'::uuid, 500.0::numeric, 1.000000000000::numeric, 'rectificacion', 6.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'c0ca7553-28e4-4391-9c9e-770d63642948'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', 'c0ca7553-28e4-4391-9c9e-770d63642948'::uuid, 200.0::numeric, 1.000000000000::numeric, 'rectificacion', 12.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'ce3f2c20-7aaf-4eb6-b6af-38834fb37fc2'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', 'ce3f2c20-7aaf-4eb6-b6af-38834fb37fc2'::uuid, 200.0::numeric, 1.000000000000::numeric, 'rectificacion', 15.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'cb969aba-5b05-4198-9fd6-5857abff2ac8'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', 'cb969aba-5b05-4198-9fd6-5857abff2ac8'::uuid, 2000.0::numeric, 1.000000000000::numeric, 'rectificacion', 1.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'ff5145c8-d43c-4104-82c3-81dacef80e78'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', 'ff5145c8-d43c-4104-82c3-81dacef80e78'::uuid, 1800.0::numeric, 1.000000000000::numeric, 'rectificacion', 2.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'f3d0f5a3-7e9d-46c9-91c1-a166129cb187'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', 'f3d0f5a3-7e9d-46c9-91c1-a166129cb187'::uuid, 5000.0::numeric, 1.000000000000::numeric, 'rectificacion', 7.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'7a6af746-d8ca-4325-b0eb-ed4cb574f5ad'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', '7a6af746-d8ca-4325-b0eb-ed4cb574f5ad'::uuid, 200.0000000000000000::numeric, 1.000000000000::numeric, 'rectificacion', 119.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'8859ef67-f829-4543-8bf8-6bb7e970e92d'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', '8859ef67-f829-4543-8bf8-6bb7e970e92d'::uuid, 4.1441441441441441441441171::numeric, 1.000000000000::numeric, 'rectificacion', 1.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'6862a061-50d0-4c8d-96d4-7b6d6ed082cd'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', '6862a061-50d0-4c8d-96d4-7b6d6ed082cd'::uuid, 0.96000000000000000000::numeric, -1.000000000000::numeric, 'rectificacion', 1.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'6cda2af1-6e24-4bfc-a2f8-bcd52797e841'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', '6cda2af1-6e24-4bfc-a2f8-bcd52797e841'::uuid, 2800.0000000000000000::numeric, 1.000000000000::numeric, 'rectificacion', 5.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'fcadebcd-1f99-4736-973d-cea194902399'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', 'fcadebcd-1f99-4736-973d-cea194902399'::uuid, 0.14285714285714285714::numeric, -665.857142857143::numeric, 'rectificacion', 2.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'963cd5c6-f496-471f-bf4b-6db083c8929f'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', '963cd5c6-f496-471f-bf4b-6db083c8929f'::uuid, 40000.0::numeric, 1.000000000000::numeric, 'rectificacion', 1.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'8769cde9-6135-4011-a56c-86a96e02bf7b'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', '8769cde9-6135-4011-a56c-86a96e02bf7b'::uuid, 250::numeric, 1.000000000000::numeric, 'rectificacion', 10.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'a764a5b5-e680-49ee-9fcf-88721e0e243e'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', 'a764a5b5-e680-49ee-9fcf-88721e0e243e'::uuid, 250.0::numeric, 1.000000000000::numeric, 'rectificacion', 3.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'7d50c274-922e-4674-bdff-a452884bf03e'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', '7d50c274-922e-4674-bdff-a452884bf03e'::uuid, 2500.0000000000000000::numeric, 1.000000000000::numeric, 'rectificacion', 22.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'6fb35013-d343-4f2f-8f24-00ff79869cf2'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', '6fb35013-d343-4f2f-8f24-00ff79869cf2'::uuid, 250.0000000000000000::numeric, 1.000000000000::numeric, 'rectificacion', 4.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'d0cab976-b1cc-42a9-a177-97aa48a393a5'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', 'd0cab976-b1cc-42a9-a177-97aa48a393a5'::uuid, 600.0000000000000000::numeric, 1.000000000000::numeric, 'rectificacion', 22.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'2b2e648d-feea-4a1b-a3c6-f614ae320ab8'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', '2b2e648d-feea-4a1b-a3c6-f614ae320ab8'::uuid, 250.0000000000000000::numeric, 1.000000000000::numeric, 'rectificacion', 2.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'9f279860-e020-4749-a40c-fee16beb35df'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', '9f279860-e020-4749-a40c-fee16beb35df'::uuid, 1500.0::numeric, 1.000000000000::numeric, 'rectificacion', 3.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'8b05170d-4b3d-4cc4-937e-b4d7daa2a6fd'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', '8b05170d-4b3d-4cc4-937e-b4d7daa2a6fd'::uuid, 1::numeric, -122398.000000000000::numeric, 'rectificacion', 2.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'ac865b9c-53a2-4048-91e6-40a362adb913'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', 'ac865b9c-53a2-4048-91e6-40a362adb913'::uuid, 6500.0::numeric, 1.000000000000::numeric, 'rectificacion', 30.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'1b0d19fd-e0fe-4ac1-972c-3a1361d61263'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', '1b0d19fd-e0fe-4ac1-972c-3a1361d61263'::uuid, 0.751879699248120300752::numeric, -78176.248120300752::numeric, 'rectificacion', 69.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'ea9f3d5e-2d7e-4ae9-adf4-d8469ae24cb3'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', 'ea9f3d5e-2d7e-4ae9-adf4-d8469ae24cb3'::uuid, 17000.000000000000::numeric, 1.000000000000::numeric, 'rectificacion', 2.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now()),
  (('7ec9000b-0000-4000-8000-' || substr(md5('m011-wac-'||'680c132e-b328-4390-926e-18b1368f6444'),1,12))::uuid, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', '680c132e-b328-4390-926e-18b1368f6444'::uuid, 1::numeric, -2175998.000000000000::numeric, 'rectificacion', 1.0000::numeric, 1::numeric, '{"mision": "CP-FIN-RECEIPT-UNIT-COST-1-CUP-011", "metodo": "revalorización capa FVC a 1 CUP; consistente con asiento RECT-011", "documento": "FAC-VITALLCONS-001-VAL1CUP"}'::jsonb, now())
ON CONFLICT (id) DO NOTHING;
DO $do$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.wac_change_log
   WHERE id::text LIKE '7ec9000b-0000-4000-8000-%' AND source_ref->>'mision' = 'CP-FIN-RECEIPT-UNIT-COST-1-CUP-011';
  IF v_n<>25 THEN RAISE EXCEPTION 'C-7: wac_change_log=% de 25', v_n; END IF;
  INSERT INTO m011c VALUES ('S2_wcl', to_jsonb(v_n));
END $do$;
-- auditoría por producto
INSERT INTO public.audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
SELECT ('7ec9000b-0000-4000-8000-' || substr(md5('m011-wacaud-'||v.product_id),1,12))::uuid, now(), 'products', v.product_id, 'SYSTEM_RECT011_WAC',
  jsonb_build_object('wac', v.wac_actual, 'stock', v.stock_current),
  jsonb_build_object('wac', v.wac_new, 'stock', v.stock_current),
  '{"mision":"CP-FIN-RECEIPT-UNIT-COST-1-CUP-011","autorizacion":"propietario §1/§11 (regla 1,00 CUP/u)","metodo":"governed_admin_write (escape hatches M021/w62)"}'::jsonb, '5e6fe821-5465-48b1-b3f1-3aa3182edc38', 'RECT011-PROD'
FROM m011_wac v ON CONFLICT (id) DO NOTHING;
SELECT paso, payload FROM m011c ORDER BY paso;
COMMIT;