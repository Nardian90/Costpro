-- W9.5-B8 · GATE 7 — P4 (forged identity) + P5 (admin global) — una request
CREATE TEMP TABLE b8_log(probe text, outcome text, detail jsonb);
GRANT INSERT, SELECT ON b8_log TO authenticated;

-- ══════ P5: ADMIN GLOBAL (profiles.role='admin', SIN membership) ══════
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"b8b00000-0000-4000-8000-000000000001","role":"authenticated"}';
SET request.jwt.claim.sub = 'b8b00000-0000-4000-8000-000000000001';
SET request.jwt.claim.role = 'authenticated';

-- P5a: admin global voida venta ajena en tienda A (TX-ADMIN-A)
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000b011', 'b8-P5a-admin-global-A', now(), NULL);
  INSERT INTO b8_log VALUES('P5a_admin_global_tienda_A','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P5a_admin_global_tienda_A','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;

-- P5b: admin global voida venta en tienda B (TX-ADMIN-B) — ¿puede actuar en CUALQUIER tienda?
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000b012', 'b8-P5b-admin-global-B', now(), NULL);
  INSERT INTO b8_log VALUES('P5b_admin_global_tienda_B','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P5b_admin_global_tienda_B','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;
RESET ROLE;

INSERT INTO b8_log
SELECT 'P5a_POST','STATE', jsonb_build_object('tx_status', t.status,
  'audit_user', (SELECT a.user_id FROM public.audit_logs a WHERE a.record_id='b8d00000-0000-4000-8000-00000000b011' AND a.action='VOID_SALE' ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id='b8d00000-0000-4000-8000-00000000b011';
INSERT INTO b8_log
SELECT 'P5b_POST','STATE', jsonb_build_object('tx_status', t.status,
  'audit_user', (SELECT a.user_id FROM public.audit_logs a WHERE a.record_id='b8d00000-0000-4000-8000-00000000b012' AND a.action='VOID_SALE' ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id='b8d00000-0000-4000-8000-00000000b012';

-- ══════ P4: FORGED p_user_id (caller real = clerk; parámetro = identidad forjada) ══════
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"b8b00000-0000-4000-8000-000000000004","role":"authenticated"}';
SET request.jwt.claim.sub = 'b8b00000-0000-4000-8000-000000000004';
SET request.jwt.claim.role = 'authenticated';

-- P4a: clerk (miembro A) forja p_user_id = ADMIN GLOBAL sobre TX-FORGED (tienda A)
--      → ¿prevalece identidad real? ¿atribución?
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000b013', 'b8-P4a-forged-admin', now(),
        'b8b00000-0000-4000-8000-000000000001'::uuid);
  INSERT INTO b8_log VALUES('P4a_clerk_forged_admin','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P4a_clerk_forged_admin','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;

-- P4b: clerk forja p_user_id = sellerB (miembro de B) sobre TX-B-OTHER (tienda B)
--      → el id forjado NO debe conferir acceso
DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('b8d00000-0000-4000-8000-00000000b010', 'b8-P4b-forged-sellerB', now(),
        'b8b00000-0000-4000-8000-000000000009'::uuid);
  INSERT INTO b8_log VALUES('P4b_clerk_forged_sellerB_cross_store','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P4b_clerk_forged_sellerB_cross_store','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;
RESET ROLE;

INSERT INTO b8_log
SELECT 'P4a_POST','STATE', jsonb_build_object('tx_status', t.status,
  'audit_user', (SELECT a.user_id FROM public.audit_logs a WHERE a.record_id='b8d00000-0000-4000-8000-00000000b013' AND a.action='VOID_SALE' ORDER BY a.created_at DESC LIMIT 1),
  'movement_by', (SELECT m.created_by FROM public.stock_movements m WHERE m.notes='b8d00000-0000-4000-8000-00000000b013' LIMIT 1))
FROM public.transactions t WHERE t.id='b8d00000-0000-4000-8000-00000000b013';
INSERT INTO b8_log
SELECT 'P4b_POST','STATE', jsonb_build_object('tx_status', t.status,
  'audit_user', (SELECT a.user_id FROM public.audit_logs a WHERE a.record_id='b8d00000-0000-4000-8000-00000000b010' AND a.action='VOID_SALE' ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id='b8d00000-0000-4000-8000-00000000b010';

SELECT coalesce(jsonb_agg(row_to_json(b8_log) ORDER BY probe), '[]'::jsonb) AS log FROM b8_log;
