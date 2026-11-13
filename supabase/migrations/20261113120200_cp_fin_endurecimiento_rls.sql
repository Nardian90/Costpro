-- ══════════════════════════════════════════════════════════════════════════
-- CP-FIN · ENDURECIMIENTO RLS/ACL (2026-11-13, auditoría final)
-- Alinea las tablas fin_* con el estándar del módulo financiero precedente
-- (payrolls, NÓMINAS SC-4-06 / m013): RLS FORCED + CERO privilegios anon.
--
-- Defecto detectado por la auditoría (clasificación: ALTO, endurecimiento):
--   · Las 8 tablas fin_* quedaron con RLS habilitado pero SIN FORCE.
--   · 6 tablas retuvieron los privilegios por defecto de Supabase para anon
--     (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES) protegidos
--     SOLO por políticas RLS. El estándar del repo para datos financieros es
--     denegación por ACL además de RLS (payrolls: forced=true, anon sin
--     privilegios; fin_entries/fin_movements ya revocadas en la migración
--     base, que además endureció con REVOKE ALL ... FROM anon, authenticated).
--
-- Seguridad de la operación:
--   · FORCE es seguro para el canal de administración: postgres y
--     service_role tienen bypassrls (verificado en producción 2026-11-13);
--     authenticated/anon NO lo tienen y quedan sujetos a las políticas.
--   · La aplicación (API /api/fin/* con withAuth) no usa anon: todas las
--     rutas exigen sesión; los grants de authenticated no cambian.
--
-- Idempotente: ALTER/REVOKE son re-ejecutables sin daño.
-- ══════════════════════════════════════════════════════════════════════════

-- 1. FORCE ROW LEVEL SECURITY en las 8 tablas fin_* (estándar payrolls)
ALTER TABLE public.fin_categories        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_document_types    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_rule_versions     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_entries           FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_movements         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_opening_balances  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_posting_errors    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_metric_catalog    FORCE ROW LEVEL SECURITY;

-- 2. CERO privilegios para anon en TODAS las tablas fin_*
--    (fin_entries/fin_movements ya estaban revocadas en la migración base;
--     se repite por idempotencia y para dejar el estado completo auditable)
REVOKE ALL ON public.fin_categories       FROM anon;
REVOKE ALL ON public.fin_document_types   FROM anon;
REVOKE ALL ON public.fin_rule_versions    FROM anon;
REVOKE ALL ON public.fin_entries          FROM anon;
REVOKE ALL ON public.fin_movements        FROM anon;
REVOKE ALL ON public.fin_opening_balances FROM anon;
REVOKE ALL ON public.fin_posting_errors   FROM anon;
REVOKE ALL ON public.fin_metric_catalog   FROM anon;

-- 3. Los grants de authenticated NO cambian (SELECT en las 8; INSERT/UPDATE
--    limitados según la migración base). Se reafirman para dejar constancia:
GRANT SELECT ON public.fin_categories, public.fin_document_types,
  public.fin_rule_versions, public.fin_entries, public.fin_movements,
  public.fin_opening_balances, public.fin_posting_errors, public.fin_metric_catalog
TO authenticated;

-- Verificación de cierre (fail-closed)
DO $$
DECLARE
  v_forced int; v_anon int;
BEGIN
  SELECT count(*) INTO v_forced
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'fin_%'
    AND c.relrowsecurity AND c.relforcerowsecurity;
  SELECT count(*) INTO v_anon
  FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND table_name LIKE 'fin_%' AND grantee = 'anon';
  IF v_forced <> 8 THEN
    RAISE EXCEPTION 'CP-FIN endurecimiento: RLS FORCED incompleto (%)', v_forced;
  END IF;
  IF v_anon <> 0 THEN
    RAISE EXCEPTION 'CP-FIN endurecimiento: anon conserva % privilegios en fin_*', v_anon;
  END IF;
  RAISE NOTICE 'CP-FIN endurecimiento OK: 8 tablas FORCED, 0 privilegios anon';
END $$;
