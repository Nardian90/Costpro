-- @statement: close_fiscal_period_def
SELECT pg_get_functiondef(p.oid) AS def, pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS secdef, p.proconfig AS spcfg
FROM pg_proc p WHERE p.proname = 'close_fiscal_period';

-- @statement: lock_fiscal_period_def
SELECT pg_get_functiondef(p.oid) AS def, pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS secdef, p.proconfig AS spcfg
FROM pg_proc p WHERE p.proname = 'lock_fiscal_period';

-- @statement: sibling_census_record_id_text_casts
-- TODAS las funciones trigger/audit que asignan a record_id con cast ::text
SELECT p.proname AS function_name,
       p.oid::regprocedure AS signature,
       (SELECT tgrelid::regclass::text FROM pg_trigger t WHERE t.tgfoid = p.oid AND NOT t.tgisinternal LIMIT 1) AS trigger_table,
       (SELECT array_agg(DISTINCT (m[1])) FROM regexp_matches(pg_get_functiondef(p.oid), '(NEW\.[a-z_]+|OLD\.[a-z_]+)::text', 'g') m) AS text_cast_targets
FROM pg_proc p
WHERE pg_get_functiondef(p.oid) ILIKE '%record_id%'
  AND pg_get_functiondef(p.oid) ~ '::text'
  AND p.pronamespace = 'public'::regnamespace
ORDER BY p.proname;

-- @statement: full_audit_function_census
-- Censo completo de funciones audit_* para contexto del censo
SELECT p.proname AS function_name,
       pg_get_functiondef(p.oid) ~ 'NEW\.id::text|OLD\.id::text' AS has_id_text_cast,
       pg_get_functiondef(p.oid) ~ '::text' AS has_any_text_cast
FROM pg_proc p
WHERE p.proname LIKE 'audit_%' AND p.pronamespace = 'public'::regnamespace
ORDER BY p.proname;

-- @statement: fiscal_closings_indexes
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'fiscal_closings';

-- @statement: fiscal_closings_constraints
SELECT conname, contype, pg_get_constraintdef(oid) AS def
FROM pg_constraint WHERE conrelid = 'fiscal_closings'::regclass;

-- @statement: stores_fixture_and_production
SELECT id, name FROM stores ORDER BY name;
