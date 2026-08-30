-- w7-depgraph.sql — FASE 3: grafo de dependencias REAL desde catálogos (solo SELECT)
\pset pager off
\o /home/z/my-project/w7-readiness/tmp/depgraph-1-overloads.txt

-- ═══ 1. INVENTARIO DE FIRMAS de los objetos de atención especial ═══
WITH targets AS (
  SELECT unnest(ARRAY[
    'withdraw_production_item','withdraw_production_item_v3','create_vale_salida',
    'create_devolution_v2','create_devolution','reverse_devolution','reverse_adjustment',
    'close_production_order_v2','fn_recalc_wac','update_product_wac',
    'register_stock_movement','create_transfer','confirm_transfer','reverse_transfer',
    'receive_production_output'
  ]) AS proname
)
SELECT t.proname,
       p.oid::regprocedure AS signature,
       p.pronamespace::regnamespace AS ns,
       p.prosecdef AS secdef,
       p.proacl::text AS acl,
       p.provolatile AS vol,
       length(coalesce(p.prosrc,'')) AS src_len
FROM pg_proc p JOIN targets t ON t.proname = p.proname
WHERE p.pronamespace::regnamespace::text = 'public'
ORDER BY t.proname, signature;

\o /home/z/my-project/w7-readiness/tmp/depgraph-2-acl.txt

-- ═══ 2. ACL EXPANDIDA (EXECUTE PUBLIC / anon / authenticated / service_role) ═══
WITH targets AS (
  SELECT unnest(ARRAY[
    'withdraw_production_item','withdraw_production_item_v3','create_vale_salida',
    'create_devolution_v2','create_devolution','reverse_devolution','reverse_adjustment',
    'close_production_order_v2','fn_recalc_wac','update_product_wac',
    'register_stock_movement','create_transfer','confirm_transfer','reverse_transfer',
    'receive_production_output'
  ]) AS proname
)
SELECT p.oid::regprocedure AS signature,
       COALESCE(array_to_string(p.proacl, ', '), 'NULL (=owner-only)') AS acl_expanded
FROM pg_proc p JOIN targets t ON t.proname = p.proname
WHERE p.pronamespace::regnamespace::text = 'public'
ORDER BY 1;

\o /home/z/my-project/w7-readiness/tmp/depgraph-3-callers.txt

-- ═══ 3. CALLERS INTERNOS: qué funciones referencian a cada objetivo en su fuente ═══
WITH targets AS (
  SELECT unnest(ARRAY[
    'withdraw_production_item','withdraw_production_item_v3','create_vale_salida',
    'create_devolution_v2','create_devolution','reverse_devolution','reverse_adjustment',
    'close_production_order_v2','fn_recalc_wac','update_product_wac',
    'register_stock_movement','create_transfer','confirm_transfer','reverse_transfer',
    'receive_production_output','perform_inventory_adjustment'
  ]) AS tname
)
SELECT tg.tname AS target, c.oid::regprocedure AS caller_function,
       CASE WHEN c.prosecdef THEN 'SECDEF' ELSE '' END AS secdef
FROM targets tg
JOIN pg_proc c ON c.prosrc ~ ('(\m' || tg.tname || '\M)')
WHERE c.pronamespace::regnamespace::text = 'public'
  AND c.proname <> tg.tname
ORDER BY tg.tname, caller_function;

\o /home/z/my-project/w7-readiness/tmp/depgraph-4-depend.txt

-- ═══ 4. pg_depend directo: objetos que dependen de update_product_wac (motor B) ═══
SELECT DISTINCT
  d.refobjid::regprocedure AS referenced_object,
  d.objid::regprocedure AS dependent_function,
  d.deptype
FROM pg_depend d
JOIN pg_proc pp ON pp.oid = d.refobjid AND pp.proname = 'update_product_wac'
WHERE d.classid = 'pg_proc'::regclass;

-- triggers que dependen de update_product_wac
SELECT t.tgname, t.tgrelid::regclass AS on_table, p.proname AS trigger_fn
FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
WHERE p.proname = 'update_product_wac' AND NOT t.tgisinternal;

-- ═══ 5. Todos los triggers activos sobre products y receipt_items (escritores potenciales) ═══
SELECT t.tgrelid::regclass AS table_name, t.tgname, p.proname AS fn, pg_get_triggerdef(t.oid) AS def
FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid IN ('public.products'::regclass, 'public.receipt_items'::regclass)
  AND NOT t.tgisinternal
ORDER BY 1, 2;

\o /home/z/my-project/w7-readiness/tmp/depgraph-5-writers.txt

-- ═══ 6. BÚSQUEDA AMPLIA de escritores WAC: toda función cuyo src escriba cost_average ═══
SELECT c.oid::regprocedure AS writer_function,
       (c.prosrc ~ 'UPDATE (public\.)?products') AS updates_products,
       (c.prosrc ~ 'cost_average\s*=') AS sets_cost_average,
       (c.prosrc ~ 'INSERT INTO (public\.)?products') AS inserts_products,
       (c.prosrc ~ 'UPDATE (public\.)?(inventory|receipt_items|stock_movements)') AS updates_other,
       CASE WHEN c.prosecdef THEN 'SECDEF' ELSE 'invoker' END AS sec
FROM pg_proc c
WHERE c.pronamespace::regnamespace::text = 'public'
  AND c.prosrc ~ ('cost_average\s*=\s*')
ORDER BY 1;

-- ═══ 7. Guard/trigger token writer ya existente en baseline (debe NO existir pre-migración) ═══
SELECT COUNT(*) AS guard_triggers_preexisting
FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
WHERE p.proname = 'w62_guard_wac_writer' AND NOT t.tgisinternal;

-- ═══ 8. Dynamic dispatch: EXECUTE format / to_regprocedure / CALL dinámico ═══
SELECT c.oid::regprocedure AS fn
FROM pg_proc c
WHERE c.pronamespace::regnamespace::text = 'public'
  AND (c.prosrc ~ 'to_regprocedure' OR c.prosrc ~ 'EXECUTE format\(' OR c.prosrc ~ 'EXECUTE ''SELECT')
ORDER BY 1;

\o /home/z/my-project/w7-readiness/tmp/depgraph-6-postgrest.txt

-- ═══ 9. Superficie PostgREST: funciones con EXECUTE para anon o authenticated ═══
SELECT p.oid::regprocedure AS fn,
       EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text ~ '^=X/') AS exec_public,
       EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE 'anon%X/%') AS exec_anon,
       EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE 'authenticated%X/%') AS exec_authed,
       EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE 'service_role%X/%') AS exec_service
FROM pg_proc p
WHERE p.pronamespace::regnamespace::text = 'public'
  AND p.proname IN ('withdraw_production_item','withdraw_production_item_v3','create_vale_salida',
    'create_devolution_v2','create_devolution','reverse_devolution','reverse_adjustment',
    'close_production_order_v2','receive_production_output','confirm_transfer','reverse_transfer')
ORDER BY 1;

-- ═══ 10. Constraints existentes sobre payment_transactions (baseline pre-pkg08) ═══
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.payment_transactions'::regclass
ORDER BY conname;

\o
