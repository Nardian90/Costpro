-- W9.5-B8 · GATE 9 — B-9: batería de estados de void_transaction + efectos de stock
-- Caller: sellerX (encargado, miembro A). Targets: TXS_* (una por estado) + TX-P/C-STOCK.
CREATE TEMP TABLE b8_log(probe text, outcome text, detail jsonb);
GRANT INSERT, SELECT ON b8_log TO authenticated;

SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"b8b00000-0000-4000-8000-000000000008","role":"authenticated"}';
SET request.jwt.claim.sub = 'b8b00000-0000-4000-8000-000000000008';
SET request.jwt.claim.role = 'authenticated';

-- S1 pending
DO $p$ DECLARE v jsonb; BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000c001','b8-S1-pending', now(), NULL);
  INSERT INTO b8_log VALUES('S1_void_status_pending','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('S1_void_status_pending','DENIED', jsonb_build_object('err',SQLERRM,'code',SQLSTATE));
END $p$;
-- S2 completed
DO $p$ DECLARE v jsonb; BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000c002','b8-S2-completed', now(), NULL);
  INSERT INTO b8_log VALUES('S2_void_status_completed','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('S2_void_status_completed','DENIED', jsonb_build_object('err',SQLERRM,'code',SQLSTATE));
END $p$;
-- S3 failed
DO $p$ DECLARE v jsonb; BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000c003','b8-S3-failed', now(), NULL);
  INSERT INTO b8_log VALUES('S3_void_status_failed','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('S3_void_status_failed','DENIED', jsonb_build_object('err',SQLERRM,'code',SQLSTATE));
END $p$;
-- S4 compensated
DO $p$ DECLARE v jsonb; BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000c004','b8-S4-compensated', now(), NULL);
  INSERT INTO b8_log VALUES('S4_void_status_compensated','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('S4_void_status_compensated','DENIED', jsonb_build_object('err',SQLERRM,'code',SQLSTATE));
END $p$;
-- S5 cancelled
DO $p$ DECLARE v jsonb; BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000c005','b8-S5-cancelled', now(), NULL);
  INSERT INTO b8_log VALUES('S5_void_status_cancelled','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('S5_void_status_cancelled','DENIED', jsonb_build_object('err',SQLERRM,'code',SQLSTATE));
END $p$;
-- S6 refunded
DO $p$ DECLARE v jsonb; BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000c006','b8-S6-refunded', now(), NULL);
  INSERT INTO b8_log VALUES('S6_void_status_refunded','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('S6_void_status_refunded','DENIED', jsonb_build_object('err',SQLERRM,'code',SQLSTATE));
END $p$;
-- S7 voided (ya anulada)
DO $p$ DECLARE v jsonb; BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000c007','b8-S7-voided', now(), NULL);
  INSERT INTO b8_log VALUES('S7_void_status_already_voided','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('S7_void_status_already_voided','DENIED', jsonb_build_object('err',SQLERRM,'code',SQLSTATE));
END $p$;
-- S8 reversed
DO $p$ DECLARE v jsonb; BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000c008','b8-S8-reversed', now(), NULL);
  INSERT INTO b8_log VALUES('S8_void_status_reversed','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('S8_void_status_reversed','DENIED', jsonb_build_object('err',SQLERRM,'code',SQLSTATE));
END $p$;
-- S9 doble anulación sobre TXS_COMPLETED (ya voided por S2)
DO $p$ DECLARE v jsonb; BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000c002','b8-S9-double', now(), NULL);
  INSERT INTO b8_log VALUES('S9_double_void_completed','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('S9_double_void_completed','DENIED', jsonb_build_object('err',SQLERRM,'code',SQLSTATE));
END $p$;
-- S10 void sobre TX-P-STOCK (pending SIN deducción previa de stock, qty 5)
DO $p$ DECLARE v jsonb; BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000c009','b8-S10-pending-stock', now(), NULL);
  INSERT INTO b8_log VALUES('S10_void_pending_sin_deduccion','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('S10_void_pending_sin_deduccion','DENIED', jsonb_build_object('err',SQLERRM,'code',SQLSTATE));
END $p$;
-- S11 void sobre TX-C-STOCK (completed CON deducción previa simulada, qty 5)
DO $p$ DECLARE v jsonb; BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000c00a','b8-S11-completed-stock', now(), NULL);
  INSERT INTO b8_log VALUES('S11_void_completed_con_deduccion','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('S11_void_completed_con_deduccion','DENIED', jsonb_build_object('err',SQLERRM,'code',SQLSTATE));
END $p$;
RESET ROLE;

-- Capturas POST (como postgres, sin RLS)
INSERT INTO b8_log
SELECT v.probe || '_POST', 'STATE', jsonb_build_object(
  'tx_status', t.status, 'old_status_in_audit', (SELECT a.metadata->>'old_status' FROM public.audit_logs a WHERE a.record_id=t.id AND a.action='VOID_SALE' ORDER BY a.created_at DESC LIMIT 1),
  'movements', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = t.id::text))
FROM (VALUES
  ('S1','b8d00000-0000-4000-8000-00000000c001'),
  ('S2','b8d00000-0000-4000-8000-00000000c002'),
  ('S3','b8d00000-0000-4000-8000-00000000c003'),
  ('S4','b8d00000-0000-4000-8000-00000000c004'),
  ('S5','b8d00000-0000-4000-8000-00000000c005'),
  ('S6','b8d00000-0000-4000-8000-00000000c006'),
  ('S7','b8d00000-0000-4000-8000-00000000c007'),
  ('S8','b8d00000-0000-4000-8000-00000000c008')
) AS v(probe, tx)
JOIN public.transactions t ON t.id = v.tx::uuid
ORDER BY v.probe;

-- Stock: TX-P-STOCK (producto …003, base 10, sin deducción) vs TX-C-STOCK (producto …004, base 10→5 por venta)
INSERT INTO b8_log VALUES('STOCK_P_PENDING','STATE', (
  SELECT jsonb_build_object(
    'product_stock_current', pr.stock_current,
    'inventory_quantity', inv.quantity,
    'movements_total', (SELECT count(*) FROM public.stock_movements m WHERE m.product_id='b8c00000-0000-4000-8000-000000000003'),
    'movements_sale_void', (SELECT count(*) FROM public.stock_movements m WHERE m.product_id='b8c00000-0000-4000-8000-000000000003' AND m.movement_type='sale_void'))
  FROM public.products pr JOIN public.inventory inv ON inv.product_id=pr.id AND inv.store_id='b8a00000-0000-4000-8000-00000000a001'
  WHERE pr.id='b8c00000-0000-4000-8000-000000000003'));
INSERT INTO b8_log VALUES('STOCK_C_COMPLETED','STATE', (
  SELECT jsonb_build_object(
    'product_stock_current', pr.stock_current,
    'inventory_quantity', inv.quantity,
    'movements_total', (SELECT count(*) FROM public.stock_movements m WHERE m.product_id='b8c00000-0000-4000-8000-000000000004'),
    'movements_sale', (SELECT count(*) FROM public.stock_movements m WHERE m.product_id='b8c00000-0000-4000-8000-000000000004' AND m.movement_type='sale'),
    'movements_sale_void', (SELECT count(*) FROM public.stock_movements m WHERE m.product_id='b8c00000-0000-4000-8000-000000000004' AND m.movement_type='sale_void'))
  FROM public.products pr JOIN public.inventory inv ON inv.product_id=pr.id AND inv.store_id='b8a00000-0000-4000-8000-00000000a001'
  WHERE pr.id='b8c00000-0000-4000-8000-000000000004'));

-- Payments intactos (void no toca payment_transactions): muestra para TXS_COMPLETED
INSERT INTO b8_log VALUES('PAYMENTS_TXS_COMPLETED','STATE', (
  SELECT jsonb_agg(jsonb_build_object('amount',p.amount,'status','-')) FROM public.payment_transactions p WHERE p.transaction_id='b8d00000-0000-4000-8000-00000000c002'));

SELECT coalesce(jsonb_agg(row_to_json(b8_log) ORDER BY probe), '[]'::jsonb) AS log FROM b8_log;
