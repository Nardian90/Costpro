-- W9.5-B8 · GATE 7 — Probes P1/P2/P3 por rol (miembros de STORE_A, admin global excluido)
-- Identidad simulada: SET ROLE authenticated + request.jwt.claims (mismo mecanismo B-2).
CREATE TEMP TABLE b8_log(probe text, outcome text, detail jsonb);
GRANT INSERT, SELECT ON b8_log TO authenticated;

-- ══════ ROL manager (uid b8b00000-0000-4000-8000-000000000002) ══════
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"b8b00000-0000-4000-8000-000000000002","role":"authenticated"}';
SET request.jwt.claim.sub = 'b8b00000-0000-4000-8000-000000000002';
SET request.jwt.claim.role = 'authenticated';
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000a002', 'b8-P1-manager', now(), NULL);
  INSERT INTO b8_log VALUES('P1_manager','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P1_manager','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000b002', 'b8-P2-manager', now(), NULL);
  INSERT INTO b8_log VALUES('P2_manager','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P2_manager','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000b010', 'b8-P3-manager', now(), NULL);
  INSERT INTO b8_log VALUES('P3_manager','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P3_manager','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;
RESET ROLE;
INSERT INTO b8_log
SELECT 'P1_manager_POST','STATE', jsonb_build_object(
  'tx_status', t.status,
  'void_reason', t.void_reason,
  'movements_of_tx', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = 'b8d00000-0000-4000-8000-00000000a002'),
  'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'metadata', a.metadata)
            FROM public.audit_logs a WHERE a.record_id = 'b8d00000-0000-4000-8000-00000000a002' AND a.action='VOID_SALE'
            ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id = 'b8d00000-0000-4000-8000-00000000a002';
INSERT INTO b8_log
SELECT 'P2_manager_POST','STATE', jsonb_build_object(
  'tx_status', t.status,
  'void_reason', t.void_reason,
  'movements_of_tx', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = 'b8d00000-0000-4000-8000-00000000b002'),
  'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'metadata', a.metadata)
            FROM public.audit_logs a WHERE a.record_id = 'b8d00000-0000-4000-8000-00000000b002' AND a.action='VOID_SALE'
            ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id = 'b8d00000-0000-4000-8000-00000000b002';
INSERT INTO b8_log
SELECT 'P3_manager_POST','STATE', jsonb_build_object(
  'tx_status', t.status,
  'void_reason', t.void_reason,
  'movements_of_tx', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = 'b8d00000-0000-4000-8000-00000000b010'),
  'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'metadata', a.metadata)
            FROM public.audit_logs a WHERE a.record_id = 'b8d00000-0000-4000-8000-00000000b010' AND a.action='VOID_SALE'
            ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id = 'b8d00000-0000-4000-8000-00000000b010';
-- ══════ ROL encargado (uid b8b00000-0000-4000-8000-000000000003) ══════
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"b8b00000-0000-4000-8000-000000000003","role":"authenticated"}';
SET request.jwt.claim.sub = 'b8b00000-0000-4000-8000-000000000003';
SET request.jwt.claim.role = 'authenticated';
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000a003', 'b8-P1-encargado', now(), NULL);
  INSERT INTO b8_log VALUES('P1_encargado','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P1_encargado','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000b003', 'b8-P2-encargado', now(), NULL);
  INSERT INTO b8_log VALUES('P2_encargado','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P2_encargado','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000b010', 'b8-P3-encargado', now(), NULL);
  INSERT INTO b8_log VALUES('P3_encargado','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P3_encargado','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;
RESET ROLE;
INSERT INTO b8_log
SELECT 'P1_encargado_POST','STATE', jsonb_build_object(
  'tx_status', t.status,
  'void_reason', t.void_reason,
  'movements_of_tx', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = 'b8d00000-0000-4000-8000-00000000a003'),
  'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'metadata', a.metadata)
            FROM public.audit_logs a WHERE a.record_id = 'b8d00000-0000-4000-8000-00000000a003' AND a.action='VOID_SALE'
            ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id = 'b8d00000-0000-4000-8000-00000000a003';
INSERT INTO b8_log
SELECT 'P2_encargado_POST','STATE', jsonb_build_object(
  'tx_status', t.status,
  'void_reason', t.void_reason,
  'movements_of_tx', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = 'b8d00000-0000-4000-8000-00000000b003'),
  'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'metadata', a.metadata)
            FROM public.audit_logs a WHERE a.record_id = 'b8d00000-0000-4000-8000-00000000b003' AND a.action='VOID_SALE'
            ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id = 'b8d00000-0000-4000-8000-00000000b003';
INSERT INTO b8_log
SELECT 'P3_encargado_POST','STATE', jsonb_build_object(
  'tx_status', t.status,
  'void_reason', t.void_reason,
  'movements_of_tx', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = 'b8d00000-0000-4000-8000-00000000b010'),
  'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'metadata', a.metadata)
            FROM public.audit_logs a WHERE a.record_id = 'b8d00000-0000-4000-8000-00000000b010' AND a.action='VOID_SALE'
            ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id = 'b8d00000-0000-4000-8000-00000000b010';
-- ══════ ROL clerk (uid b8b00000-0000-4000-8000-000000000004) ══════
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"b8b00000-0000-4000-8000-000000000004","role":"authenticated"}';
SET request.jwt.claim.sub = 'b8b00000-0000-4000-8000-000000000004';
SET request.jwt.claim.role = 'authenticated';
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000a004', 'b8-P1-clerk', now(), NULL);
  INSERT INTO b8_log VALUES('P1_clerk','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P1_clerk','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000b004', 'b8-P2-clerk', now(), NULL);
  INSERT INTO b8_log VALUES('P2_clerk','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P2_clerk','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000b010', 'b8-P3-clerk', now(), NULL);
  INSERT INTO b8_log VALUES('P3_clerk','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P3_clerk','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;
RESET ROLE;
INSERT INTO b8_log
SELECT 'P1_clerk_POST','STATE', jsonb_build_object(
  'tx_status', t.status,
  'void_reason', t.void_reason,
  'movements_of_tx', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = 'b8d00000-0000-4000-8000-00000000a004'),
  'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'metadata', a.metadata)
            FROM public.audit_logs a WHERE a.record_id = 'b8d00000-0000-4000-8000-00000000a004' AND a.action='VOID_SALE'
            ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id = 'b8d00000-0000-4000-8000-00000000a004';
INSERT INTO b8_log
SELECT 'P2_clerk_POST','STATE', jsonb_build_object(
  'tx_status', t.status,
  'void_reason', t.void_reason,
  'movements_of_tx', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = 'b8d00000-0000-4000-8000-00000000b004'),
  'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'metadata', a.metadata)
            FROM public.audit_logs a WHERE a.record_id = 'b8d00000-0000-4000-8000-00000000b004' AND a.action='VOID_SALE'
            ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id = 'b8d00000-0000-4000-8000-00000000b004';
INSERT INTO b8_log
SELECT 'P3_clerk_POST','STATE', jsonb_build_object(
  'tx_status', t.status,
  'void_reason', t.void_reason,
  'movements_of_tx', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = 'b8d00000-0000-4000-8000-00000000b010'),
  'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'metadata', a.metadata)
            FROM public.audit_logs a WHERE a.record_id = 'b8d00000-0000-4000-8000-00000000b010' AND a.action='VOID_SALE'
            ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id = 'b8d00000-0000-4000-8000-00000000b010';
-- ══════ ROL warehouse (uid b8b00000-0000-4000-8000-000000000005) ══════
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"b8b00000-0000-4000-8000-000000000005","role":"authenticated"}';
SET request.jwt.claim.sub = 'b8b00000-0000-4000-8000-000000000005';
SET request.jwt.claim.role = 'authenticated';
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000a005', 'b8-P1-warehouse', now(), NULL);
  INSERT INTO b8_log VALUES('P1_warehouse','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P1_warehouse','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000b005', 'b8-P2-warehouse', now(), NULL);
  INSERT INTO b8_log VALUES('P2_warehouse','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P2_warehouse','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000b010', 'b8-P3-warehouse', now(), NULL);
  INSERT INTO b8_log VALUES('P3_warehouse','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P3_warehouse','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;
RESET ROLE;
INSERT INTO b8_log
SELECT 'P1_warehouse_POST','STATE', jsonb_build_object(
  'tx_status', t.status,
  'void_reason', t.void_reason,
  'movements_of_tx', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = 'b8d00000-0000-4000-8000-00000000a005'),
  'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'metadata', a.metadata)
            FROM public.audit_logs a WHERE a.record_id = 'b8d00000-0000-4000-8000-00000000a005' AND a.action='VOID_SALE'
            ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id = 'b8d00000-0000-4000-8000-00000000a005';
INSERT INTO b8_log
SELECT 'P2_warehouse_POST','STATE', jsonb_build_object(
  'tx_status', t.status,
  'void_reason', t.void_reason,
  'movements_of_tx', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = 'b8d00000-0000-4000-8000-00000000b005'),
  'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'metadata', a.metadata)
            FROM public.audit_logs a WHERE a.record_id = 'b8d00000-0000-4000-8000-00000000b005' AND a.action='VOID_SALE'
            ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id = 'b8d00000-0000-4000-8000-00000000b005';
INSERT INTO b8_log
SELECT 'P3_warehouse_POST','STATE', jsonb_build_object(
  'tx_status', t.status,
  'void_reason', t.void_reason,
  'movements_of_tx', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = 'b8d00000-0000-4000-8000-00000000b010'),
  'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'metadata', a.metadata)
            FROM public.audit_logs a WHERE a.record_id = 'b8d00000-0000-4000-8000-00000000b010' AND a.action='VOID_SALE'
            ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id = 'b8d00000-0000-4000-8000-00000000b010';
-- ══════ ROL usuario (uid b8b00000-0000-4000-8000-000000000006) ══════
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"b8b00000-0000-4000-8000-000000000006","role":"authenticated"}';
SET request.jwt.claim.sub = 'b8b00000-0000-4000-8000-000000000006';
SET request.jwt.claim.role = 'authenticated';
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000a006', 'b8-P1-usuario', now(), NULL);
  INSERT INTO b8_log VALUES('P1_usuario','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P1_usuario','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000b006', 'b8-P2-usuario', now(), NULL);
  INSERT INTO b8_log VALUES('P2_usuario','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P2_usuario','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000b010', 'b8-P3-usuario', now(), NULL);
  INSERT INTO b8_log VALUES('P3_usuario','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P3_usuario','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;
RESET ROLE;
INSERT INTO b8_log
SELECT 'P1_usuario_POST','STATE', jsonb_build_object(
  'tx_status', t.status,
  'void_reason', t.void_reason,
  'movements_of_tx', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = 'b8d00000-0000-4000-8000-00000000a006'),
  'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'metadata', a.metadata)
            FROM public.audit_logs a WHERE a.record_id = 'b8d00000-0000-4000-8000-00000000a006' AND a.action='VOID_SALE'
            ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id = 'b8d00000-0000-4000-8000-00000000a006';
INSERT INTO b8_log
SELECT 'P2_usuario_POST','STATE', jsonb_build_object(
  'tx_status', t.status,
  'void_reason', t.void_reason,
  'movements_of_tx', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = 'b8d00000-0000-4000-8000-00000000b006'),
  'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'metadata', a.metadata)
            FROM public.audit_logs a WHERE a.record_id = 'b8d00000-0000-4000-8000-00000000b006' AND a.action='VOID_SALE'
            ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id = 'b8d00000-0000-4000-8000-00000000b006';
INSERT INTO b8_log
SELECT 'P3_usuario_POST','STATE', jsonb_build_object(
  'tx_status', t.status,
  'void_reason', t.void_reason,
  'movements_of_tx', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = 'b8d00000-0000-4000-8000-00000000b010'),
  'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'metadata', a.metadata)
            FROM public.audit_logs a WHERE a.record_id = 'b8d00000-0000-4000-8000-00000000b010' AND a.action='VOID_SALE'
            ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id = 'b8d00000-0000-4000-8000-00000000b010';
-- ══════ ROL costo (uid b8b00000-0000-4000-8000-000000000007) ══════
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"b8b00000-0000-4000-8000-000000000007","role":"authenticated"}';
SET request.jwt.claim.sub = 'b8b00000-0000-4000-8000-000000000007';
SET request.jwt.claim.role = 'authenticated';
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000a007', 'b8-P1-costo', now(), NULL);
  INSERT INTO b8_log VALUES('P1_costo','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P1_costo','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000b007', 'b8-P2-costo', now(), NULL);
  INSERT INTO b8_log VALUES('P2_costo','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P2_costo','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000b010', 'b8-P3-costo', now(), NULL);
  INSERT INTO b8_log VALUES('P3_costo','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P3_costo','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;
RESET ROLE;
INSERT INTO b8_log
SELECT 'P1_costo_POST','STATE', jsonb_build_object(
  'tx_status', t.status,
  'void_reason', t.void_reason,
  'movements_of_tx', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = 'b8d00000-0000-4000-8000-00000000a007'),
  'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'metadata', a.metadata)
            FROM public.audit_logs a WHERE a.record_id = 'b8d00000-0000-4000-8000-00000000a007' AND a.action='VOID_SALE'
            ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id = 'b8d00000-0000-4000-8000-00000000a007';
INSERT INTO b8_log
SELECT 'P2_costo_POST','STATE', jsonb_build_object(
  'tx_status', t.status,
  'void_reason', t.void_reason,
  'movements_of_tx', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = 'b8d00000-0000-4000-8000-00000000b007'),
  'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'metadata', a.metadata)
            FROM public.audit_logs a WHERE a.record_id = 'b8d00000-0000-4000-8000-00000000b007' AND a.action='VOID_SALE'
            ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id = 'b8d00000-0000-4000-8000-00000000b007';
INSERT INTO b8_log
SELECT 'P3_costo_POST','STATE', jsonb_build_object(
  'tx_status', t.status,
  'void_reason', t.void_reason,
  'movements_of_tx', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = 'b8d00000-0000-4000-8000-00000000b010'),
  'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'metadata', a.metadata)
            FROM public.audit_logs a WHERE a.record_id = 'b8d00000-0000-4000-8000-00000000b010' AND a.action='VOID_SALE'
            ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id = 'b8d00000-0000-4000-8000-00000000b010';
SELECT coalesce(jsonb_agg(row_to_json(b8_log) ORDER BY probe), '[]'::jsonb) AS log FROM b8_log;