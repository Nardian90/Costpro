-- W9.5-B8 MODELO C · p03 — Probes Reversión Administrativa (reverse_transaction_v2)
CREATE TEMP TABLE b8c_log3(probe text, outcome text, detail jsonb);
GRANT INSERT, SELECT ON b8c_log3 TO authenticated;

-- Re-freshen solo los tx dedicados a V2 (b003..b00a, c002, b013, b014, e001)
UPDATE public.transactions SET created_at = CASE
    WHEN id::text LIKE '%c002' THEN now() - interval '2 days'
    ELSE now() END
WHERE id::text ~ '(b00[3-9a]|c002|b013|b014|e001)$' AND status='completed';

CREATE OR REPLACE FUNCTION pg_temp.probe3(p_name text, p_uid uuid, p_tx uuid, p_forge uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_uid,'role','authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  v := public.reverse_transaction_v2(p_tx, 'b8c-probe-'||p_name, p_forge);
  INSERT INTO b8c_log3 VALUES(p_name,'SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8c_log3 VALUES(p_name,'DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $f$;

-- ALLOWED: admin/manager/encargado (venta AJENA dentro de su tienda)
SELECT pg_temp.probe3('R01_manager_other',       'b8cb0000-0000-4000-8000-000000000002'::uuid, 'b8cd0000-0000-4000-8000-00000000b003'::uuid);
SELECT pg_temp.probe3('R02_encargado_other',     'b8cb0000-0000-4000-8000-000000000003'::uuid, 'b8cd0000-0000-4000-8000-00000000b004'::uuid);
SELECT pg_temp.probe3('R03_adminMember_other',   'b8cb0000-0000-4000-8000-000000000008'::uuid, 'b8cd0000-0000-4000-8000-00000000b005'::uuid);
SELECT pg_temp.probe3('R04_adminGlobal_other',   'b8cb0000-0000-4000-8000-000000000001'::uuid, 'b8cd0000-0000-4000-8000-00000000b006'::uuid);
SELECT pg_temp.probe3('R10_manager_aged2d',      'b8cb0000-0000-4000-8000-000000000002'::uuid, 'b8cd0000-0000-4000-8000-00000000c002'::uuid);

-- DENIED: roles operativos sin privilegio administrativo (EL FIX CENTRAL)
SELECT pg_temp.probe3('R05_clerk_denied',        'b8cb0000-0000-4000-8000-000000000004'::uuid, 'b8cd0000-0000-4000-8000-00000000b007'::uuid);
SELECT pg_temp.probe3('R06_warehouse_denied',    'b8cb0000-0000-4000-8000-000000000005'::uuid, 'b8cd0000-0000-4000-8000-00000000b008'::uuid);
SELECT pg_temp.probe3('R07_usuario_denied',      'b8cb0000-0000-4000-8000-000000000006'::uuid, 'b8cd0000-0000-4000-8000-00000000b009'::uuid);
SELECT pg_temp.probe3('R08_costo_denied',        'b8cb0000-0000-4000-8000-000000000007'::uuid, 'b8cd0000-0000-4000-8000-00000000b00a'::uuid);

-- DENIED: cross-store (manager de A sobre tx de B)
SELECT pg_temp.probe3('R09_managerA_cross_store','b8cb0000-0000-4000-8000-000000000002'::uuid, 'b8cd0000-0000-4000-8000-00000000c001'::uuid);

-- DENIED: identidad forjada via p_user_id (no-service_role → ignorado)
SELECT pg_temp.probe3('R11_clerk_forge_admin',   'b8cb0000-0000-4000-8000-000000000004'::uuid, 'b8cd0000-0000-4000-8000-00000000b013'::uuid, 'b8cb0000-0000-4000-8000-000000000001'::uuid);

-- Integridad financiera: e001 (consistente: stock 5 + previo -5 → tras revertir 10)
SELECT pg_temp.probe3('R12_e001_stock_check',    'b8cb0000-0000-4000-8000-000000000002'::uuid, 'b8cd0000-0000-4000-8000-00000000e001'::uuid);

-- R13: V2 sobre tx ya voided → idempotente (corre como manager autenticado)
CREATE OR REPLACE FUNCTION pg_temp.probe3b() RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', '{"sub":"b8cb0000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'b8cb0000-0000-4000-8000-000000000002', true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  v := public.reverse_transaction_v2('b8cd0000-0000-4000-8000-00000000a004', 'b8c-probe-idempotent-on-voided', NULL);
  INSERT INTO b8c_log3 VALUES('R13_v2_on_voided_idempotent','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8c_log3 VALUES('R13_v2_on_voided_idempotent','DENIED', jsonb_build_object('err', SQLERRM));
END $f$;
SELECT pg_temp.probe3b();
INSERT INTO b8c_log3 VALUES('R13::POST','STATE', jsonb_build_object(
  'movements_for_a004', (SELECT count(*) FROM public.stock_movements WHERE notes='b8cd0000-0000-4000-8000-00000000a004')));

SELECT set_config('role','postgres',true);


-- POST-STATE financiero de e001
INSERT INTO b8c_log3 VALUES('R12::POST','STATE', jsonb_build_object(
  'product03_stock_current', (SELECT stock_current FROM public.products WHERE id='b8cc0000-0000-4000-8000-000000000003'),
  'inventory_qty',           (SELECT quantity FROM public.inventory WHERE store_id='b8ca0000-0000-4000-8000-0000000000a1' AND product_id='b8cc0000-0000-4000-8000-000000000003'),
  'movements_for_e001',      (SELECT count(*) FROM public.stock_movements WHERE notes='b8cd0000-0000-4000-8000-00000000e001'),
  'movement_types',          (SELECT jsonb_agg(movement_type::text) FROM public.stock_movements WHERE notes='b8cd0000-0000-4000-8000-00000000e001'),
  'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'operation', a.metadata->>'operation', 'units', a.metadata->>'units_restored', 'old', a.metadata->>'old_status')
            FROM public.audit_logs a WHERE a.record_id='b8cd0000-0000-4000-8000-00000000e001' AND a.action='REVERSE_TRANSACTION_V2'
            ORDER BY a.created_at DESC LIMIT 1)));

SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY probe), '[]'::jsonb) AS probes FROM b8c_log3 t;
