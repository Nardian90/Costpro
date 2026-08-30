-- ============================================================================
-- w7d1-case-f1-forensic.sql — FASE 1: CONFIRMACIÓN FORENSE ACL fn_recalc_wac
-- Catálogos puros (sin fixture). Ejecutable pre y post parche para contraste.
-- ============================================================================
-- 1. Identidad EXACTA (sin inventar firma)
SELECT 'F1|IDENT|'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
       ||'|ret='||p.prorettype::regtype
       ||'|secdef='||p.prosecdef
       ||'|owner='||pg_get_userbyid(p.proowner)
       ||'|search_path='||coalesce(p.proconfig::text,'-')
       ||'|proacl='||coalesce(array_to_string(p.proacl,','),'NULL(default=PUBLIC EXECUTE)')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='fn_recalc_wac';

-- 2. Overloads existentes (REVOKE individual, nunca genérico)
SELECT 'F1|OVERLOADS|count='||count(*)||'|' || coalesce(string_agg(p.oid::regprocedure::text,' ;; '),'-')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='fn_recalc_wac';

-- 3. ACL heredada declarativa (information_schema)
SELECT 'F1|ROUTINE_PRIV|grantee='||grantee||'|priv='||privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema='public' AND routine_name='fn_recalc_wac'
ORDER BY grantee, privilege_type;

-- 4. Contraste privilegio EFECTIVO por rol (has_function_privilege vs proacl)
SELECT 'F1|HFP|anon='||has_function_privilege('anon','public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb)','EXECUTE')
       ||'|authenticated='||has_function_privilege('authenticated','public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb)','EXECUTE')
       ||'|service_role='||has_function_privilege('service_role','public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb)','EXECUTE')
       ||'|postgres(owner)='||has_function_privilege('postgres','public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb)','EXECUTE');

-- 5. Roles involucrados (existencia y login)
SELECT 'F1|ROLE|'||rolname||'|canlogin='||rolcanlogin||'|super='||rolsuper
FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','authenticator','postgres')
ORDER BY rolname;

-- 6. Callers/wrappers que alcanzan fn_recalc_wac (prosrc) + SU ACL (¿wrapper público?)
SELECT 'F1|CALLER|'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
       ||'|secdef='||p.prosecdef
       ||'|acl='||coalesce(array_to_string(p.proacl,','),'PUBLIC-default')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosrc LIKE '%fn_recalc_wac%' AND p.proname <> 'fn_recalc_wac'
ORDER BY p.proname;

-- 7. ¿Algún caller con EXECUTE público (wrapper alcanzable por anon)? Lista exacta
SELECT 'F1|PUBLIC_WRAPPER|'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|trigger_fn='||(p.prorettype='trigger'::regtype)::text
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosrc LIKE '%fn_recalc_wac%' AND p.proname <> 'fn_recalc_wac'
  AND (p.proacl IS NULL OR '=X/postgres' = ANY(p.proacl::text[]) OR 'anon=X/postgres' = ANY(p.proacl::text[]));
SELECT 'F1|PUBLIC_WRAPPERS|count='||count(*)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosrc LIKE '%fn_recalc_wac%' AND p.proname <> 'fn_recalc_wac'
  AND (p.proacl IS NULL OR '=X/postgres' = ANY(p.proacl::text[]) OR 'anon=X/postgres' = ANY(p.proacl::text[]));
