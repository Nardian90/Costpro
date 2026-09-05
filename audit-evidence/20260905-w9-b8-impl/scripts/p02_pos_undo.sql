-- W9.5-B8 MODELO C · p02 — Probes POS Undo (void_transaction) por rol/ownership/ventana
-- Identidad simulada: SET ROLE authenticated + request.jwt.claims (patrón B-2/B-8).
CREATE TEMP TABLE b8c_log(probe text, outcome text, detail jsonb);
GRANT INSERT, SELECT ON b8c_log TO authenticated;

-- Re-freshen (la ventana 30s exige frescura; solo estados completed sin tocar)
UPDATE public.transactions SET created_at = now()
WHERE id::text LIKE 'b8cd0000%' AND status='completed' AND void_reason IS NULL
  AND created_at > now() - interval '3 hours'
  AND id::text !~ '(b001|c002)$';

CREATE OR REPLACE FUNCTION pg_temp.probe(p_name text, p_uid uuid, p_tx uuid, p_forge uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_uid,'role','authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  v := public.void_transaction(p_tx, 'b8c-probe-'||p_name, now(), p_forge);
  INSERT INTO b8c_log VALUES(p_name,'SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8c_log VALUES(p_name,'DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $f$;

CREATE OR REPLACE FUNCTION pg_temp.post(p_name text, p_tx uuid)
RETURNS void LANGUAGE sql AS $f$
  INSERT INTO b8c_log
  SELECT p_name||'::POST','STATE', jsonb_build_object(
    'tx_status', t.status,
    'movements', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = p_tx::text),
    'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'action', a.action, 'operation', a.metadata->>'operation', 'old_status', a.metadata->>'old_status')
              FROM public.audit_logs a WHERE a.record_id = p_tx AND a.action='VOID_SALE'
              ORDER BY a.created_at DESC LIMIT 1))
  FROM public.transactions t WHERE t.id = p_tx;
$f$;

-- NIVEL 1 — ALLOWED (venta propia, fresh, rol POS)
SELECT pg_temp.probe('V01_clerk_own_fresh',        'b8cb0000-0000-4000-8000-000000000004'::uuid, 'b8cd0000-0000-4000-8000-00000000a004'::uuid);
SELECT pg_temp.probe('V08_encargado_own_fresh',    'b8cb0000-0000-4000-8000-000000000003'::uuid, 'b8cd0000-0000-4000-8000-00000000a003'::uuid);
SELECT pg_temp.probe('V09_manager_own_fresh',      'b8cb0000-0000-4000-8000-000000000002'::uuid, 'b8cd0000-0000-4000-8000-00000000a002'::uuid);
SELECT pg_temp.probe('V10_adminMember_own_fresh',  'b8cb0000-0000-4000-8000-000000000008'::uuid, 'b8cd0000-0000-4000-8000-00000000a008'::uuid);
SELECT pg_temp.probe('V11_adminGlobal_own_fresh',  'b8cb0000-0000-4000-8000-000000000001'::uuid, 'b8cd0000-0000-4000-8000-00000000a001'::uuid);
SELECT pg_temp.probe('V13_clerkB_own_fresh',       'b8cb0000-0000-4000-8000-00000000000a'::uuid, 'b8cd0000-0000-4000-8000-00000000a009'::uuid);

-- NIVEL 1 — DENIED (ventana / ownership / rol / cross-store)
SELECT pg_temp.probe('V02_clerk_own_aged_window',  'b8cb0000-0000-4000-8000-000000000004'::uuid, 'b8cd0000-0000-4000-8000-00000000b001'::uuid);
SELECT pg_temp.probe('V03_clerk_other_ownership',  'b8cb0000-0000-4000-8000-000000000004'::uuid, 'b8cd0000-0000-4000-8000-00000000b002'::uuid);
SELECT pg_temp.probe('V04_manager_other_POSstrict','b8cb0000-0000-4000-8000-000000000002'::uuid, 'b8cd0000-0000-4000-8000-00000000b002'::uuid);
SELECT pg_temp.probe('V05_warehouse_own_role',     'b8cb0000-0000-4000-8000-000000000005'::uuid, 'b8cd0000-0000-4000-8000-00000000a005'::uuid);
SELECT pg_temp.probe('V06_usuario_own_role',       'b8cb0000-0000-4000-8000-000000000006'::uuid, 'b8cd0000-0000-4000-8000-00000000a006'::uuid);
SELECT pg_temp.probe('V07_costo_own_role',         'b8cb0000-0000-4000-8000-000000000007'::uuid, 'b8cd0000-0000-4000-8000-00000000a007'::uuid);
SELECT pg_temp.probe('V12_clerkA_cross_store',     'b8cb0000-0000-4000-8000-000000000004'::uuid, 'b8cd0000-0000-4000-8000-00000000c001'::uuid);

-- IDENTIDAD FORJADA
SELECT pg_temp.probe('V14_warehouse_forge_admin',  'b8cb0000-0000-4000-8000-000000000005'::uuid, 'b8cd0000-0000-4000-8000-00000000a005'::uuid, 'b8cb0000-0000-4000-8000-000000000001'::uuid);
SELECT pg_temp.probe('V15_clerk_forge_admin',      'b8cb0000-0000-4000-8000-000000000004'::uuid, 'b8cd0000-0000-4000-8000-00000000b012'::uuid, 'b8cb0000-0000-4000-8000-000000000001'::uuid);

-- POST-STATE de los SUCCESS (auditoría + movements)
SELECT pg_temp.post('V01','b8cd0000-0000-4000-8000-00000000a004');
SELECT pg_temp.post('V08','b8cd0000-0000-4000-8000-00000000a003');
SELECT pg_temp.post('V09','b8cd0000-0000-4000-8000-00000000a002');
SELECT pg_temp.post('V10','b8cd0000-0000-4000-8000-00000000a008');
SELECT pg_temp.post('V11','b8cd0000-0000-4000-8000-00000000a001');
SELECT pg_temp.post('V13','b8cd0000-0000-4000-8000-00000000a009');
SELECT pg_temp.post('V15','b8cd0000-0000-4000-8000-00000000b012');

SELECT set_config('role','postgres',true);

-- Verificación de atribución de identidad forjada (V15): audit.user_id debe ser CLERK, no admin
INSERT INTO b8c_log VALUES('V15_ATTRIBUTION','CHECK', jsonb_build_object(
  'audit_user_id_is_clerk', (
    SELECT (a.user_id = 'b8cb0000-0000-4000-8000-000000000004'::uuid)
    FROM public.audit_logs a WHERE a.record_id='b8cd0000-0000-4000-8000-00000000b012' AND a.action='VOID_SALE'
    ORDER BY a.created_at DESC LIMIT 1)));

SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY probe), '[]'::jsonb) AS probes FROM b8c_log t;
