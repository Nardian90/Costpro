-- @statement: f404_f403_intact_check
SELECT p.proname, p.prosecdef AS secdef, p.proconfig AS spcfg, pg_get_userbyid(p.proowner) AS owner,
       CASE WHEN p.proname='register_reception' THEN (pg_get_functiondef(p.oid) LIKE '%fn_recalc_wac%') ELSE NULL END AS calls_recalc_wac
FROM pg_proc p
WHERE p.proname IN ('register_reception','fn_recalc_wac','withdraw_production_item_v3')
ORDER BY p.proname;

-- @statement: wac_guard_trigger_present
SELECT tgname, tgenabled FROM pg_trigger WHERE tgname='trg_guard_wac_writer';

-- @statement: fiscal_rpc_execute_acl_real
SELECT p.proname,
       CASE WHEN p.proacl IS NULL THEN 'NULL(default: EXECUTE to PUBLIC)' ELSE array_to_string(array_agg(a.grantee::regrole::text || ':' || a.privilege_type), ', ') END AS acl
FROM pg_proc p
LEFT JOIN LATERAL aclexplode(p.proacl) a ON p.proacl IS NOT NULL
WHERE p.proname IN ('ensure_fiscal_period','lock_fiscal_period','close_fiscal_period')
GROUP BY p.proname, p.proacl ORDER BY p.proname;

-- @statement: admin_demo_profile
SELECT id, email, role FROM profiles WHERE email='admin@demo.com';

-- @statement: admin_demo_memberships
SELECT store_id, role FROM store_access WHERE user_id=(SELECT id FROM profiles WHERE email='admin@demo.com');
